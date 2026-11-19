import { round2 } from '@/lib/utils'
import type {
  Project, ProjectMember, ProjectTransaction, ProjectBudget,
  ProjectSummary, MemberSummary, SettlementResult, BudgetSummary
} from '../types'
import { computeSettlement, type SettlementOptions } from './settlement'

export function calcProjectSummary(
  project: Project,
  members: ProjectMember[],
  transactions: ProjectTransaction[]
): ProjectSummary {
  const contributions = transactions.filter(t => t.transaction_type === 'contribution')
  const expenses = transactions.filter(t => t.transaction_type === 'expense')
  const totalContributions = round2(contributions.reduce((s, t) => s + t.amount, 0))
  const totalExpenses = round2(expenses.reduce((s, t) => s + t.amount, 0))
  const target = project.target_amount || 0

  return {
    totalContributions,
    totalExpenses,
    fundingProgress: target > 0 ? Math.min((totalContributions / target) * 100, 100) : 0,
    spendingProgress: target > 0 ? Math.min((totalExpenses / target) * 100, 100) : 0,
    remainingBudget: round2(totalContributions - totalExpenses),
    memberCount: members.filter(m => m.is_active).length,
    expenseCount: expenses.length,
    contributionCount: contributions.length,
  }
}

export function calcMemberSummaries(
  project: Project,
  members: ProjectMember[],
  transactions: ProjectTransaction[]
): MemberSummary[] {
  const activeMembers = members.filter(m => m.is_active)
  const totalRatio = activeMembers.reduce((s, m) => s + m.share_ratio, 0)
  const target = project.target_amount || 0

  return activeMembers.map(member => {
    const contributions = transactions
      .filter(t => t.member_id === member.id && t.transaction_type === 'contribution')
    const expenses = transactions
      .filter(t => t.member_id === member.id && t.transaction_type === 'expense')

    const actualContribution = round2(contributions.reduce((s, t) => s + t.amount, 0))
    const totalExpensesPaid = round2(expenses.reduce((s, t) => s + t.amount, 0))
    const expectedContribution = round2(totalRatio > 0 ? (member.share_ratio / totalRatio) * target : 0)

    return {
      memberId: member.id,
      memberName: member.name,
      expectedContribution,
      actualContribution,
      remainingContribution: round2(Math.max(0, expectedContribution - actualContribution)),
      totalExpensesPaid,
    }
  })
}

/**
 * Adapter over the paise engine (lib/settlement.ts). Keeps the shape every consumer
 * reads — creditors/debtors (members only), settlements with member names — and adds
 * `balanced` and the full `detail`. Amounts here are rupees.
 */
export function calcSettlement(
  members: ProjectMember[],
  transactions: ProjectTransaction[],
  opts?: SettlementOptions,
): SettlementResult {
  const detail = computeSettlement(members, transactions, opts)
  const people = detail.participants.filter(p => p.kind === 'member')
  return {
    creditors: people.filter(p => p.net > 0)
      .map(p => ({ memberId: p.id, memberName: p.name, netCredit: p.net / 100 }))
      .sort((a, b) => b.netCredit - a.netCredit),
    debtors: people.filter(p => p.net < 0)
      .map(p => ({ memberId: p.id, memberName: p.name, netDebt: -p.net / 100 }))
      .sort((a, b) => b.netDebt - a.netDebt),
    settlements: detail.transfers.map(t => ({
      fromMemberId: t.from.id, fromMemberName: t.from.name,
      toMemberId: t.to.id, toMemberName: t.to.name,
      amount: t.amount / 100, fromKind: t.from.kind, toKind: t.to.kind,
    })),
    balanced: detail.balanced,
    detail,
  }
}
export function calcBudgetSummary(
  project: Project,
  budgets: ProjectBudget[],
  transactions: ProjectTransaction[]
): BudgetSummary {
  const expenses = transactions.filter(t => t.transaction_type === 'expense')

  const breakdowns = budgets
    .sort((a, b) => a.display_order - b.display_order)
    .map(b => {
      const spent = round2(expenses
        .filter(t => (t.category || '').toLowerCase() === b.category.toLowerCase())
        .reduce((s, t) => s + t.amount, 0))
      return {
        budgetId: b.id,
        category: b.category,
        budgetAmount: b.budget_amount,
        spent,
        remaining: round2(b.budget_amount - spent),
        pct: b.budget_amount > 0 ? Math.min(100, (spent / b.budget_amount) * 100) : 0,
      }
    })

  const totalAllocated = round2(budgets.reduce((s, b) => s + b.budget_amount, 0))
  const budgetCategories = new Set(budgets.map(b => b.category.toLowerCase()))
  const uncategorizedSpend = round2(expenses
    .filter(t => !budgetCategories.has((t.category || '').toLowerCase()))
    .reduce((s, t) => s + t.amount, 0))

  return {
    totalAllocated,
    totalSpentInBudget: round2(breakdowns.reduce((s, b) => s + b.spent, 0)),
    unallocatedAmount: round2((project.target_amount || 0) - totalAllocated),
    breakdowns,
    uncategorizedSpend,
  }
}
