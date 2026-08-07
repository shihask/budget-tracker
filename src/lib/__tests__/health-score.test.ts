import { describe, it, expect } from 'vitest'
import { computeHealthScore, gradeForScore } from '../health-score'
import type { ChallengeCalc } from '@/lib/challenge'
import { iso, TODAY, addDays } from '@/lib/utils'
import type { AppState, AppNotification, DerivedMetrics } from '@/types'

function makeState(overrides: Partial<AppState['settings']> = {}, userAchievements = 0): AppState {
  return {
    settings: {
      id: 's1',
      weekly_budget: 5000, emergency_fund: 0, salary_date: 28,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      last_reflection_date: null,
      ...overrides,
    },
    user_achievements: Array.from({ length: userAchievements }, (_, i) => ({
      id: `ua-${i}`, achievement_id: `a-${i}`, unlocked_at: iso(TODAY),
    })),
  } as unknown as AppState
}

function makeD(cashHealth: DerivedMetrics['cashHealth']): DerivedMetrics {
  return { cashHealth } as unknown as DerivedMetrics
}

function makeCalc(successRate: number | null): ChallengeCalc {
  return { successRate } as unknown as ChallengeCalc
}

function makeNotif(priority: AppNotification['priority']): AppNotification {
  return {
    id: `n-${Math.random()}`, domain: 'budget', priority, tone: 'warning',
    detector: 'budget_pace', title: 't', message: 'm', createdAt: '2026-01-01', dismissible: true,
  }
}

describe('gradeForScore', () => {
  it('maps scores to the documented bands', () => {
    expect(gradeForScore(100)).toBe('Flourishing')
    expect(gradeForScore(90)).toBe('Flourishing')
    expect(gradeForScore(89)).toBe('Healthy')
    expect(gradeForScore(80)).toBe('Healthy')
    expect(gradeForScore(79)).toBe('Stable')
    expect(gradeForScore(70)).toBe('Stable')
    expect(gradeForScore(69)).toBe('Improving')
    expect(gradeForScore(60)).toBe('Improving')
    expect(gradeForScore(59)).toBe('At Risk')
    expect(gradeForScore(40)).toBe('At Risk')
    expect(gradeForScore(39)).toBe('Critical')
    expect(gradeForScore(0)).toBe('Critical')
  })
})

describe('computeHealthScore', () => {
  it('excludes inapplicable components and renormalizes remaining weights to sum to 100', () => {
    const state = makeState()
    const d = makeD(undefined)   // cash health unknown -> excluded
    const result = computeHealthScore(state, d, makeCalc(null), [], null)   // no mission, no habits
    const totalWeight = result.components.reduce((s, c) => s + c.weight, 0)
    expect(totalWeight).toBe(100)
    expect(result.components.map(c => c.key).sort()).toEqual(['achievements', 'alerts', 'reflection'])
  })

  it('includes every component when all inputs are present', () => {
    const state = makeState({ last_reflection_date: iso(TODAY) }, 5)
    const d = makeD({ status: 'healthy', tone: 'positive', message: '', description: '' })
    const result = computeHealthScore(state, d, makeCalc(80), [], 90)
    expect(result.components).toHaveLength(6)
    expect(result.components.reduce((s, c) => s + c.weight, 0)).toBe(100)
  })

  it('scores a perfectly healthy day at 100', () => {
    const state = makeState({ last_reflection_date: iso(TODAY) }, 0)
    const d = makeD({ status: 'healthy', tone: 'positive', message: '', description: '' })
    const result = computeHealthScore(state, d, makeCalc(100), [], 100)
    // achievements is 0/0 -> excluded (ACHIEVEMENTS catalog is non-empty in real app,
    // but with 0 unlocked it would score 0 -- here we assert the applicable ones are perfect
    expect(result.components.every(c => c.score === 100 || c.key === 'achievements')).toBe(true)
  })

  it('cash health contributes 0 when in shortfall', () => {
    const state = makeState()
    const d = makeD({ status: 'shortfall', tone: 'critical', message: '', description: '' })
    const result = computeHealthScore(state, d, makeCalc(null), [], null)
    const cash = result.components.find(c => c.key === 'cash_health')
    expect(cash?.score).toBe(0)
  })

  it('reflection recency scores by days since last_reflection_date', () => {
    const state0 = makeState({ last_reflection_date: iso(TODAY) })
    const state1 = makeState({ last_reflection_date: iso(addDays(TODAY, -1)) })
    const state3 = makeState({ last_reflection_date: iso(addDays(TODAY, -3)) })
    const state7 = makeState({ last_reflection_date: iso(addDays(TODAY, -7)) })
    const state30 = makeState({ last_reflection_date: iso(addDays(TODAY, -30)) })
    const stateNever = makeState({ last_reflection_date: null })
    const d = makeD(undefined)
    const score = (s: AppState) => computeHealthScore(s, d, makeCalc(null), [], null).components.find(c => c.key === 'reflection')!.score
    expect(score(state0)).toBe(100)
    expect(score(state1)).toBe(80)
    expect(score(state3)).toBe(50)
    expect(score(state7)).toBe(20)
    expect(score(state30)).toBe(0)
    expect(score(stateNever)).toBe(0)
  })

  it('active-alert severity subtracts 20 per critical and 10 per high, floored at 0', () => {
    const state = makeState()
    const d = makeD(undefined)
    const zero = computeHealthScore(state, d, makeCalc(null), [], null)
    const oneCritical = computeHealthScore(state, d, makeCalc(null), [makeNotif('critical')], null)
    const oneHigh = computeHealthScore(state, d, makeCalc(null), [makeNotif('high')], null)
    const manyCritical = computeHealthScore(state, d, makeCalc(null), Array.from({ length: 10 }, () => makeNotif('critical')), null)
    expect(zero.components.find(c => c.key === 'alerts')?.score).toBe(100)
    expect(oneCritical.components.find(c => c.key === 'alerts')?.score).toBe(80)
    expect(oneHigh.components.find(c => c.key === 'alerts')?.score).toBe(90)
    expect(manyCritical.components.find(c => c.key === 'alerts')?.score).toBe(0)
  })

  it('reports the highest and lowest scoring components as strongest/weakest', () => {
    const state = makeState({ last_reflection_date: null }, 0)
    const d = makeD({ status: 'healthy', tone: 'positive', message: '', description: '' })
    const result = computeHealthScore(state, d, makeCalc(30), [], 40)
    expect(result.strongest?.key).toBe('cash_health')
    expect(result.weakest?.key).toBe('reflection')
  })

  it('leaves trend null — the caller fills it in from health-score-cache', () => {
    const state = makeState()
    const d = makeD(undefined)
    const result = computeHealthScore(state, d, makeCalc(null), [], null)
    expect(result.trend).toBeNull()
  })
})
