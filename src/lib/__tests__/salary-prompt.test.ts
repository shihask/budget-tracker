import { describe, it, expect, vi, afterEach } from 'vitest'
import { pendingSalaryPayday, salaryDefaults, latestPayday, SALARY_PROMPT_DAYS } from '../salary-prompt'
import { localIso } from '../utils'
import type { AppState, Transaction, Settings } from '@/types'

const SALARY = 'cat-salary'

function tx(date: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${date}-${Math.random().toString(36).slice(2)}`,
    transaction_date: date, description: 'Salary', amount: 60000, transaction_type: 'income',
    category_id: SALARY, from_account_id: 'acc-bank', to_account_id: null, notes: null, created_at: date,
    ...overrides,
  } as Transaction
}

function makeState(settings: Partial<Settings> = {}, transactions: Transaction[] = []): AppState {
  return {
    accounts: [
      { id: 'acc-cash', name: 'Cash', type: 'cash', current_balance: 0, is_active: true },
      { id: 'acc-bank', name: 'Bank', type: 'bank', current_balance: 0, is_active: true },
    ],
    categories: [
      { id: SALARY, name: 'Salary', group_name: 'Income' },
      { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
    ],
    groups: [{ id: 'g-income', name: 'Income', is_system: true, type: 'income' }],
    credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: 29,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      ...settings,
    },
    transactions,
  } as unknown as AppState
}

function at(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const now = new Date(y, m - 1, d, 8, 0, 0)
  vi.useFakeTimers()
  vi.setSystemTime(now)
  return now
}

afterEach(() => { vi.useRealTimers() })

const ask = (state: AppState, today: string) => {
  const p = pendingSalaryPayday(state, at(today))
  return p ? localIso(p) : null
}

describe('pendingSalaryPayday', () => {
  it('asks on payday morning', () => {
    expect(ask(makeState(), '2026-10-29')).toBe('2026-10-29')
  })

  it('does not ask the day before payday', () => {
    expect(ask(makeState({}, [tx('2026-09-29')]), '2026-10-28')).toBeNull()
  })

  it('keeps asking on the following days until recorded', () => {
    expect(ask(makeState(), '2026-10-30')).toBe('2026-10-29')
    expect(ask(makeState(), '2026-11-03')).toBe('2026-10-29')
  })

  it('stops once the salary is recorded, late or a few days early', () => {
    expect(ask(makeState({}, [tx('2026-10-30')]), '2026-10-31')).toBeNull()
    expect(ask(makeState({}, [tx('2026-10-26')]), '2026-10-29')).toBeNull()
  })

  it("last month's salary doesn't count for this payday", () => {
    expect(ask(makeState({}, [tx('2026-09-30')]), '2026-10-29')).toBe('2026-10-29')
  })

  it('ignores expenses and other groups', () => {
    const food = tx('2026-10-29', { transaction_type: 'expense', category_id: 'cat-food' })
    expect(ask(makeState({}, [food]), '2026-10-29')).toBe('2026-10-29')
  })

  it(`gives up ${SALARY_PROMPT_DAYS} days after payday`, () => {
    expect(ask(makeState(), '2026-11-13')).toBe('2026-10-29')
    expect(ask(makeState(), '2026-11-14')).toBeNull()
  })

  it('clamps a 31st salary date to short months', () => {
    expect(ask(makeState({ salary_date: 31 }), '2026-11-30')).toBe('2026-11-30')
    expect(localIso(latestPayday(31, new Date(2026, 1, 28)))).toBe('2026-02-28')
  })

  it('only for monthly earners with a salary date', () => {
    expect(ask(makeState({ income_pattern: 'weekly' }), '2026-10-29')).toBeNull()
    expect(ask(makeState({ salary_date: null }), '2026-10-29')).toBeNull()
  })
})

describe('salaryDefaults', () => {
  it('uses the configured salary, else the last salary amount', () => {
    at('2026-10-29')
    expect(salaryDefaults(makeState({ monthly_salary: 75000 }, [tx('2026-09-29')])).amount).toBe(75000)
    expect(salaryDefaults(makeState({}, [tx('2026-09-29', { amount: 61000 })])).amount).toBe(61000)
    expect(salaryDefaults(makeState()).amount).toBeNull()
  })

  it("defaults to the last salary's account, else the first bank account", () => {
    at('2026-10-29')
    expect(salaryDefaults(makeState({}, [tx('2026-09-29', { from_account_id: 'acc-cash' })])).accountId).toBe('acc-cash')
    expect(salaryDefaults(makeState()).accountId).toBe('acc-bank')
  })

  it('picks the Salary category', () => {
    at('2026-10-29')
    expect(salaryDefaults(makeState()).categoryId).toBe(SALARY)
  })
})
