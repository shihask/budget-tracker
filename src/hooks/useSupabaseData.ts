import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction, Commitment, TransactionType, Group, Category, CreditCard } from '@/types'

const delta = (type: TransactionType, amount: number) =>
  type === 'income' ? amount : -amount

const EMPTY_STATE: AppState = {
  accounts: [],
  categories: [],
  groups: [],
  credit_cards: [],
  settings: { id: '', weekly_budget: 5000, emergency_fund: 20000, salary_date: null, track_credit_cards: false, track_borrowings: true },
  commitments: [],
  borrowings: [],
  transactions: [],
}

const DEFAULT_SETTINGS = { weekly_budget: 5000, emergency_fund: 20000, salary_date: null, track_credit_cards: false }

const DEFAULT_GROUPS = ['Lifestyle', 'Commitment', 'Renovation', 'Family', 'Transfer', 'Income']

const DEFAULT_CATEGORIES: { name: string; group_name: string }[] = [
  { name: 'Food & Tea',        group_name: 'Lifestyle' },
  { name: 'Groceries',         group_name: 'Lifestyle' },
  { name: 'Fuel',              group_name: 'Lifestyle' },
  { name: 'Shopping',          group_name: 'Lifestyle' },
  { name: 'Medical',           group_name: 'Lifestyle' },
  { name: 'Utilities',         group_name: 'Lifestyle' },
  { name: 'Loan EMI',          group_name: 'Commitment' },
  { name: 'Gold Scheme',       group_name: 'Commitment' },
  { name: 'SIP',               group_name: 'Commitment' },
  { name: 'Borrow Repayment',  group_name: 'Commitment' },
  { name: 'Renovation',        group_name: 'Renovation' },
  { name: 'Family',            group_name: 'Family' },
  { name: 'Transfer',          group_name: 'Transfer' },
  { name: 'Salary',            group_name: 'Income' },
  { name: 'Freelance',         group_name: 'Income' },
  { name: 'Refund',            group_name: 'Income' },
  { name: 'Other Income',      group_name: 'Income' },
]

