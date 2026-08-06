import { describe, it, expect } from 'vitest'
import { buildMintCoachContext, buildMintCoachFingerprint } from '@/lib/mint-coach-context'
import { derive } from '@/lib/data'
import { iso, addDays, TODAY } from '@/lib/utils'
import type { ChallengeCalc } from '@/lib/challenge'
import type { DailyChallengeState } from '@/hooks/useDailyChallenge'
import type { AppState, Category, Group, Habit, UserAchievement, Transaction } from '@/types'

const BASE_CATEGORIES: Category[] = [
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
]
const BASE_GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
]

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
      autopilot_enabled: true,
      income_pattern: 'monthly',
      primary_income_category_id: null,
      last_reflection_date: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [],
    borrowings: [],
    transactions: [],
    goals: [],
    goal_contributions: [],
    user_achievements: [],
    habits: [],
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
    todayStr: iso(TODAY),
    currentPace: 50,
    survivalStatus: 'on_track',
    todaysWin: null,
    plantGrowth: { leaves: 0, milestone: 'seed', milestoneLabel: 'Seed — 0 leaves', nextGoal: 1, streakBonus: false, stageIdx: 0 },
    successRate: null,
    avgDailySpend30: 50,
    ...overrides,
  }
}

function makeChallenge(calc: ChallengeCalc | null, overrides: Partial<DailyChallengeState> = {}): DailyChallengeState {
  return {
    calc,
    enabled: calc !== null,
    difficulty: 'medium',
    streak: 3,
    remaining: calc?.remaining ?? 0,
    progressPct: 0,
    isOverTarget: calc?.status === 'exceeded',
    ...overrides,
  }
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Skip Tea',
    description: null,
    category: 'saving',
    preset_key: 'skip_tea',
    frequency: 'daily',
    days_of_week: [],
    weekly_day: null,
    monthly_day: null,
    target_amount: null,
    status: 'active',
    snoozed_until: null,
    current_streak: 0,
    best_streak: 0,
    total_completions: 0,
    total_paused: 0,
    total_missed: 0,
    last_completed_date: null,
    last_evaluated_date: null,
    created_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeAchievement(overrides: Partial<UserAchievement> = {}): UserAchievement {
  return {
    id: 'ua1',
    achievement_id: 'first_reflection',
    unlocked_at: `${iso(TODAY)}T00:00:00Z`,
    metadata: {},
    ...overrides,
  }
}

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

const todayStr = iso(TODAY)

describe('buildMintCoachContext', () => {
  it('mission is null when Daily Challenge is disabled', () => {
    const state = makeState()
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.mission).toBeNull()
  })

  it('mission carries calc, streak, and difficulty when enabled', () => {
    const state = makeState()
    const calc = makeCalc({ status: 'at_risk' })
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(calc, { streak: 5, difficulty: 'hard' }), 5, 'Sam', null)
    expect(ctx.mission).toEqual({ calc, streak: 5, difficulty: 'hard' })
  })

  it('habits: counts only active habits due today, and completedToday only among those', () => {
    const state = makeState({
      habits: [
        makeHabit({ id: 'a', frequency: 'daily', current_streak: 4 }),                                   // active, due, not completed
        makeHabit({ id: 'b', frequency: 'daily', last_completed_date: todayStr, current_streak: 6 }),      // active, due, completed
        makeHabit({ id: 'c', status: 'on_hold', frequency: 'daily', current_streak: 99 }),                  // on hold — excluded entirely
      ],
    })
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.habits.dueToday).toBe(2)
    expect(ctx.habits.completedToday).toBe(1)
    expect(ctx.habits.topStreak).toBe(6)   // max across active habits (on-hold excluded), not just due-today ones
  })

  it('habits: all zero when there are no habits', () => {
    const state = makeState()
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.habits).toEqual({ dueToday: 0, completedToday: 0, topStreak: 0 })
  })

  it('achievement is null when nothing is unlocked', () => {
    const state = makeState()
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.achievement).toBeNull()
  })

  it('achievement reflects the most recent unlock and whether it happened today', () => {
    const state = makeState({
      user_achievements: [
        makeAchievement({ id: 'ua-old', achievement_id: 'first_reflection', unlocked_at: '2020-01-01T00:00:00Z' }),
        makeAchievement({ id: 'ua-new', achievement_id: 'habit_starter', unlocked_at: `${todayStr}T12:00:00Z` }),
      ],
    })
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.achievement).toEqual({ title: 'Habit Starter', unlockedToday: true })
  })

  it('achievement.unlockedToday is false for a past unlock even if it is the most recent', () => {
    const state = makeState({
      user_achievements: [makeAchievement({ achievement_id: 'first_reflection', unlocked_at: '2020-01-01T00:00:00Z' })],
    })
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.achievement?.unlockedToday).toBe(false)
  })

  it('reflection.done follows settings.last_reflection_date', () => {
    const notDone = makeState()
    const done = makeState({ settings: { ...makeState().settings, last_reflection_date: todayStr } })
    expect(buildMintCoachContext(notDone, derive(notDone), makeChallenge(null), 0, 'Sam', null).reflection.done).toBe(false)
    expect(buildMintCoachContext(done, derive(done), makeChallenge(null), 0, 'Sam', null).reflection.done).toBe(true)
  })

  it('topSuggestion is null when Daily Challenge is disabled (no calc to generate from)', () => {
    const state = makeState()
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.topSuggestion).toBeNull()
  })

  it('topSuggestion mirrors generateMintSuggestions(state, d, calc)[0] when enabled', () => {
    const state = makeState()
    const calc = makeCalc({ pctUsed: 80 })
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(calc), 0, 'Sam', null)
    expect(ctx.topSuggestion?.id).toBe('mission_risk')
  })

  it('forecastEvent picks up a real expense >= 500 due tomorrow, ignoring lifestyle-source synthetic events', () => {
    const tomorrowStr = iso(addDays(TODAY, 1))
    const state = makeState({
      commitments: [{
        id: 'c1', name: 'Rent', amount: 8000, remaining: 8000, category_id: null,
        is_recurring: false, frequency: null, due_day: null,
        from_account_id: null, is_active: true, last_paid_date: null,
        total_installments: null, current_installment: null, due_date: tomorrowStr,
      }],
    })
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.forecastEvent).not.toBeNull()
    expect(ctx.forecastEvent?.title).toContain('Rent')
    expect(ctx.forecastEvent?.amount).toBe(8000)
  })

  it('forecastEvent is null when nothing meaningful is due tomorrow', () => {
    const state = makeState()
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', null)
    expect(ctx.forecastEvent).toBeNull()
  })

  it('previousCoachSummary passes through unchanged (caller trims/loads it)', () => {
    const state = makeState()
    const ctx = buildMintCoachContext(state, derive(state), makeChallenge(null), 0, 'Sam', 'Yesterday you cooked at home.')
    expect(ctx.previousCoachSummary).toBe('Yesterday you cooked at home.')
  })

  it('is deterministic — same inputs produce the same output', () => {
    const state = makeState({ transactions: [makeTx({ transaction_date: todayStr, amount: 100 })] })
    const calc = makeCalc()
    const args = [state, derive(state), makeChallenge(calc), 3, 'Sam', null] as const
    expect(buildMintCoachContext(...args)).toEqual(buildMintCoachContext(...args))
  })
})

