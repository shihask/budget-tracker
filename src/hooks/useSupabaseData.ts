import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction, Commitment, TransactionType, Group, Category, CreditCard, Goal, Savings } from '@/types'
import { INCOME_GROUP, TRANSFER_GROUP, BORROWING_GROUP, SAVINGS_GROUP, BORROWING_CREDIT_CATS } from '@/lib/constants'

const delta = (type: TransactionType, amount: number) =>
  type === 'income' ? amount : -amount

// 'Borrowed Money' and 'Lent Repayment' are credits (money came in); the other two are debits.
const borrowingIsCredit = (categoryName: string | undefined) =>
  BORROWING_CREDIT_CATS.has(categoryName ?? '')

const EMPTY_STATE: AppState = {
  accounts: [],
  categories: [],
  groups: [],
  credit_cards: [],
  settings: { id: '', weekly_budget: 5000, emergency_fund: 0, salary_date: null, track_credit_cards: false, track_borrowings: true, autopilot_enabled: false, weekly_budget_scope: null, ai_requests_used: 0, ai_requests_reset_at: null, budget_period: 'weekly', weekly_start_day: 1, monthly_start_date: 1, notifications_enabled: false, notify_daily_reminder: true, notify_budget_alert: true, notify_commitments: true, notify_weekly_summary: true, track_savings: false },
  commitments: [],
  borrowings: [],
  transactions: [],
  goals: [],
  savings: [],
}

const DEFAULT_SETTINGS = { weekly_budget: 5000, emergency_fund: 0, salary_date: null, track_credit_cards: false }

const DEFAULT_GROUPS: { name: string; is_system?: boolean }[] = [
  { name: 'Lifestyle' },
  { name: 'Commitment' },
  { name: 'Renovation' },
  { name: 'Family' },
  { name: 'Transfer',  is_system: true },
  { name: 'Income',    is_system: true },
]

const DEFAULT_CATEGORIES: { name: string; group_name: string }[] = [
  { name: 'Food & Tea',    group_name: 'Lifestyle' },
  { name: 'Groceries',     group_name: 'Lifestyle' },
  { name: 'Fuel',          group_name: 'Lifestyle' },
  { name: 'Shopping',      group_name: 'Lifestyle' },
  { name: 'Medical',       group_name: 'Lifestyle' },
  { name: 'Utilities',     group_name: 'Lifestyle' },
  { name: 'Loan EMI',      group_name: 'Commitment' },
  { name: 'Gold Scheme',   group_name: 'Commitment' },
  { name: 'SIP',           group_name: 'Commitment' },
  { name: 'Renovation',    group_name: 'Renovation' },
  { name: 'Family',        group_name: 'Family' },
  { name: 'Transfer',      group_name: 'Transfer' },
  { name: 'Salary',        group_name: 'Income' },
  { name: 'Freelance',     group_name: 'Income' },
  { name: 'Refund',        group_name: 'Income' },
  { name: 'Other Income',  group_name: 'Income' },
]

const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Refund', 'Other Income']
const BORROWING_CATEGORIES = ['Lent Money', 'Lent Repayment', 'Borrowed Money', 'Borrow Repayment']

const SAVINGS_TYPE_LABEL: Record<string, string> = {
  sip:     'SIP / Mutual Fund',
  gold:    'Gold Scheme',
  rd:      'Recurring Deposit',
  fd:      'Fixed Deposit',
  ppf_nps: 'PPF / NPS',
  chit:    'Chit Fund',
  custom:  'Savings',
}
const savingsContribNote = (type: string) => `${SAVINGS_TYPE_LABEL[type] ?? 'Savings'} Contribution`
const savingsWithdrawNote = (type: string, isChit: boolean) =>
  isChit ? 'Chit Fund Payout' : `${SAVINGS_TYPE_LABEL[type] ?? 'Savings'} Redemption`
