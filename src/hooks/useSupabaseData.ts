import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction, Commitment, TransactionType, Group, Category } from '@/types'

const delta = (type: TransactionType, amount: number) =>
  type === 'income' ? amount : -amount

const EMPTY_STATE: AppState = {
  accounts: [],
  categories: [],
  groups: [],
  settings: { id: '', weekly_budget: 5000, emergency_fund: 20000, salary_date: null },
  commitments: [],
  borrowings: [],
  transactions: [],
}

const DEFAULT_SETTINGS = { weekly_budget: 5000, emergency_fund: 20000, salary_date: null }

const DEFAULT_GROUPS = ['Lifestyle', 'Commitment', 'Renovation', 'Family', 'Transfer']

const DEFAULT_CATEGORIES: { name: string; group_name: string }[] = [
  { name: 'Food & Tea',   group_name: 'Lifestyle' },
  { name: 'Groceries',    group_name: 'Lifestyle' },
  { name: 'Fuel',         group_name: 'Lifestyle' },
  { name: 'Shopping',     group_name: 'Lifestyle' },
  { name: 'Medical',      group_name: 'Lifestyle' },
  { name: 'Utilities',    group_name: 'Lifestyle' },
  { name: 'Loan EMI',     group_name: 'Commitment' },
  { name: 'Gold Scheme',  group_name: 'Commitment' },
  { name: 'SIP',          group_name: 'Commitment' },
  { name: 'Renovation',   group_name: 'Renovation' },
  { name: 'Family',       group_name: 'Family' },
  { name: 'Transfer',     group_name: 'Transfer' },
]

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
          { data: groups },
          { data: borrowings },
          { data: commitments },
          { data: transactions },
        ] = await Promise.all([
          supabase.from('settings').select('*').eq('user_id', userId).limit(1).single(),
          supabase.from('accounts').select('*').eq('is_active', true).eq('user_id', userId).order('name'),
          supabase.from('categories').select('*').eq('user_id', userId).order('group_name'),
          supabase.from('groups').select('*').eq('user_id', userId).order('name'),
          supabase.from('borrowings').select('*').eq('user_id', userId).order('person_name'),
          supabase.from('commitments').select('*').eq('user_id', userId).order('name'),
          supabase.from('transactions')
            .select('*, category:categories(*), from_account:accounts!from_account_id(*)')
            .eq('user_id', userId)
            .order('transaction_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200),
        ])

        // First login — seed settings
        let settings = settingsRow
        if (!settings) {
          const { data: created, error } = await supabase
            .from('settings')
            .insert({ ...DEFAULT_SETTINGS, user_id: userId })
            .select('*').single()
          if (error || !created) { console.error('Failed to create settings:', error); setLoading(false); return }
          settings = created
        }

        // First login — seed groups
        let userGroups = groups || []
        if (userGroups.length === 0) {
          const { data: seededGroups } = await supabase
            .from('groups')
            .insert(DEFAULT_GROUPS.map(name => ({ name, user_id: userId })))
            .select('*')
          userGroups = seededGroups || []
        }

        // First login — seed categories
        let userCategories = categories || []
        if (userCategories.length === 0) {
          const { data: seededCats } = await supabase
            .from('categories')
            .insert(DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: userId })))
            .select('*')
          userCategories = seededCats || []
        }

        setState({
          accounts: accounts || [],
          categories: userCategories as Category[],
          groups: userGroups as Group[],
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
        accounts: s.accounts.map(a => a.id === form.from_account_id ? { ...a, current_balance: a.current_balance + delta(form.transaction_type, form.amount) } : a),
      }))
    } catch (err) { console.error('Failed to save transaction:', err); throw err }
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
        accounts: s.accounts.map(a => a.id === t.from_account_id ? { ...a, current_balance: a.current_balance - delta(t.transaction_type, t.amount) } : a),
      }))
    } catch (err) { console.error('Failed to delete transaction:', err); throw err }
  }, [])

  const updateTransaction = useCallback(async (
    old: Transaction,
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>
  ) => {
    try {
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({ transaction_date: form.transaction_date, description: form.description, amount: form.amount, transaction_type: form.transaction_type, category_id: form.category_id, from_account_id: form.from_account_id })
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
    } catch (err) { console.error('Failed to update transaction:', err); throw err }
  }, [])

  const addAccount = useCallback(async (form: { name: string; type: string; current_balance: number }) => {
    const { data, error } = await supabase.from('accounts').insert({ ...form, is_active: true, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, accounts: [...s.accounts, data as AppState['accounts'][0]] }))
  }, [userId])

  const deleteAccount = useCallback(async (accountId: string) => {
    await supabase.from('accounts').update({ is_active: false }).eq('id', accountId)
    setState(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== accountId) }))
  }, [])

  const adjustBalance = useCallback(async (accountId: string, newBalance: number) => {
    try {
      await supabase.from('accounts').update({ current_balance: newBalance }).eq('id', accountId)
      setState(s => ({ ...s, accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: newBalance } : a) }))
    } catch (err) { console.error('Failed to adjust balance:', err); throw err }
  }, [])

  // ── Groups CRUD ──────────────────────────────────────────────────────────────
  const addGroup = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('groups').insert({ name, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, groups: [...s.groups, data as Group] }))
  }, [userId])

  const updateGroup = useCallback(async (id: string, name: string) => {
    const { data, error } = await supabase.from('groups').update({ name }).eq('id', id).select('*').single()
    if (error) throw error
    // Also update group_name in categories that use this group
    const old = (await supabase.from('groups').select('name').eq('id', id).single()).data
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id === id ? data as Group : g),
      categories: s.categories.map(c => c.group_name === old?.name ? { ...c, group_name: (data as Group).name } : c),
    }))
  }, [])

  const deleteGroup = useCallback(async (id: string, groupName: string) => {
    // Delete all categories in this group first
    await supabase.from('categories').delete().eq('group_name', groupName).eq('user_id', userId)
    await supabase.from('groups').delete().eq('id', id)
    setState(s => ({
      ...s,
      groups: s.groups.filter(g => g.id !== id),
      categories: s.categories.filter(c => c.group_name !== groupName),
    }))
  }, [userId])

  // ── Categories CRUD ──────────────────────────────────────────────────────────
  const addCategory = useCallback(async (name: string, group_name: string) => {
    const { data, error } = await supabase.from('categories').insert({ name, group_name, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, categories: [...s.categories, data as Category] }))
  }, [userId])

  const updateCategory = useCallback(async (id: string, name: string, group_name: string) => {
    const { data, error } = await supabase.from('categories').update({ name, group_name }).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, categories: s.categories.map(c => c.id === id ? data as Category : c) }))
  }, [])

  const deleteCategory = useCallback(async (id: string) => {
    await supabase.from('categories').delete().eq('id', id)
    setState(s => ({ ...s, categories: s.categories.filter(c => c.id !== id) }))
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
    borrowing: AppState['borrowings'][0], payment: number, accountId: string | null, incoming: boolean,
  ) => {
    const today = new Date().toISOString().slice(0, 10)
    const newPaid = Math.min(borrowing.total_amount, borrowing.paid_amount + payment)
    await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', borrowing.id)
    if (accountId) {
      await supabase.from('transactions').insert({ transaction_date: today, description: `${borrowing.person_name} – repayment`, amount: payment, transaction_type: 'borrowing_repayment', category_id: null, from_account_id: accountId, to_account_id: null, notes: '', user_id: userId })
      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) await supabase.from('accounts').update({ current_balance: incoming ? acc.current_balance + payment : acc.current_balance - payment }).eq('id', accountId)
    }
    setState(s => ({
      ...s,
      borrowings: s.borrowings.map(b => b.id === borrowing.id ? { ...b, paid_amount: newPaid, remaining_amount: b.total_amount - newPaid } : b),
      accounts: accountId ? s.accounts.map(a => a.id !== accountId ? a : { ...a, current_balance: a.current_balance + (incoming ? payment : -payment) }) : s.accounts,
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
    const { data: newTx, error } = await supabase.from('transactions').insert({ transaction_date: today, description: cm.name, amount: payAmount, transaction_type: 'commitment', category_id: cm.category_id, from_account_id: cm.from_account_id, to_account_id: null, notes: '', user_id: userId }).select('*, category:categories(*), from_account:accounts!from_account_id(*)').single()
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
    } catch (err) { console.error('Failed to update settings:', err); throw err }
  }, [state.settings.id])

  return {
    state, setState, loading, usingSupabase,
    addTransaction, deleteTransaction, updateTransaction, updateSettings,
    addAccount, deleteAccount, adjustBalance,
    addGroup, updateGroup, deleteGroup,
    addCategory, updateCategory, deleteCategory,
    addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment,
    addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid,
  }
}
