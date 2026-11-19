// FROZEN copy of calcSettlement as shipped before the v1.108.0 pool-accounting engine.
// Used only by regression tests to show old vs new results. Do not change.
import { round2 } from '@/lib/utils'
import type { ProjectMember, ProjectTransaction, SettlementResult } from '../../types'

export function legacySettlement(
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

