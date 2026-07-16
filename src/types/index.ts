export type AccountType = 'bank' | 'cash' | 'credit_card' | 'wallet'
export type BudgetBucket = 'needs' | 'wants' | 'savings'
export type BudgetStrategyType = 'none' | 'balanced' | 'stable' | 'growth' | 'custom'
export type IncomePattern = 'monthly' | 'weekly' | 'variable' | 'business'
export type EstimateConfidence = 'high' | 'medium' | 'low' | 'none'
export type TransactionType = 'expense' | 'income' | 'transfer' | 'commitment' | 'borrowing' | 'borrowing_repayment' | 'savings_contribution' | 'savings_withdrawal' | 'opening_balance' | 'balance_adjustment' | 'credit_card_payment' | 'cc_opening_balance' | 'cc_balance_adjustment'

export const SYSTEM_TX_TYPES = new Set<TransactionType>(['opening_balance', 'balance_adjustment', 'credit_card_payment', 'cc_opening_balance', 'cc_balance_adjustment'])

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
  budget_bucket?: BudgetBucket | null
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
  // Direction for borrowing/borrowing_repayment: true = account credited, false = debited
  is_credit?: boolean | null
  // FK to savings record for savings_contribution/savings_withdrawal
  savings_id?: string | null
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
  repayment_date: string | null
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
  notify_evening_recap?: boolean
  track_savings?: boolean
  track_projects?: boolean
  track_aa_sync?: boolean
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
  last_reflection_date?:        string | null
  monthly_salary?:              number | null
  income_pattern?:              IncomePattern
  weekly_income?:               number | null
  income_day?:                  number | null
  average_daily_income?:        number | null
  working_days_per_week?:       number | null
  business_monthly_drawings?:   number | null
  primary_income_category_id?:  string | null
  // Auto-mode "envelope" snapshot — frozen once per income cycle so the Auto
  // Budget ring/remaining figures don't recompute against a shrinking live
  // denominator. See src/lib/data.ts `derive()` and the snapshot-detect effect
  // in src/App.tsx.
  cycle_start_free_money?:      number | null
  cycle_snapshot_key?:          string | null
  // Affordability Checker "changed since yesterday" snapshot — frozen once
  // per day so the checker can explain what moved. See AffordabilityChecker.tsx.
  affordability_snapshot_date?:            string | null
  affordability_snapshot_daily_lifestyle?: number | null
  affordability_snapshot_bills_total?:     number | null
}

export type ForecastMode = 'planned' | 'lifestyle'

export interface ForecastSettings {
  id: string
  user_id?: string
  enabled: boolean
  days: number
  commitment_ids: string[] | null
  savings_ids: string[] | null
  salary_override: number | null
  forecast_mode: ForecastMode
}

