import { describe, it, expect, vi, afterEach } from 'vitest'
import { derive } from '@/lib/data'
import { computeStrategyData } from '@/lib/budget-strategy'
import type { AppState, Category, Commitment, Group, Transaction } from '@/types'

// Pins which posted rows reach Budget Strategy actuals. Every test runs against the
// rows the real writers produce (addBorrowing, recordBorrowingPayment, payCreditCardBill,
// markCommitmentPaid) — see CLAUDE.md "What counts in Budget Strategy actuals".

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CATS: Category[] = [
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'cat-rent', name: 'Rent', group_name: 'Utilities' },
  { id: 'cat-gold', name: 'Gold', group_name: 'Savings' },
  { id: 'cat-emi', name: 'Loan EMI', group_name: 'Commitment' },
  { id: 'cat-borrowed', name: 'Borrowed Money', group_name: 'Borrowing' },
  { id: 'cat-lent', name: 'Lent Money', group_name: 'Borrowing' },
  { id: 'cat-borrow-repay', name: 'Borrow Repayment', group_name: 'Borrowing' },
  { id: 'cat-lent-repay', name: 'Lent Repayment', group_name: 'Borrowing' },
]
const GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-life', name: 'Lifestyle', type: 'discretionary' },
  { id: 'g-util', name: 'Utilities', type: 'essential' },
  { id: 'g-sav', name: 'Savings', type: 'savings' },
  { id: 'g-commit', name: 'Commitment', type: 'commitment' },
  { id: 'g-borrow', name: 'Borrowing', is_system: true, type: 'borrowing' },
]

let seq = 0
function tx(o: Partial<Transaction> & Pick<Transaction, 'transaction_date' | 'transaction_type' | 'amount'>): Transaction {
  return {
    id: o.id ?? `tx-${++seq}`,
    description: 'test',
    category_id: null,
    from_account_id: 'acc-1',
    to_account_id: null,
    notes: null,
    created_at: o.transaction_date,
    ...o,
  } as Transaction
}
const salary = (date: string, amount = 50000) => tx({ transaction_date: date, transaction_type: 'income', amount, category_id: 'cat-salary' })

// Shapes of the rows the real writers post.
const cardPurchase = (date: string, amount: number, category_id = 'cat-food') =>
  tx({ transaction_date: date, transaction_type: 'expense', amount, category_id, credit_card_id: 'cc-1', from_account_id: null })
const cardBill = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'credit_card_payment', amount, credit_card_id: 'cc-1' })
const borrowed = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'borrowing', amount, category_id: 'cat-borrowed', is_credit: true, borrowing_id: 'b-1' })
const lent = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'borrowing', amount, category_id: 'cat-lent', is_credit: false, borrowing_id: 'b-2' })
const repaid = (date: string, amount: number, category_id = 'cat-borrow-repay') =>
  tx({ transaction_date: date, transaction_type: 'borrowing_repayment', amount, category_id, is_credit: false, borrowing_id: 'b-1' })
const repaidToMe = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'borrowing_repayment', amount, category_id: 'cat-lent-repay', is_credit: true, borrowing_id: 'b-2' })
const emiPaid = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'commitment', amount, category_id: 'cat-emi' })

const LOAN_EMI: Commitment = {
  id: 'cm-1', name: 'Loan EMI', amount: 12000, remaining: 0, category_id: 'cat-emi',
  is_recurring: true, frequency: 'monthly', due_day: 5, from_account_id: 'acc-1', is_active: true,
  last_paid_date: null, paid_through: null, total_installments: null, current_installment: null, due_date: null,
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: CATS,
    groups: GROUPS,
    credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: 28,
      track_credit_cards: true, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', monthly_salary: 50000, primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'balanced', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions: [], goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
    ...overrides,
  } as AppState
}

function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}
afterEach(() => { vi.useRealTimers() })

/** Strategy for the cycle that began on the 2026-09-28 salary, read on 2026-10-20. */
function strategyFor(rows: Transaction[], overrides: Partial<AppState> = {}) {
  mockToday('2026-10-20')
  const state = makeState({ transactions: [salary('2026-09-28'), ...rows], ...overrides })
  return computeStrategyData(state, derive(state))!
}

const NOTHING = { needs: 0, wants: 0, savings: 0 }

// ── Credit cards ─────────────────────────────────────────────────────────────

