import { round2 } from '@/lib/utils'
import type { ProjectSummary, ProjectTransaction } from '../types'
import { transactionKind } from './transactions'

// Display-only helpers for the Overview tab. Nothing here is a new
// calculation: kitty spend/remaining were already computed inline by the old
// OverviewTab, and "paid personally" is the identity
//   totalExpenses = spent from kitty + paid personally.
// calculations.ts stays the one source of every stored/settled number.

/** Below this, an amount is zero — the same epsilon calcSettlement uses. */
const PAISE_EPSILON = 0.01

export type KittyState = 'remaining' | 'used' | 'overspent' | 'none'

export interface KittySource {
  key: 'members' | 'group'
  label: string
  amount: number
}

export interface KittyBreakdown {
  /** Money that entered the kitty, by source: member contributions, plus group money
   *  (contributions with no member — sponsors, refunds) when there is any. */
  sources: KittySource[]
  kittyFunds: number
  /** Expenses paid from the Project Fund (no member). */
  fundSpent: number
  /** kittyFunds − fundSpent. Negative when the kitty paid out more than it had. */
  fundRemaining: number
  /** Expenses a member paid from their own pocket. */
  paidPersonally: number
  state: KittyState
}

export function kittyBreakdown(summary: ProjectSummary, transactions: ProjectTransaction[]): KittyBreakdown {
  // Same rule as the settlement engine and the Transactions tab: a contribution with
  // no (existing) member is group money.
  const groupMoney = round2(transactions
    .filter(t => transactionKind(t) === 'group-money')
    .reduce((s, t) => s + t.amount, 0))
  const sources: KittySource[] = [
    { key: 'members', label: 'Member contributions', amount: round2(summary.totalContributions - groupMoney) },
    ...(groupMoney > 0 ? [{ key: 'group' as const, label: 'Group money (outside the group)', amount: groupMoney }] : []),
  ]
  const kittyFunds = round2(sources.reduce((s, x) => s + x.amount, 0))
  const fundSpent = round2(transactions
    .filter(t => t.transaction_type === 'expense' && t.member_id == null)
    .reduce((s, t) => s + t.amount, 0))
  const fundRemaining = round2(kittyFunds - fundSpent)
  const paidPersonally = round2(summary.totalExpenses - fundSpent)

  let state: KittyState
  if (kittyFunds < PAISE_EPSILON && fundSpent < PAISE_EPSILON) state = 'none'
  else if (fundRemaining > PAISE_EPSILON) state = 'remaining'
  else if (fundRemaining < -PAISE_EPSILON) state = 'overspent'
  else state = 'used'

  return { sources, kittyFunds, fundSpent, fundRemaining, paidPersonally, state }
}

export type BudgetStatus = 'ok' | 'near' | 'over'

/** The thresholds BudgetBreakdownSection has always coloured by: < 80 / < 100 / ≥ 100. */
export function budgetStatus(pct: number): BudgetStatus {
  return pct < 80 ? 'ok' : pct < 100 ? 'near' : 'over'
}

export interface TargetProgress {
  spent: number
  target: number
  /** Uncapped — summary.spendingProgress is capped at 100, which hides "over target". */
  pct: number
  /** target − spent; negative when over. */
  left: number
}

export function targetProgress(summary: ProjectSummary, target: number): TargetProgress | null {
  if (!(target > 0)) return null
  return {
    spent: summary.totalExpenses,
    target,
    pct: (summary.totalExpenses / target) * 100,
    left: round2(target - summary.totalExpenses),
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
