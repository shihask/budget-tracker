import { fmt, round2 } from '@/lib/utils'
import type { MemberSummary, ProjectMember, ProjectTransaction, SettlementResult } from '../types'

// Display-only helpers for the Members tab. Every amount comes from the existing
// calcMemberSummaries / calcSettlement results — nothing here is a new calculation.

const EPS = 0.01

export interface MemberRowData {
  member: ProjectMember
  /** Sum of this member's contributions (MemberSummary.actualContribution). */
  putInKitty: number
  /** Expenses this member paid from their own pocket (MemberSummary.totalExpensesPaid). */
  paidPersonally: number
  /** Ratio share of the target — an estimate, never an obligation. null without a target. */
  estShare: number | null
  /** Settlement net from calcSettlement: + gets back, − owes, 0 even. null when Settlement doesn't apply. */
  net: number | null
  txnCount: number
  inactive: boolean
}

export function buildMemberRows(
  members: ProjectMember[],
  summaries: MemberSummary[],
  settlement: SettlementResult,
  transactions: ProjectTransaction[],
  target: number,
): MemberRowData[] {
  const summaryById = new Map(summaries.map(s => [s.memberId, s]))
  const credit = new Map(settlement.creditors.map(x => [x.memberId, x.netCredit]))
  const debt = new Map(settlement.debtors.map(x => [x.memberId, x.netDebt]))
  const counts = new Map<string, number>()
  for (const t of transactions) if (t.member_id) counts.set(t.member_id, (counts.get(t.member_id) ?? 0) + 1)

  // calcSettlement returns nothing with fewer than two active members, and with no
  // expenses there is nothing to settle — "Even" would be noise in both cases.
  const settles = members.filter(m => m.is_active).length >= 2 && transactions.some(t => t.transaction_type === 'expense')

  return members.map(member => {
    const s = summaryById.get(member.id)
    const inactive = !member.is_active
    let net: number | null = null
    if (settles && !inactive) net = credit.get(member.id) ?? (debt.has(member.id) ? -debt.get(member.id)! : 0)
    return {
      member,
      putInKitty: s?.actualContribution ?? 0,
      paidPersonally: s?.totalExpensesPaid ?? 0,
      estShare: target > 0 && s ? s.expectedContribution : null,
      net,
      txnCount: counts.get(member.id) ?? 0,
      inactive,
    }
  })
}

export type SettlementTone = 'good' | 'ink' | 'muted'

export function settlementStatus(net: number): { label: string; tone: SettlementTone } {
  if (net > EPS) return { label: `Gets back ${fmt(round2(net))}`, tone: 'good' }
  if (net < -EPS) return { label: `Owes ${fmt(round2(-net))}`, tone: 'ink' }
  return { label: 'Even', tone: 'muted' }
}

/** "₹2,000 put in kitty · ₹1,200 paid personally" — zero parts left out. */
export function moneyLine(row: Pick<MemberRowData, 'putInKitty' | 'paidPersonally'>): string {
  const parts = [
    row.putInKitty > EPS && `${fmt(row.putInKitty)} put in kitty`,
    row.paidPersonally > EPS && `${fmt(row.paidPersonally)} paid personally`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Nothing recorded yet'
}

export interface RemovalImpact {
  count: number
  contributed: number
  paidPersonally: number
}

/** What a hard delete would orphan: the member's rows become member-less (FK ON DELETE SET NULL). */
export function removalImpact(memberId: string, transactions: ProjectTransaction[]): RemovalImpact {
  let count = 0, contributed = 0, paidPersonally = 0
  for (const t of transactions) {
    if (t.member_id !== memberId) continue
    count++
    if (t.transaction_type === 'contribution') contributed += t.amount
    else paidPersonally += t.amount
  }
  return { count, contributed: round2(contributed), paidPersonally: round2(paidPersonally) }
}
