import { describe, it, expect } from 'vitest'
import {
  forSpendAnalytics, spendAmount, reimbursedTotals, remainingReimbursable,
  reimbursementSummary, resolveReimbursementTarget, resolveReimbursedExpense,
  isReimbursement,
} from '@/lib/reimbursements'
import { derive, categorySplit } from '@/lib/data'
import { getCurrentBalance } from '@/lib/account-balance'
import { iso, TODAY, addDays } from '@/lib/utils'
import type { AppState, Category, Group, Transaction } from '@/types'

/** The accounting the feature exists to fix: a ₹408 gift refunded ₹400 is ₹8
 *  spent and ₹0 earned — while the account really did receive ₹400. */

const CATEGORIES: Category[] = [
  { id: 'cat-gift', name: 'Gift', group_name: 'Lifestyle' },
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
]
const GROUPS: Group[] = [
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
]

const base = (id: string, amount: number, date = iso(TODAY)): Transaction => ({
  id,
  transaction_date: date,
  description: id,
  amount,
  transaction_type: 'expense',
  category_id: 'cat-gift',
  from_account_id: 'acc-1',
  to_account_id: null,
  notes: null,
  created_at: date,
})

const expense = (id: string, amount: number, date?: string): Transaction =>
  base(id, amount, date)

const leg = (id: string, amount: number, group: string, createdAt: string): Transaction =>
  ({ ...base(id, amount), split_group_id: group, created_at: createdAt })

const recovery = (id: string, amount: number, forId: string, date = iso(TODAY)): Transaction => ({
  ...base(id, amount, date),
  transaction_type: 'income',
  category_id: null,
  from_account_id: 'acc-1',
  reimbursement_for: forId,
})

function makeState(transactions: Transaction[]): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: CATEGORIES,
    groups: GROUPS,
    credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: null,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      budget_period: 'monthly', monthly_start_date: 1, budget_mode: 'manual',
      income_pattern: 'monthly', monthly_salary: 50000,
      weekly_budget_scope: null,
    },
    forecast_settings: { id: 'f1', enabled: false, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'b1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [],
    transactions,
    goals: [], goal_contributions: [], user_achievements: [], habits: [],
    savings: [], planned_expenses: [],
    events: [],
    masters: [],
  }
}

describe('net expense', () => {
  it('nets a full-value example: 408 spent, 400 back, 8 net', () => {
    const txns = [expense('gift', 408), recovery('back', 400, 'gift')]
    const [row, ...rest] = forSpendAnalytics(txns)
    expect(rest).toHaveLength(0)          // the reimbursement row is dropped entirely
    expect(spendAmount(row)).toBe(8)
    expect(row.gross_amount).toBe(408)
    expect(row.reimbursed_amount).toBe(400)
  })

  it('accumulates multiple partial recoveries', () => {
    const txns = [expense('trip', 1000), recovery('r1', 300, 'trip'), recovery('r2', 200, 'trip')]
    expect(spendAmount(forSpendAnalytics(txns)[0])).toBe(500)
  })

  it('clamps a fully recovered expense at zero, never negative', () => {
    const txns = [expense('gift', 500), recovery('back', 500, 'gift')]
    expect(spendAmount(forSpendAnalytics(txns)[0])).toBe(0)
  })

  it('leaves `amount` untouched — the invariant the whole design rests on', () => {
    const txns = [expense('gift', 408), recovery('back', 400, 'gift')]
    // Exports, the AI context, drill-downs and any future audit log read this.
    expect(forSpendAnalytics(txns)[0].amount).toBe(408)
  })

  it('is a pass-through for a ledger with no links', () => {
    const txns = [expense('a', 100), expense('b', 250)]
    expect(forSpendAnalytics(txns)).toEqual(txns)
  })

  it('ignores a dangling link rather than throwing', () => {
    const txns = [expense('a', 100), recovery('orphan', 50, 'deleted-expense')]
    const out = forSpendAnalytics(txns)
    expect(out).toHaveLength(1)
    expect(spendAmount(out[0])).toBe(100)
  })
})

describe('remaining and summary', () => {
  const txns = [expense('gift', 408), recovery('back', 400, 'gift')]

  it('reports what can still be recovered', () => {
    expect(remainingReimbursable(txns[0], txns)).toBe(8)
  })

  it('clamps remaining at zero when fully recovered', () => {
    const full = [expense('gift', 408), recovery('back', 408, 'gift')]
    expect(remainingReimbursable(full[0], full)).toBe(0)
  })

  it('gives gross / reimbursed / net for the breakdown UI', () => {
    expect(reimbursementSummary(txns[0], txns)).toEqual({ gross: 408, reimbursed: 400, net: 8 })
  })
})

