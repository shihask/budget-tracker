import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction, Commitment, TransactionType, Group, Category, CreditCard, Goal, GoalContribution, Savings, PlannedExpense, BudgetBucket, ForecastSettings, BudgetStrategySettings } from '@/types'
import { INCOME_GROUP, TRANSFER_GROUP, BORROWING_GROUP, SAVINGS_GROUP, ADJUSTMENT_GROUP } from '@/lib/constants'
import { getCreditCardBilling } from '@/lib/credit-card'
import { withTimeout } from '@/lib/utils'
import type { PickedReceipt } from '@/lib/imageCompress'

const RECEIPT_NETWORK_TIMEOUT_MS = 20_000

export const delta = (type: TransactionType, amount: number) => {
  switch (type) {
    case 'income':
    case 'opening_balance':
      return amount    // credits the account
    default:
      return -amount   // debits the account (expense, commitment, balance_adjustment-debit, etc.)
  }
}

const EMPTY_STATE: AppState = {
  accounts: [],
  categories: [],
  groups: [],
  credit_cards: [],
  settings: { id: '', weekly_budget: 5000, emergency_fund: 0, salary_date: null, track_credit_cards: false, track_borrowings: true, autopilot_enabled: false, weekly_budget_scope: null, ai_requests_used: 0, ai_requests_reset_at: null, budget_period: 'weekly', weekly_start_day: 1, monthly_start_date: 1, notifications_enabled: false, notify_daily_reminder: true, notify_budget_alert: true, notify_commitments: true, notify_weekly_summary: true, notify_evening_recap: true, track_savings: false, budget_mode: 'auto', hero_mode: 'remaining', challenge_enabled: false, challenge_difficulty: 'medium', challenge_streak: 0, challenge_pot: 0, challenge_leaves: 0, challenge_month_leaves: 0, challenge_last_date: null, challenge_excluded_txn_ids: [], challenge_total_days: 0, challenge_success_days: 0, last_reflection_date: null, monthly_salary: null, income_pattern: 'monthly', weekly_income: null, income_day: null, average_daily_income: null, working_days_per_week: null, business_monthly_drawings: null, primary_income_category_id: null, cycle_start_free_money: null, cycle_snapshot_key: null, affordability_snapshot_date: null, affordability_snapshot_daily_lifestyle: null, affordability_snapshot_bills_total: null, track_aa_sync: false },
  forecast_settings: { id: '', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
  budget_strategy_settings: { id: '', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
  commitments: [],
  borrowings: [],
  transactions: [],
  goals: [],
  goal_contributions: [],
  savings: [],
  planned_expenses: [],
}

const DEFAULT_SETTINGS = { weekly_budget: 5000, emergency_fund: 0, salary_date: null, track_credit_cards: false, track_projects: false }

const DEFAULT_GROUPS: { name: string; is_system?: boolean; is_editable?: boolean; is_deletable?: boolean; type?: string }[] = [
  { name: 'Lifestyle',   type: 'discretionary' },
  { name: 'Utilities',   type: 'essential' },
  { name: 'Transport',   type: 'essential' },
  { name: 'Health',      type: 'essential' },
  { name: 'Family',      type: 'essential' },
  { name: 'Obligations', type: 'commitment' },
  { name: 'Other',       type: 'discretionary' },
  { name: TRANSFER_GROUP,   is_system: true, is_editable: false, is_deletable: false, type: 'transfer' },
  { name: INCOME_GROUP,     is_system: true, is_editable: false, is_deletable: false, type: 'income' },
  { name: ADJUSTMENT_GROUP, is_system: true, is_editable: false, is_deletable: false, type: 'adjustment' },
]

const DEFAULT_CATEGORIES: { name: string; group_name: string; is_system?: boolean }[] = [
  // Lifestyle
  { name: 'Food',                 group_name: 'Lifestyle' },
  { name: 'Tea & Snacks',         group_name: 'Lifestyle' },
  { name: 'Groceries',            group_name: 'Lifestyle' },
  { name: 'Shopping',             group_name: 'Lifestyle' },
  { name: 'Entertainment',        group_name: 'Lifestyle' },
  { name: 'Personal Care',        group_name: 'Lifestyle' },
  { name: 'Clothing',             group_name: 'Lifestyle' },
  { name: 'Gifts',                group_name: 'Lifestyle' },
  // Utilities
  { name: 'Electricity',          group_name: 'Utilities' },
  { name: 'Water',                group_name: 'Utilities' },
  { name: 'Internet',             group_name: 'Utilities' },
  { name: 'Mobile Recharge',      group_name: 'Utilities' },
  { name: 'Cooking Gas',          group_name: 'Utilities' },
  { name: 'Subscription',         group_name: 'Utilities' },
  { name: 'Household Supplies',   group_name: 'Utilities' },
  // Transport
  { name: 'Fuel',                 group_name: 'Transport' },
  { name: 'Bus',                  group_name: 'Transport' },
  { name: 'Train',                group_name: 'Transport' },
  { name: 'Taxi & Ride',           group_name: 'Transport' },
  { name: 'Parking',              group_name: 'Transport' },
  { name: 'Vehicle Maintenance',  group_name: 'Transport' },
  // Health
  { name: 'Medical',              group_name: 'Health' },
  { name: 'Pharmacy',             group_name: 'Health' },
  { name: 'Doctor Consultation',  group_name: 'Health' },
  { name: 'Lab Test',             group_name: 'Health' },
  // Family
  { name: 'Child Care',           group_name: 'Family' },
  { name: 'Education',            group_name: 'Family' },
  { name: 'Pet Care',             group_name: 'Family' },
  { name: 'Family Expense',       group_name: 'Family' },
  // Obligations
  { name: 'Loan EMI',             group_name: 'Obligations' },
  { name: 'Credit Card Bill',     group_name: 'Obligations' },
  { name: 'Insurance Premium',    group_name: 'Obligations' },
  { name: 'Rent',                 group_name: 'Obligations' },
  { name: 'School Fees',          group_name: 'Obligations' },
  // Other
  { name: 'Other Expense',        group_name: 'Other' },
  // System categories
  { name: 'Transfer',             group_name: TRANSFER_GROUP,   is_system: true },
  { name: 'Salary',               group_name: INCOME_GROUP,     is_system: true },
  { name: 'Freelance',            group_name: INCOME_GROUP,     is_system: true },
  { name: 'Refund',               group_name: INCOME_GROUP,     is_system: true },
  { name: 'Other Income',         group_name: INCOME_GROUP,     is_system: true },
  { name: 'Opening Balance',      group_name: ADJUSTMENT_GROUP, is_system: true },
  { name: 'Balance Adjustment',   group_name: ADJUSTMENT_GROUP, is_system: true },
]

const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Refund', 'Other Income']
const BORROWING_CATEGORIES = ['Lent Money', 'Lent Repayment', 'Borrowed Money', 'Borrow Repayment']
const ADJUSTMENT_CATEGORIES = ['Opening Balance', 'Balance Adjustment']

// Metadata applied to system groups on load/migration
const SYSTEM_GROUP_META: Record<string, { type: string; is_editable: boolean; is_deletable: boolean }> = {
  [INCOME_GROUP]:     { type: 'income',     is_editable: false, is_deletable: false },
  [TRANSFER_GROUP]:   { type: 'transfer',   is_editable: false, is_deletable: false },
  [BORROWING_GROUP]:  { type: 'borrowing',  is_editable: false, is_deletable: false },
  [SAVINGS_GROUP]:    { type: 'savings',    is_editable: false, is_deletable: false },
  [ADJUSTMENT_GROUP]: { type: 'adjustment', is_editable: false, is_deletable: false },
}

const SAVINGS_TYPE_LABEL: Record<string, string> = {
  sip:     'SIP / Mutual Fund',
  gold:    'Gold Scheme',
  rd:      'Recurring Deposit',
  fd:      'Fixed Deposit',
  ppf_nps: 'PPF / NPS',
  ppf:     'PPF',
  nps:     'NPS',
  chit:    'Chit Fund',
  custom:  'Savings',
}
const savingsContribNote = (type: string) => `${SAVINGS_TYPE_LABEL[type] ?? 'Savings'} Contribution`
const savingsWithdrawNote = (type: string, isChit: boolean) =>
  isChit ? 'Chit Fund Payout' : `${SAVINGS_TYPE_LABEL[type] ?? 'Savings'} Redemption`
const SAVINGS_CATEGORIES = ['SIP', 'Mutual Fund', 'Gold Scheme', 'Recurring Deposit', 'Fixed Deposit', 'PPF', 'NPS', 'Chit Fund']

const TXN_PAGE_SIZE = 200

export function useSupabaseData(userId: string) {
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [usingSupabase, setUsingSupabase] = useState(false)
  const [allTransactionsLoaded, setAllTransactionsLoaded] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const receiptUrlCache = useRef(new Map<string, { url: string; expiresAt: number }>())

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
          { data: goalContribs },
          { data: savingsRows },
          { data: forecastRow },
          { data: budgetStrategyRow },
          { data: plannedExpenses },
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
            .limit(TXN_PAGE_SIZE),
          supabase.from('goals').select('*').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }),
          supabase.from('goal_contributions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
          supabase.from('savings').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
          supabase.from('forecast_settings').select('*').eq('user_id', userId).limit(1).single(),
          supabase.from('budget_strategy_settings').select('*').eq('user_id', userId).limit(1).single(),
          supabase.from('planned_expenses').select('*').eq('user_id', userId).order('planned_date'),
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

        // First login — seed forecast_settings
        let forecastSettings = forecastRow as ForecastSettings | null
        if (!forecastSettings) {
          const { data: created } = await supabase
            .from('forecast_settings')
            .insert({ user_id: userId, enabled: true, days: 60, commitment_ids: null, savings_ids: null, salary_override: null })
            .select('*').single()
          forecastSettings = (created as ForecastSettings) ?? { id: '', user_id: userId, enabled: true, days: 60, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' }
        }
        forecastSettings.forecast_mode ??= 'planned'

        // First login — seed budget_strategy_settings
        let budgetStrategySettings = budgetStrategyRow as BudgetStrategySettings | null
        if (!budgetStrategySettings) {
          const defaults = { user_id: userId, budget_strategy: 'none' as const, custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' as const }
          const { data: created } = await supabase
            .from('budget_strategy_settings')
            .insert(defaults)
            .select('*').single()
          budgetStrategySettings = (created as BudgetStrategySettings) ?? { id: '', ...defaults }
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

        // Migration: ensure Income group exists with system metadata
        const existingIncomeGroup = userGroups.find(g => g.name === INCOME_GROUP)
        if (!existingIncomeGroup) {
          const { data: newGroup } = await supabase
            .from('groups').insert({ name: INCOME_GROUP, user_id: userId, is_system: true, is_editable: false, is_deletable: false, type: 'income' }).select('*').single()
          if (newGroup) userGroups = [...userGroups, newGroup as Group]
        } else if (!existingIncomeGroup.is_system) {
          await supabase.from('groups').update({ is_system: true, is_editable: false, is_deletable: false, type: 'income' }).eq('id', existingIncomeGroup.id)
          userGroups = userGroups.map(g => g.id === existingIncomeGroup.id ? { ...g, is_system: true, is_editable: false, is_deletable: false, type: 'income' as const } : g)
        }

        // Migration: ensure Transfer group is marked system with metadata
        const existingTransferGroup = userGroups.find(g => g.name === TRANSFER_GROUP)
        if (existingTransferGroup && (!existingTransferGroup.is_system || existingTransferGroup.is_editable !== false)) {
          await supabase.from('groups').update({ is_system: true, is_editable: false, is_deletable: false, type: 'transfer' }).eq('id', existingTransferGroup.id)
          userGroups = userGroups.map(g => g.id === existingTransferGroup.id ? { ...g, is_system: true, is_editable: false, is_deletable: false, type: 'transfer' as const } : g)
        }

        // Migration: ensure Adjustment group exists (always a system group)
        const existingAdjustmentGroup = userGroups.find(g => g.name === ADJUSTMENT_GROUP)
        if (!existingAdjustmentGroup) {
          const { data: newGroup } = await supabase
            .from('groups').insert({ name: ADJUSTMENT_GROUP, user_id: userId, is_system: true, is_editable: false, is_deletable: false, is_visible: false, type: 'adjustment' }).select('*').single()
          if (newGroup) userGroups = [...userGroups, newGroup as Group]
        } else if (!existingAdjustmentGroup.is_system) {
          await supabase.from('groups').update({ is_system: true, is_editable: false, is_deletable: false, type: 'adjustment' }).eq('id', existingAdjustmentGroup.id)
          userGroups = userGroups.map(g => g.id === existingAdjustmentGroup.id ? { ...g, is_system: true, is_editable: false, is_deletable: false, type: 'adjustment' as const } : g)
        }

        // Migration: apply type/is_editable/is_deletable to any known system group that's missing them
        for (const [groupName, meta] of Object.entries(SYSTEM_GROUP_META)) {
          const g = userGroups.find(x => x.name === groupName)
          if (g && g.is_system && g.type == null) {
            await supabase.from('groups').update(meta).eq('id', g.id)
            userGroups = userGroups.map(x => x.id === g.id ? { ...x, ...meta } as Group : x)
          }
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
        const catIdRemap = new Map<string, string>()
        const dedupedCats: Category[] = []
        for (const rows of catsByKey.values()) {
          dedupedCats.push(rows[0])
          for (const extra of rows.slice(1)) {
            catExtras.push(extra.id)
            catIdRemap.set(extra.id, rows[0].id)
          }
        }
        if (catExtras.length > 0) {
          for (const [extraId, canonicalId] of catIdRemap) {
            await supabase.from('transactions').update({ category_id: canonicalId }).eq('category_id', extraId)
          }
          await supabase.from('categories').delete().in('id', catExtras)
        }
        userCategories = dedupedCats

        // Ensure Income categories exist (always seeded, is_system=true)
        const existingIncomeNames = userCategories.filter(c => c.group_name === INCOME_GROUP).map(c => c.name)
        const incomeCatsToAdd = DEFAULT_INCOME_CATEGORIES.filter(n => !existingIncomeNames.includes(n))
        if (incomeCatsToAdd.length > 0) {
          const { data: newCats } = await supabase
            .from('categories')
            .insert(incomeCatsToAdd.map(name => ({ name, group_name: INCOME_GROUP, user_id: userId, is_system: true })))
            .select('*')
          if (newCats) userCategories = [...userCategories, ...(newCats as Category[])]
        }

        // Ensure Adjustment categories exist (always seeded, is_system=true)
        const existingAdjustmentNames = userCategories.filter(c => c.group_name === ADJUSTMENT_GROUP).map(c => c.name)
        const adjustmentCatsToAdd = ADJUSTMENT_CATEGORIES.filter(n => !existingAdjustmentNames.includes(n))
        if (adjustmentCatsToAdd.length > 0) {
          const { data: newCats } = await supabase
            .from('categories')
            .insert(adjustmentCatsToAdd.map(name => ({ name, group_name: ADJUSTMENT_GROUP, user_id: userId, is_system: true })))
            .select('*')
          if (newCats) userCategories = [...userCategories, ...(newCats as Category[])]
        }

        // Ensure Borrowing group and categories exist when tracker is enabled
        if (settings.track_borrowings) {
          const existingBorrowingGroup = userGroups.find(g => g.name === BORROWING_GROUP)
          if (!existingBorrowingGroup) {
            const { data: newGroup } = await supabase
              .from('groups').insert({ name: BORROWING_GROUP, user_id: userId, is_system: true, is_editable: false, is_deletable: false, type: 'borrowing' }).select('*').single()
            if (newGroup) userGroups = [...userGroups, newGroup as Group]
          } else if (!existingBorrowingGroup.is_system) {
            await supabase.from('groups').update({ is_system: true, is_editable: false, is_deletable: false, type: 'borrowing' }).eq('id', existingBorrowingGroup.id)
            userGroups = userGroups.map(g => g.id === existingBorrowingGroup.id ? { ...g, is_system: true, is_editable: false, is_deletable: false, type: 'borrowing' as const } : g)
          }
          const existingBorrowingNames = userCategories.filter(c => c.group_name === BORROWING_GROUP).map(c => c.name)
          const borrowingCatsToAdd = BORROWING_CATEGORIES.filter(n => !existingBorrowingNames.includes(n))
          if (borrowingCatsToAdd.length > 0) {
            const { data: newCats } = await supabase
              .from('categories')
              .insert(borrowingCatsToAdd.map(name => ({ name, group_name: BORROWING_GROUP, user_id: userId, is_system: true })))
              .select('*')
            if (newCats) userCategories = [...userCategories, ...(newCats as Category[])]
          }
        }

        const txnList = (transactions as Transaction[]) || []
        setState({
          accounts: accounts || [],
          categories: userCategories as Category[],
          groups: userGroups as Group[],
          credit_cards: (credit_cards as CreditCard[]) || [],
          settings,
          forecast_settings: forecastSettings,
          budget_strategy_settings: budgetStrategySettings,
          commitments: (commitments as Commitment[]) || [],
          borrowings: borrowings || [],
          transactions: txnList,
          goals: (goals as Goal[]) || [],
          goal_contributions: (goalContribs as GoalContribution[]) || [],
          savings: (savingsRows as Savings[]) || [],
          planned_expenses: (plannedExpenses as PlannedExpense[]) || [],
        })
        setAllTransactionsLoaded(txnList.length < TXN_PAGE_SIZE)
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
  ): Promise<Transaction | undefined> => {
    try {
      const isCreditCard = state.credit_cards.some(c => c.id === form.from_account_id)
      const toAccountId = form.transaction_type === 'transfer' ? (form.to_account_id ?? null) : null

      const fromAccountId = isCreditCard ? null : (form.from_account_id ?? null)
      const creditCardId  = isCreditCard ? form.from_account_id : null
      const fromDelta     = fromAccountId ? delta(form.transaction_type, form.amount) : null
      const toDelta       = toAccountId ? form.amount : null
      const ccDelta       = creditCardId ? form.amount : null  // CC expense: outstanding increases

      const { data, error } = await supabase.rpc('mp_execute_transaction', {
        p_user_id:          userId,
        p_transaction_date: form.transaction_date,
        p_description:      form.description,
        p_amount:           form.amount,
        p_transaction_type: form.transaction_type,
        p_category_id:      form.category_id ?? null,
        p_from_account_id:  fromAccountId,
        p_to_account_id:    toAccountId,
        p_credit_card_id:   creditCardId,
        p_notes:            '',
        p_borrowing_id:     (form as any).borrowing_id ?? null,
        p_savings_id:       null,
        p_is_credit:        form.is_credit ?? null,
        p_from_delta:       fromDelta,
        p_to_delta:         toDelta,
        p_cc_delta:         ccDelta,
      })
      if (error) throw error

      const newTx: Transaction = {
        ...(data as Transaction),
        category: stateRef.current.categories.find(c => c.id === form.category_id),
      }

      setState(s => ({
        ...s,
        transactions: [newTx, ...s.transactions],
        accounts: s.accounts.map(a => {
          let bal = a.current_balance
          if (a.id === fromAccountId && fromDelta !== null) bal += fromDelta
          if (a.id === toAccountId  && toDelta  !== null) bal += toDelta
          return bal !== a.current_balance ? { ...a, current_balance: bal } : a
        }),
        credit_cards: creditCardId ? s.credit_cards.map(c =>
          c.id === creditCardId ? { ...c, current_balance: c.current_balance + (ccDelta ?? 0) } : c
        ) : s.credit_cards,
      }))
      return newTx
    } catch (err) { console.error('Failed to save transaction:', err); throw err }
  }, [userId, state.credit_cards])

  const deleteTransaction = useCallback(async (t: Transaction) => {
    try {
      // Compute reversal deltas in TypeScript; RPC applies them atomically
      // then deletes the row — reversals always run before delete.
      let fromDelta: number | null = null
      let toDelta: number | null = null

      if (t.from_account_id) {
        fromDelta = (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment')
          ? (t.is_credit ? -t.amount : t.amount)
          : -delta(t.transaction_type, t.amount)
      }
      if ((t.transaction_type === 'transfer' || t.transaction_type === 'savings_withdrawal' || t.transaction_type === 'balance_adjustment') && t.to_account_id) {
        toDelta = -t.amount
      }

      const ccId = t.credit_card_id ?? null
      const ccDelta = ccId ? -t.amount : null

      const { error } = await supabase.rpc('mp_delete_transaction', {
        p_transaction_id:  t.id,
        p_from_account_id: t.from_account_id ?? null,
        p_from_delta:      fromDelta,
        p_to_account_id:   toDelta !== null ? t.to_account_id : null,
        p_to_delta:        toDelta,
        p_credit_card_id:  ccId,
        p_cc_delta:        ccDelta,
      })
      if (error) throw error

      if (t.receipt_path) {
        try {
          await withTimeout(
            supabase.storage.from('transaction-receipts').remove([t.receipt_path]),
            RECEIPT_NETWORK_TIMEOUT_MS, 'Receipt cleanup timed out'
          )
        }
        catch (err) { console.error('Failed to delete receipt file:', err) }
      }

      setState(s => ({
        ...s,
        transactions: s.transactions.filter(tx => tx.id !== t.id),
        accounts: s.accounts.map(a => {
          let bal = a.current_balance
          if (a.id === t.from_account_id && fromDelta !== null) bal += fromDelta
          if (a.id === t.to_account_id   && toDelta  !== null) bal += toDelta
          return bal !== a.current_balance ? { ...a, current_balance: bal } : a
        }),
        credit_cards: ccId ? s.credit_cards.map(c =>
          c.id === ccId ? { ...c, current_balance: c.current_balance + (ccDelta ?? 0) } : c
        ) : s.credit_cards,
      }))
    } catch (err) { console.error('Failed to delete transaction:', err); throw err }
  }, [])

  const uploadReceipt = useCallback(async (transactionId: string, receipt: PickedReceipt) => {
    const path = `${userId}/receipts/${transactionId}`
    const receipt_uploaded_at = new Date().toISOString()

    await withTimeout((async () => {
      const { error: uploadErr } = await supabase.storage
        .from('transaction-receipts')
        .upload(path, receipt.blob, { contentType: receipt.blob.type, upsert: true })
      if (uploadErr) throw uploadErr

      const { error } = await supabase
        .from('transactions')
        .update({ receipt_path: path, receipt_uploaded_at })
        .eq('id', transactionId)
      if (error) throw error
    })(), RECEIPT_NETWORK_TIMEOUT_MS, 'Upload timed out')

    setState(s => ({
      ...s,
      transactions: s.transactions.map(tx =>
        tx.id === transactionId ? { ...tx, receipt_path: path, receipt_uploaded_at } : tx
      ),
    }))
  }, [userId])

  const removeReceipt = useCallback(async (transaction: Transaction) => {
    if (!transaction.receipt_path) return

    await withTimeout((async () => {
      await supabase.storage.from('transaction-receipts').remove([transaction.receipt_path!])
      const { error } = await supabase
        .from('transactions')
        .update({ receipt_path: null, receipt_uploaded_at: null })
        .eq('id', transaction.id)
      if (error) throw error
    })(), RECEIPT_NETWORK_TIMEOUT_MS, 'Removing receipt timed out')

    setState(s => ({
      ...s,
      transactions: s.transactions.map(tx =>
        tx.id === transaction.id ? { ...tx, receipt_path: null, receipt_uploaded_at: null } : tx
      ),
    }))
  }, [])

  const getReceiptUrl = useCallback(async (path: string): Promise<string | null> => {
    const cached = receiptUrlCache.current.get(path)
    if (cached && cached.expiresAt > Date.now()) return cached.url

    try {
      const { data, error } = await withTimeout(
        supabase.storage.from('transaction-receipts').createSignedUrl(path, 3600),
        RECEIPT_NETWORK_TIMEOUT_MS, 'Signed URL request timed out'
      )
      if (error || !data?.signedUrl) return null

      receiptUrlCache.current.set(path, { url: data.signedUrl, expiresAt: Date.now() + 3600_000 - 60_000 })
      return data.signedUrl
    } catch {
      return null
    }
  }, [])

  const updateTransaction = useCallback(async (
    old: Transaction,
    form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }
  ) => {
    try {
      const toAccountId   = form.transaction_type === 'transfer' ? (form.to_account_id ?? null) : null
      const isBorrowingTx = !!old.borrowing_id
      const newIsCredit   = isBorrowingTx
        ? (['Borrowed Money', 'Lent Repayment'] as string[]).includes(
            stateRef.current.categories.find(c => c.id === form.category_id)?.name ?? ''
          )
        : null

      // Pre-compute deltas; RPC applies them all atomically
      const borrowDelta = (isCredit: boolean | null | undefined, amount: number) =>
        isCredit ? amount : -amount

      const oldFromDelta = old.from_account_id
        ? -(isBorrowingTx ? borrowDelta(old.is_credit, old.amount) : delta(old.transaction_type, old.amount))
        : null
      const oldToDelta = old.transaction_type === 'transfer' && old.to_account_id ? -old.amount : null
      const newFromDelta = form.from_account_id
        ? (isBorrowingTx ? borrowDelta(newIsCredit, form.amount) : delta(form.transaction_type, form.amount))
        : null
      const newToDelta = toAccountId ? form.amount : null

      const oldCcId = old.credit_card_id ?? null
      const oldCcDelta = oldCcId ? -old.amount : null
      const newIsCC = stateRef.current.credit_cards.some(c => c.id === form.from_account_id)
      const newCcId = newIsCC ? form.from_account_id! : null
      const newCcDelta = newCcId ? form.amount : null

      const { data, error } = await supabase.rpc('mp_update_transaction', {
        p_transaction_id:      old.id,
        p_transaction_date:    form.transaction_date,
        p_description:         form.description,
        p_amount:              form.amount,
        p_transaction_type:    form.transaction_type,
        p_category_id:         form.category_id ?? null,
        p_from_account_id:     newIsCC ? null : (form.from_account_id ?? null),
        p_to_account_id:       toAccountId,
        p_is_credit:           newIsCredit,
        p_old_from_account_id: old.from_account_id ?? null,
        p_old_from_delta:      oldFromDelta,
        p_old_to_account_id:   old.transaction_type === 'transfer' ? (old.to_account_id ?? null) : null,
        p_old_to_delta:        oldToDelta,
        p_new_from_delta:      newIsCC ? null : newFromDelta,
        p_new_to_delta:        newToDelta,
        p_borrowing_id:        old.borrowing_id ?? null,
        p_old_amount:          old.amount,
        p_borrowing_type:      old.borrowing_id ? old.transaction_type : null,
        p_old_cc_id:           oldCcId,
        p_old_cc_delta:        oldCcDelta,
        p_new_cc_id:           newCcId,
        p_new_cc_delta:        newCcDelta,
      })
      if (error) throw error

      const result = data as { transaction: Transaction; borrowing: AppState['borrowings'][0] | null }
      const updated: Transaction = {
        ...result.transaction,
        category: stateRef.current.categories.find(c => c.id === form.category_id),
      }

      setState(s => ({
        ...s,
        transactions: s.transactions.map(t => t.id === old.id ? updated : t),
        borrowings: result.borrowing
          ? s.borrowings.map(b => b.id === old.borrowing_id ? result.borrowing! : b)
          : s.borrowings,
        accounts: s.accounts.map(a => {
          let bal = a.current_balance
          if (a.id === old.from_account_id  && oldFromDelta !== null) bal += oldFromDelta
          if (a.id === old.to_account_id    && oldToDelta  !== null) bal += oldToDelta
          if (!newIsCC && a.id === form.from_account_id && newFromDelta !== null) bal += newFromDelta
          if (a.id === toAccountId          && newToDelta  !== null) bal += newToDelta
          return bal !== a.current_balance ? { ...a, current_balance: bal } : a
        }),
        credit_cards: (oldCcId || newCcId) ? s.credit_cards.map(c => {
          let bal = c.current_balance
          if (c.id === oldCcId && oldCcDelta !== null) bal += oldCcDelta
          if (c.id === newCcId && newCcDelta !== null) bal += newCcDelta
          return bal !== c.current_balance ? { ...c, current_balance: bal } : c
        }) : s.credit_cards,
      }))
    } catch (err) { console.error('Failed to update transaction:', err); throw err }
  }, [])

  const addAccount = useCallback(async (form: { name: string; type: string; current_balance: number }) => {
    const { data, error } = await supabase.from('accounts').insert({ ...form, is_active: true, user_id: userId }).select('*').single()
    if (error) throw error
    const acc = data as AppState['accounts'][0]

    let openingTx = null
    if (form.current_balance !== 0) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: tx } = await supabase.from('transactions').insert({
        transaction_date: today,
        description: 'Opening Balance',
        amount: Math.abs(form.current_balance),
        transaction_type: 'opening_balance',
        category_id: null,
        from_account_id: acc.id,
        to_account_id: null,
        notes: 'Opening Balance',
        user_id: userId,
      }).select('*, category:categories(*)').single()
      openingTx = tx
    }

    setState(s => ({
      ...s,
      accounts: [...s.accounts, acc],
      transactions: openingTx ? [openingTx as Transaction, ...s.transactions] : s.transactions,
    }))
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

  const adjustBalance = useCallback(async (accountId: string, actualBalance: number) => {
    const account = stateRef.current.accounts.find(a => a.id === accountId)
    if (!account) return
    const difference = actualBalance - account.current_balance
    if (difference === 0) return

    const today = new Date().toISOString().slice(0, 10)
    const isCredit = difference > 0

    await supabase.from('accounts').update({ current_balance: actualBalance }).eq('id', accountId)

    // Credit (positive diff): to_account_id = accountId, from = null
    // Debit  (negative diff): from_account_id = accountId, to = null
    // delta('balance_adjustment') = -amount, so debit via from_account subtracts correctly.
    const { data: tx } = await supabase.from('transactions').insert({
      transaction_date: today,
      description: 'Balance Adjustment',
      amount: Math.abs(difference),
      transaction_type: 'balance_adjustment',
      category_id: null,
      from_account_id: isCredit ? null : accountId,
      to_account_id:   isCredit ? accountId : null,
      notes: `Adjusted: ₹${account.current_balance.toLocaleString('en-IN')} → ₹${actualBalance.toLocaleString('en-IN')}`,
      user_id: userId,
    }).select('*, category:categories(*)').single()

    setState(s => ({
      ...s,
      accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: actualBalance } : a),
      transactions: tx ? [tx as Transaction, ...s.transactions] : s.transactions,
    }))
  }, [userId])

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

  const updateCategoryBucket = useCallback(async (id: string, bucket: BudgetBucket | null) => {
    await supabase.from('categories').update({ budget_bucket: bucket }).eq('id', id)
    setState(s => ({ ...s, categories: s.categories.map(c => c.id === id ? { ...c, budget_bucket: bucket } : c) }))
  }, [])

  const addBorrowing = useCallback(async (
    form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed'; transaction_date?: string; repayment_date?: string | null },
    addTransaction: boolean,
    accountId: string | null,
  ) => {
    const today = form.transaction_date || new Date().toISOString().slice(0, 10)

    if (addTransaction && accountId) {
      const isBorrowed  = form.direction === 'borrowed'
      const catName     = isBorrowed ? 'Borrowed Money' : 'Lent Money'
      const catId       = stateRef.current.categories.find(c => c.name === catName && c.group_name === BORROWING_GROUP)?.id ?? null
      const accountDelta = isBorrowed ? form.total_amount : -form.total_amount
      const description  = `${form.person_name} – ${isBorrowed ? 'borrowed' : 'lent'}`

      const { data, error } = await supabase.rpc('mp_add_borrowing', {
        p_user_id:          userId,
        p_person_name:      form.person_name,
        p_total_amount:     form.total_amount,
        p_paid_amount:      form.paid_amount,
        p_notes:            form.notes,
        p_direction:        form.direction,
        p_transaction_date: today,
        p_category_id:      catId,
        p_account_id:       accountId,
        p_account_delta:    accountDelta,
        p_is_credit:        isBorrowed,
        p_description:      description,
        p_repayment_date:   form.repayment_date ?? null,
      })
      if (error) throw error

      const result = data as { borrowing: AppState['borrowings'][0]; transaction: Transaction }
      const newTx: Transaction = {
        ...result.transaction,
        category: stateRef.current.categories.find(c => c.id === catId),
      }
      setState(s => ({
        ...s,
        borrowings: [...s.borrowings, result.borrowing],
        transactions: [newTx, ...s.transactions],
        accounts: s.accounts.map(a => a.id === accountId
          ? { ...a, current_balance: a.current_balance + accountDelta }
          : a
        ),
      }))
    } else {
      // No transaction — just insert the borrowing record
      const { data: bData, error: bErr } = await supabase
        .from('borrowings')
        .insert({ person_name: form.person_name, total_amount: form.total_amount, paid_amount: form.paid_amount, notes: form.notes, direction: form.direction, user_id: userId, repayment_date: form.repayment_date ?? null })
        .select('*').single()
      if (bErr) throw bErr
      setState(s => ({ ...s, borrowings: [...s.borrowings, bData as AppState['borrowings'][0]] }))
    }
  }, [userId])

  const updateBorrowing = useCallback(async (id: string, form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed'; repayment_date: string | null }) => {
    const current      = stateRef.current
    const oldBorrowing = current.borrowings.find(b => b.id === id)
    const nameChanged   = oldBorrowing?.person_name !== form.person_name
    const amountChanged = oldBorrowing?.total_amount !== form.total_amount

    // Compute account delta if amount changed (RPC finds the linked tx server-side)
    let accountDelta: number | null = null
    if (amountChanged && oldBorrowing) {
      const initialTx = current.transactions.find(t => t.borrowing_id === id && t.transaction_type === 'borrowing')
      if (initialTx) {
        const oldImpact = initialTx.is_credit ?  oldBorrowing.total_amount : -oldBorrowing.total_amount
        const newImpact = initialTx.is_credit ?  form.total_amount         : -form.total_amount
        accountDelta = newImpact - oldImpact
      }
    }

    const newDescription = nameChanged || amountChanged
      ? (form.direction === 'lent' ? `${form.person_name} – lent` : `${form.person_name} – borrowed`)
      : null

    const { data, error } = await supabase.rpc('mp_update_borrowing', {
      p_user_id:         userId,
      p_borrowing_id:    id,
      p_person_name:     form.person_name,
      p_total_amount:    form.total_amount,
      p_paid_amount:     form.paid_amount,
      p_notes:           form.notes,
      p_direction:       form.direction,
      p_account_delta:   accountDelta,
      p_new_description: newDescription,
      p_repayment_date:  form.repayment_date,
    })
    if (error) throw error

    const result = data as { borrowing: AppState['borrowings'][0]; transaction: Transaction | null }
    setState(s => ({
      ...s,
      borrowings: s.borrowings.map(b => b.id === id ? result.borrowing : b),
      transactions: result.transaction
        ? s.transactions.map(t => t.id === result.transaction!.id
            ? { ...result.transaction!, category: s.categories.find(c => c.id === result.transaction!.category_id) }
            : t)
        : s.transactions,
      accounts: accountDelta
        ? s.accounts.map(a => {
            const initialTx = current.transactions.find(t => t.borrowing_id === id && t.transaction_type === 'borrowing')
            return a.id === initialTx?.from_account_id
              ? { ...a, current_balance: a.current_balance + accountDelta! }
              : a
          })
        : s.accounts,
    }))
  }, [userId])

  const deleteBorrowing = useCallback(async (id: string, deleteTransactions: boolean) => {
    if (deleteTransactions) {
      // RPC atomically reverses all linked transaction effects in a loop,
      // then deletes all transactions and the borrowing in one DB transaction.
      // Previously, any mid-loop failure left partial reversals committed
      // while all transactions were still deleted.
      const { data, error } = await supabase.rpc('mp_delete_borrowing', {
        p_user_id:      userId,
        p_borrowing_id: id,
      })
      if (error) throw error

      const result = data as { deleted_tx_ids: string[] }
      const deletedSet = new Set(result.deleted_tx_ids)
      // Reverse account deltas in client state using the transactions we had loaded
      const linkedTxns = stateRef.current.transactions.filter(t => (t as any).borrowing_id === id)
      setState(s => ({
        ...s,
        borrowings: s.borrowings.filter(b => b.id !== id),
        transactions: s.transactions.filter(t => !deletedSet.has(t.id)),
        accounts: s.accounts.map(a => {
          const affectedTxns = linkedTxns.filter(t => t.from_account_id === a.id)
          if (affectedTxns.length === 0) return a
          const reversal = affectedTxns.reduce((sum, t) =>
            sum + (t.is_credit ? -t.amount : t.amount), 0)
          return { ...a, current_balance: a.current_balance + reversal }
        }),
      }))
    } else {
      await supabase.from('borrowings').delete().eq('id', id)
      setState(s => ({ ...s, borrowings: s.borrowings.filter(b => b.id !== id) }))
    }
  }, [userId])

  const recordBorrowingPayment = useCallback(async (
    borrowing: AppState['borrowings'][0], payment: number, accountId: string | null,
    incoming: boolean, _categoryId: string | null = null, addTransaction: boolean = true,
  ) => {
    const today          = new Date().toISOString().slice(0, 10)
    const newPaid        = Math.min(borrowing.total_amount, borrowing.paid_amount + payment)
    const catName        = incoming ? 'Lent Repayment' : 'Borrow Repayment'
    const repaymentCatId = stateRef.current.categories.find(c => c.name === catName && c.group_name === BORROWING_GROUP)?.id ?? null
    const accountDelta   = incoming ? payment : -payment

    if (addTransaction && accountId) {
      const { data, error } = await supabase.rpc('mp_record_borrowing_payment', {
        p_user_id:          userId,
        p_borrowing_id:     borrowing.id,
        p_new_paid_amount:  newPaid,
        p_payment:          payment,
        p_account_id:       accountId,
        p_account_delta:    accountDelta,
        p_is_credit:        incoming,
        p_category_id:      repaymentCatId,
        p_description:      `${borrowing.person_name} – ${incoming ? 'received repayment' : 'repayment'}`,
        p_transaction_date: today,
      })
      if (error) throw error

      const result = data as { transaction: Transaction; borrowing: AppState['borrowings'][0] }
      const newTx: Transaction = {
        ...result.transaction,
        category: stateRef.current.categories.find(c => c.id === repaymentCatId),
      }
      setState(s => ({
        ...s,
        borrowings: s.borrowings.map(b => b.id === borrowing.id ? result.borrowing : b),
        transactions: [newTx, ...s.transactions],
        accounts: s.accounts.map(a => a.id !== accountId ? a : { ...a, current_balance: a.current_balance + accountDelta }),
      }))
    } else {
      // No transaction — just update the borrowing paid amount
      await supabase.from('borrowings').update({ paid_amount: newPaid }).eq('id', borrowing.id)
      setState(s => ({
        ...s,
        borrowings: s.borrowings.map(b => b.id === borrowing.id
          ? { ...b, paid_amount: newPaid, remaining_amount: b.total_amount - newPaid }
          : b
        ),
      }))
    }
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
    const today          = new Date().toISOString().slice(0, 10)
    const payAmount      = cm.amount || cm.remaining || 0
    const isCreditCard   = state.credit_cards.some(c => c.id === cm.from_account_id)
    const newInstallment = (cm.current_installment || 0) + 1
    const isComplete     = cm.total_installments ? newInstallment >= cm.total_installments : false
    const newRemaining   = !cm.is_recurring ? Math.max(0, cm.remaining - payAmount) : undefined
    const effectiveAccountId = isCreditCard ? cm.from_account_id : (accountId ?? cm.from_account_id)

    const commitmentStateUpdate = (s: AppState) =>
      s.commitments.map(c => c.id === cm.id ? {
        ...c, last_paid_date: today, current_installment: newInstallment,
        remaining: newRemaining ?? c.remaining,
        is_active: isComplete ? false : c.is_active,
        from_account_id: effectiveAccountId ?? c.from_account_id,
      } : c)

    // Path A: no balance effects — just update the commitment record
    if (!isCreditCard && !recordExpense) {
      await supabase.from('commitments').update({
        last_paid_date: today, current_installment: newInstallment,
        ...(newRemaining !== undefined ? { remaining: newRemaining } : {}),
        ...(isComplete ? { is_active: false } : {}),
        ...(accountId && accountId !== cm.from_account_id ? { from_account_id: accountId } : {}),
      }).eq('id', cm.id)
      setState(s => ({ ...s, commitments: commitmentStateUpdate(s) }))
      return
    }

    // Path B/C: transaction + balance + commitment update — all atomic via RPC
    const { data, error } = await supabase.rpc('mp_mark_commitment_paid', {
      p_user_id:          userId,
      p_commitment_id:    cm.id,
      p_transaction_date: today,
      p_description:      cm.name,
      p_amount:           payAmount,
      p_category_id:      cm.category_id ?? null,
      p_from_account_id:  isCreditCard ? null : accountId,
      p_credit_card_id:   isCreditCard ? cm.from_account_id : null,
      p_from_delta:       isCreditCard ? null : -payAmount,
      p_cc_delta:         isCreditCard ? payAmount : null,
      p_last_paid_date:   today,
      p_new_installment:  newInstallment,
      p_new_remaining:    newRemaining ?? null,
      p_new_is_active:    isComplete ? false : null,
    })
    if (error) throw error

    const newTx: Transaction = {
      ...(data as Transaction),
      category: stateRef.current.categories.find(c => c.id === cm.category_id),
    }
    setState(s => ({
      ...s,
      transactions: [newTx, ...s.transactions],
      commitments: commitmentStateUpdate(s),
      accounts: accountId && !isCreditCard
        ? s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance - payAmount } : a)
        : s.accounts,
      credit_cards: isCreditCard
        ? s.credit_cards.map(c => c.id === cm.from_account_id ? { ...c, current_balance: c.current_balance + payAmount } : c)
        : s.credit_cards,
    }))
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

  const addGoalSavings = useCallback(async (id: string, amount: number, source: 'manual' | 'daily_challenge' = 'manual') => {
    const goal = stateRef.current.goals.find(g => g.id === id)
    if (!goal) return
    const newSaved = goal.current_saved + amount
    await supabase.from('goals').update({ current_saved: newSaved }).eq('id', id)
    const { data: contrib } = await supabase
      .from('goal_contributions')
      .insert({ goal_id: id, user_id: userId, amount, source })
      .select('*')
      .single()
    setState(s => ({
      ...s,
      goals: s.goals.map(g => g.id === id ? { ...g, current_saved: newSaved } : g),
      goal_contributions: contrib
        ? [contrib as GoalContribution, ...s.goal_contributions]
        : s.goal_contributions,
    }))
  }, [userId])

  // ── Savings CRUD ─────────────────────────────────────────────────────────────

  const addSavings = useCallback(async (form: Omit<Savings, 'id' | 'created_at'>, debitAccountId?: string) => {
    if (form.is_recurring) {
      if (form.frequency === 'monthly' && (form.due_day == null || form.due_day < 1 || form.due_day > 31)) {
        throw new Error('Monthly recurring savings require a contribution day (1–31). Please set the Contribution day field.')
      }
      if (form.frequency === 'weekly' && (form.due_day == null || form.due_day < 0 || form.due_day > 6)) {
        throw new Error('Weekly recurring savings require a contribution weekday (0=Sun, 6=Sat). Please set the Contribution day field.')
      }
    }
    if (debitAccountId) {
      // Create savings + debit account + create transaction atomically.
      // Replaces the faulty application-level rollback that existed here before.
      const today = new Date().toISOString().split('T')[0]
      const { data: rpcData, error } = await supabase.rpc('mp_add_savings_with_contribution', {
        p_user_id:      userId,
        p_savings_data: JSON.parse(JSON.stringify(form)),  // serialise to plain object for jsonb param
        p_account_id:   debitAccountId,
        p_amount:       form.amount,
        p_transaction_date: today,
        p_description:  form.name,
        p_category_id:  form.category_id ?? null,
        p_notes:        savingsContribNote(form.type),
      })
      if (error) throw error

      const result = rpcData as { savings: Savings; transaction: Transaction }
      const newTx: Transaction = {
        ...result.transaction,
        category: stateRef.current.categories.find(c => c.id === form.category_id),
      }
      setState(s => ({
        ...s,
        savings: [result.savings, ...s.savings],
        accounts: s.accounts.map(a =>
          a.id === debitAccountId ? { ...a, current_balance: a.current_balance - form.amount } : a
        ),
        transactions: [newTx, ...s.transactions],
      }))
    } else {
      // No account debit — direct savings insert is safe without RPC
      const { data, error } = await supabase
        .from('savings').insert({ ...form, user_id: userId }).select('*').single()
      if (error) throw error
      setState(s => ({ ...s, savings: [data as Savings, ...s.savings] }))
    }
  }, [userId])

  const updateSavings = useCallback(async (id: string, patch: Partial<Omit<Savings, 'id' | 'user_id' | 'created_at'>>) => {
    if (patch.is_recurring) {
      if (patch.frequency === 'monthly' && (patch.due_day == null || patch.due_day < 1 || patch.due_day > 31)) {
        throw new Error('Monthly recurring savings require a contribution day (1–31). Please set the Contribution day field.')
      }
      if (patch.frequency === 'weekly' && (patch.due_day == null || patch.due_day < 0 || patch.due_day > 6)) {
        throw new Error('Weekly recurring savings require a contribution weekday (0=Sun, 6=Sat). Please set the Contribution day field.')
      }
    }
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
      paid_date: today,
      ...(accountId && accountId !== sv.from_account_id ? { from_account_id: accountId } : {}),
    }

    // Mark complete if all installments done
    if (sv.total_installments && newInstallment >= sv.total_installments) {
      patch.is_active = false
    }

    if (recordExpense && accountId) {
      // Savings update + account debit + transaction all atomically via RPC
      const { data, error } = await supabase.rpc('mp_record_savings_contribution', {
        p_user_id:                userId,
        p_savings_id:             sv.id,
        p_account_id:             accountId,
        p_amount:                 sv.amount,
        p_transaction_date:       today,
        p_description:            sv.name,
        p_category_id:            sv.category_id ?? null,
        p_notes:                  savingsContribNote(sv.type),
        p_new_installment:        newInstallment,
        p_last_contribution_date: today,
        p_mark_complete:          patch.is_active === false,
      })
      if (error) throw error
      // RPC doesn't handle paid_date — update it separately
      await supabase.from('savings').update({ paid_date: today }).eq('id', sv.id)

      const newTx: Transaction = {
        ...(data as Transaction),
        category: stateRef.current.categories.find(c => c.id === sv.category_id),
      }
      setState(s => ({
        ...s,
        savings: s.savings.map(item => item.id === sv.id ? { ...item, ...patch } : item),
        accounts: s.accounts.map(a =>
          a.id === accountId ? { ...a, current_balance: a.current_balance - sv.amount } : a
        ),
        transactions: [newTx, ...s.transactions],
      }))
    } else {
      // No balance effects — direct savings update is safe without RPC
      await supabase.from('savings').update(patch).eq('id', sv.id)
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
    const today    = new Date().toISOString().split('T')[0]
    const label    = sv.type === 'chit' ? `${sv.name} — Chit Prize` : `${sv.name} — Redemption`
    const newValue = sv.type === 'chit' ? 0 : Math.max(0, sv.current_value - amount)

    const { data, error } = await supabase.rpc('mp_record_savings_payout', {
      p_user_id:           userId,
      p_savings_id:        sv.id,
      p_account_id:        accountId,
      p_amount:            amount,
      p_new_current_value: newValue,
      p_description:       label,
      p_notes:             savingsWithdrawNote(sv.type, sv.type === 'chit'),
      p_transaction_date:  today,
    })
    if (error) throw error

    const newTx: Transaction = { ...(data as Transaction), category: undefined }
    setState(s => ({
      ...s,
      accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance + amount } : a),
      transactions: [newTx, ...s.transactions],
      savings: s.savings.map(item => item.id === sv.id ? { ...item, current_value: newValue } : item),
    }))
  }, [userId])

  const revertSavingsPayout = useCallback(async (sv: Savings) => {
    // RPC finds the withdrawal server-side (no 200-tx client-state limit),
    // reverses the account credit, deletes the transaction, and restores
    // savings.current_value — all in one atomic operation.
    const { data, error } = await supabase.rpc('mp_revert_savings_payout', {
      p_user_id:    userId,
      p_savings_id: sv.id,
    })
    if (error) throw error

    const result = data as { deleted_tx_id: string; restored_value: number; account_id: string | null }
    setState(s => ({
      ...s,
      transactions: s.transactions.filter(t => t.id !== result.deleted_tx_id),
      accounts: result.account_id
        ? s.accounts.map(a => a.id === result.account_id
            ? { ...a, current_balance: a.current_balance - result.restored_value }
            : a)
        : s.accounts,
      savings: s.savings.map(item => item.id === sv.id ? { ...item, current_value: result.restored_value } : item),
    }))
  }, [userId])

  // ── Planned Expenses ──
  const addPlannedExpense = useCallback(async (form: Omit<PlannedExpense, 'id' | 'created_at'>) => {
    const { data, error } = await supabase.from('planned_expenses').insert({ ...form, user_id: userId }).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, planned_expenses: [...s.planned_expenses, data as PlannedExpense].sort((a, b) => a.planned_date.localeCompare(b.planned_date)) }))
  }, [userId])

  const updatePlannedExpense = useCallback(async (id: string, patch: Partial<PlannedExpense>) => {
    const { data, error } = await supabase.from('planned_expenses').update(patch).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, planned_expenses: s.planned_expenses.map(p => p.id === id ? data as PlannedExpense : p) }))
  }, [])

  const deletePlannedExpense = useCallback(async (id: string) => {
    await supabase.from('planned_expenses').delete().eq('id', id)
    setState(s => ({ ...s, planned_expenses: s.planned_expenses.filter(p => p.id !== id) }))
  }, [])

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
            .from('groups').insert({ name: SAVINGS_GROUP, user_id: userId, is_system: true, is_editable: false, is_deletable: false, type: 'savings' }).select('*').single()
          if (newGroup) newGroups = [...newGroups, newGroup as Group]
        } else if (!existingSavingsGroup.is_system) {
          await supabase.from('groups').update({ is_system: true, is_editable: false, is_deletable: false, type: 'savings' }).eq('id', existingSavingsGroup.id)
          newGroups = newGroups.map(g => g.id === existingSavingsGroup.id ? { ...g, is_system: true, is_editable: false, is_deletable: false, type: 'savings' as const } : g)
        }

        // Skip creating categories that already exist under any group (avoids duplicates for existing users)
        const allExistingNames = new Set(newCategories.map(c => c.name))
        const existingSavingsNames = newCategories.filter(c => c.group_name === SAVINGS_GROUP).map(c => c.name)
        const savingsCatsToAdd = SAVINGS_CATEGORIES.filter(n => !existingSavingsNames.includes(n) && !allExistingNames.has(n))
        if (savingsCatsToAdd.length > 0) {
          const { data: seededCats } = await supabase
            .from('categories')
            .insert(savingsCatsToAdd.map(name => ({ name, group_name: SAVINGS_GROUP, user_id: userId, is_system: true })))
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
            .from('groups').insert({ name: BORROWING_GROUP, user_id: userId, is_system: true, is_editable: false, is_deletable: false, type: 'borrowing' }).select('*').single()
          if (newGroup) newGroups = [...newGroups, newGroup as Group]
        } else if (!existingBorrowingGroup.is_system) {
          await supabase.from('groups').update({ is_system: true, is_editable: false, is_deletable: false, type: 'borrowing' }).eq('id', existingBorrowingGroup.id)
          newGroups = newGroups.map(g => g.id === existingBorrowingGroup.id ? { ...g, is_system: true, is_editable: false, is_deletable: false, type: 'borrowing' as const } : g)
        }

        const existingBorrowingNames = newCategories.filter(c => c.group_name === BORROWING_GROUP).map(c => c.name)
        const borrowingCatsToAdd = BORROWING_CATEGORIES.filter(n => !existingBorrowingNames.includes(n))
        if (borrowingCatsToAdd.length > 0) {
          const { data: seededCats } = await supabase
            .from('categories')
            .insert(borrowingCatsToAdd.map(name => ({ name, group_name: BORROWING_GROUP, user_id: userId, is_system: true })))
            .select('*')
          if (seededCats) newCategories = [...newCategories, ...(seededCats as Category[])]
        }

        setState(s => ({ ...s, groups: newGroups, categories: newCategories }))
      }
    } catch (err) { console.error('Failed to update settings:', err); throw err }
  }, [state.settings.id, userId])

  const updateForecastSettings = useCallback(async (patch: Partial<ForecastSettings>) => {
    try {
      await supabase.from('forecast_settings').update(patch).eq('id', state.forecast_settings.id)
      setState(s => ({ ...s, forecast_settings: { ...s.forecast_settings, ...patch } }))
    } catch (err) { console.error('Failed to update forecast settings:', err); throw err }
  }, [state.forecast_settings.id])

  const updateBudgetStrategySettings = useCallback(async (patch: Partial<BudgetStrategySettings>) => {
    try {
      await supabase.from('budget_strategy_settings').update(patch).eq('id', state.budget_strategy_settings.id)
      setState(s => ({ ...s, budget_strategy_settings: { ...s.budget_strategy_settings, ...patch } }))
    } catch (err) { console.error('Failed to update budget strategy settings:', err); throw err }
  }, [state.budget_strategy_settings.id])

  // Reverse a borrowing-linked transaction (called when user deletes it from TransactionsPage)
  const reversePayment = useCallback(async (t: Transaction) => {
    if (!t.borrowing_id) return
    // Reverse account balance
    if (t.from_account_id) {
      const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
      if (acc) {
        let newBal: number
        if (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') {
          newBal = t.is_credit
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
        const isBorrowingType = t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment'
        const balDelta = isBorrowingType
          ? (t.is_credit ? -t.amount : t.amount)
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
    const openingBalance = form.current_balance || 0
    const { data, error } = await supabase.from('credit_cards').insert({ ...form, current_balance: 0, user_id: userId, is_active: true }).select('*').single()
    if (error) throw error
    const card = data as CreditCard

    if (openingBalance > 0) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: txData, error: txErr } = await supabase.rpc('mp_execute_transaction', {
        p_user_id: userId, p_transaction_date: today,
        p_description: `${card.name} Opening Balance`, p_amount: openingBalance,
        p_transaction_type: 'cc_opening_balance',
        p_credit_card_id: card.id, p_cc_delta: openingBalance,
        p_from_account_id: null, p_to_account_id: null, p_from_delta: null, p_to_delta: null,
        p_notes: 'Opening Balance', p_category_id: null, p_borrowing_id: null, p_savings_id: null, p_is_credit: null,
      })
      if (txErr) throw txErr
      card.current_balance = openingBalance
      const openTx: Transaction = { ...(txData as Transaction), category: undefined }
      setState(s => ({ ...s, credit_cards: [...s.credit_cards, card], transactions: [openTx, ...s.transactions] }))
    } else {
      setState(s => ({ ...s, credit_cards: [...s.credit_cards, card] }))
    }
  }, [userId])

  const updateCreditCard = useCallback(async (id: string, form: Omit<CreditCard, 'id' | 'user_id' | 'is_active'>) => {
    const card = stateRef.current.credit_cards.find(c => c.id === id)
    if (!card) return
    const { current_balance: _ignore, ...metaFields } = form
    const { data, error } = await supabase.from('credit_cards').update(metaFields).eq('id', id).select('*').single()
    if (error) throw error
    setState(s => ({ ...s, credit_cards: s.credit_cards.map(c => c.id === id ? data as CreditCard : c) }))
  }, [])

  const deleteCreditCard = useCallback(async (id: string) => {
    await supabase.from('credit_cards').update({ is_active: false }).eq('id', id)
    setState(s => ({ ...s, credit_cards: s.credit_cards.filter(c => c.id !== id) }))
  }, [])

  const payCreditCardBill = useCallback(async (card: CreditCard, amount: number, accountId: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.rpc('mp_execute_transaction', {
      p_user_id:          userId,
      p_transaction_date: today,
      p_description:      `${card.name} bill payment`,
      p_amount:           amount,
      p_transaction_type: 'credit_card_payment',
      p_category_id:      null,
      p_from_account_id:  accountId,
      p_to_account_id:    null,
      p_credit_card_id:   card.id,   // stored on tx for audit + used for CC balance update
      p_notes:            '',
      p_borrowing_id:     null,
      p_savings_id:       null,
      p_is_credit:        null,
      p_from_delta:       -amount,   // bank account debited
      p_to_delta:         null,
      p_cc_delta:         -amount,   // CC outstanding reduced
    })
    if (error) throw error

    const newTx: Transaction = { ...(data as Transaction), category: undefined }
    setState(s => ({
      ...s,
      credit_cards: s.credit_cards.map(c => c.id === card.id ? { ...c, current_balance: c.current_balance - amount } : c),
      accounts: s.accounts.map(a => a.id === accountId ? { ...a, current_balance: a.current_balance - amount } : a),
      transactions: [newTx, ...s.transactions],
    }))
  }, [userId])

  const adjustCreditCardBalance = useCallback(async (cardId: string, actualBalance: number, newBilled?: number) => {
    const card = stateRef.current.credit_cards.find(c => c.id === cardId)
    if (!card) return

    const today = new Date().toISOString().slice(0, 10)
    const totalDiff = actualBalance - card.current_balance
    const newTxns: Transaction[] = []

    // Billed adjustment — dated on last bill date so it falls in billed period
    let billedDiff = 0
    if (newBilled !== undefined) {
      const billing = getCreditCardBilling(card, stateRef.current.transactions)
      billedDiff = newBilled - billing.billedAmount
      if (Math.abs(billedDiff) > 0.01) {
        const { data, error } = await supabase.rpc('mp_execute_transaction', {
          p_user_id: userId, p_transaction_date: billing.lastBillDate,
          p_description: `${card.name} Billed Adjustment`,
          p_amount: Math.abs(billedDiff),
          p_transaction_type: 'cc_balance_adjustment',
          p_credit_card_id: cardId, p_cc_delta: billedDiff,
          p_from_account_id: null, p_to_account_id: null, p_from_delta: null, p_to_delta: null,
          p_notes: `Billed adjusted: ₹${(newBilled - billedDiff).toLocaleString('en-IN')} → ₹${newBilled.toLocaleString('en-IN')}`,
          p_category_id: null, p_borrowing_id: null, p_savings_id: null, p_is_credit: billedDiff > 0,
        })
        if (error) throw error
        newTxns.push({ ...(data as Transaction), category: undefined })
      }
    }

    // Unbilled adjustment — remaining total difference after billed portion, dated today
    const unbilledDiff = totalDiff - billedDiff
    if (Math.abs(unbilledDiff) > 0.01) {
      const { data, error } = await supabase.rpc('mp_execute_transaction', {
        p_user_id: userId, p_transaction_date: today,
        p_description: `${card.name} Balance Adjustment`,
        p_amount: Math.abs(unbilledDiff),
        p_transaction_type: 'cc_balance_adjustment',
        p_credit_card_id: cardId, p_cc_delta: unbilledDiff,
        p_from_account_id: null, p_to_account_id: null, p_from_delta: null, p_to_delta: null,
        p_notes: `Adjusted: ₹${card.current_balance.toLocaleString('en-IN')} → ₹${actualBalance.toLocaleString('en-IN')}`,
        p_category_id: null, p_borrowing_id: null, p_savings_id: null, p_is_credit: unbilledDiff > 0,
      })
      if (error) throw error
      newTxns.push({ ...(data as Transaction), category: undefined })
    }

    if (newTxns.length === 0) return

    setState(s => ({
      ...s,
      credit_cards: s.credit_cards.map(c => c.id === cardId ? { ...c, current_balance: actualBalance } : c),
      transactions: [...newTxns, ...s.transactions],
    }))
  }, [userId])

  const updateChallengeResult = useCallback(async (
    result: 'success' | 'miss',
    savedAmount: number,
    target: number,
    todayStr: string
  ) => {
    const s = stateRef.current.settings
    const streak  = s.challenge_streak       ?? 0
    const total   = s.challenge_total_days   ?? 0
    const success = s.challenge_success_days ?? 0
    const isSuccess = result === 'success'

    let newStreak: number
    let potDelta = 0
    let leafDelta = 0
    let isGrace = false

    if (isSuccess) {
      newStreak = streak + 1
      potDelta = Math.max(0, savedAmount)
      leafDelta = 2
    } else {
      const overPct = target > 0 ? Math.abs(savedAmount) / target : 1
      if (overPct < 0.10) {
        newStreak = streak   // grace pass: streak preserved, not incremented
        leafDelta = 1
        isGrace = true
      } else {
        newStreak = 0
        leafDelta = 0
      }
    }

    // Streak milestone bonuses (fire when streak crosses the threshold)
    if (newStreak === 7)  leafDelta += 3
    if (newStreak === 30) leafDelta += 10
    if (newStreak === 90) leafDelta += 25

    // Monthly leaf counter: reset when calendar month changes
    const currentMonth = todayStr.substring(0, 7)
    const lastMonth = (s.challenge_last_date ?? '').substring(0, 7)
    const monthLeaves = lastMonth === currentMonth ? (s.challenge_month_leaves ?? 0) : 0

    await updateSettings({
      challenge_streak:       newStreak,
      challenge_pot:          (s.challenge_pot ?? 0) + potDelta,
      challenge_leaves:       (s.challenge_leaves ?? 0) + leafDelta,
      challenge_month_leaves: monthLeaves + leafDelta,
      challenge_last_date:    todayStr,
      challenge_total_days:   total + 1,
      challenge_success_days: success + (isSuccess && !isGrace ? 1 : 0),
    })
  }, [updateSettings])

  const excludeChallengeTransaction = useCallback(async (txnId: string) => {
    const existing = stateRef.current.settings.challenge_excluded_txn_ids ?? []
    if (!existing.includes(txnId)) {
      await updateSettings({ challenge_excluded_txn_ids: [...existing, txnId] })
    }
  }, [updateSettings])

  const toggleChallengeExclusion = useCallback(async (txnId: string) => {
    const existing = stateRef.current.settings.challenge_excluded_txn_ids ?? []
    const isExcluded = existing.includes(txnId)
    await updateSettings({
      challenge_excluded_txn_ids: isExcluded
        ? existing.filter(id => id !== txnId)
        : [...existing, txnId],
    })
  }, [updateSettings])

  const loadMoreTransactions = useCallback(async () => {
    if (allTransactionsLoaded || loadingMore) return
    setLoadingMore(true)
    try {
      const current = stateRef.current.transactions
      const offset = current.length
      const { data } = await supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + TXN_PAGE_SIZE - 1)
      const newTxns = (data as Transaction[]) || []
      if (newTxns.length < TXN_PAGE_SIZE) setAllTransactionsLoaded(true)
      if (newTxns.length > 0) {
        const existingIds = new Set(current.map(t => t.id))
        const unique = newTxns.filter(t => !existingIds.has(t.id))
        if (unique.length > 0) setState(s => ({ ...s, transactions: [...s.transactions, ...unique] }))
      }
    } catch (err) {
      console.error('Failed to load more transactions:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [userId, allTransactionsLoaded, loadingMore])

  // The AA sync promotion loop writes accounts/transactions via RPC, not
  // through addTransaction/addAccount, so those rows never reach AppState
  // through the normal optimistic-setState path (useSupabaseData has no
  // realtime subscription — see the Phase 1b plan). Re-fetches just the
  // account balances and the most recent page of transactions and merges
  // them in, keeping this hook the sole owner of AppState's shape.
  const refetchAccountsAndRecentTransactions = useCallback(async () => {
    const [{ data: accounts }, { data: transactions }] = await Promise.all([
      supabase.from('accounts').select('*').eq('is_active', true).eq('user_id', userId).order('name'),
      supabase.from('transactions')
        .select('*, category:categories(*)')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(TXN_PAGE_SIZE),
    ])

    const freshTxns = (transactions as Transaction[]) || []
    const freshIds = new Set(freshTxns.map(t => t.id))
    const olderTxns = stateRef.current.transactions.filter(t => !freshIds.has(t.id))

    setState(s => ({
      ...s,
      accounts: accounts ?? s.accounts,
      transactions: [...freshTxns, ...olderTxns],
    }))
  }, [userId])

  return {
    state, setState, loading, usingSupabase, allTransactionsLoaded, loadingMore, loadMoreTransactions,
    refetchAccountsAndRecentTransactions,
    addTransaction, deleteTransaction, updateTransaction, updateSettings, updateForecastSettings, updateBudgetStrategySettings,
    uploadReceipt, removeReceipt, getReceiptUrl,
    addAccount, deleteAccount, updateAccount, adjustBalance,
    addGroup, updateGroup, deleteGroup, toggleGroupVisibility,
    addCategory, updateCategory, deleteCategory, toggleCategoryVisibility, updateCategoryBucket,
    addCreditCard, updateCreditCard, deleteCreditCard, payCreditCardBill, adjustCreditCardBalance,
    addBorrowing, updateBorrowing, deleteBorrowing, recordBorrowingPayment, reversePayment,
    addCommitment, updateCommitment, deleteCommitment, markCommitmentPaid,
    addPlannedExpense, updatePlannedExpense, deletePlannedExpense,
    addGoal, updateGoal, deleteGoal, addGoalSavings,
    addSavings, updateSavings, deleteSavings, recordContribution, updateSavingsValue, recordSavingsPayout, revertSavingsPayout,
    updateChallengeResult, excludeChallengeTransaction, toggleChallengeExclusion,
  }
}