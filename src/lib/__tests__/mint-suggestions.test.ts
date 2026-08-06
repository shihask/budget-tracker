import { describe, it, expect } from 'vitest'
import { generateMintSuggestions } from '@/lib/mint-suggestions'
import type { ChallengeCalc } from '@/lib/challenge'
import { derive } from '@/lib/data'
import { iso } from '@/lib/utils'
import type { AppState, Transaction, Category, Group, Commitment } from '@/types'

const BASE_CATEGORIES: Category[] = [
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
]
const BASE_GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
]

function makeTx(overrides: Partial<Transaction> & { transaction_date: string; amount: number }): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    description: 'test',
    transaction_type: 'expense',
    category_id: 'cat-food',
    from_account_id: 'acc-1',
    to_account_id: null,
    notes: null,
    created_at: overrides.transaction_date,
    ...overrides,
  }
}

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    name: 'EMI',
    amount: 8000,
    remaining: 8000,
    category_id: null,
    is_recurring: false,
    frequency: null,
    due_day: null,
    from_account_id: null,
    is_active: true,
    last_paid_date: null,
    total_installments: null,
    current_installment: null,
    due_date: null,
    ...overrides,
  }
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 5000, is_active: true }],
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
  } as AppState
}

function makeCalc(overrides: Partial<ChallengeCalc> = {}): ChallengeCalc {
  return {
    daysRemaining: 10,
    planningMode: 'salary_cycle',
    availableSpendable: 1000,
    safeDailyLimit: 100,
    targets: { easy: 100, medium: 85, hard: 70 },
    recommendedDifficulty: 'medium',
    target: 100,
    adjustedTarget: 100,
    recoveryAmount: 0,
    yesterdayOverspend: 0,
    yesterdaySpent: 50,
    spentToday: 20,
    remaining: 80,
    pctUsed: 20,
    status: 'on_track',
    message: '',
    todayStr: iso(new Date()),
    currentPace: 50,
    survivalStatus: 'on_track',
    todaysWin: null,
    plantGrowth: { leaves: 0, milestone: 'seed', milestoneLabel: 'Seed — 0 leaves', nextGoal: 1, streakBonus: false, stageIdx: 0 },
    successRate: null,
    avgDailySpend30: 50,
    ...overrides,
  }
}

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return iso(d)
}

describe('Mint Suggestions — priority rule engine', () => {
  it('1. Mission Risk fires when pctUsed > 70, regardless of other data', () => {
    const state = makeState()
    const calc = makeCalc({ pctUsed: 80 })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('mission_risk')
    expect(s.priority).toBe(1)
    expect(s.body).toContain('80%')
  })

  it('2. Recovery is never surfaced as its own suggestion — recoveryAmount alone falls through to celebrate', () => {
    const state = makeState()
    const calc = makeCalc({ pctUsed: 20, status: 'at_risk', recoveryAmount: 500 })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('celebrate')
  })

  it('3. Recurring Spend fires when a description repeats ≥3 times, and names the top item', () => {
    const state = makeState({
      transactions: [
        makeTx({ transaction_date: daysAgoIso(20), description: 'Tea', amount: 40 }),
        makeTx({ transaction_date: daysAgoIso(15), description: 'Tea', amount: 40 }),
        makeTx({ transaction_date: daysAgoIso(10), description: 'Tea', amount: 40 }),
      ],
    })
    const calc = makeCalc({ pctUsed: 60, status: 'on_track' })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('recurring_spend')
    expect(s.title.toLowerCase()).toContain('tea') // detectRecurringExpenses groups by lowercased description
    expect(s.savingAmount).toBeGreaterThan(0)
  })

  it('4. Category Spike fires when this month is up >30% vs last month same point for a category', () => {
    const state = makeState({
      transactions: [
        makeTx({ transaction_date: daysAgoIso(35), description: 'groceries', amount: 250, category_id: 'cat-food' }), // last month
        makeTx({ transaction_date: daysAgoIso(2), description: 'groceries', amount: 400, category_id: 'cat-food' }), // this month
      ],
    })
    const calc = makeCalc({ pctUsed: 60, status: 'on_track' })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('category_spike')
    expect(s.title).toContain('Food')
  })

  it('5. Unused Budget fires when on track and under half of today\'s target used', () => {
    const state = makeState()
    const calc = makeCalc({ pctUsed: 20, status: 'on_track', target: 100, spentToday: 20 })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('unused_budget')
    expect(s.savingAmount).toBeGreaterThan(0)
  })

  it('6. Forecast fires when a real (non-lifestyle) expense ≥500 is due tomorrow', () => {
    const state = makeState({
      commitments: [makeCommitment({ name: 'EMI', amount: 8000, remaining: 8000, due_date: tomorrowIso() })],
    })
    const calc = makeCalc({ pctUsed: 20, status: 'clear' })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('forecast')
    expect(s.title).toContain('tomorrow')
    expect(s.body).toContain('EMI')
  })

  it('7. Celebrate fallback fires when nothing else qualifies', () => {
    const state = makeState()
    const calc = makeCalc({ pctUsed: 60, status: 'at_risk' })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('celebrate')
  })

  it('priority ordering: Recurring Spend (3) wins over Category Spike (4) when both qualify', () => {
    const state = makeState({
      transactions: [
        makeTx({ transaction_date: daysAgoIso(20), description: 'Tea', amount: 40 }),
        makeTx({ transaction_date: daysAgoIso(15), description: 'Tea', amount: 40 }),
        makeTx({ transaction_date: daysAgoIso(10), description: 'Tea', amount: 40 }),
        makeTx({ transaction_date: daysAgoIso(35), description: 'groceries', amount: 250, category_id: 'cat-food' }),
        makeTx({ transaction_date: daysAgoIso(2), description: 'groceries', amount: 400, category_id: 'cat-food' }),
      ],
    })
    const calc = makeCalc({ pctUsed: 60, status: 'on_track' })
    const [s] = generateMintSuggestions(state, derive(state), calc)
    expect(s.id).toBe('recurring_spend')
  })

  it('exactly one suggestion is returned', () => {
    const state = makeState()
    const calc = makeCalc({ pctUsed: 80 })
    const suggestions = generateMintSuggestions(state, derive(state), calc)
    expect(suggestions.length).toBe(1)
  })
})