describe('split groups reimburse as a unit', () => {
  // A 408 gift paid 300 Axis + 108 Cash: two legs, no parent row.
  const legs = [
    leg('leg-axis', 300, 'grp-1', '2026-08-28T10:00:00Z'),
    leg('leg-cash', 108, 'grp-1', '2026-08-28T10:00:01Z'),
  ]
  const anchor = 'leg-axis'   // earliest created_at

  it('measures remaining against the whole group, not one leg', () => {
    const txns = [...legs]
    expect(remainingReimbursable(legs[0], txns)).toBe(408)
  })

  it('resolves the anchor leg as the link target from either leg', () => {
    expect(resolveReimbursementTarget(legs[0], legs)).toBe(anchor)
    expect(resolveReimbursementTarget(legs[1], legs)).toBe(anchor)
  })

  it('distributes recovery across legs proportionally, and the legs still sum to the group net', () => {
    const txns = [...legs, recovery('back', 400, anchor)]
    const out = forSpendAnalytics(txns)
    const axis = out.find(t => t.id === 'leg-axis')!
    const cash = out.find(t => t.id === 'leg-cash')!
    // 300/408 and 108/408 of 400
    expect(axis.reimbursed_amount).toBeCloseTo(294.12, 2)
    expect(cash.reimbursed_amount).toBeCloseTo(105.88, 2)
    // The parts add back up exactly, so a per-account breakdown still balances.
    expect(axis.reimbursed_amount! + cash.reimbursed_amount!).toBeCloseTo(400, 10)
    expect(spendAmount(axis) + spendAmount(cash)).toBeCloseTo(8, 2)
  })

  it('still resolves the whole group after a non-anchor leg is deleted', () => {
    // The guarantee that makes the anchor an internal detail: a split refactor
    // that trims legs must not invalidate a stored link.
    const after = [legs[0], recovery('back', 400, anchor)]
    const resolved = resolveReimbursedExpense(after[1], after)
    expect(resolved.map(t => t.id)).toEqual(['leg-axis'])
    expect(remainingReimbursable(legs[0], after)).toBe(0)
  })

  it('keys recovered totals per leg, not per group', () => {
    const txns = [...legs, recovery('back', 400, anchor)]
    const totals = reimbursedTotals(txns)
    expect(totals.get('leg-axis')).toBeGreaterThan(0)
    expect(totals.get('leg-cash')).toBeGreaterThan(0)
  })
})

describe('netting is expense-dated', () => {
  // An August expense refunded in September corrects AUGUST. That is what makes
  // the category total honest; the September arrival stays visible in balances
  // and cash flow, which read raw transactions.
  const aug = '2026-08-28'
  const sep = '2026-09-02'

  it('lands the recovery in the expense month, not the arrival month', () => {
    const txns = [expense('gift', 408, aug), recovery('back', 400, 'gift', sep)]
    const out = forSpendAnalytics(txns)
    const gift = out.find(t => t.id === 'gift')!
    expect(gift.transaction_date).toBe(aug)
    expect(spendAmount(gift)).toBe(8)
    // September contributes no spend row at all.
    expect(out.filter(t => t.transaction_date.startsWith('2026-09'))).toHaveLength(0)
  })
})

describe('income and balances', () => {
  it('a reimbursement is never income', () => {
    const txns = [expense('gift', 408), recovery('back', 400, 'gift')]
    expect(isReimbursement(txns[1])).toBe(true)
    expect(forSpendAnalytics(txns).some(t => t.transaction_type === 'income')).toBe(false)
  })

  it('balances are unchanged by the link — the regression that matters most', () => {
    // The money really did leave and really did come back. getCurrentBalance
    // must read raw transactions and never consult reimbursement_for.
    const unlinked: Transaction[] = [
      expense('gift', 408),
      { ...recovery('back', 400, 'gift'), reimbursement_for: null },
    ]
    const linked = [expense('gift', 408), recovery('back', 400, 'gift')]
    expect(getCurrentBalance(makeState(linked))).toBe(getCurrentBalance(makeState(unlinked)))
  })

  it('category analytics show net while the account still received the money', () => {
    const monthStart = iso(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
    const day = iso(addDays(new Date(monthStart), 1))
    const state = makeState([expense('gift', 408, day), recovery('back', 400, 'gift', day)])
    expect(categorySplit(state).find(c => c.name === 'Gift')?.value).toBe(8)
    expect(derive(state).weeklySpent).toBe(8)
  })
})