const INCOME_GROUP = 'Income'
const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Refund', 'Other Income']

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
          { data: credit_cards },
          { data: borrowings },
          { data: commitments },
          { data: transactions },
        ] = await Promise.all([
          supabase.from('settings').select('*').eq('user_id', userId).limit(1).single(),
          supabase.from('accounts').select('*').eq('is_active', true).eq('user_id', userId).order('name'),
          supabase.from('categories').select('*').eq('user_id', userId).order('group_name'),
          supabase.from('groups').select('*').eq('user_id', userId).order('name'),
          supabase.from('credit_cards').select('*').eq('user_id', userId).eq('is_active', true).order('name'),
          supabase.from('borrowings').select('*').eq('user_id', userId).order('person_name'),
          supabase.from('commitments').select('*').eq('user_id', userId).order('name'),
          supabase.from('transactions')
            .select('*, category:categories(*)')
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

        // Migration: ensure Income group exists (re-query DB to avoid race with StrictMode double-invoke)
        const { data: dbIncomeGroups } = await supabase
          .from('groups').select('*').eq('user_id', userId).eq('name', INCOME_GROUP)
        const incomeGroupRows = dbIncomeGroups || []

        // Dedup: if more than one Income group exists, delete the extras
        if (incomeGroupRows.length > 1) {
          const [keep, ...extras] = incomeGroupRows
          await supabase.from('groups').delete().in('id', extras.map((g: Group) => g.id))
          userGroups = [...userGroups.filter(g => g.name !== INCOME_GROUP), keep as Group]
        } else if (incomeGroupRows.length === 0) {
          const { data: newGroup } = await supabase
            .from('groups').insert({ name: INCOME_GROUP, user_id: userId }).select('*').single()
          if (newGroup) userGroups = [...userGroups, newGroup as Group]
        }

        // Ensure Income categories exist
        const existingIncomeNames = userCategories.filter(c => c.group_name === INCOME_GROUP).map(c => c.name)
        const incomeCatsToAdd = DEFAULT_INCOME_CATEGORIES.filter(n => !existingIncomeNames.includes(n))
        if (incomeCatsToAdd.length > 0) {
          const { data: newCats } = await supabase
            .from('categories')
            .insert(incomeCatsToAdd.map(name => ({ name, group_name: INCOME_GROUP, user_id: userId })))
            .select('*')
          if (newCats) userCategories = [...userCategories, ...(newCats as Category[])]
        }

        setState({
          accounts: accounts || [],
          categories: userCategories as Category[],
          groups: userGroups as Group[],
          credit_cards: (credit_cards as CreditCard[]) || [],
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
      const isCreditCard = state.credit_cards.some(c => c.id === form.from_account_id)
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          transaction_date: form.transaction_date,
          description: form.description,
          amount: form.amount,
          transaction_type: form.transaction_type,
          category_id: form.category_id,
          from_account_id: isCreditCard ? null : form.from_account_id,
          credit_card_id: isCreditCard ? form.from_account_id : null,
          to_account_id: null,
          notes: '',
          user_id: userId,
        })
        .select('*, category:categories(*)')
        .single()
      if (txErr) throw txErr
      if (isCreditCard) {
        // Increase credit card outstanding balance
        const card = state.credit_cards.find(c => c.id === form.from_account_id)
        if (card) {
          const newBalance = card.current_balance + form.amount
          await supabase.from('credit_cards').update({ current_balance: newBalance }).eq('id', card.id)
          setState(s => ({
            ...s,
            transactions: [newTx as Transaction, ...s.transactions],
            credit_cards: s.credit_cards.map(c => c.id === card.id ? { ...c, current_balance: newBalance } : c),
          }))
        }
      } else {
        if (form.from_account_id) {
          const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', form.from_account_id).single()
          if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance + delta(form.transaction_type, form.amount) }).eq('id', form.from_account_id)
        }
        setState(s => ({
          ...s,
          transactions: [newTx as Transaction, ...s.transactions],
          accounts: s.accounts.map(a => a.id === form.from_account_id ? { ...a, current_balance: a.current_balance + delta(form.transaction_type, form.amount) } : a),
        }))
      }
    } catch (err) { console.error('Failed to save transaction:', err); throw err }
  }, [userId, state.credit_cards])

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
        .select('*, category:categories(*)')
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
  const addCategory = useCallback(async (name: string, group_name: string): Promise<string> => {
    const { data, error } = await supabase.from('categories').insert({ name, group_name, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, categories: [...s.categories, data as Category] }))
    return (data as Category).id
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

  const addBorrowing = useCallback(async (
    form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' },
    addTransaction: boolean,
    accountId: string | null,
  ) => {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.from('borrowings').insert({ ...form, user_id: userId }).select('*').single()
    if (error) throw error
    const borrowing = data as AppState['borrowings'][0]

    if (addTransaction && accountId && form.direction === 'borrowed') {
      const { data: newTx } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${form.person_name} – borrowed`,
        amount: form.total_amount,
        transaction_type: 'income',
        category_id: null,
        from_account_id: accountId,
        to_account_id: null,
        notes: '',
        user_id: userId,
        borrowing_id: borrowing.id,
      }).select('*, category:categories(*)').single()

      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance + form.total_amount }).eq('id', accountId)

      setState(s => ({
        ...s,
        borrowings: [...s.borrowings, borrowing],
        transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
        accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance + form.total_amount } : a),
      }))
    } else if (addTransaction && accountId && form.direction === 'lent') {
      const { data: newTx } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${form.person_name} – lent`,
        amount: form.total_amount,
        transaction_type: 'expense',
        category_id: null,
        from_account_id: accountId,
        to_account_id: null,
        notes: '',
        user_id: userId,
        borrowing_id: borrowing.id,
      }).select('*, category:categories(*)').single()

      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - form.total_amount }).eq('id', accountId)

      setState(s => ({
        ...s,
        borrowings: [...s.borrowings, borrowing],
        transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
        accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance - form.total_amount } : a),
      }))
    } else {
      setState(s => ({ ...s, borrowings: [...s.borrowings, borrowing] }))
    }
  }, [userId])

  const updateBorrowing = useCallback(async (id: string, form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' }) => {
    const { data, error } = await supabase.from('borrowings').update(form).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, borrowings: s.borrowings.map(b => b.id === id ? data as AppState['borrowings'][0] : b) }))
  }, [])

  const deleteBorrowing = useCallback(async (id: string, deleteTransactions: boolean) => {
    if (deleteTransactions) {
      // Get linked transactions and reverse their account impact
      const { data: txns } = await supabase.from('transactions').select('*').eq('borrowing_id', id)
      if (txns) {
        for (const t of txns) {
          if (t.from_account_id) {
            const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
            if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - delta(t.transaction_type, t.amount) }).eq('id', t.from_account_id)
          }
        }
        await supabase.from('transactions').delete().eq('borrowing_id', id)
      }
    }
    await supabase.from('borrowings').delete().eq('id', id)
    setState(s => ({
      ...s,
      borrowings: s.borrowings.filter(b => b.id !== id),
      transactions: deleteTransactions ? s.transactions.filter(t => (t as any).borrowing_id !== id) : s.transactions,
    }))
  }, [])

  const recordBorrowingPayment = useCallback(async (
    borrowing: AppState['borrowings'][0], payment: number, accountId: string | null,
    incoming: boolean, categoryId: string | null = null, addTransaction: boolean = true,
  ) => {
    const today = new Date().toISOString().slice(0, 10)
    const newPaid = Math.min(borrowing.total_amount, borrowing.paid_amount + payment)
    await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', borrowing.id)

    let newTx: Transaction | null = null
    if (addTransaction && accountId) {
      const { data } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${borrowing.person_name} – ${incoming ? 'received repayment' : 'repayment'}`,
        amount: payment,
        transaction_type: incoming ? 'income' : 'expense',
        category_id: categoryId,
        from_account_id: accountId,
        to_account_id: null,
        notes: '',
        user_id: userId,
        borrowing_id: borrowing.id,
      }).select('*, category:categories(*)').single()
      newTx = data as Transaction

      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) await supabase.from('accounts').update({ current_balance: incoming ? acc.current_balance + payment : acc.current_balance - payment }).eq('id', accountId)
    }

    setState(s => ({
      ...s,
      borrowings: s.borrowings.map(b => b.id === borrowing.id ? { ...b, paid_amount: newPaid, remaining_amount: b.total_amount - newPaid } : b),
      transactions: newTx ? [newTx, ...s.transactions] : s.transactions,
      accounts: (addTransaction && accountId) ? s.accounts.map(a => a.id !== accountId ? a : { ...a, current_balance: a.current_balance + (incoming ? payment : -payment) }) : s.accounts,
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

  const markCommitmentPaid = useCallback(async (cm: Commitment, recordExpense: boolean = false, accountId: string | null = null) => {
    const today = new Date().toISOString().slice(0, 10)
    const payAmount = cm.amount || cm.remaining || 0
    const isCreditCard = state.credit_cards.some(c => c.id === cm.from_account_id)
    const newInstallment = (cm.current_installment || 0) + 1
    const isComplete = cm.total_installments ? newInstallment >= cm.total_installments : false

    // Update commitment
    const commitmentUpdate: any = { last_paid_date: today, current_installment: newInstallment }
    if (!cm.is_recurring) commitmentUpdate.remaining = Math.max(0, cm.remaining - payAmount)
    if (isComplete) commitmentUpdate.is_active = false
    await supabase.from('commitments').update(commitmentUpdate).eq('id', cm.id)

    // CC commitment — record expense + increase card outstanding
    if (isCreditCard) {
      const { data: newTx } = await supabase.from('transactions').insert({
        transaction_date: today, description: cm.name, amount: payAmount,
        transaction_type: 'expense', category_id: cm.category_id,
        from_account_id: null, credit_card_id: cm.from_account_id,
        to_account_id: null, notes: '', user_id: userId,
      }).select('*, category:categories(*)').single()

      // Increase card outstanding
      const card = state.credit_cards.find(c => c.id === cm.from_account_id)
      if (card) {
        const newBalance = card.current_balance + payAmount
        await supabase.from('credit_cards').update({ current_balance: newBalance }).eq('id', card.id)
      }

      setState(s => ({
        ...s,
        transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
        credit_cards: s.credit_cards.map(c => c.id === cm.from_account_id ? { ...c, current_balance: c.current_balance + payAmount } : c),
        commitments: s.commitments.map(c => c.id === cm.id ? {
          ...c, last_paid_date: today, current_installment: newInstallment,
          remaining: commitmentUpdate.remaining ?? c.remaining,
          is_active: isComplete ? false : c.is_active,
        } : c),
      }))
      return
    }

    // Non-CC — record expense if confirmed
    if (recordExpense && accountId) {
      const { data: newTx } = await supabase.from('transactions').insert({
        transaction_date: today, description: cm.name, amount: payAmount,
        transaction_type: 'commitment', category_id: cm.category_id,
        from_account_id: accountId, to_account_id: null, notes: '', user_id: userId,
      }).select('*, category:categories(*)').single()

      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - payAmount }).eq('id', accountId)

      setState(s => ({
        ...s,
        transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
        accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance - payAmount } : a),
        commitments: s.commitments.map(c => c.id === cm.id ? {
          ...c, last_paid_date: today, current_installment: newInstallment,
          remaining: commitmentUpdate.remaining ?? c.remaining,
          is_active: isComplete ? false : c.is_active,
        } : c),
      }))
    } else {
      setState(s => ({
        ...s,
        commitments: s.commitments.map(c => c.id === cm.id ? {
          ...c, last_paid_date: today, current_installment: newInstallment,
          remaining: commitmentUpdate.remaining ?? c.remaining,
          is_active: isComplete ? false : c.is_active,
        } : c),
      }))
    }
  }, [userId, state.credit_cards])

  const updateSettings = useCallback(async (patch: Partial<AppState['settings']>) => {
    try {
      await supabase.from('settings').update(patch).eq('id', state.settings.id)
      setState(s => ({ ...s, settings: { ...s.settings, ...patch } }))
    } catch (err) { console.error('Failed to update settings:', err); throw err }
  }, [state.settings.id])

  // Reverse a borrowing-linked transaction (called when user deletes it from TransactionsPage)
  const reversePayment = useCallback(async (t: Transaction) => {
    if (!t.borrowing_id) return
    // Reverse account balance
    if (t.from_account_id) {
      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
      if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - delta(t.transaction_type, t.amount) }).eq('id', t.from_account_id)
    }
    // Reverse paid_amount on borrowing
    const { data: borrowing } = await supabase.from('borrowings').select('paid_amount, total_amount').eq('id', t.borrowing_id).single()
    if (borrowing) {
      const newPaid = Math.max(0, borrowing.paid_amount - t.amount)
      await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', t.borrowing_id)
      setState(s => ({
        ...s,
        borrowings: s.borrowings.map(b => b.id === t.borrowing_id ? { ...b, paid_amount: newPaid, remaining_amount: b.total_amount - newPaid } : b),
        accounts: t.from_account_id ? s.accounts.map(a => a.id === t.from_account_id ? { ...a, current_balance: a.current_balance - delta(t.transaction_type, t.amount) } : a) : s.accounts,
      }))
    }
    // Delete the transaction
    await supabase.from('transactions').delete().eq('id', t.id)
    setState(s => ({ ...s, transactions: s.transactions.filter(tx => tx.id !== t.id) }))
  }, [])

  // ── Credit Cards CRUD ────────────────────────────────────────────────────────
  const addCreditCard = useCallback(async (form: Omit<CreditCard, 'id' | 'user_id' | 'is_active'>) => {
    const { data, error } = await supabase.from('credit_cards').insert({ ...form, user_id: userId, is_active: true }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, credit_cards: [...s.credit_cards, data as CreditCard] }))
  }, [userId])

  const updateCreditCard = useCallback(async (id: string, form: Omit<CreditCard, 'id' | 'user_id' | 'is_active'>) => {
    const { data, error } = await supabase.from('credit_cards').update(form).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, credit_cards: s.credit_cards.map(c => c.id === id ? data as CreditCard : c) }))
  }, [])

  const deleteCreditCard = useCallback(async (id: string) => {
    await supabase.from('credit_cards').update({ is_active: false }).eq('id', id)
    setState(s => ({ ...s, credit_cards: s.credit_cards.filter(c => c.id !== id) }))
  }, [])

  const payCreditCardBill = useCallback(async (card: CreditCard, amount: number, accountId: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
    if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - amount }).eq('id', accountId)
    await supabase.from('credit_cards').update({ current_balance: card.current_balance - amount }).eq('id', card.id)
    const { data: newTx } = await supabase.from('transactions').insert({
      transaction_date: today,
      description: `${card.name} bill payment`,
      amount,
      transaction_type: 'expense',
      category_id: null,
      from_account_id: accountId,
      to_account_id: null,
      notes: '',
      user_id: userId,
    }).select('*, category:categories(*)').single()

    setState(s => ({
      ...s,
      credit_cards: s.credit_cards.map(c => c.id === card.id ? { ...c, current_balance: c.current_balance - amount } : c),
      accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance - amount } : a),
      transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
    }))
  }, [userId])

  const updateCreditCardBalance = useCallback(async (card: CreditCard, spentAmount: number) => {
    const newBalance = card.current_balance + spentAmount
    await supabase.from('credit_cards').update({ current_balance: newBalance }).eq('id', card.id)
    setState(s => ({ ...s, credit_cards: s.credit_cards.map(c => c.id === card.id ? { ...c, current_balance: newBalance } : c) }))
  }, [])

  return {
    state, setState, loading, usingSupabase,
    addTransaction, deleteTransaction, updateTransaction, updateSettings,
    addAccount, deleteAccount, adjustBalance,
    addGroup, updateGroup, deleteGroup,
    addCategory, updateCategory, deleteCategory,
    addCreditCard, updateCreditCard, deleteCreditCard, payCreditCardBill, updateCreditCardBalance,
    addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, reversePayment,
    addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid,
  }
}