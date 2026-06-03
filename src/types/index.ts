export type AccountType = 'bank' | 'cash' | 'credit_card'
export type CategoryGroup = 'Lifestyle' | 'Commitment' | 'Renovation' | 'Family' | 'Transfer'
export type TransactionType = 'expense' | 'income' | 'transfer' | 'commitment' | 'borrowing' | 'borrowing_repayment'

export interface Account {
  id: string
  name: string
  type: AccountType
  current_balance: number
  is_active: boolean
  created_at?: string
}

export interface Category {
  id: string
  name: string
  group_name: CategoryGroup
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
  // joined
  category?: Category
  from_account?: Account
}

export interface Borrowing {
  id: string
  person_name: string
  total_amount: number
  paid_amount: number
  remaining_amount: number
  notes: string | null
}

export interface Settings {
  id: string
  weekly_budget: number
  emergency_fund: number
}

// Commitments are rows in a separate local table (or commitments are derived from transactions)
// The prototype uses a separate in-memory list; we model it the same way
export interface Commitment {
  id: string
  name: string
  remaining: number
  category_id: string
}

export interface AppState {
  accounts: Account[]
  categories: Category[]
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
  renovationMonth: number
}

export interface TrendPoint { label: string; date: string; value: number }
export interface BarPoint   { label: string; value: number }
export interface CatPoint   { name: string; value: number }

export type Layout = 'grid' | 'carousel' | 'list'
