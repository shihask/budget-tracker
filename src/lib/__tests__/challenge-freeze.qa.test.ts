import { describe, it, expect, beforeEach } from 'vitest'
import { computeChallenge, type ChallengeCalc } from '@/lib/challenge'
import { derive } from '@/lib/data'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import { loadFrozenSnapshot, saveFrozenSnapshot, freezeFromCalc, CHALLENGE_SNAPSHOT_VERSION } from '@/lib/challenge-snapshot'
import { iso } from '@/lib/utils'
import type { AppState, Transaction, Category, Group } from '@/types'

// ─── In-memory localStorage polyfill (vitest's default 'node' env has no window/localStorage) ──
function makeMemoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
  }
}
type MemoryStorage = ReturnType<typeof makeMemoryStorage>
const g = globalThis as unknown as { localStorage: MemoryStorage }
g.localStorage = makeMemoryStorage()

const USER_ID = 'user-qa-1'
const SALARY_CAT_ID = 'cat-salary'

const BASE_CATEGORIES: Category[] = [
  { id: SALARY_CAT_ID, name: 'Salary', group_name: 'Income' },
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

// Mirrors the merge DailyChallengeCard.tsx performs: freeze safeDailyLimit + targets, keep the rest live.
function computeMerged(state: AppState, difficulty: 'easy' | 'medium' | 'hard') {
  const liveCalc = computeChallenge(state, difficulty, derive(state).realFreeMoney)
  const cycle = getCurrentFinancialCycle(state)
  const cycleKey = `${iso(cycle.cycleStart)}:${cycle.status}`
  const settingsFingerprint = [
    state.settings.emergency_fund ?? 0,
    state.settings.income_pattern ?? 'monthly',
    state.settings.salary_date ?? '',
    state.settings.income_day ?? '',
    state.settings.primary_income_category_id ?? '',
  ].join(':')

  let frozen = loadFrozenSnapshot(USER_ID, liveCalc.todayStr, cycleKey, settingsFingerprint)
  if (!frozen) {
    frozen = freezeFromCalc(liveCalc, cycleKey, settingsFingerprint)
    saveFrozenSnapshot(USER_ID, frozen)
  }

  const calc: ChallengeCalc = {
    ...liveCalc,
    safeDailyLimit: frozen.safeDailyLimit,
    targets: frozen.targets,
    target: frozen.targets[difficulty],
  }
  return { calc, cycleKey, settingsFingerprint }
}

beforeEach(() => {
  g.localStorage.clear()
})

describe('Daily Challenge freeze — QA scenarios', () => {
  it('1. spend during the day: target/safeDailyLimit stay fixed, Available + spentToday + remaining move live', () => {
    const morning = makeState()
    const { calc: morningCalc } = computeMerged(morning, 'easy')

    const afterSpend = makeState({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 5000 - 100, is_active: true }],
      transactions: [makeTx({ transaction_date: morningCalc.todayStr, amount: 100 })],
    })
    const { calc: afterCalc } = computeMerged(afterSpend, 'easy')

    expect(afterCalc.safeDailyLimit).toBe(morningCalc.safeDailyLimit)
    expect(afterCalc.targets).toEqual(morningCalc.targets)
    expect(afterCalc.target).toBe(morningCalc.target)

    expect(afterCalc.availableSpendable).toBeCloseTo(morningCalc.availableSpendable - 100, 5)
    expect(afterCalc.spentToday).toBe(100)
    expect(Math.round(afterCalc.target - afterCalc.spentToday)).toBe(Math.round(afterCalc.target) - 100)
  })

  it('2. overspend: target never shrinks to match spend, "exceeded" is spent minus fixed target', () => {
    const morning = makeState()
    const { calc: morningCalc } = computeMerged(morning, 'easy')
    const target = Math.round(morningCalc.target)

    // Spend the full target, then 10 more (mirrors "170 then +10" from the QA doc, scaled to this fixture's numbers)
    const spend1 = makeState({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 5000 - target, is_active: true }],
      transactions: [makeTx({ transaction_date: morningCalc.todayStr, amount: target })],
    })
    const { calc: c1 } = computeMerged(spend1, 'easy')
    expect(c1.target).toBe(morningCalc.target) // target unchanged after first spend

    const spend2 = makeState({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 5000 - target - 10, is_active: true }],
      transactions: [
        makeTx({ transaction_date: morningCalc.todayStr, amount: target }),
        makeTx({ transaction_date: morningCalc.todayStr, amount: 10 }),
      ],
    })
    const { calc: c2 } = computeMerged(spend2, 'easy')

    expect(c2.target).toBe(morningCalc.target) // target STILL unchanged — this is the bug being fixed
    expect(c2.spentToday).toBe(target + 10)
    const remaining = Math.round(c2.target - c2.spentToday)
    expect(remaining).toBe(-10) // exceeded by 10, not "target became spend amount"
  })

  it('3. midnight/next day: a snapshot for a different calendar date is invalidated, fresh snapshot created', () => {
    const state = makeState()
    const liveCalc = computeChallenge(state, 'easy', derive(state).realFreeMoney)
    const cycle = getCurrentFinancialCycle(state)
    const cycleKey = `${iso(cycle.cycleStart)}:${cycle.status}`
    const fingerprint = '0:monthly:28::'

    const yesterdaySnap = freezeFromCalc({ ...liveCalc, todayStr: '2026-06-30', safeDailyLimit: 174 }, cycleKey, fingerprint)
    saveFrozenSnapshot(USER_ID, yesterdaySnap)

    // "Today" is a different calendar date than what's stored -> must invalidate
    const loaded = loadFrozenSnapshot(USER_ID, '2026-07-01', cycleKey, fingerprint)
    expect(loaded).toBeNull()

    const freshSnap = freezeFromCalc({ ...liveCalc, todayStr: '2026-07-01', safeDailyLimit: 168 }, cycleKey, fingerprint)
    saveFrozenSnapshot(USER_ID, freshSnap)
    const reloaded = loadFrozenSnapshot(USER_ID, '2026-07-01', cycleKey, fingerprint)
    expect(reloaded?.safeDailyLimit).toBe(168)
  })

  it('4. salary received mid-day (waiting -> active cycle): cycle key changes, snapshot invalidates, new challenge generated', () => {
    // Salary date = today's day-of-month, with last salary received a full cycle ago -> "waiting for income" today
    const now = new Date()
    const todayDay = now.getDate()
    const prevCycleDateStr = iso(new Date(now.getFullYear(), now.getMonth() - 1, todayDay))
    const todayStr = iso(now)

    const waitingState = makeState({
      settings: { ...makeState().settings, salary_date: todayDay, income_pattern: 'monthly' },
      transactions: [makeTx({ transaction_date: prevCycleDateStr, amount: 50000, transaction_type: 'income', category_id: SALARY_CAT_ID })],
    })
    const waitingCycle = getCurrentFinancialCycle(waitingState)
    expect(waitingCycle.status).toBe('waiting')
    const { cycleKey: waitingKey } = computeMerged(waitingState, 'easy')
    const waitingCalc = computeChallenge(waitingState, 'easy', derive(waitingState).realFreeMoney)

    // Salary now recorded today -> cycle re-anchors to an active cycle starting today
    const salaryReceivedState = makeState({
      settings: { ...makeState().settings, salary_date: todayDay, income_pattern: 'monthly' },
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 5000 + 50000, is_active: true }],
      transactions: [
        makeTx({ transaction_date: prevCycleDateStr, amount: 50000, transaction_type: 'income', category_id: SALARY_CAT_ID }),
        makeTx({ transaction_date: todayStr, amount: 50000, transaction_type: 'income', category_id: SALARY_CAT_ID }),
      ],
    })
    const activeCycle = getCurrentFinancialCycle(salaryReceivedState)
    expect(activeCycle.status).toBe('active')
    const { calc: activeCalc, cycleKey: activeKey } = computeMerged(salaryReceivedState, 'easy')

    expect(activeKey).not.toBe(waitingKey) // cycle identity changed
    expect(activeCalc.targets.easy).not.toBe(waitingCalc.targets.easy) // fresh challenge generated immediately, not stuck at old value
  })

  it('5. emergency fund change mid-day: recomputes immediately (fingerprint bust)', () => {
    const before = makeState({ settings: { ...makeState().settings, emergency_fund: 0 } })
    const { calc: beforeCalc } = computeMerged(before, 'easy')

    const after = makeState({ settings: { ...makeState().settings, emergency_fund: 3000 } })
    const { calc: afterCalc } = computeMerged(after, 'easy')

    expect(afterCalc.targets.easy).not.toBe(beforeCalc.targets.easy)
    expect(afterCalc.availableSpendable).toBeCloseTo(beforeCalc.availableSpendable - 3000, 5)
  })

  it('6. several small QuickAdd transactions in sequence: target never moves, spend accumulates', () => {
    const morning = makeState()
    const { calc: morningCalc } = computeMerged(morning, 'easy')

    const amounts = [10, 20, 5, 15]
    let running = 0
    let balance = 5000
    for (const amt of amounts) {
      running += amt
      balance -= amt
      const state = makeState({
        accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: balance, is_active: true }],
        transactions: [makeTx({ transaction_date: morningCalc.todayStr, amount: running })], // cumulative single txn = running total spent today
      })
      const { calc } = computeMerged(state, 'easy')
      expect(calc.target).toBe(morningCalc.target)
      expect(calc.safeDailyLimit).toBe(morningCalc.safeDailyLimit)
      expect(calc.spentToday).toBe(running)
    }
  })

  it('7. refresh (re-mount): loading the snapshot again returns the exact same frozen values', () => {
    const state = makeState()
    const { calc: first } = computeMerged(state, 'easy')
    // Simulate a fresh mount reading from the same localStorage-backed store
    const { calc: second } = computeMerged(state, 'easy')

    expect(second.target).toBe(first.target)
    expect(second.safeDailyLimit).toBe(first.safeDailyLimit)
    expect(second.targets).toEqual(first.targets)
  })

  it('8. clearing storage: a fresh snapshot is created without errors after localStorage is emptied', () => {
    const state = makeState()
    const { calc: first } = computeMerged(state, 'easy')

    g.localStorage.clear()

    expect(() => computeMerged(state, 'easy')).not.toThrow()
    const { calc: afterClear } = computeMerged(state, 'easy')
    expect(afterClear.target).toBe(first.target) // same inputs -> same recomputed target
  })

  it('8b. a throwing localStorage degrades gracefully to live recompute instead of crashing', () => {
    const throwing: MemoryStorage = {
      getItem: () => { throw new Error('quota exceeded') },
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => {},
      clear: () => {},
    }
    const original = g.localStorage
    g.localStorage = throwing
    try {
      const state = makeState()
      expect(() => computeMerged(state, 'easy')).not.toThrow()
    } finally {
      g.localStorage = original
    }
  })

  it('snapshot carries the schema version', () => {
    const state = makeState()
    computeMerged(state, 'easy')
    const liveCalc = computeChallenge(state, 'easy', derive(state).realFreeMoney)
    const cycle = getCurrentFinancialCycle(state)
    const cycleKey = `${iso(cycle.cycleStart)}:${cycle.status}`
    const fingerprint = '0:monthly:28::'
    const loaded = loadFrozenSnapshot(USER_ID, liveCalc.todayStr, cycleKey, fingerprint)
    expect(loaded?.version).toBe(CHALLENGE_SNAPSHOT_VERSION)
  })
})
