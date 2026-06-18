export type AccountType = 'bank' | 'cash' | 'credit_card' | 'wallet'
export type TransactionType = 'expense' | 'income' | 'transfer' | 'commitment' | 'borrowing' | 'borrowing_repayment' | 'savings_contribution' | 'savings_withdrawal'

export type GroupType =
  | 'income'
  | 'transfer'
  | 'savings'
  | 'borrowing'
  | 'adjustment'
  | 'discretionary'
  | 'essential'
  | 'commitment'

export interface Group {
  id: string
  name: string
  user_id?: string
  is_visible?: boolean
  is_system?: boolean
  is_editable?: boolean
  is_deletable?: boolean
  type?: GroupType
}

export interface Category {
  id: string
  name: string
  group_name: string
  user_id?: string
  is_visible?: boolean
  is_system?: boolean
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
  weekly_start_day?: number     // 0=Sun 1=Mon … 6=Sat, default 1
  monthly_start_date?: number   // 1–31, default 1
  notifications_enabled?: boolean
  notify_daily_reminder?: boolean
  notify_budget_alert?: boolean
  notify_commitments?: boolean
  notify_weekly_summary?: boolean
  track_savings?: boolean
  budget_mode?: 'auto' | 'manual'
  hero_mode?: 'remaining' | 'budget'
  challenge_enabled?:           boolean
  challenge_difficulty?:        'easy' | 'medium' | 'hard'
  challenge_streak?:            number
  challenge_pot?:               number
  challenge_leaves?:            number
  challenge_month_leaves?:      number
  challenge_last_date?:         string | null
  challenge_excluded_txn_ids?:  string[] | null
  challenge_total_days?:        number
  challenge_success_days?:      number
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

export type SavingsType = 'sip' | 'gold' | 'rd' | 'fd' | 'ppf_nps' | 'chit' | 'custom'
export type SavingsFrequency = 'monthly' | 'weekly' | 'yearly'

export interface Savings {
  id: string
  user_id?: string
  name: string
  type: SavingsType
  amount: number                      // contribution per period (or FD principal)
  is_recurring: boolean
  frequency: SavingsFrequency | null
  due_day: number | null              // day of month for recurring contribution
  total_installments: number | null   // total months / tenure (= member count for chits)
  current_installment: number         // contributions made so far
  total_target: number | null         // target corpus amount
  current_value: number               // market value / maturity value / chit prize amount
  maturity_date: string | null        // ISO date — for FD / RD
  interest_rate: number | null        // % p.a. — for FD / RD
  from_account_id: string | null
  category_id: string | null
  last_contribution_date: string | null
  notes: string | null
  is_active: boolean
  is_prized: boolean                  // chit: have you received the prize pot yet?
  prize_month: number | null          // chit: which installment number the prize was received at
  created_at?: string
}

export type GoalType = 'purchase' | 'savings' | 'event'

export interface Goal {
  id: string
  user_id?: string
  name: string
  goal_type: GoalType
  goal_amount: number
  current_saved: number
  monthly_target: number
  target_date: string
  created_at: string
  is_active: boolean
}

export interface GoalContribution {
  id: string
  user_id?: string
  goal_id: string
  amount: number
  source: 'manual' | 'daily_challenge'
  note?: string | null
  created_at: string
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
  goals: Goal[]
  goal_contributions: GoalContribution[]
  savings: Savings[]
}

export interface DerivedMetrics {
  actualBalance: number
  emergencyFund: number
  availableBalance: number
  remainingCommitments: number
  realFreeMoney: number
  // Period-based (manual mode + analytics)
  weeklyBudget: number
  weeklySpent: number
  weeklyRemaining: number
  weeklyPct: number
  // Salary-cycle-based (auto mode)
  cycleSpent: number
  cycleRemaining: number
  safeDailySpend: number
  safeWeeklySpend: number
  cycleDaysLeft: number
  cycleWeeksLeft: number
}

export interface TrendPoint { label: string; date: string; value: number }
export interface BarPoint   { label: string; value: number }
export interface CatPoint   { name: string; value: number }

export interface TimelineDayPoint {
  day: number
  isoDate: string
  total: number
  isFuture: boolean
  transactions: Transaction[]
}

export interface TimelineLane {
  name: string
  group?: string
  total: number
  days: Array<{ day: number; isoDate: string; amount: number }>
}

export interface MonthTimelineData {
  byDay: TimelineDayPoint[]
  byCategory: TimelineLane[]
  byGroup: TimelineLane[]
  daysInMonth: number
  todayDay: number
  monthLabel: string
  totalSpent: number
}

export interface JourneyIncomeItem  { name: string; amount: number }
export interface JourneyWealthItem  { name: string; type: string; value: number }
export interface JourneyGoalItem    { name: string; target: number; current: number; pct: number; completed: boolean }

export interface JourneyData {
  // Seed
  totalIncome: number
  incomeItems: JourneyIncomeItem[]
  // Roots
  commitmentsPaid: number
  savingsContributed: number
  goalsContributed: number
  rootsTotal: number
  rootsPct: number
  // Stem
  challengeEnabled: boolean
  successDays: number
  totalDays: number
  leavesEarned: number
  streak: number
  successRate: number
  // Branches
  wealthItems: JourneyWealthItem[]
  totalWealth: number
  // Flowers
  goalItems: JourneyGoalItem[]
  activeGoals: number
  completedGoals: number
  // Meta
  cycleLabel: string
}

export type Layout = 'grid' | 'carousel' | 'list'

export type DashboardSectionId =
  | 'hero' | 'affordability' | 'daily_challenge' | 'metrics' | 'commitments' | 'goals'
  | 'accounts' | 'borrowing' | 'credit_cards' | 'analytics' | 'recent_txns' | 'savings'

export interface DashboardSection {
  id: string                    // built-ins use DashboardSectionId; custom sections use 'custom__<timestamp>'
  visible: boolean
  customName?: string
  customGroups?: string[]       // category group names
  customCategories?: string[]   // individual category IDs
}

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[] = [
  { id: 'hero',            visible: true },
  { id: 'affordability',   visible: true },
  { id: 'daily_challenge', visible: true },
  { id: 'metrics',         visible: true },
  { id: 'commitments',   visible: true },
  { id: 'goals',         visible: true },
  { id: 'accounts',      visible: true },
  { id: 'savings',       visible: true },
  { id: 'borrowing',     visible: true },
  { id: 'credit_cards',  visible: true },
  { id: 'analytics',     visible: true },
  { id: 'recent_txns',   visible: true },
]
