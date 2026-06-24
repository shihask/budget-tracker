export type ProjectStatus = 'active' | 'completed' | 'archived'
export type ProjectTransactionType = 'contribution' | 'expense'
export type ProjectTab = 'overview' | 'expenses' | 'members' | 'settlement'
export type CollaboratorRole = 'owner' | 'editor' | 'viewer'

export interface Project {
  id: string
  owner_user_id: string
  name: string
  description: string | null
  notes: string | null
  target_amount: number
  currency: string
  status: ProjectStatus
  share_code: string | null
  is_public: boolean
  shared_at: string | null
  share_views: number
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  name: string
  email: string | null
  share_ratio: number
  display_order: number
  is_active: boolean
  created_at: string
}

export interface ProjectTransaction {
  id: string
  project_id: string
  member_id: string | null
  transaction_type: ProjectTransactionType
  amount: number
  description: string | null
  category: string | null
  notes: string | null
  transaction_date: string
  display_order: number
  created_at: string
  member?: ProjectMember
}

export interface ProjectAttachment {
  id: string
  project_transaction_id: string
  path: string
  file_name: string
  created_at: string
}

export interface ProjectCollaborator {
  id: string
  project_id: string
  user_id: string | null
  invited_email: string | null
  role: CollaboratorRole
  status: 'active' | 'pending'
  created_at: string
}

export interface ProjectBudget {
  id: string
  project_id: string
  category: string
  budget_amount: number
  display_order: number
  created_at: string
}

export type ProjectRole = 'owner' | 'editor' | 'viewer'

// ── Calculation outputs ─────────────────────────────────────────────────

export interface ProjectSummary {
  totalContributions: number
  totalExpenses: number
  fundingProgress: number
  spendingProgress: number
  remainingBudget: number
  memberCount: number
  expenseCount: number
  contributionCount: number
}

export interface MemberSummary {
  memberId: string
  memberName: string
  expectedContribution: number
  actualContribution: number
  remainingContribution: number
  totalExpensesPaid: number
}

export interface SettlementEntry {
  fromMemberId: string
  fromMemberName: string
  toMemberId: string
  toMemberName: string
  amount: number
}

export interface SettlementResult {
  creditors: Array<{ memberId: string; memberName: string; netCredit: number }>
  debtors: Array<{ memberId: string; memberName: string; netDebt: number }>
  settlements: SettlementEntry[]
}

export interface BudgetBreakdown {
  budgetId: string
  category: string
  budgetAmount: number
  spent: number
  remaining: number
  pct: number
}

export interface BudgetSummary {
  totalAllocated: number
  totalSpentInBudget: number
  unallocatedAmount: number
  breakdowns: BudgetBreakdown[]
  uncategorizedSpend: number
}
