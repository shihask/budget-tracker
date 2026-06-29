import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCurrentFinancialCycle, isPrimaryIncomeTransaction } from '../financial-cycle'
import type { AppState, Transaction, Category, Group } from '@/types'

const SALARY_CAT_ID = 'cat-salary'
const FREELANCE_CAT_ID = 'cat-freelance'
const REFUND_CAT_ID = 'cat-refund'
const OTHER_INCOME_CAT_ID = 'cat-other-income'

const BASE_CATEGORIES: Category[] = [
  { id: SALARY_CAT_ID, name: 'Salary', group_name: 'Income' },
  { id: FREELANCE_CAT_ID, name: 'Freelance', group_name: 'Income' },
  { id: REFUND_CAT_ID, name: 'Refund', group_name: 'Income' },
  { id: OTHER_INCOME_CAT_ID, name: 'Other Income', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
]

const BASE_GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
]

function makeTx(overrides: Partial<Transaction> & { transaction_date: string }): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    description: 'test',
    amount: 50000,
    transaction_type: 'income',
    category_id: SALARY_CAT_ID,
    from_account_id: 'acc-1',
    to_account_id: null,
    notes: null,
    created_at: overrides.transaction_date,
    ...overrides,
  }
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: BASE_CATEGORIES,
    groups: BASE_GROUPS,
    credit_cards: [],
    settings: {
      id: 's1',
      weekly_budget: 5000,
      emergency_fund: 0,
      salary_date: 28,
      track_credit_cards: false,
      track_borrowings: true,
      autopilot_enabled: false,
      income_pattern: 'monthly',
      primary_income_category_id: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [],
    borrowings: [],
    transactions: [],
    goals: [],
    goal_contributions: [],
    savings: [],
    planned_expenses: [],
    ...overrides,
  }
}

function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const fakeNow = new Date(y, m - 1, d, 12, 0, 0)
  vi.useFakeTimers()
  vi.setSystemTime(fakeNow)
}

afterEach(() => {
  vi.useRealTimers()
})

// ─── isPrimaryIncomeTransaction ─────────────────────────────────────────────

describe('isPrimaryIncomeTransaction', () => {
  it('accepts salary-category income when no primary_income_category_id set', () => {
    mockToday('2026-06-28')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28', category_id: SALARY_CAT_ID })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(true)
  })

  it('accepts freelance income when no primary_income_category_id set', () => {
    mockToday('2026-06-28')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28', category_id: FREELANCE_CAT_ID })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(true)
  })

  it('excludes refund transactions by default', () => {
    mockToday('2026-06-28')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28', category_id: REFUND_CAT_ID })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(false)
  })

  it('uses primary_income_category_id when set', () => {
    mockToday('2026-06-28')
    const state = makeState({
      settings: { ...makeState().settings, primary_income_category_id: SALARY_CAT_ID },
    })
    const salaryTx = makeTx({ transaction_date: '2026-06-28', category_id: SALARY_CAT_ID })
    const freelanceTx = makeTx({ transaction_date: '2026-06-28', category_id: FREELANCE_CAT_ID })
    expect(isPrimaryIncomeTransaction(salaryTx, state)).toBe(true)
    expect(isPrimaryIncomeTransaction(freelanceTx, state)).toBe(false)
  })

  it('excludes expenses', () => {
    mockToday('2026-06-28')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28', transaction_type: 'expense', category_id: 'cat-food' })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(false)
  })

  it('excludes zero-amount income', () => {
    mockToday('2026-06-28')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28', amount: 0 })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(false)
  })

  it('excludes future-dated transactions', () => {
    mockToday('2026-06-27')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28' })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(false)
  })

  it('excludes non-Income group categories even with broad fallback', () => {
    mockToday('2026-06-28')
    const state = makeState()
    const tx = makeTx({ transaction_date: '2026-06-28', category_id: 'cat-food' })
    expect(isPrimaryIncomeTransaction(tx, state)).toBe(false)
  })
})

// ─── getCurrentFinancialCycle ───────────────────────────────────────────────