// Generic invariants from the documented contract atop generateMintSuggestions — checked across
// every rule-triggering fixture above, not just the "happy path" for each rule individually.
describe('Mint Suggestions — contract invariants', () => {
  const fixtures: Array<{ label: string; state: AppState; calc: ChallengeCalc }> = [
    { label: 'mission risk', state: makeState(), calc: makeCalc({ pctUsed: 80 }) },
    { label: 'recovery alone (skipped, falls to celebrate)', state: makeState(), calc: makeCalc({ pctUsed: 20, status: 'at_risk', recoveryAmount: 500 }) },
    {
      label: 'recurring spend',
      state: makeState({
        transactions: [
          makeTx({ transaction_date: daysAgoIso(20), description: 'Tea', amount: 40 }),
          makeTx({ transaction_date: daysAgoIso(15), description: 'Tea', amount: 40 }),
          makeTx({ transaction_date: daysAgoIso(10), description: 'Tea', amount: 40 }),
        ],
      }),
      calc: makeCalc({ pctUsed: 60, status: 'on_track' }),
    },
    {
      label: 'category spike',
      state: makeState({
        transactions: [
          makeTx({ transaction_date: daysAgoIso(35), description: 'groceries', amount: 250, category_id: 'cat-food' }),
          makeTx({ transaction_date: daysAgoIso(2), description: 'groceries', amount: 400, category_id: 'cat-food' }),
        ],
      }),
      calc: makeCalc({ pctUsed: 60, status: 'on_track' }),
    },
    { label: 'unused budget', state: makeState(), calc: makeCalc({ pctUsed: 20, status: 'on_track', target: 100, spentToday: 20 }) },
    {
      label: 'forecast',
      state: makeState({ commitments: [makeCommitment({ name: 'EMI', amount: 8000, remaining: 8000, due_date: tomorrowIso() })] }),
      calc: makeCalc({ pctUsed: 20, status: 'clear' }),
    },
    { label: 'celebrate', state: makeState(), calc: makeCalc({ pctUsed: 60, status: 'at_risk' }) },
  ]

  it.each(fixtures)('$label: satisfies the documented contract', ({ state, calc }) => {
    const d = derive(state)
    const suggestions = generateMintSuggestions(state, d, calc)

    // never empty
    expect(suggestions.length).toBeGreaterThan(0)

    // deterministic: calling again with identical inputs gives an identical result
    expect(generateMintSuggestions(state, d, calc)).toEqual(suggestions)

    // no duplicate ids
    const ids = suggestions.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)

    // sorted by priority ascending
    const priorities = suggestions.map(s => s.priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))

    for (const s of suggestions) {
      expect(s.title.trim().length).toBeGreaterThan(0)
      expect(s.body.trim().length).toBeGreaterThan(0)
      expect(Number.isInteger(s.confidence)).toBe(true)
      expect(s.confidence).toBeGreaterThanOrEqual(0)
      expect(s.confidence).toBeLessThanOrEqual(100)
    }
  })
})
