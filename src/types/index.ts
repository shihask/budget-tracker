export type AccountType = 'bank' | 'cash' | 'credit_card'
export type TransactionType = 'expense' | 'income' | 'transfer' | 'commitment' | 'borrowing' | 'borrowing_repayment'

export interface Group {
  id: string
  name: string
  user_id?: string
}

export interface Category {
  id: string
  name: string
  group_name: string
  user_id?: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  current_balance: number
  is_active: boolean
  created_at?: string
}

export interface Transaction {
  id: string
  transaction_date: string
  description: string
  amount: number
  transaction_type: TransactionType
  category_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  notes: string | null
  created_at: string
  borrowing_id?: string | null
  credit_card_id?: string | null
  // joined
  category?: Category
  from_account?: Account
}

export interface CreditCard {
  id: string
  user_id?: string
  name: string
  last_four: string | null
  credit_limit: number
  cycle_start_day: number
  bill_day: number
  due_day: number
  current_balance: number
  is_active: boolean
}

export interface Borrowing {
  id: string
  person_name: string
  total_amount: number
  paid_amount: number
  remaining_amount: number
  notes: string | null
  direction: 'lent' | 'borrowed'
}

export interface WeeklyBudgetScope {
  groups: string[]
  categoryIds: string[]
  transactionIds: string[]
}

export interface Settings {
  id: string
  weekly_budget: number
  emergency_fund: number
  salary_date: number | null
  track_credit_cards: boolean
  track_borrowings: boolean
  autopilot_enabled: boolean
  dashboard_sections?: DashboardSection[] | null
  weekly_budget_scope?: WeeklyBudgetScope | null
  ai_requests_used?: number
  ai_requests_reset_at?: string | null
  budget_period?: 'daily' | 'weekly' | 'monthly'
  notifications_enabled?: boolean
  notify_daily_reminder?: boolean
  notify_budget_alert?: boolean
  notify_commitments?: boolean
  notify_weekly_summary?: boolean
}

// Commitments are rows in a separate local table (or commitments are derived from transactions)
// The prototype uses a separate in-memory list; we model it the same way
export interface Commitment {
  id: string
  name: string
  amount: number
  remaining: number
  category_id: string | null
  is_recurring: boolean
  frequency: 'monthly' | 'weekly' | 'yearly' | null
  due_day: number | null
  from_account_id: string | null
  is_active: boolean
  last_paid_date: string | null
  total_installments: number | null
  current_installment: number | null
}

export interface AppState {
  accounts: Account[]
  categories: Category[]
  groups: Group[]
  credit_cards: CreditCard[]
  settings: Settings
  commitments: Commitment[]
  borrowings: Borrowing[]
  transactions: Transaction[]
}

export interface DerivedMetrics {
  actualBalance: number
  emergencyFund: number
  availableBalance: number
  remainingCommitments: number
  realFreeMoney: number
  weeklyBudget: number
  weeklySpent: number
  weeklyRemaining: number
  weeklyPct: number
}

export interface TrendPoint { label: string; date: string; value: number }
export interface BarPoint   { label: string; value: number }
export interface CatPoint   { name: string; value: number }

export type Layout = 'grid' | 'carousel' | 'list'

export type DashboardSectionId =
  | 'hero' | 'affordability' | 'metrics' | 'commitments' | 'accounts'
  | 'borrowing' | 'credit_cards' | 'analytics' | 'recent_txns'

export interface DashboardSection {
  id: string                    // built-ins use DashboardSectionId; custom sections use 'custom__<timestamp>'
  visible: boolean
  customName?: string
  customGroups?: string[]       // category group names
  customCategories?: string[]   // individual category IDs
}

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[] = [
  { id: 'hero',          visible: true },
  { id: 'affordability', visible: true },
  { id: 'metrics',       visible: true },
  { id: 'commitments',   visible: true },
  { id: 'accounts',      visible: true },
  { id: 'borrowing',     visible: true },
  { id: 'credit_cards',  visible: true },
  { id: 'analytics',     visible: true },
  { id: 'recent_txns',   visible: true },
]
