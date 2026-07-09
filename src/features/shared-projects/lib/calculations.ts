import { round2 } from '@/lib/utils'
import type {
  Project, ProjectMember, ProjectTransaction, ProjectBudget,
  ProjectSummary, MemberSummary, SettlementResult, BudgetSummary
} from '../types'

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

export function calcSettlement(
  members: ProjectMember[],
  transactions: ProjectTransaction[]
): SettlementResult {
  const activeMembers = members.filter(m => m.is_active)
  if (activeMembers.length < 2) {
    return { creditors: [], debtors: [], settlements: [] }
  }

  const totalExpenses = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((s, t) => s + t.amount, 0)

  const totalRatio = activeMembers.reduce((s, m) => s + m.share_ratio, 0)

  // Each member's total input = contributions + expenses they paid personally
  // Fair share = their proportion of ALL expenses (including fund expenses)
  const balances = activeMembers.map(member => {
    const contributed = transactions
      .filter(t => t.member_id === member.id && t.transaction_type === 'contribution')
      .reduce((s, t) => s + t.amount, 0)
    const paidExpenses = transactions
      .filter(t => t.member_id === member.id && t.transaction_type === 'expense')
      .reduce((s, t) => s + t.amount, 0)
    const totalInput = contributed + paidExpenses
    const fairShare = totalRatio > 0 ? (member.share_ratio / totalRatio) * totalExpenses : 0
    return {
      memberId: member.id,
      memberName: member.name,
      net: round2(totalInput - fairShare),
    }
  })

  const creditors = balances
    .filter(b => b.net > 0.01)
    .map(b => ({ memberId: b.memberId, memberName: b.memberName, netCredit: b.net }))
    .sort((a, b) => b.netCredit - a.netCredit)

  const debtors = balances
    .filter(b => b.net < -0.01)
    .map(b => ({ memberId: b.memberId, memberName: b.memberName, netDebt: Math.abs(b.net) }))
    .sort((a, b) => b.netDebt - a.netDebt)

  const settlements = settleDebts(
    creditors.map(c => ({ ...c })),
    debtors.map(d => ({ ...d }))
  )

  return { creditors, debtors, settlements }
}

function settleDebts(
  creditors: Array<{ memberId: string; memberName: string; netCredit: number }>,
  debtors: Array<{ memberId: string; memberName: string; netDebt: number }>
) {
  const settlements: Array<{
    fromMemberId: string; fromMemberName: string
    toMemberId: string; toMemberName: string
    amount: number
  }> = []

  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].netCredit, debtors[di].netDebt)
    if (amount > 0.01) {
      settlements.push({
        fromMemberId: debtors[di].memberId,
        fromMemberName: debtors[di].memberName,
        toMemberId: creditors[ci].memberId,
        toMemberName: creditors[ci].memberName,
        amount: round2(amount),
      })
    }
    creditors[ci].netCredit -= amount
    debtors[di].netDebt -= amount
    if (creditors[ci].netCredit < 0.01) ci++
    if (debtors[di].netDebt < 0.01) di++
  }

  return settlements
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