describe('credit cards', () => {
  it('counts a card purchase once, in its category bucket', () => {
    const s = strategyFor([cardPurchase('2026-10-03', 450)])
    expect(s.actuals).toEqual({ needs: 0, wants: 450, savings: 0 })
    expect(s.categoryBreakdown.wants).toEqual([{ name: 'Food', amount: 450 }])
  })

  it('excludes the bill payment, so purchase + bill still counts once', () => {
    expect(strategyFor([cardBill('2026-10-07', 450)]).actuals).toEqual(NOTHING)
    expect(strategyFor([cardPurchase('2026-10-03', 450), cardBill('2026-10-07', 450)]).actuals)
      .toEqual({ needs: 0, wants: 450, savings: 0 })
  })
})

// ── Borrowings ───────────────────────────────────────────────────────────────

describe('borrowings', () => {
  it('excludes money borrowed and money lent, and neither changes income', () => {
    const s = strategyFor([borrowed('2026-10-02', 20000), lent('2026-10-04', 3000)])
    expect(s.actuals).toEqual(NOTHING)
    expect(s.income).toBe(50000)
  })

  it('puts a repayment of borrowed money in Needs by default', () => {
    const s = strategyFor([repaid('2026-10-06', 900)])
    expect(s.actuals).toEqual({ needs: 900, wants: 0, savings: 0 })
    expect(s.categoryBreakdown.needs).toEqual([{ name: 'Borrow Repayment', amount: 900 }])
  })

  it('excludes a repayment received for money lent', () => {
    expect(strategyFor([repaidToMe('2026-10-06', 1500)]).actuals).toEqual(NOTHING)
  })

  // Not reachable from the UI today (the mapper hides the Borrowing group), but it is the
  // only path by which a repayment leaves Needs — the anchor for any future
  // extra-principal classification. EMI vs extra principal is not distinguishable now.
  it("honours a repayment category's budget_bucket override", () => {
    const categories = CATS.map(c => c.id === 'cat-borrow-repay' ? { ...c, budget_bucket: 'savings' as const } : c)
    const s = strategyFor([repaid('2026-10-06', 900)], { categories })
    expect(s.actuals).toEqual({ needs: 0, wants: 0, savings: 900 })
  })
})

// ── Commitments ──────────────────────────────────────────────────────────────

describe('commitments', () => {
  it('a planned commitment with nothing posted adds nothing', () => {
    expect(strategyFor([], { commitments: [LOAN_EMI] }).actuals).toEqual(NOTHING)
  })

  it('a paid commitment counts its posted row once, not the plan on top', () => {
    const s = strategyFor([emiPaid('2026-10-05', 12000)], { commitments: [LOAN_EMI] })
    expect(s.actuals).toEqual({ needs: 12000, wants: 0, savings: 0 })
  })
})

// ── System rows ──────────────────────────────────────────────────────────────

describe('system rows', () => {
  it('excludes opening balances, adjustments and transfers even when categorized', () => {
    const s = strategyFor([
      tx({ transaction_date: '2026-10-01', transaction_type: 'opening_balance', amount: 10000, category_id: 'cat-rent' }),
      tx({ transaction_date: '2026-10-01', transaction_type: 'balance_adjustment', amount: 500, category_id: 'cat-food' }),
      tx({ transaction_date: '2026-10-01', transaction_type: 'cc_opening_balance', amount: 2000, category_id: 'cat-food', credit_card_id: 'cc-1' }),
      tx({ transaction_date: '2026-10-01', transaction_type: 'cc_balance_adjustment', amount: 300, category_id: 'cat-food', credit_card_id: 'cc-1' }),
      tx({ transaction_date: '2026-10-02', transaction_type: 'transfer', amount: 4000, category_id: 'cat-rent', to_account_id: 'acc-2' }),
    ])
    expect(s.actuals).toEqual(NOTHING)
  })
})

// ── End to end ───────────────────────────────────────────────────────────────

describe('a full cycle', () => {
  it('totals every rule together', () => {
    const s = strategyFor([
      tx({ transaction_date: '2026-10-01', transaction_type: 'expense', amount: 15000, category_id: 'cat-rent' }),
      cardPurchase('2026-10-03', 450),
      cardBill('2026-10-07', 450),
      borrowed('2026-10-02', 20000),
      lent('2026-10-04', 3000),
      repaid('2026-10-06', 900),
      repaidToMe('2026-10-08', 1500),
      emiPaid('2026-10-05', 12000),
      tx({ transaction_date: '2026-10-09', transaction_type: 'savings_contribution', amount: 5000, category_id: 'cat-gold' }),
      tx({ transaction_date: '2026-10-10', transaction_type: 'transfer', amount: 4000, to_account_id: 'acc-2' }),
    ], { commitments: [LOAN_EMI] })
    expect(s.actuals).toEqual({ needs: 15000 + 900 + 12000, wants: 450, savings: 5000 })
  })
})
