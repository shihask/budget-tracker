import { describe, it, expect, vi, afterEach } from 'vitest'
import { derive } from '../data'
import { localIso } from '../utils'
import type { AppState, Transaction, Category, Group } from '@/types'

const SALARY_CAT_ID = 'cat-salary'
const FOOD_CAT_ID = 'cat-food'

const BASE_CATEGORIES: Category[] = [
  { id: SALARY_CAT_ID, name: 'Salary', group_name: 'Income' },
  { id: FOOD_CAT_ID, name: 'Food', group_name: 'Lifestyle' },
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
      cycle_start_free_money: null,
      cycle_snapshot_key: null,
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
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('derive() — cycleStartFreeMoney snapshot', () => {
  it('falls back to live realFreeMoney when no snapshot exists for the current cycle, and reports tracking as not ready', () => {
    mockToday('2026-06-30')
    const state = makeState({
      transactions: [makeTx({ transaction_date: '2026-06-28' })],
    })
    const d = derive(state)
    expect(d.cycleStartFreeMoney).toBe(d.realFreeMoney)
    expect(d.cycleRemaining).toBe(d.cycleStartFreeMoney - d.cycleSpent)
    expect(d.cycleTrackingReady).toBe(false)
  })

  it('uses the persisted snapshot when it matches the current cycle, ignoring live balance changes', () => {
    mockToday('2026-06-30')
    const state = makeState({
      transactions: [makeTx({ transaction_date: '2026-06-28' })],
      settings: {
        ...makeState().settings,
        cycle_snapshot_key: localIso(new Date(2026, 5, 28)),
        cycle_start_free_money: 13113,
      },
    })
    const d = derive(state)
    expect(d.cycleStartFreeMoney).toBe(13113)
    expect(d.cycleTrackingReady).toBe(true)
    // Live free money differs from the frozen snapshot — proves it's not recomputed live.
    expect(d.realFreeMoney).not.toBe(13113)
  })

  it('keeps the ring percentage stable and linear against the frozen envelope', () => {
    mockToday('2026-06-30')
    const cycleKey = localIso(new Date(2026, 5, 28))
    const baseState = makeState({
      transactions: [
        makeTx({ transaction_date: '2026-06-28' }),
        makeTx({ transaction_date: '2026-06-29', transaction_type: 'expense', category_id: FOOD_CAT_ID, amount: 8966.64 }),
      ],
      settings: {
        ...makeState().settings,
        cycle_snapshot_key: cycleKey,
        cycle_start_free_money: 13113,
      },
    })
    const d = derive(baseState)
    expect(d.cycleSpent).toBeCloseTo(8966.64, 2)
    expect(d.cycleRemaining).toBeCloseTo(13113 - 8966.64, 2)
    const pct = (d.cycleSpent / d.cycleStartFreeMoney) * 100
    expect(pct).toBeCloseTo(68.4, 1) // sensible, not the old 216%-style runaway curve
  })

  it('reports tracking as not ready when the snapshot key belongs to a stale/different cycle', () => {
    mockToday('2026-06-30')
    const state = makeState({
      transactions: [makeTx({ transaction_date: '2026-06-28' })],
      settings: {
        ...makeState().settings,
        cycle_snapshot_key: '2026-05-28', // a previous cycle's key, not the current one
        cycle_start_free_money: 9000,
      },
    })
    const d = derive(state)
    expect(d.cycleTrackingReady).toBe(false)
    expect(d.cycleStartFreeMoney).toBe(d.realFreeMoney) // falls back to live, ignores the stale value
  })

  it('does not compute cycleStartFreeMoney/cycleRemaining differently for variable income (untouched path)', () => {
    mockToday('2026-06-20')
    const state = makeState({
      settings: { ...makeState().settings, income_pattern: 'variable' },
      transactions: [],
    })
    const d = derive(state)
    expect(d.cycleStartFreeMoney).toBe(d.realFreeMoney)
    expect(d.cycleRemaining).toBe(d.realFreeMoney)
    expect(d.cycleSpent).toBe(0)
    expect(d.cycleTrackingReady).toBe(false)
  })
})
