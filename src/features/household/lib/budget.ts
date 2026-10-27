// Household budget math. Pure, and the one definition of a household total.
//
// - A month is the local calendar month, [YYYY-MM-01, next month's 01), compared
//   on txn_date (a plain date, so no timezone shift). Deliberately not either
//   member's salary cycle — the two rarely match.
// - Sums run in integer paise, so many small rows can't drift.
// - Budgets count expense rows only. Income is shown, never netted off spending.
// - Nothing is stored: every total is derived from the rows on each render, so an
//   edit that moves a row's date or category, or a delete, is reflected at once.

import type { HouseholdBudget, HouseholdTransaction } from '../types'

/** Share of a limit at which a budget reads as "nearly used". */
export const NEAR_LIMIT_SHARE = 0.8

export const toPaise = (v: number | string) => Math.round(Number(v) * 100)
const fromPaise = (p: number) => p / 100

/** 'YYYY-MM' for a local date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

/** Inclusive start, exclusive end, both 'YYYY-MM-DD'. */
export function monthBounds(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` }
}

export function inMonth(txnDate: string, month: string): boolean {
  const { start, end } = monthBounds(month)
  return txnDate >= start && txnDate < end
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export type BudgetStatus = 'none' | 'ok' | 'near' | 'over'

export interface BudgetLine {
  spent: number
  /** null = no budget set */
  limit: number | null
  /** limit − spent; negative when over. null without a budget. */
  remaining: number | null
  /** How far past the limit (0 when within it). */
  over: number
  /** Bar fill, 0..1 — capped, so it never reads as more than full. */
  progress: number
  status: BudgetStatus
}

export function budgetLine(spentPaise: number, limit: number | null): BudgetLine {
  const spent = fromPaise(spentPaise)
  if (limit == null) return { spent, limit: null, remaining: null, over: 0, progress: 0, status: 'none' }
  const limitPaise = toPaise(limit)
  const remainingPaise = limitPaise - spentPaise
  const over = remainingPaise < 0 ? fromPaise(-remainingPaise) : 0
  // A ₹0 budget is "spend nothing": any spend is over, none is fine. No division by zero.
  const share = limitPaise === 0 ? (spentPaise > 0 ? Infinity : 0) : spentPaise / limitPaise
  const status: BudgetStatus = share > 1 ? 'over' : share >= NEAR_LIMIT_SHARE && spentPaise > 0 ? 'near' : 'ok'
  return { spent, limit, remaining: fromPaise(remainingPaise), over, progress: Math.min(share, 1), status }
}

export interface CategoryLine extends BudgetLine {
  /** null = expenses recorded without a category */
  categoryId: string | null
}

export interface HouseholdSummary {
  income: number
  expense: number
  overall: BudgetLine
  /** Every expense category with spend or a budget this month, most spent first. */
  categories: CategoryLine[]
  /** Sum of category limits — shown as a hint when it exceeds the overall budget. */
  categoryLimitsTotal: number
  categoryLimitsExceedOverall: boolean
}

export function summarize(txns: HouseholdTransaction[], budgets: HouseholdBudget[], month: string): HouseholdSummary {
  let incomePaise = 0
  let expensePaise = 0
  const spentByCategory = new Map<string | null, number>()
  for (const t of txns) {
    if (!inMonth(t.txn_date, month)) continue
    const p = toPaise(t.amount)
    if (t.type === 'income') { incomePaise += p; continue }
    expensePaise += p
    spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + p)
  }

  const overallBudget = budgets.find(b => b.category_id == null)
  const categoryBudgets = budgets.filter(b => b.category_id != null)
  const limitByCategory = new Map(categoryBudgets.map(b => [b.category_id, Number(b.monthly_limit)]))

  const ids = new Set<string | null>([...spentByCategory.keys(), ...limitByCategory.keys()])
  const categories = [...ids]
    .map(id => ({ categoryId: id, ...budgetLine(spentByCategory.get(id) ?? 0, limitByCategory.get(id) ?? null) }))
    .sort((a, b) => b.spent - a.spent || (b.limit ?? 0) - (a.limit ?? 0))

  const categoryLimitsTotalPaise = categoryBudgets.reduce((s, b) => s + toPaise(b.monthly_limit), 0)
  return {
    income: fromPaise(incomePaise),
    expense: fromPaise(expensePaise),
    overall: budgetLine(expensePaise, overallBudget ? Number(overallBudget.monthly_limit) : null),
    categories,
    categoryLimitsTotal: fromPaise(categoryLimitsTotalPaise),
    categoryLimitsExceedOverall: !!overallBudget && categoryLimitsTotalPaise > toPaise(overallBudget.monthly_limit),
  }
}
