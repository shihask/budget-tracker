import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import { version as APP_VERSION } from '../../package.json'
import type {
  Account, Category, Group, CreditCard, Borrowing, Commitment, Goal,
  GoalContribution, Savings, PlannedExpense, Settings, ForecastSettings, BudgetStrategySettings,
} from '@/types'

const PAGE_SIZE = 1000

async function fetchAllPages<T>(table: string, userId: string, orderCol: string): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderCol, { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function toCsv<T extends object>(rows: T[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map(c => csvEscape((row as Record<string, unknown>)[c])).join(','))
  return '﻿' + lines.join('\n')
}

const TRANSACTION_COLUMNS = [
  'id', 'transaction_date', 'description', 'amount', 'transaction_type', 'category_id',
  'from_account_id', 'to_account_id', 'notes', 'created_at', 'borrowing_id', 'credit_card_id',
  'is_credit', 'savings_id', 'receipt_uploaded_at',
]
const ACCOUNT_COLUMNS = ['id', 'name', 'type', 'current_balance', 'is_active', 'created_at']
const CATEGORY_COLUMNS = ['id', 'name', 'group_name', 'is_visible', 'is_system', 'budget_bucket']
const GROUP_COLUMNS = ['id', 'name', 'is_visible', 'is_system', 'is_editable', 'is_deletable', 'type']
const CREDIT_CARD_COLUMNS = ['id', 'name', 'last_four', 'credit_limit', 'cycle_start_day', 'bill_day', 'due_day', 'current_balance', 'is_active']
const BORROWING_COLUMNS = ['id', 'person_name', 'total_amount', 'paid_amount', 'remaining_amount', 'notes', 'direction', 'repayment_date']
const COMMITMENT_COLUMNS = ['id', 'name', 'amount', 'remaining', 'category_id', 'is_recurring', 'frequency', 'due_day', 'from_account_id', 'is_active', 'last_paid_date', 'total_installments', 'current_installment', 'due_date']
const GOAL_COLUMNS = ['id', 'name', 'goal_type', 'goal_amount', 'current_saved', 'monthly_target', 'target_date', 'created_at', 'is_active']
const GOAL_CONTRIBUTION_COLUMNS = ['id', 'goal_id', 'amount', 'source', 'note', 'created_at']
const SAVINGS_COLUMNS = ['id', 'name', 'type', 'amount', 'is_recurring', 'frequency', 'due_day', 'total_installments', 'current_installment', 'total_target', 'current_value', 'maturity_date', 'interest_rate', 'from_account_id', 'category_id', 'last_contribution_date', 'paid_date', 'notes', 'is_active', 'is_prized', 'prize_month', 'investment_source', 'created_at']
const PLANNED_EXPENSE_COLUMNS = ['id', 'title', 'amount', 'planned_date', 'category_id', 'notes', 'is_completed', 'created_at']

const README = `# MoneyPlant Data Export

This archive contains a full export of your MoneyPlant data — every table is scoped to your account only.

## Files

- transactions.csv — every transaction you've recorded
- accounts.csv — your accounts (bank, cash, wallet, credit card)
- categories.csv — spending/income categories
- groups.csv — category groups (e.g. Lifestyle, Utilities)
- credit_cards.csv — credit card profiles
- borrowings.csv — money lent or borrowed
- commitments.csv — recurring bills/EMIs
- goals.csv — savings goals
- goal_contributions.csv — contributions made toward goals
- savings.csv — SIPs, deposits, chits and other savings instruments
- planned_expenses.csv — upcoming planned expenses
- settings.json — your app settings and budget-strategy configuration
- metadata.json — export version, timestamp, and row counts

## Reading transactions.csv

- \`amount\` is always a positive number. \`transaction_type\` determines whether it credits or
  debits the account — e.g. \`income\`, \`opening_balance\` credit the account; \`expense\`,
  \`commitment\`, \`savings_contribution\`, etc. debit it.
- \`transaction_type\` values: expense, income, transfer, commitment, borrowing,
  borrowing_repayment, savings_contribution, savings_withdrawal, opening_balance,
  balance_adjustment, credit_card_payment, cc_opening_balance, cc_balance_adjustment.
- Currency is Indian Rupees (INR, ₹) throughout; amounts are plain numbers with no symbol.

## Relationships between files

- transactions.category_id -> categories.id
- transactions.from_account_id / to_account_id -> accounts.id
- transactions.credit_card_id -> credit_cards.id
- transactions.borrowing_id -> borrowings.id
- transactions.savings_id -> savings.id
- categories.group_name -> groups.name
- goal_contributions.goal_id -> goals.id
- commitments.category_id / savings.category_id / planned_expenses.category_id -> categories.id

Note: receipt images are not included in this export — only \`receipt_uploaded_at\` (the
date a receipt was attached to a transaction, if any) is present in transactions.csv.
`

export async function exportAllData(userId: string, userEmail?: string): Promise<void> {
  const [
    { data: accounts, error: e1 },
    { data: categories, error: e2 },
    { data: groups, error: e3 },
    { data: creditCards, error: e4 },
    { data: borrowings, error: e5 },
    { data: commitments, error: e6 },
    { data: goals, error: e7 },
    { data: savings, error: e8 },
    { data: plannedExpenses, error: e9 },
    { data: settings, error: e10 },
    { data: forecastSettings, error: e11 },
    { data: budgetStrategySettings, error: e12 },
    transactions,
    goalContributions,
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).order('name'),
    supabase.from('categories').select('*').eq('user_id', userId).order('group_name'),
    supabase.from('groups').select('*').eq('user_id', userId).order('name'),
    supabase.from('credit_cards').select('*').eq('user_id', userId).order('name'),
    supabase.from('borrowings').select('*').eq('user_id', userId).order('person_name'),
    supabase.from('commitments').select('*').eq('user_id', userId).order('name'),
    supabase.from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('savings').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('planned_expenses').select('*').eq('user_id', userId).order('planned_date'),
    supabase.from('settings').select('*').eq('user_id', userId).limit(1).single(),
    supabase.from('forecast_settings').select('*').eq('user_id', userId).limit(1).single(),
    supabase.from('budget_strategy_settings').select('*').eq('user_id', userId).limit(1).single(),
    fetchAllPages<Record<string, unknown>>('transactions', userId, 'created_at'),
    fetchAllPages<GoalContribution>('goal_contributions', userId, 'created_at'),
  ])

  const firstError = [e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11, e12].find(Boolean)
  if (firstError) throw firstError

  const zip = new JSZip()

  zip.file('transactions.csv', toCsv(transactions as unknown as Record<string, unknown>[], TRANSACTION_COLUMNS))
  zip.file('accounts.csv', toCsv((accounts as Account[]) || [], ACCOUNT_COLUMNS))
  zip.file('categories.csv', toCsv((categories as Category[]) || [], CATEGORY_COLUMNS))
  zip.file('groups.csv', toCsv((groups as Group[]) || [], GROUP_COLUMNS))
  zip.file('credit_cards.csv', toCsv((creditCards as CreditCard[]) || [], CREDIT_CARD_COLUMNS))
  zip.file('borrowings.csv', toCsv((borrowings as Borrowing[]) || [], BORROWING_COLUMNS))
  zip.file('commitments.csv', toCsv((commitments as Commitment[]) || [], COMMITMENT_COLUMNS))
  zip.file('goals.csv', toCsv((goals as Goal[]) || [], GOAL_COLUMNS))
  zip.file('goal_contributions.csv', toCsv(goalContributions, GOAL_CONTRIBUTION_COLUMNS))
  zip.file('savings.csv', toCsv((savings as Savings[]) || [], SAVINGS_COLUMNS))
  zip.file('planned_expenses.csv', toCsv((plannedExpenses as PlannedExpense[]) || [], PLANNED_EXPENSE_COLUMNS))

  zip.file('settings.json', JSON.stringify({
    settings: settings as Settings,
    forecast_settings: forecastSettings as ForecastSettings,
    budget_strategy_settings: budgetStrategySettings as BudgetStrategySettings,
  }, null, 2))

  zip.file('metadata.json', JSON.stringify({
    format: 'moneyplant-export',
    format_version: 1,
    exported_at: new Date().toISOString(),
    app: 'MoneyPlant',
    app_version: APP_VERSION,
    user_id: userId,
    user_email: userEmail ?? null,
    currency: 'INR',
    row_counts: {
      transactions: transactions.length,
      accounts: (accounts || []).length,
      categories: (categories || []).length,
      groups: (groups || []).length,
      credit_cards: (creditCards || []).length,
      borrowings: (borrowings || []).length,
      commitments: (commitments || []).length,
      goals: (goals || []).length,
      goal_contributions: goalContributions.length,
      savings: (savings || []).length,
      planned_expenses: (plannedExpenses || []).length,
    },
  }, null, 2))

  zip.file('README.md', README)

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `MoneyPlant_Export_${date}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
