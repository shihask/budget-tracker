import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction, Commitment, TransactionType } from '@/types'

const delta = (type: TransactionType, amount: number) =>
  type === 'income' ? amount : -amount

const EMPTY_STATE: AppState = {
  accounts: [],
  categories: [],
  settings: { id: '', weekly_budget: 5000, emergency_fund: 20000, salary_date: null },
  commitments: [],
  borrowings: [],
  transactions: [],
}

const DEFAULT_SETTINGS = { weekly_budget: 5000, emergency_fund: 20000, salary_date: null }

export function useSupabaseData(userId: string) {
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [usingSupabase, setUsingSupabase] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [
          { data: settingsRow },
          { data: accounts },
          { data: categories },
          { data: borrowings },
          { data: commitments },
          { data: transactions },
        ] = await Promise.all([
          supabase.from('settings').select('*').eq('user_id', userId).limit(1).single(),
          supabase.from('accounts').select('*').eq('is_active', true).eq('user_id', userId).order('name'),
          supabase.from('categories').select('*').order('group_name'),
          supabase.from('borrowings').select('*').eq('user_id', userId).order('person_name'),
          supabase.from('commitments').select('*').eq('user_id', userId).order('name'),
          supabase.from('transactions')
            .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
            .eq('user_id', userId)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200),
        ])

        // First login — create default settings for this user
        let settings = settingsRow
        if (!settings) {
          const { data: created, error } = await supabase
            .from('settings')
            .insert({ ...DEFAULT_SETTINGS, user_id: userId })
            .select('*')
            .single()
          if (error || !created) {
            console.error('Failed to create settings:', error)
            setLoading(false)
            return
          }
          settings = created
        }

        setState({
          accounts: accounts || [],
          categories: categories || [],
          settings,
          commitments: (commitments as Commitment[]) || [],
          borrowings: borrowings || [],
          transactions: (transactions as Transaction[]) || [],
        })
        setUsingSupabase(true)
      } catch (err) {
        console.error('Supabase load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  const addTransaction = useCallback(async (
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>
  ) => {
    try {
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          transaction_date: form.transaction_date,
          description: form.description,
          amount: form.amount,
          transaction_type: form.transaction_type,
          category_id: form.category_id,
          from_account_id: form.from_account_id,
          to_account_id: null,
          notes: '',
          user_id: userId,
        })
        .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
        .single()

      if (txErr) throw txErr

      if (form.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', form.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance + delta(form.transaction_type, form.amount) }).eq('id', form.from_account_id)
      }

      setState(s => ({
        ...s,
        transactions: [newTx as Transaction, ...s.transactions],
        accounts: s.accounts.map(a =>
          a.id === form.from_account_id
            ? { ...a, current_balance: a.current_balance + delta(form.transaction_type, form.amount) }
            : a
        ),
      }))
    } catch (err) {
      console.error('Failed to save transaction:', err)
      throw err
    }
  }, [userId])

  const deleteTransaction = useCallback(async (t: Transaction) => {
    try {
      await supabase.from('transactions').delete().eq('id', t.id)
      if (t.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - delta(t.transaction_type, t.amount) }).eq('id', t.from_account_id)
      }
      setState(s => ({
        ...s,
        transactions: s.transactions.filter(tx => tx.id !== t.id),
        accounts: s.accounts.map(a =>
          a.id === t.from_account_id ? { ...a, current_balance: a.current_balance - delta(t.transaction_type, t.amount) } : a
        ),
      }))
    } catch (err) {
      console.error('Failed to delete transaction:', err)
      throw err
    }
  }, [])

  const updateTransaction = useCallback(async (
    old: Transaction,
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>
  ) => {
    try {
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({
          transaction_date: form.transaction_date,
          description: form.description,
          amount: form.amount,
          transaction_type: form.transaction_type,
          category_id: form.category_id,
          from_account_id: form.from_account_id,
        })
        .eq('id', old.id)
        .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
        .single()

      if (error) throw error

      if (old.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', old.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - delta(old.transaction_type, old.amount) }).eq('id', old.from_account_id)
      }
      if (form.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', form.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance + delta(form.transaction_type, form.amount) }).eq('id', form.from_account_id)
      }

      setState(s => ({
        ...s,
        transactions: s.transactions.map(t => t.id === old.id ? updated as Transaction : t),
        accounts: s.accounts.map(a => {
          let bal = a.current_balance
          if (a.id === old.from_account_id) bal -= delta(old.transaction_type, old.amount)
          if (a.id === form.from_account_id) bal += delta(form.transaction_type, form.amount)
          return bal !== a.current_balance ? { ...a, current_balance: bal } : a
        }),
      }))
    } catch (err) {
      console.error('Failed to update transaction:', err)
      throw err
    }
  }, [])

  const addAccount = useCallback(async (form: { name: string; type: string; current_balance: number }) => {
    const { data, error } = await supabase
      .from('accounts')
      .insert({ ...form, is_active: true, user_id: userId })
      .select('*')
      .single()
    if (error) throw error
    setState(s => ({ ...s, accounts: [...s.accounts, data as AppState['accounts'][0]] }))
  }, [userId])

  const deleteAccount = useCallback(async (accountId: string) => {
    // Soft-delete so transaction history is preserved
    await supabase.from('accounts').update({ is_active: false }).eq('id', accountId)
    setState(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== accountId) }))
  }, [])

  const adjustBalance = useCallback(async (accountId: string, newBalance: number) => {
    try {
      await supabase.from('accounts').update({ current_balance: newBalance }).eq('id', accountId)
      setState(s => ({
        ...s,
        accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: newBalance } : a),
      }))
    } catch (err) {
      console.error('Failed to adjust balance:', err)
      throw err
    }
  }, [])

  const addBorrowing = useCallback(async (form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null }) => {
    const { data, error } = await supabase.from('borrowings').insert({ ...form, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, borrowings: [...s.borrowings, data as AppState['borrowings'][0]] }))
  }, [userId])

  const updateBorrowing = useCallback(async (id: string, form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null }) => {
    const { data, error } = await supabase.from('borrowings').update(form).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, borrowings: s.borrowings.map(b => b.id === id ? data as AppState['borrowings'][0] : b) }))
  }, [])

  const deleteBorrowing = useCallback(async (id: string) => {
    await supabase.from('borrowings').delete().eq('id', id)
    setState(s => ({ ...s, borrowings: s.borrowings.filter(b => b.id !== id) }))
  }, [])

  const recordBorrowingPayment = useCallback(async (
    borrowing: AppState['borrowings'][0],
    payment: number,
    accountId: string | null,
    incoming: boolean,
  ) => {
    const today = new Date().toISOString().slice(0, 10)
    const newPaid = Math.min(borrowing.total_amount, borrowing.paid_amount + payment)
    await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', borrowing.id)

    if (accountId) {
      await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${borrowing.person_name} – repayment`,
        amount: payment,
        transaction_type: 'borrowing_repayment',
        category_id: null,
        from_account_id: accountId,
        to_account_id: null,
        notes: '',
        user_id: userId,
      })
      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) await supabase.from('accounts').update({ current_balance: incoming ? acc.current_balance + payment : acc.current_balance - payment }).eq('id', accountId)
    }

    setState(s => ({
      ...s,
      borrowings: s.borrowings.map(b =>
        b.id === borrowing.id ? { ...b, paid_amount: newPaid, remaining_amount: b.total_amount - newPaid } : b
      ),
      accounts: accountId ? s.accounts.map(a =>
        a.id !== accountId ? a : { ...a, current_balance: a.current_balance + (incoming ? payment : -payment) }
      ) : s.accounts,
    }))
  }, [userId])

  const addCommitment = useCallback(async (form: Omit<Commitment, 'id'>) => {
    const { data, error } = await supabase.from('commitments').insert({ ...form, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, commitments: [...s.commitments, data as Commitment] }))
  }, [userId])

  const updateCommitment = useCallback(async (id: string, form: Omit<Commitment, 'id'>) => {
    const { data, error } = await supabase.from('commitments').update(form).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, commitments: s.commitments.map(c => c.id === id ? data as Commitment : c) }))
  }, [])

  const deleteCommitment = useCallback(async (id: string) => {
    await supabase.from('commitments').delete().eq('id', id)
    setState(s => ({ ...s, commitments: s.commitments.filter(c => c.id !== id) }))
  }, [])

  const markCommitmentPaid = useCallback(async (cm: Commitment) => {
    const today = new Date().toISOString().slice(0, 10)
    const payAmount = cm.amount || cm.remaining || 0
    const { data: newTx, error } = await supabase
      .from('transactions')
      .insert({
        transaction_date: today,
        description: cm.name,
        amount: payAmount,
        transaction_type: 'commitment',
        category_id: cm.category_id,
        from_account_id: cm.from_account_id,
        to_account_id: null,
        notes: '',
        user_id: userId,
      })
      .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
      .single()
    if (error) throw error

    if (cm.from_account_id) {
      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', cm.from_account_id).single()
      if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - payAmount }).eq('id', cm.from_account_id)
    }

    let newRemaining = cm.remaining
    if (!cm.is_recurring) {
      newRemaining = Math.max(0, cm.remaining - payAmount)
      await supabase.from('commitments').update({ remaining: newRemaining }).eq('id', cm.id)
    }

    setState(s => ({
      ...s,
      transactions: [newTx as Transaction, ...s.transactions],
      accounts: s.accounts.map(a => a.id === cm.from_account_id ? { ...a, current_balance: a.current_balance - payAmount } : a),
      commitments: s.commitments.map(c => c.id === cm.id ? { ...c, remaining: newRemaining } : c),
    }))
  }, [userId])

  const updateSettings = useCallback(async (patch: Partial<AppState['settings']>) => {
    try {
      await supabase.from('settings').update(patch).eq('id', state.settings.id)
      setState(s => ({ ...s, settings: { ...s.settings, ...patch } }))
    } catch (err) {
      console.error('Failed to update settings:', err)
      throw err
    }
  }, [state.settings.id])

  return { state, setState, loading, usingSupabase, addTransaction, deleteTransaction, updateTransaction, updateSettings, addAccount, deleteAccount, adjustBalance, addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid }
}