describe('getCurrentFinancialCycle', () => {
  describe('first-time user (calendar fallback)', () => {
    it('returns calendar fallback when no income transactions exist', () => {
      mockToday('2026-06-15')
      const state = makeState({ transactions: [] })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('calendar_fallback')
      expect(cycle.latestIncomeTransaction).toBeNull()
      expect(cycle.isWaitingForIncome).toBe(false)
      expect(cycle.status).toBe('active')
      expect(cycle.daysRemaining).toBeGreaterThan(0)
    })

    it('uses salary_date for calendar fallback when set', () => {
      mockToday('2026-06-15')
      const state = makeState({ transactions: [] })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.cycleStart.getDate()).toBe(28)
      expect(cycle.cycleStart.getMonth()).toBe(4) // May 28
    })
  })

  describe('monthly salary', () => {
    it('starts cycle on actual salary date', () => {
      mockToday('2026-06-30')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-06-28' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('transaction')
      expect(cycle.cycleStart.getDate()).toBe(28)
      expect(cycle.cycleStart.getMonth()).toBe(5) // June
      expect(cycle.status).toBe('active')
      expect(cycle.isWaitingForIncome).toBe(false)
    })

    it('continues old cycle when salary day arrives but no income recorded', () => {
      mockToday('2026-06-28')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.status).toBe('waiting')
      expect(cycle.isWaitingForIncome).toBe(true)
      expect(cycle.cycleStart.getDate()).toBe(28)
      expect(cycle.cycleStart.getMonth()).toBe(4) // May
    })
  })

  describe('late salary', () => {
    it('continues old cycle until late salary is recorded', () => {
      mockToday('2026-06-30')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.status).toBe('waiting')
      expect(cycle.isWaitingForIncome).toBe(true)
      expect(cycle.cycleStart.getMonth()).toBe(4) // still May
    })

    it('starts new cycle when late salary is recorded', () => {
      mockToday('2026-06-30')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
          makeTx({ transaction_date: '2026-06-30' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.status).toBe('active')
      expect(cycle.isWaitingForIncome).toBe(false)
      expect(cycle.cycleStart.getDate()).toBe(30)
      expect(cycle.cycleStart.getMonth()).toBe(5) // June
    })
  })

  describe('early salary', () => {
    it('starts new cycle when early salary is recorded', () => {
      mockToday('2026-06-27')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
          makeTx({ transaction_date: '2026-06-27' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.status).toBe('active')
      expect(cycle.cycleStart.getDate()).toBe(27)
      expect(cycle.cycleStart.getMonth()).toBe(5) // June
    })
  })

  describe('deleted salary transaction', () => {
    it('falls back to previous qualifying income (NOT calendar fallback)', () => {
      mockToday('2026-07-05')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
          // June salary was deleted — gap
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('transaction')
      expect(cycle.cycleStart.getDate()).toBe(28)
      expect(cycle.cycleStart.getMonth()).toBe(4) // falls back to May
      expect(cycle.status).toBe('waiting')
    })
  })

  describe('multiple salary transactions in one cycle', () => {
    it('clusters to earliest qualifying txn within window', () => {
      mockToday('2026-07-05')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-06-28', description: 'main salary' }),
          makeTx({ transaction_date: '2026-06-30', description: 'arrears' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.cycleStart.getDate()).toBe(28) // clusters to the earlier one
      expect(cycle.cycleStart.getMonth()).toBe(5) // June
    })

    it('does not cluster transactions from different cycles', () => {
      mockToday('2026-07-05')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
          makeTx({ transaction_date: '2026-06-28' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.cycleStart.getDate()).toBe(28)
      expect(cycle.cycleStart.getMonth()).toBe(5) // June, not May
    })
  })

  describe('future-dated salary', () => {
    it('ignores future-dated transactions', () => {
      mockToday('2026-06-25')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28' }),
          makeTx({ transaction_date: '2026-06-28' }), // future
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.cycleStart.getMonth()).toBe(4) // May — future one ignored
    })
  })

  describe('backdated salary', () => {
    it('uses backdated salary as cycle start if most recent qualifying', () => {
      mockToday('2026-07-05')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-06-25' }), // backdated
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('transaction')
      expect(cycle.cycleStart.getDate()).toBe(25)
      expect(cycle.cycleStart.getMonth()).toBe(5) // June
    })
  })

  describe('weekly income', () => {
    it('starts cycle on actual weekly income date', () => {
      mockToday('2026-06-25') // Wednesday
      const state = makeState({
        settings: { ...makeState().settings, income_pattern: 'weekly', income_day: 5 },
        transactions: [
          makeTx({ transaction_date: '2026-06-20', category_id: FREELANCE_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('transaction')
      expect(cycle.cycleStart.getDate()).toBe(20)
    })

    it('shows waiting when expected income day passes without income', () => {
      mockToday('2026-06-27') // Friday = income day 5
      const state = makeState({
        settings: { ...makeState().settings, income_pattern: 'weekly', income_day: 5 },
        transactions: [
          makeTx({ transaction_date: '2026-06-20', category_id: FREELANCE_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.status).toBe('waiting')
    })
  })

  describe('variable income', () => {
    it('starts cycle on latest qualifying income', () => {
      mockToday('2026-06-20')
      const state = makeState({
        settings: { ...makeState().settings, income_pattern: 'variable' },
        transactions: [
          makeTx({ transaction_date: '2026-06-15', category_id: FREELANCE_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('transaction')
      expect(cycle.cycleStart.getDate()).toBe(15)
    })

    it('uses calendar fallback when no qualifying income exists', () => {
      mockToday('2026-06-20')
      const state = makeState({
        settings: { ...makeState().settings, income_pattern: 'variable' },
        transactions: [],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('calendar_fallback')
    })
  })

  describe('business income', () => {
    it('starts cycle on business income transaction', () => {
      mockToday('2026-06-20')
      const state = makeState({
        settings: { ...makeState().settings, income_pattern: 'business' },
        transactions: [
          makeTx({ transaction_date: '2026-06-10', category_id: OTHER_INCOME_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.source).toBe('transaction')
      expect(cycle.cycleStart.getDate()).toBe(10)
    })
  })

  describe('primary income category changes', () => {
    it('recalculates immediately when primary_income_category_id changes', () => {
      mockToday('2026-06-30')
      const state = makeState({
        settings: { ...makeState().settings, primary_income_category_id: FREELANCE_CAT_ID },
        transactions: [
          makeTx({ transaction_date: '2026-06-28', category_id: SALARY_CAT_ID }),
          makeTx({ transaction_date: '2026-06-15', category_id: FREELANCE_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      // Only freelance qualifies now — salary is excluded
      expect(cycle.cycleStart.getDate()).toBe(15)
      expect(cycle.cycleStart.getMonth()).toBe(5)
    })
  })

  describe('salary correction / split payments', () => {
    it('clusters split salary payments to earliest', () => {
      mockToday('2026-07-10')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-06-28', amount: 40000, description: 'base' }),
          makeTx({ transaction_date: '2026-06-29', amount: 10000, description: 'bonus' }),
          makeTx({ transaction_date: '2026-07-01', amount: 5000, description: 'allowance' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.cycleStart.getDate()).toBe(28) // earliest in cluster
    })
  })

  describe('salary recorded with other income in cluster window', () => {
    it('clears waiting state even when older income clusters with salary', () => {
      mockToday('2026-06-29')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28', category_id: SALARY_CAT_ID }),
          makeTx({ transaction_date: '2026-06-20', category_id: FREELANCE_CAT_ID }),
          makeTx({ transaction_date: '2026-06-29', category_id: SALARY_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.isWaitingForIncome).toBe(false)
      expect(cycle.status).toBe('active')
      expect(cycle.cycleStart.getDate()).toBe(20) // clustered to freelance
    })

    it('stays waiting when only older income exists (no salary after expected date)', () => {
      mockToday('2026-06-29')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-05-28', category_id: SALARY_CAT_ID }),
          makeTx({ transaction_date: '2026-06-20', category_id: FREELANCE_CAT_ID }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.isWaitingForIncome).toBe(true)
      expect(cycle.status).toBe('waiting')
    })
  })

  describe('cycle metrics', () => {
    it('computes daysRemaining, totalDays, currentDay correctly', () => {
      mockToday('2026-07-05')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-06-28' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.currentDay).toBeGreaterThan(0)
      expect(cycle.totalDays).toBeGreaterThan(0)
      expect(cycle.daysRemaining).toBeGreaterThan(0)
      expect(cycle.weeksRemaining).toBeGreaterThan(0)
      expect(cycle.currentDay + cycle.daysRemaining - 1).toBe(cycle.totalDays)
    })

    it('provides formatted labels', () => {
      mockToday('2026-07-05')
      const state = makeState({
        transactions: [
          makeTx({ transaction_date: '2026-06-28' }),
        ],
      })
      const cycle = getCurrentFinancialCycle(state)
      expect(cycle.startLabel).toContain('28')
      expect(cycle.endLabel).toBeTruthy()
    })
  })

  describe('pure function guarantees', () => {
    it('is deterministic — same input produces same output', () => {
      mockToday('2026-06-30')
      const state = makeState({
        transactions: [makeTx({ transaction_date: '2026-06-28' })],
      })
      const a = getCurrentFinancialCycle(state)
      const b = getCurrentFinancialCycle(state)
      expect(a.cycleStart.getTime()).toBe(b.cycleStart.getTime())
      expect(a.daysRemaining).toBe(b.daysRemaining)
      expect(a.status).toBe(b.status)
    })

    it('has no side effects on input state', () => {
      mockToday('2026-06-30')
      const state = makeState({
        transactions: [makeTx({ transaction_date: '2026-06-28' })],
      })
      const txCount = state.transactions.length
      getCurrentFinancialCycle(state)
      expect(state.transactions.length).toBe(txCount)
    })
  })
})
