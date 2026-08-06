import type { AppState, DerivedMetrics } from '@/types'
import type { ChallengeCalc } from '@/lib/challenge'
import type { DailyChallengeState } from '@/hooks/useDailyChallenge'
import { generateMintSuggestions, type MintSuggestion } from '@/lib/mint-suggestions'
import { buildCashFlowForecast } from '@/lib/cashflow'
import { isHabitDueToday, type HabitSchedule } from '@/lib/habit-engine'
import { ACHIEVEMENTS } from '@/lib/achievement-definitions'
import { iso, addDays, TODAY } from '@/lib/utils'

const FORECAST_THRESHOLD = 500

export interface MintCoachContext {
  userName: string
  mission: { calc: ChallengeCalc; streak: number; difficulty: 'easy' | 'medium' | 'hard' } | null   // null when Daily Challenge disabled
  habits: { dueToday: number; completedToday: number; topStreak: number }  // 0s when no habits
  achievement: { title: string; unlockedToday: boolean } | null   // most recent unlock, and whether it's today's
  reflection: { done: boolean }
  topSuggestion: MintSuggestion | null   // generateMintSuggestions(state, d, calc)[0] — reused, not recomputed
  forecastEvent: { title: string; amount: number } | null   // tomorrow's known expense, same lookup Mint rule #6 uses
  timingHint: 'salary_tomorrow' | 'weekend_approaching' | 'month_start' | null   // first match wins
  previousCoachSummary: string | null   // yesterday's (or last-known) coach text, trimmed by the caller
}

function habitScheduleOf(h: AppState['habits'][number]): HabitSchedule {
  return {
    frequency: h.frequency,
    weeklyDay: h.weekly_day,
    monthlyDay: h.monthly_day,
    daysOfWeek: h.days_of_week,
    snoozedUntil: h.snoozed_until,
  }
}

function computeTimingHint(calc: ChallengeCalc | null): MintCoachContext['timingHint'] {
  // Priority order: an obligation due tomorrow outranks the weekend, which outranks a
  // generic "new month" nudge — the most actionable timing fact wins.
  if (calc) {
    const cycleDays = calc.daysRemaining
    // A same-day salary-cycle rollover reads as "salary tomorrow" only when the cycle
    // is genuinely about to reset — daysRemaining counts down to 0/1 on the day before.
    if (calc.planningMode === 'salary_cycle' && cycleDays === 1) return 'salary_tomorrow'
  }
  const day = TODAY.getDay()
  if (day === 5) return 'weekend_approaching'   // Friday
  if (TODAY.getDate() <= 3) return 'month_start'
  return null
}

export function buildMintCoachContext(
  state: AppState,
  d: DerivedMetrics,
  challenge: DailyChallengeState,
  streak: number,
  userName: string,
  previousCoachSummary: string | null,
): MintCoachContext {
  const todayStr = iso(TODAY)
  const calc = challenge.enabled ? challenge.calc : null

  const activeHabits = state.habits.filter(h => h.status === 'active')
  const dueToday = activeHabits.filter(h => isHabitDueToday(habitScheduleOf(h), TODAY))
  const habits = {
    dueToday: dueToday.length,
    completedToday: dueToday.filter(h => h.last_completed_date === todayStr).length,
    topStreak: activeHabits.reduce((max, h) => Math.max(max, h.current_streak), 0),
  }

  const mostRecentUnlock = [...state.user_achievements].sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))[0]
  const mostRecentDef = mostRecentUnlock ? ACHIEVEMENTS.find(def => def.id === mostRecentUnlock.achievement_id) : undefined
  const achievement = mostRecentUnlock && mostRecentDef
    ? { title: mostRecentDef.title, unlockedToday: mostRecentUnlock.unlocked_at.slice(0, 10) === todayStr }
    : null

  const topSuggestion = calc ? generateMintSuggestions(state, d, calc)[0] ?? null : null

  const tomorrowStr = iso(addDays(TODAY, 1))
  const forecast = buildCashFlowForecast(state, d)
  const tomorrowBill = forecast.projections.find(p =>
    p.event.date === tomorrowStr &&
    p.event.type === 'expense' &&
    p.event.source !== 'lifestyle' &&
    p.event.amount >= FORECAST_THRESHOLD
  )
  const forecastEvent = tomorrowBill ? { title: tomorrowBill.event.title, amount: tomorrowBill.event.amount } : null

  return {
    userName,
    mission: calc ? { calc, streak, difficulty: challenge.difficulty } : null,
    habits,
    achievement,
    reflection: { done: state.settings.last_reflection_date === todayStr },
    topSuggestion,
    forecastEvent,
    timingHint: computeTimingHint(calc),
    previousCoachSummary,
  }
}

// Small state fingerprint — GrowPage compares this (not just the date) against what's
// cached to decide whether today's coach text is still accurate. Deliberately narrow:
// only the facts that actually change Coach's narrative, not everything in AppState.
export function buildMintCoachFingerprint(ctx: MintCoachContext): string {
  const missionStatus = ctx.mission?.calc.status ?? 'disabled'
  const achievementId = ctx.achievement?.unlockedToday ? ctx.achievement.title : ''
  return `${missionStatus}|${ctx.reflection.done}|${ctx.habits.completedToday}|${achievementId}`
}
