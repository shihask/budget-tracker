import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS } from '@/lib/achievement-definitions'
import { evaluateDaily, evaluateEvent } from '@/lib/achievement-engine'
import { computeChallengeResultUpdate } from '@/lib/challenge'
import type { AppState, Category, Goal, GoalContribution, Group } from '@/types'

const BASE_CATEGORIES: Category[] = [
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
]
const BASE_GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
]

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: `goal-${Math.random().toString(36).slice(2)}`,
    name: 'Trip',
    goal_type: 'savings',
    goal_amount: 100000,
    current_saved: 0,
    monthly_target: 1000,
    target_date: '2027-01-01',
    created_at: '2026-01-01',
    is_active: true,
    ...overrides,
  }
}

function makeContribution(overrides: Partial<GoalContribution> & { goal_id: string }): GoalContribution {
  return {
    id: `gc-${Math.random().toString(36).slice(2)}`,
    amount: 100,
    source: 'manual',
    note: null,
    created_at: '2026-01-01T00:00:00Z',
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
    user_achievements: [],
    habits: [],
    savings: [],
    planned_expenses: [],
    ...overrides,
  } as AppState
}

describe('Achievements — definitions & daily evaluation', () => {
  const dailyDefs = ACHIEVEMENTS.filter(a => a.trigger.kind === 'daily')

  it('every daily-trigger definition has a condition, every definition has non-empty title/description', () => {
    for (const def of dailyDefs) {
      expect(typeof def.condition).toBe('function')
    }
    for (const def of ACHIEVEMENTS) {
      expect(def.title.trim().length).toBeGreaterThan(0)
      expect(def.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('ids are unique across all 16 achievements', () => {
    const ids = ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('budget_guardian fires at 7 success days, not before', () => {
    const below = makeState({ settings: { ...makeState().settings, challenge_success_days: 6 } })
    const at = makeState({ settings: { ...makeState().settings, challenge_success_days: 7 } })
    expect(evaluateDaily(below, new Set()).some(a => a.id === 'budget_guardian')).toBe(false)
    expect(evaluateDaily(at, new Set()).some(a => a.id === 'budget_guardian')).toBe(true)
  })

  it('perfect_week uses challenge_clean_streak, not challenge_streak', () => {
    // High regular streak but zero clean streak (all grace passes) must NOT unlock Perfect Week
    const graceHeavy = makeState({ settings: { ...makeState().settings, challenge_streak: 10, challenge_clean_streak: 0 } })
    const clean = makeState({ settings: { ...makeState().settings, challenge_streak: 7, challenge_clean_streak: 7 } })
    expect(evaluateDaily(graceHeavy, new Set()).some(a => a.id === 'perfect_week')).toBe(false)
    expect(evaluateDaily(clean, new Set()).some(a => a.id === 'perfect_week')).toBe(true)
  })

  it('forest_builder requires 1000 leaves (no plant visual stage needed)', () => {
    const below = makeState({ settings: { ...makeState().settings, challenge_leaves: 999 } })
    const at = makeState({ settings: { ...makeState().settings, challenge_leaves: 1000 } })
    expect(evaluateDaily(below, new Set()).some(a => a.id === 'forest_builder')).toBe(false)
    expect(evaluateDaily(at, new Set()).some(a => a.id === 'forest_builder')).toBe(true)
  })

  it('savings totals sum active goals\' current_saved, not the capped goal_contributions list', () => {
    const state = makeState({
      goals: [makeGoal({ current_saved: 6000, is_active: true }), makeGoal({ current_saved: 3000, is_active: true }), makeGoal({ current_saved: 999999, is_active: false })],
      goal_contributions: [], // deliberately empty — total must come from goals, not this array
    })
    const unlocked = evaluateDaily(state, new Set())
    // active goals sum to 9000: over the 1,000 threshold, under the 10,000 one; the
    // inactive goal's 999,999 must be excluded or saved_10000 would wrongly fire too
    expect(unlocked.some(a => a.id === 'saved_1000')).toBe(true)
    expect(unlocked.some(a => a.id === 'saved_10000')).toBe(false)
  })

  it('three_goals counts distinct goal_id in goal_contributions', () => {
    const state = makeState({
      goal_contributions: [
        makeContribution({ goal_id: 'g1' }),
        makeContribution({ goal_id: 'g2' }),
        makeContribution({ goal_id: 'g1' }), // repeat — must not double-count
      ],
    })
    expect(evaluateDaily(state, new Set()).some(a => a.id === 'three_goals')).toBe(false)
    const threeGoalsState = makeState({
      goal_contributions: [
        makeContribution({ goal_id: 'g1' }),
        makeContribution({ goal_id: 'g2' }),
        makeContribution({ goal_id: 'g3' }),
      ],
    })
    expect(evaluateDaily(threeGoalsState, new Set()).some(a => a.id === 'three_goals')).toBe(true)
  })

  it('reflection badges use reflection_days_count, a distinct-day count, not last_reflection_date', () => {
    const state = makeState({ settings: { ...makeState().settings, reflection_days_count: 7 } })
    const unlocked = evaluateDaily(state, new Set())
    expect(unlocked.some(a => a.id === 'weekly_reflection')).toBe(true)
    expect(unlocked.some(a => a.id === 'self_awareness')).toBe(false)
  })

  it('evaluateDaily never returns an id already in alreadyUnlockedIds', () => {
    const state = makeState({ settings: { ...makeState().settings, challenge_success_days: 30, challenge_leaves: 1000 } })
    const alreadyUnlocked = new Set(['budget_guardian', 'budget_champion', 'first_success'])
    const unlocked = evaluateDaily(state, alreadyUnlocked)
    for (const id of alreadyUnlocked) {
      expect(unlocked.some(a => a.id === id)).toBe(false)
    }
    // still finds the ones not yet unlocked
    expect(unlocked.some(a => a.id === 'forest_builder')).toBe(true)
  })

  it('evaluateDaily never returns an event-trigger definition (comeback)', () => {
    const state = makeState()
    const unlocked = evaluateDaily(state, new Set())
    expect(unlocked.some(a => a.id === 'comeback')).toBe(false)
  })
})

describe('Achievements — event evaluation (Comeback)', () => {
  it('evaluateEvent matches challenge_comeback to the comeback definition only', () => {
    const unlocked = evaluateEvent({ type: 'challenge_comeback' }, new Set())
    expect(unlocked.map(a => a.id)).toEqual(['comeback'])
  })

  it('evaluateEvent respects alreadyUnlockedIds', () => {
    const unlocked = evaluateEvent({ type: 'challenge_comeback' }, new Set(['comeback']))
    expect(unlocked.length).toBe(0)
  })
})

describe('Achievements — computeChallengeResultUpdate (Perfect Week / Comeback source of truth)', () => {
  const base = { streak: 0, total: 0, success: 0, cleanStreak: 0, monthLeaves: 0, lastDate: null as string | null }

  it('clean streak increments on a clean success', () => {
    const upd = computeChallengeResultUpdate({ ...base, cleanStreak: 3 }, 'success', 50, 100, '2026-08-06')
    expect(upd.newCleanStreak).toBe(4)
  })

  it('clean streak resets to 0 on a grace pass (overspend < 10%), even though the regular streak is preserved', () => {
    const upd = computeChallengeResultUpdate({ ...base, streak: 5, cleanStreak: 5 }, 'miss', -5, 100, '2026-08-06') // 5% over target
    expect(upd.isGrace).toBe(true)
    expect(upd.newStreak).toBe(5)       // preserved
    expect(upd.newCleanStreak).toBe(0)  // reset — grace still breaks "perfect"
  })

  it('clean streak resets to 0 on a real miss too', () => {
    const upd = computeChallengeResultUpdate({ ...base, cleanStreak: 5 }, 'miss', -50, 100, '2026-08-06') // 50% over target
    expect(upd.newCleanStreak).toBe(0)
  })

  it('comeback fires on a success right after a broken streak, not on the very first day ever', () => {
    const firstDayEver = computeChallengeResultUpdate({ ...base, streak: 0, total: 0 }, 'success', 50, 100, '2026-08-06')
    expect(firstDayEver.isComeback).toBe(false) // total === 0 -> nothing to "come back" from

    const bounceBack = computeChallengeResultUpdate({ ...base, streak: 0, total: 5 }, 'success', 50, 100, '2026-08-06')
    expect(bounceBack.isComeback).toBe(true)

    const continuingStreak = computeChallengeResultUpdate({ ...base, streak: 3, total: 5 }, 'success', 50, 100, '2026-08-06')
    expect(continuingStreak.isComeback).toBe(false) // streak wasn't broken
  })
})