export interface BudgetStrategySettings {
  id: string
  user_id?: string
  budget_strategy: BudgetStrategyType
  custom_needs_pct: number
  custom_wants_pct: number
  custom_savings_pct: number
  budget_strategy_base: 'income' | 'available_funds'
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
  due_date: string | null
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
  due_day: number | null              // day of month the scheme expects payment (deadline)
  total_installments: number | null   // total months / tenure (= member count for chits)
  current_installment: number         // contributions made so far
  total_target: number | null         // target corpus amount
  current_value: number               // market value / maturity value / chit prize amount
  maturity_date: string | null        // ISO date — for FD / RD
  interest_rate: number | null        // % p.a. — for FD / RD
  from_account_id: string | null
  category_id: string | null
  last_contribution_date: string | null
  paid_date: string | null              // actual date payment was made (set by recordContribution)
  notes: string | null
  is_active: boolean
  is_prized: boolean                  // chit: have you received the prize pot yet?
  prize_month: number | null          // chit: which installment number the prize was received at
  investment_source?: 'existing' | 'new'
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

export interface PlannedExpense {
  id: string
  user_id?: string
  title: string
  amount: number
  planned_date: string
  category_id: string | null
  notes: string | null
  is_completed: boolean
  created_at?: string
}

export interface AppState {
  accounts: Account[]
  categories: Category[]
  groups: Group[]
  credit_cards: CreditCard[]
  settings: Settings
  forecast_settings: ForecastSettings
  budget_strategy_settings: BudgetStrategySettings
  commitments: Commitment[]
  borrowings: Borrowing[]
  transactions: Transaction[]
  goals: Goal[]
  goal_contributions: GoalContribution[]
  savings: Savings[]
  planned_expenses: PlannedExpense[]
}

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'info' | 'positive'
export type NotificationDomain = 'budget' | 'cash_health' | 'bills' | 'income' | 'goals' | 'savings' | 'challenge'
export type NotificationTone = 'critical' | 'warning' | 'info' | 'positive'   // semantic, not a color

// Structured navigation payload — the app has no URL router (App.tsx uses state-driven
// panel toggles), so this is "which screen to open, with which params," not a route string.
export interface NotificationTarget {
  screen: 'spending' | 'budget' | 'forecast' | 'bills' | 'goal' | 'savings' | 'challenge'
  params?: Record<string, string>
}

export interface NotificationAction {
  label: string
  target: NotificationTarget
}

// Notifications are derived state, not persisted application data — every one is
// recomputed from the current AppState/DerivedMetrics each call. See src/lib/notification-engine.ts.
export interface AppNotification {
  id: string
  domain: NotificationDomain
  priority: NotificationPriority
  tone: NotificationTone
  title: string
  message: string
  recommendation?: string
  reasons?: { label: string; amount: number }[]
  projectedAmount?: number
  remainingBudget?: number
  safeDailySpend?: number
  confidence?: EstimateConfidence
  progress?: { label: string; pct: number }[]
  actions?: NotificationAction[]
  createdAt: string
  dismissible: boolean
  meta?: {
    entityId?: string
    entityType?: 'goal' | 'bill' | 'savings' | 'account' | 'commitment' | 'credit_card'
    cycleKey?: string
  }
}

export interface CashHealthStatus {
  status: 'healthy' | 'shortfall'
  tone: 'positive' | 'critical'
  message: string
  description: string
}

export interface DerivedMetrics {
  actualBalance: number
  emergencyFund: number
  availableBalance: number
  remainingCommitments: number
  realFreeMoney: number
  obligationBreakdown?: import('@/lib/obligations').RemainingObligations
  cashFlowSummary?: import('@/lib/cashflow').CashFlowSummary
  // Period-based (manual mode + analytics)
  weeklyBudget: number
  weeklySpent: number
  weeklyRemaining: number
  weeklyPct: number
  // Financial-cycle-based (auto mode — income-driven)
  cycleStartFreeMoney: number   // frozen "envelope" for this cycle — stable all cycle long
  cycleTrackingReady: boolean   // false until a real snapshot exists for the current cycle
  cashHealth?: CashHealthStatus   // live realFreeMoney check, independent of Budget Progress
  cycleSpent: number
  cycleRemaining: number        // cycleStartFreeMoney - cycleSpent (stable, can go negative)
  safeDailySpend: number
  safeWeeklySpend: number
  cycleDaysLeft: number
  cycleWeeksLeft: number
  // Financial Cycle (computed once, shared across all consumers)
  financialCycle?: import('@/lib/financial-cycle').FinancialCycle
  isWaitingForIncome?: boolean
  expectedIncomeDate?: Date | null
  cycleSource?: import('@/lib/financial-cycle').CycleSource
  // Variable/business income metrics
  safeUntilDays?: number
  avgDailyIncome?: number
  avgDailySpending?: number
  incomeConfidence?: EstimateConfidence
  todayIncome?: number
  todaySpending?: number
  todaySaving?: number
  weekEarned?: number
  weekSpent?: number
  weekSaved?: number
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
  count: number
  days: Array<{ day: number; isoDate: string; amount: number }>
}

export interface MonthTimelineData {
  byDay: TimelineDayPoint[]
  byCategory: TimelineLane[]
  byGroup: TimelineLane[]
  daysInMonth: number
  todayDay: number
  monthLabel: string
  isCurrentMonth: boolean
  totalSpent: number
  txnCount: number
}

export interface JourneyIncomeItem  { name: string; amount: number }
export interface JourneyWealthItem  { name: string; type: string; value: number }
export interface JourneyGoalItem    { name: string; target: number; current: number; pct: number; completed: boolean }
export interface JourneyMilestone   { emoji: string; text: string; section: 'seed' | 'roots' | 'stem' | 'branch' | 'flower' }
export interface JourneyFlowItem    { name: string; amount: number }
export interface JourneyHealthItem  { label: string; score: number; max: number }
export type JourneyEventType = 'income' | 'savings' | 'commitment' | 'goal' | 'expense'
export interface JourneyReplayEvent {
  date: string; emoji: string; title: string; subtitle?: string; amount?: number
  eventType: JourneyEventType
}

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
  // Hero
  heroValue: number
  heroLabel: string
  // Milestones
  milestones: JourneyMilestone[]
  // Story
  storyLine: string
  // Health score
  healthScore: number
  healthLabel: string
  healthBreakdown: JourneyHealthItem[]
  // Replay
  replayEvents: JourneyReplayEvent[]
  // Lifestyle spending
  lifestyleSpending: number
  lifestyleCategories: JourneyFlowItem[]
  savedBreakdown: JourneyFlowItem[]
  spendingPct: number
  // Efficiency
  efficiencyPct: number
  // Cycle comparison
  prevRootsTotal: number
  prevSavingsContributed: number
  hasPrevData: boolean
  // Meta
  cycleLabel: string
  isCurrentCycle: boolean
}

export type Layout = 'grid' | 'carousel' | 'list'

export type DashboardSectionId =
  | 'hero' | 'affordability' | 'daily_challenge' | 'metrics' | 'commitments' | 'goals'
  | 'accounts' | 'borrowing' | 'credit_cards' | 'analytics' | 'recent_txns' | 'savings' | 'cashflow'
  | 'projects' | 'wealth_summary' | 'budget_strategy'

export interface DashboardSection {
  id: string                    // built-ins use DashboardSectionId; custom sections use 'custom__<timestamp>'
  visible: boolean
  customName?: string
  customGroups?: string[]       // category group names
  customCategories?: string[]   // individual category IDs
}

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[] = [
  { id: 'hero',            visible: true },
  { id: 'wealth_summary',  visible: true },
  { id: 'budget_strategy', visible: true },
  { id: 'daily_challenge', visible: true },
  { id: 'affordability',   visible: true },
  { id: 'cashflow',        visible: true },
  { id: 'metrics',         visible: true },
  { id: 'commitments',   visible: true },
  { id: 'goals',         visible: true },
  { id: 'accounts',      visible: true },
  { id: 'savings',       visible: true },
  { id: 'borrowing',     visible: true },
  { id: 'credit_cards',  visible: true },
  { id: 'projects',      visible: true },
  { id: 'analytics',     visible: true },
  { id: 'recent_txns',   visible: true },
]
