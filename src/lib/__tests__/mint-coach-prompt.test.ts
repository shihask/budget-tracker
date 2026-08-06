import { describe, it, expect } from 'vitest'
import { buildMintCoachPrompt } from '@/lib/mint-coach-prompt'
import type { MintCoachContext } from '@/lib/mint-coach-context'
import type { ChallengeCalc } from '@/lib/challenge'

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
    todayStr: '2026-08-06',
    currentPace: 50,
    survivalStatus: 'on_track',
    todaysWin: null,
    plantGrowth: { leaves: 0, milestone: 'seed', milestoneLabel: 'Seed — 0 leaves', nextGoal: 1, streakBonus: false, stageIdx: 0 },
    successRate: null,
    avgDailySpend30: 50,
    ...overrides,
  }
}

function makeContext(overrides: Partial<MintCoachContext> = {}): MintCoachContext {
  return {
    userName: 'Sam',
    mission: null,
    habits: { dueToday: 0, completedToday: 0, topStreak: 0 },
    achievement: null,
    reflection: { done: false },
    topSuggestion: null,
    forecastEvent: null,
    timingHint: null,
    previousCoachSummary: null,
    ...overrides,
  }
}

describe('buildMintCoachPrompt', () => {
  it('context string includes the exact DailyChallenge: label format when mission is present', () => {
    const ctx = makeContext({ mission: { calc: makeCalc({ status: 'at_risk' }), streak: 4, difficulty: 'hard' } })
    const { context } = buildMintCoachPrompt(ctx)
    expect(context).toMatch(/DailyChallenge: difficulty:hard target:₹\d+ spent-today:₹\d+ remaining:₹\d+ status:at_risk streak:4-days success-rate:\S+ plant:.+ salary-pace:\S+ safe-daily:₹\d+/)
  })

  it('omits the DailyChallenge line entirely when mission is null', () => {
    const { context } = buildMintCoachPrompt(makeContext())
    expect(context).not.toContain('DailyChallenge:')
  })

  it('always includes a Habits: line, even with zero habits', () => {
    const { context } = buildMintCoachPrompt(makeContext())
    expect(context).toContain('Habits: due:0 completed:0 top-streak:0')
  })

  it('includes an Achievement: line only when present, correctly tagged unlocked-today vs past', () => {
    const today = makeContext({ achievement: { title: 'Habit Starter', unlockedToday: true } })
    const past = makeContext({ achievement: { title: 'Habit Starter', unlockedToday: false } })
    expect(buildMintCoachPrompt(today).context).toContain('Achievement: Habit Starter (unlocked-today)')
    expect(buildMintCoachPrompt(past).context).toContain('Achievement: Habit Starter (past)')
    expect(buildMintCoachPrompt(makeContext()).context).not.toContain('Achievement:')
  })

  it('Reflection: line reflects done/pending', () => {
    expect(buildMintCoachPrompt(makeContext({ reflection: { done: true } })).context).toContain('Reflection: done')
    expect(buildMintCoachPrompt(makeContext({ reflection: { done: false } })).context).toContain('Reflection: pending')
  })

  it('includes a Suggestion: line only when topSuggestion is present', () => {
    const withSuggestion = makeContext({
      topSuggestion: { id: 'mission_risk', type: 'spend_less', title: 'Careful today', body: '...', savingAmount: null, priority: 1, detector: 'mission_risk', confidence: 80 },
    })
    expect(buildMintCoachPrompt(withSuggestion).context).toContain('Suggestion: mission_risk — Careful today')
    expect(buildMintCoachPrompt(makeContext()).context).not.toContain('Suggestion:')
  })

  it('includes a Forecast: line only when forecastEvent is present', () => {
    const withForecast = makeContext({ forecastEvent: { title: 'Rent', amount: 8000 } })
    expect(buildMintCoachPrompt(withForecast).context).toContain('due tomorrow')
    expect(buildMintCoachPrompt(withForecast).context).toContain('Rent')
    expect(buildMintCoachPrompt(makeContext()).context).not.toContain('Forecast:')
  })

  it('includes a Timing: line only when timingHint is present, one per hint', () => {
    expect(buildMintCoachPrompt(makeContext({ timingHint: 'salary_tomorrow' })).context).toContain('Timing:')
    expect(buildMintCoachPrompt(makeContext({ timingHint: 'weekend_approaching' })).context).toContain('Timing:')
    expect(buildMintCoachPrompt(makeContext({ timingHint: 'month_start' })).context).toContain('Timing:')
    expect(buildMintCoachPrompt(makeContext({ timingHint: null })).context).not.toContain('Timing:')
  })

  it('includes a PreviousCoachNote: line only when previousCoachSummary is set', () => {
    const withNote = makeContext({ previousCoachSummary: 'Yesterday you cooked at home.' })
    expect(buildMintCoachPrompt(withNote).context).toContain('PreviousCoachNote: Yesterday you cooked at home.')
    expect(buildMintCoachPrompt(makeContext()).context).not.toContain('PreviousCoachNote:')
  })

  it('message carries the format/voice constraints, not raw facts', () => {
    const { message } = buildMintCoachPrompt(makeContext())
    expect(message).toContain('80 words')
    expect(message).toMatch(/no headings/i)
    expect(message).toMatch(/no bold markdown/i)
    expect(message).toMatch(/exaggerated praise/i)
    expect(message).not.toContain('₹')   // no numbers baked into the instruction itself — those live only in context
  })

  it('message is identical regardless of context contents — only context varies per call', () => {
    const a = buildMintCoachPrompt(makeContext())
    const b = buildMintCoachPrompt(makeContext({ reflection: { done: true }, timingHint: 'month_start' }))
    expect(a.message).toBe(b.message)
  })

  it('is deterministic — same context produces the same output', () => {
    const ctx = makeContext({ mission: { calc: makeCalc(), streak: 2, difficulty: 'easy' } })
    expect(buildMintCoachPrompt(ctx)).toEqual(buildMintCoachPrompt(ctx))
  })
})