const SAVINGS_CATEGORIES = ['SIP', 'Gold Scheme', 'Recurring Deposit', 'Fixed Deposit', 'PPF / NPS', 'Chit Fund']

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
          { data: goals },
          { data: savingsRows },
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
          supabase.from('goals').select('*').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('savings').select('*').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }),
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
            .insert(DEFAULT_GROUPS.map(g => ({ ...g, user_id: userId })))
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

        // Dedup ALL groups by name (in-memory — initial query already loaded all rows incl. duplicates)
        const groupsByName = new Map<string, Group[]>()
        for (const g of userGroups as Group[]) {
          const arr = groupsByName.get(g.name) || []
          arr.push(g)
          groupsByName.set(g.name, arr)
        }
        const groupExtras: string[] = []
        const dedupedGroups: Group[] = []
        for (const rows of groupsByName.values()) {
          dedupedGroups.push(rows[0])
          for (const extra of rows.slice(1)) groupExtras.push(extra.id)
        }
        if (groupExtras.length > 0) {
          await supabase.from('groups').delete().in('id', groupExtras)
        }
        userGroups = dedupedGroups

        // Migration: ensure Income group exists and is marked system
        const existingIncomeGroup = userGroups.find(g => g.name === INCOME_GROUP)
        if (!existingIncomeGroup) {
          const { data: newGroup } = await supabase
            .from('groups').insert({ name: INCOME_GROUP, user_id: userId, is_system: true }).select('*').single()
          if (newGroup) userGroups = [...userGroups, newGroup as Group]
        } else if (!existingIncomeGroup.is_system) {
          await supabase.from('groups').update({ is_system: true }).eq('id', existingIncomeGroup.id)
          userGroups = userGroups.map(g => g.id === existingIncomeGroup.id ? { ...g, is_system: true } : g)
        }

        // Migration: ensure Transfer group is marked system
        const existingTransferGroup = userGroups.find(g => g.name === TRANSFER_GROUP)
        if (existingTransferGroup && !existingTransferGroup.is_system) {
          await supabase.from('groups').update({ is_system: true }).eq('id', existingTransferGroup.id)
          userGroups = userGroups.map(g => g.id === existingTransferGroup.id ? { ...g, is_system: true } : g)
        }

        // Dedup ALL categories by (name, group_name) — same in-memory approach
        const catsByKey = new Map<string, Category[]>()
        for (const cat of userCategories as Category[]) {
          const key = `${cat.name}|${cat.group_name}`
          const arr = catsByKey.get(key) || []
          arr.push(cat)
          catsByKey.set(key, arr)
        }
        const catExtras: string[] = []
        const dedupedCats: Category[] = []
        for (const rows of catsByKey.values()) {
          dedupedCats.push(rows[0])
          for (const extra of rows.slice(1)) catExtras.push(extra.id)
        }
        if (catExtras.length > 0) {
          await supabase.from('categories').delete().in('id', catExtras)
        }
        userCategories = dedupedCats

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

        // Ensure Borrowing group and categories exist when tracker is enabled
        if (settings.track_borrowings) {
          const existingBorrowingGroup = userGroups.find(g => g.name === BORROWING_GROUP)
          if (!existingBorrowingGroup) {
            const { data: newGroup } = await supabase
              .from('groups').insert({ name: BORROWING_GROUP, user_id: userId, is_system: true }).select('*').single()
            if (newGroup) userGroups = [...userGroups, newGroup as Group]
          } else if (!existingBorrowingGroup.is_system) {
            // Migration: mark existing Borrowing group as system
            await supabase.from('groups').update({ is_system: true }).eq('id', existingBorrowingGroup.id)
            userGroups = userGroups.map(g => g.id === existingBorrowingGroup.id ? { ...g, is_system: true } : g)
          }
          const existingBorrowingNames = userCategories.filter(c => c.group_name === BORROWING_GROUP).map(c => c.name)
          const borrowingCatsToAdd = BORROWING_CATEGORIES.filter(n => !existingBorrowingNames.includes(n))
          if (borrowingCatsToAdd.length > 0) {
            const { data: newCats } = await supabase
              .from('categories')
              .insert(borrowingCatsToAdd.map(name => ({ name, group_name: BORROWING_GROUP, user_id: userId })))
              .select('*')
            if (newCats) userCategories = [...userCategories, ...(newCats as Category[])]
          }
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
          goals: (goals as Goal[]) || [],
          savings: (savingsRows as Savings[]) || [],
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
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }
  ) => {
    try {
      const isCreditCard = state.credit_cards.some(c => c.id === form.from_account_id)
      const toAccountId = form.transaction_type === 'transfer' ? (form.to_account_id ?? null) : null
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
          to_account_id: toAccountId,
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
        if (toAccountId) {
          const { data: toAcc } = await supabase.from('accounts').select('current_balance').eq('id', toAccountId).single()
          if (toAcc) await supabase.from('accounts').update({ current_balance: toAcc.current_balance + form.amount }).eq('id', toAccountId)
        }
        setState(s => ({
          ...s,
          transactions: [newTx as Transaction, ...s.transactions],
          accounts: s.accounts.map(a => {
            let bal = a.current_balance
            if (a.id === form.from_account_id) bal += delta(form.transaction_type, form.amount)
            if (toAccountId && a.id === toAccountId) bal += form.amount
            return bal !== a.current_balance ? { ...a, current_balance: bal } : a
          }),
        }))
      }
    } catch (err) { console.error('Failed to save transaction:', err); throw err }
  }, [userId, state.credit_cards])

  const deleteTransaction = useCallback(async (t: Transaction) => {
    try {
      await supabase.from('transactions').delete().eq('id', t.id)
      if (t.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
        if (acc) {
          let newBal: number
          if (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') {
            const catName = stateRef.current.categories.find(c => c.id === t.category_id)?.name
            newBal = borrowingIsCredit(catName)
              ? acc.current_balance - t.amount   // was credit → reverse = debit
              : acc.current_balance + t.amount   // was debit  → reverse = credit
          } else {
            newBal = acc.current_balance - delta(t.transaction_type, t.amount)
          }
          await supabase.from('accounts').update({ current_balance: newBal }).eq('id', t.from_account_id)
        }
      }
      if (t.transaction_type === 'transfer' && t.to_account_id) {
        const { data: toAcc } = await supabase.from('accounts').select('current_balance').eq('id', t.to_account_id).single()
        if (toAcc) await supabase.from('accounts').update({ current_balance: toAcc.current_balance - t.amount }).eq('id', t.to_account_id)
      }
      setState(s => ({
        ...s,
        transactions: s.transactions.filter(tx => tx.id !== t.id),
        accounts: s.accounts.map(a => {
          let bal = a.current_balance
          if (a.id === t.from_account_id) {
            if (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') {
              const catName = s.categories.find(c => c.id === t.category_id)?.name
              bal += borrowingIsCredit(catName) ? -t.amount : t.amount
            } else {
              bal -= delta(t.transaction_type, t.amount)
            }
          }
          if (t.transaction_type === 'transfer' && a.id === t.to_account_id) bal -= t.amount
          return bal !== a.current_balance ? { ...a, current_balance: bal } : a
        }),
      }))
    } catch (err) { console.error('Failed to delete transaction:', err); throw err }
  }, [])

  const updateTransaction = useCallback(async (
    old: Transaction,
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }
  ) => {
    try {
      const toAccountId = form.transaction_type === 'transfer' ? (form.to_account_id ?? null) : null
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({ transaction_date: form.transaction_date, description: form.description, amount: form.amount, transaction_type: form.transaction_type, category_id: form.category_id, from_account_id: form.from_account_id, to_account_id: toAccountId })
        .eq('id', old.id)
        .select('*, category:categories(*)')
        .single()
      if (error) throw error
      // Reverse old transaction's balance effects
      if (old.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', old.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance - delta(old.transaction_type, old.amount) }).eq('id', old.from_account_id)
      }
      if (old.transaction_type === 'transfer' && old.to_account_id) {
        const { data: toAcc } = await supabase.from('accounts').select('current_balance').eq('id', old.to_account_id).single()
        if (toAcc) await supabase.from('accounts').update({ current_balance: toAcc.current_balance - old.amount }).eq('id', old.to_account_id)
      }
      // Apply new transaction's balance effects
      if (form.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', form.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance + delta(form.transaction_type, form.amount) }).eq('id', form.from_account_id)
      }
      if (toAccountId) {
        const { data: toAcc } = await supabase.from('accounts').select('current_balance').eq('id', toAccountId).single()
        if (toAcc) await supabase.from('accounts').update({ current_balance: toAcc.current_balance + form.amount }).eq('id', toAccountId)
      }
      setState(s => ({
        ...s,
        transactions: s.transactions.map(t => t.id === old.id ? updated as Transaction : t),
        accounts: s.accounts.map(a => {
          let bal = a.current_balance
          if (a.id === old.from_account_id) bal -= delta(old.transaction_type, old.amount)
          if (old.transaction_type === 'transfer' && a.id === old.to_account_id) bal -= old.amount
          if (a.id === form.from_account_id) bal += delta(form.transaction_type, form.amount)
          if (toAccountId && a.id === toAccountId) bal += form.amount
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

  const updateAccount = useCallback(async (id: string, form: { name: string; type: string; current_balance: number }) => {
    try {
      await supabase.from('accounts').update(form).eq('id', id)
      setState(s => ({ ...s, accounts: s.accounts.map(a => a.id === id ? { ...a, name: form.name, type: form.type as import('@/types').AccountType, current_balance: form.current_balance } : a) }))
    } catch (err) { console.error('Failed to update account:', err); throw err }
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
  const stateRef = useRef(state)
  stateRef.current = state

  const addCategory = useCallback(async (name: string, group_name: string): Promise<string> => {
    // Return existing category if one with the same name already exists (case-insensitive)
    const existing = stateRef.current.categories.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing.id
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

  const toggleGroupVisibility = useCallback(async (id: string, visible: boolean) => {
    await supabase.from('groups').update({ is_visible: visible }).eq('id', id)
    setState(s => ({ ...s, groups: s.groups.map(g => g.id === id ? { ...g, is_visible: visible } : g) }))
  }, [])

  const toggleCategoryVisibility = useCallback(async (id: string, visible: boolean) => {
    await supabase.from('categories').update({ is_visible: visible }).eq('id', id)
    setState(s => ({ ...s, categories: s.categories.map(c => c.id === id ? { ...c, is_visible: visible } : c) }))
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
      const borrowedCatId = stateRef.current.categories.find(c => c.name === 'Borrowed Money' && c.group_name === BORROWING_GROUP)?.id ?? null
      const { data: newTx } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${form.person_name} – borrowed`,
        amount: form.total_amount,
        transaction_type: 'borrowing',
        category_id: borrowedCatId,
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
      const lentCatId = stateRef.current.categories.find(c => c.name === 'Lent Money' && c.group_name === BORROWING_GROUP)?.id ?? null
      const { data: newTx } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${form.person_name} – lent`,
        amount: form.total_amount,
        transaction_type: 'borrowing',
        category_id: lentCatId,
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
            if (acc) {
              let newBal: number
              if (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') {
                const catName = stateRef.current.categories.find(c => c.id === t.category_id)?.name
                newBal = borrowingIsCredit(catName)
                  ? acc.current_balance - t.amount
                  : acc.current_balance + t.amount
              } else {
                newBal = acc.current_balance - delta(t.transaction_type, t.amount)
              }
              await supabase.from('accounts').update({ current_balance: newBal }).eq('id', t.from_account_id)
            }
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
    incoming: boolean, _categoryId: string | null = null, addTransaction: boolean = true,
  ) => {
    const today = new Date().toISOString().slice(0, 10)
    const newPaid = Math.min(borrowing.total_amount, borrowing.paid_amount + payment)
    await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', borrowing.id)

    // incoming=true → received repayment on a lent → 'Lent Repayment' (credit)
    // incoming=false → made repayment on borrowed → 'Borrow Repayment' (debit)
    const repaymentCatName = incoming ? 'Lent Repayment' : 'Borrow Repayment'
    const repaymentCatId = stateRef.current.categories.find(c => c.name === repaymentCatName && c.group_name === BORROWING_GROUP)?.id ?? null

    let newTx: Transaction | null = null
    if (addTransaction && accountId) {
      const { data } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: `${borrowing.person_name} – ${incoming ? 'received repayment' : 'repayment'}`,
        amount: payment,
        transaction_type: 'borrowing_repayment',
        category_id: repaymentCatId,
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

  // ── Goals CRUD ───────────────────────────────────────────────────────────────
  const addGoal = useCallback(async (form: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => {
    const { data, error } = await supabase.from('goals').insert({ ...form, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, goals: [data as Goal, ...s.goals] }))
  }, [userId])

  const updateGoal = useCallback(async (id: string, patch: Partial<Goal>) => {
    const { data, error } = await supabase.from('goals').update(patch).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, goals: s.goals.map(g => g.id === id ? data as Goal : g) }))
  }, [])

  const deleteGoal = useCallback(async (id: string) => {
    await supabase.from('goals').delete().eq('id', id)
    setState(s => ({ ...s, goals: s.goals.filter(g => g.id !== id) }))
  }, [])

  const addGoalSavings = useCallback(async (id: string, amount: number) => {
    const goal = stateRef.current.goals.find(g => g.id === id)
    if (!goal) return
    const newSaved = goal.current_saved + amount
    await supabase.from('goals').update({ current_saved: newSaved }).eq('id', id)
    setState(s => ({ ...s, goals: s.goals.map(g => g.id === id ? { ...g, current_saved: newSaved } : g) }))
  }, [])

  // ── Savings CRUD ─────────────────────────────────────────────────────────────

  const addSavings = useCallback(async (form: Omit<Savings, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('savings').insert({ ...form, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, savings: [data as Savings, ...s.savings] }))
  }, [userId])

  const updateSavings = useCallback(async (id: string, patch: Partial<Omit<Savings, 'id' | 'user_id' | 'created_at'>>) => {
    const { data, error } = await supabase.from('savings').update(patch).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, savings: s.savings.map(sv => sv.id === id ? data as Savings : sv) }))
  }, [])

  const deleteSavings = useCallback(async (id: string) => {
    await supabase.from('savings').delete().eq('id', id)
    setState(s => ({ ...s, savings: s.savings.filter(sv => sv.id !== id) }))
  }, [])

  const recordContribution = useCallback(async (
    sv: Savings,
    recordExpense: boolean,
    accountId: string | null
  ) => {
    const today = new Date().toISOString().split('T')[0]
    const newInstallment = sv.current_installment + 1
    const patch: Partial<Savings> = {
      current_installment: newInstallment,
      last_contribution_date: today,
    }

    // Mark complete if all installments done
    if (sv.total_installments && newInstallment >= sv.total_installments) {
      patch.is_active = false
    }

    await supabase.from('savings').update(patch).eq('id', sv.id)

    if (recordExpense && accountId) {
      // Deduct from account
      const { data: acc } = await supabase
        .from('accounts').select('current_balance').eq('id', accountId).single()
      if (acc) {
        await supabase.from('accounts')
          .update({ current_balance: acc.current_balance - sv.amount })
          .eq('id', accountId)
      }
      // Record transaction
      const { data: newTx } = await supabase.from('transactions').insert({
        user_id: userId,
        transaction_date: today,
        description: sv.name,
        amount: sv.amount,
        transaction_type: 'savings_contribution',
        category_id: sv.category_id,
        from_account_id: accountId,
        to_account_id: null,
        notes: savingsContribNote(sv.type),
      }).select('*, category:categories(*)').single()

      setState(s => ({
        ...s,
        savings: s.savings.map(item => item.id === sv.id ? { ...item, ...patch } : item),
        accounts: s.accounts.map(a =>
          a.id === accountId ? { ...a, current_balance: a.current_balance - sv.amount } : a
        ),
        transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
      }))
    } else {
      setState(s => ({
        ...s,
        savings: s.savings.map(item => item.id === sv.id ? { ...item, ...patch } : item),
      }))
    }
  }, [userId])

  const updateSavingsValue = useCallback(async (id: string, currentValue: number) => {
    await supabase.from('savings').update({ current_value: currentValue }).eq('id', id)
    setState(s => ({ ...s, savings: s.savings.map(sv => sv.id === id ? { ...sv, current_value: currentValue } : sv) }))
  }, [])

  const recordSavingsPayout = useCallback(async (sv: Savings, amount: number, accountId: string) => {
    const today = new Date().toISOString().split('T')[0]
    const label = sv.type === 'chit' ? `${sv.name} — Chit Prize` : `${sv.name} — Redemption`

    // Credit the account
    const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
    if (acc) {
      await supabase.from('accounts').update({ current_balance: acc.current_balance + amount }).eq('id', accountId)
    }

    // Record as savings_withdrawal (not income — doesn't affect budget/earnings)
    const { data: newTx } = await supabase.from('transactions').insert({
      user_id: userId,
      transaction_date: today,
      description: label,
      amount,
      transaction_type: 'savings_withdrawal',
      category_id: null,
      from_account_id: null,
      to_account_id: accountId,
      notes: savingsWithdrawNote(sv.type, sv.type === 'chit'),
    }).select('*, category:categories(*)').single()

    // For non-chit: reduce current_value by the withdrawn amount
    let savingsPatch: Partial<Savings> | undefined
    if (sv.type !== 'chit') {
      const newValue = Math.max(0, sv.current_value - amount)
      savingsPatch = { current_value: newValue }
      await supabase.from('savings').update({ current_value: newValue }).eq('id', sv.id)
    }

    setState(s => ({
      ...s,
      accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance + amount } : a),
      transactions: newTx ? [newTx as Transaction, ...s.transactions] : s.transactions,
      savings: savingsPatch ? s.savings.map(item => item.id === sv.id ? { ...item, ...savingsPatch } : item) : s.savings,
    }))
  }, [userId])

  const updateSettings = useCallback(async (patch: Partial<AppState['settings']>) => {
    try {
      await supabase.from('settings').update(patch).eq('id', state.settings.id)
      setState(s => ({ ...s, settings: { ...s.settings, ...patch } }))

      if (patch.track_savings === true) {
        let newGroups = [...stateRef.current.groups]
        let newCategories = [...stateRef.current.categories]

        const existingSavingsGroup = newGroups.find(g => g.name === SAVINGS_GROUP)
        if (!existingSavingsGroup) {
          const { data: newGroup } = await supabase
            .from('groups').insert({ name: SAVINGS_GROUP, user_id: userId, is_system: true }).select('*').single()
          if (newGroup) newGroups = [...newGroups, newGroup as Group]
        } else if (!existingSavingsGroup.is_system) {
          await supabase.from('groups').update({ is_system: true }).eq('id', existingSavingsGroup.id)
          newGroups = newGroups.map(g => g.id === existingSavingsGroup.id ? { ...g, is_system: true } : g)
        }

        // Skip creating categories that already exist under any group (avoids duplicates for existing users)
        const allExistingNames = new Set(newCategories.map(c => c.name))
        const existingSavingsNames = newCategories.filter(c => c.group_name === SAVINGS_GROUP).map(c => c.name)
        const savingsCatsToAdd = SAVINGS_CATEGORIES.filter(n => !existingSavingsNames.includes(n) && !allExistingNames.has(n))
        if (savingsCatsToAdd.length > 0) {
          const { data: seededCats } = await supabase
            .from('categories')
            .insert(savingsCatsToAdd.map(name => ({ name, group_name: SAVINGS_GROUP, user_id: userId })))
            .select('*')
          if (seededCats) newCategories = [...newCategories, ...(seededCats as Category[])]
        }

        setState(s => ({ ...s, groups: newGroups, categories: newCategories }))
      }

      if (patch.track_borrowings === true) {
        let newGroups = [...stateRef.current.groups]
        let newCategories = [...stateRef.current.categories]

        const existingBorrowingGroup = newGroups.find(g => g.name === BORROWING_GROUP)
        if (!existingBorrowingGroup) {
          const { data: newGroup } = await supabase
            .from('groups').insert({ name: BORROWING_GROUP, user_id: userId, is_system: true }).select('*').single()
          if (newGroup) newGroups = [...newGroups, newGroup as Group]
        } else if (!existingBorrowingGroup.is_system) {
          await supabase.from('groups').update({ is_system: true }).eq('id', existingBorrowingGroup.id)
          newGroups = newGroups.map(g => g.id === existingBorrowingGroup.id ? { ...g, is_system: true } : g)
        }

        const existingBorrowingNames = newCategories.filter(c => c.group_name === BORROWING_GROUP).map(c => c.name)
        const borrowingCatsToAdd = BORROWING_CATEGORIES.filter(n => !existingBorrowingNames.includes(n))
        if (borrowingCatsToAdd.length > 0) {
          const { data: seededCats } = await supabase
            .from('categories')
            .insert(borrowingCatsToAdd.map(name => ({ name, group_name: BORROWING_GROUP, user_id: userId })))
            .select('*')
          if (seededCats) newCategories = [...newCategories, ...(seededCats as Category[])]
        }

        setState(s => ({ ...s, groups: newGroups, categories: newCategories }))
      }
    } catch (err) { console.error('Failed to update settings:', err); throw err }
  }, [state.settings.id, userId])

  // Reverse a borrowing-linked transaction (called when user deletes it from TransactionsPage)
  const reversePayment = useCallback(async (t: Transaction) => {
    if (!t.borrowing_id) return
    // Reverse account balance
    if (t.from_account_id) {
      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
      if (acc) {
        let newBal: number
        if (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') {
          const catName = stateRef.current.categories.find(c => c.id === t.category_id)?.name
          newBal = borrowingIsCredit(catName)
            ? acc.current_balance - t.amount
            : acc.current_balance + t.amount
        } else {
          newBal = acc.current_balance - delta(t.transaction_type, t.amount)
        }
        await supabase.from('accounts').update({ current_balance: newBal }).eq('id', t.from_account_id)
      }
    }
    // Reverse paid_amount on borrowing
    const { data: borrowing } = await supabase.from('borrowings').select('paid_amount, total_amount').eq('id', t.borrowing_id).single()
    if (borrowing) {
      const newPaid = Math.max(0, borrowing.paid_amount - t.amount)
      await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', t.borrowing_id)
      setState(s => {
        const catName = s.categories.find(c => c.id === t.category_id)?.name
        const isBorrowingType = t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment'
        const balDelta = isBorrowingType
          ? (borrowingIsCredit(catName) ? -t.amount : t.amount)
          : -delta(t.transaction_type, t.amount)
        return {
          ...s,
          borrowings: s.borrowings.map(b => b.id === t.borrowing_id ? { ...b, paid_amount: newPaid, remaining_amount: b.total_amount - newPaid } : b),
          accounts: t.from_account_id ? s.accounts.map(a => a.id === t.from_account_id ? { ...a, current_balance: a.current_balance + balDelta } : a) : s.accounts,
        }
      })
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
    addAccount, deleteAccount, updateAccount,
    addGroup, updateGroup, deleteGroup, toggleGroupVisibility,
    addCategory, updateCategory, deleteCategory, toggleCategoryVisibility,
    addCreditCard, updateCreditCard, deleteCreditCard, payCreditCardBill, updateCreditCardBalance,
    addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, reversePayment,
    addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid,
    addGoal, updateGoal, deleteGoal, addGoalSavings,
    addSavings, updateSavings, deleteSavings, recordContribution, updateSavingsValue, recordSavingsPayout,
  }
}