describe('buildMintCoachFingerprint', () => {
  function ctxWith(overrides: Partial<{ status: ChallengeCalc['status']; reflectionDone: boolean; habitsCompleted: number; achievementTitle: string | null }>) {
    const state = makeState({
      settings: { ...makeState().settings, last_reflection_date: overrides.reflectionDone ? todayStr : null },
      habits: overrides.habitsCompleted
        ? Array.from({ length: overrides.habitsCompleted }, (_, i) => makeHabit({ id: `h${i}`, last_completed_date: todayStr }))
        : [],
      user_achievements: overrides.achievementTitle
        ? [makeAchievement({ achievement_id: 'habit_starter', unlocked_at: `${todayStr}T00:00:00Z` })]
        : [],
    })
    const calc = makeCalc({ status: overrides.status ?? 'on_track' })
    return buildMintCoachContext(state, derive(state), makeChallenge(calc), 0, 'Sam', null)
  }

  it('changes when mission status changes', () => {
    const a = buildMintCoachFingerprint(ctxWith({ status: 'on_track' }))
    const b = buildMintCoachFingerprint(ctxWith({ status: 'exceeded' }))
    expect(a).not.toBe(b)
  })

  it('changes when reflection completion changes', () => {
    const a = buildMintCoachFingerprint(ctxWith({ reflectionDone: false }))
    const b = buildMintCoachFingerprint(ctxWith({ reflectionDone: true }))
    expect(a).not.toBe(b)
  })

  it('changes when habits-completed-today count changes', () => {
    const a = buildMintCoachFingerprint(ctxWith({ habitsCompleted: 0 }))
    const b = buildMintCoachFingerprint(ctxWith({ habitsCompleted: 2 }))
    expect(a).not.toBe(b)
  })

  it('changes when a new achievement unlocks today', () => {
    const a = buildMintCoachFingerprint(ctxWith({ achievementTitle: null }))
    const b = buildMintCoachFingerprint(ctxWith({ achievementTitle: 'Habit Starter' }))
    expect(a).not.toBe(b)
  })

  it('stays identical when nothing fingerprint-relevant changes, even if previousCoachSummary differs', () => {
    const state = makeState()
    const calc = makeCalc()
    const ctx1 = buildMintCoachContext(state, derive(state), makeChallenge(calc), 0, 'Sam', null)
    const ctx2 = buildMintCoachContext(state, derive(state), makeChallenge(calc), 0, 'Sam', 'some unrelated previous note')
    expect(buildMintCoachFingerprint(ctx1)).toBe(buildMintCoachFingerprint(ctx2))
  })

  it('is deterministic — same context produces the same fingerprint', () => {
    const ctx = ctxWith({ status: 'at_risk', reflectionDone: true, habitsCompleted: 1 })
    expect(buildMintCoachFingerprint(ctx)).toBe(buildMintCoachFingerprint(ctx))
  })
})
