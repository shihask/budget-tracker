import { iso } from '@/lib/utils'
import type { Habit, HabitFrequency, HabitStatus, HabitCompletionStatus } from '@/types'

// Habit Engine Contract (enforced by src/lib/__tests__/habit-engine.test.ts, not just
// documented here):
//   - Deterministic — same inputs, same outputs, every call.
//   - No side effects — reads only what's passed in, never touches Supabase/localStorage.
//   - Evaluation order independent — scoring day N doesn't need to know about day N+1.
//   - streak >= 0 always; bestStreak >= streak always; counters never decrease.
//   - isHabitDueToday is timezone-safe — works off calendar-day strings/Date fields
//     consistently, never an implicit local-vs-UTC comparison.
//   - Idempotent — evaluating the same day twice never double-applies; guaranteed by the
//     immutability rule below, not a separate mechanism.
//   - One completion row per habit per day, ever — completion status is immutable once
//     recorded. No "change my answer" UI; correcting a mistake is a delete-and-recreate,
//     developer-tool-only operation, not a user-facing edit path. This is what keeps the
//     whole engine simple: no update-conflict handling, no "was this already answered
//     differently" branching anywhere.
//
// Dependency direction: this file never imports anything from the achievement system.
// The only cross-system dependency is Achievements -> Habits (achievement conditions
// read state.habits) — never the reverse.

export interface HabitSchedule {
  frequency: HabitFrequency
  weeklyDay?: number | null
  monthlyDay?: number | null
  daysOfWeek?: number[]
  snoozedUntil?: string | null
}

export function isHabitDueToday(schedule: HabitSchedule, date: Date): boolean {
  const todayStr = iso(date)
  if (schedule.snoozedUntil && schedule.snoozedUntil > todayStr) return false // reserved field, unused by any UI yet

  const day = date.getDay() // 0=Sun..6=Sat, native JS convention, no conversion needed
  switch (schedule.frequency) {
    case 'daily': return true
    case 'weekdays': return day >= 1 && day <= 5
    case 'weekends': return day === 0 || day === 6
    case 'specific_days': return (schedule.daysOfWeek ?? []).includes(day)
    case 'weekly': return day === (schedule.weeklyDay ?? 1) // per-habit anchor, Monday only as a defensive default
    case 'monthly': {
      const anchor = schedule.monthlyDay ?? 1 // per-habit anchor, 1st only as a defensive default
      // Clamp to the month's last real day — a monthlyDay: 31 habit fires on Feb 28,
      // Apr 30, etc. rather than silently never firing in shorter months.
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
      return date.getDate() === Math.min(anchor, lastDayOfMonth)
    }
  }
}

export interface HabitCounters {
  streak: number
  bestStreak: number
  completions: number
  paused: number
  missed: number
}

export function computeHabitUpdate(current: HabitCounters, status: HabitCompletionStatus): HabitCounters {
  const streak = status === 'completed' ? current.streak + 1 : 0
  return {
    streak,
    bestStreak: Math.max(current.bestStreak, streak),
    completions: current.completions + (status === 'completed' ? 1 : 0),
    paused: current.paused + (status === 'paused' ? 1 : 0),
    missed: current.missed + (status === 'missed' ? 1 : 0),
  }
}

export interface HabitCatchUpResult {
  missedDates: string[]
  counters: HabitCounters
}

// Walks [gapStart, yesterday] inclusive, marking each actually-due day that has no
// existing completion row as missed. Pure — useHabitEvaluation.ts supplies the
// already-fetched existing-dates set and performs the actual write; this function only
// computes what the write should contain. Never overwrites a day already present in
// existingDates (immutability holds for the catch-up pass too, not just same-day writes).
export function computeHabitCatchUp(
  schedule: HabitSchedule,
  initialCounters: HabitCounters,
  gapStart: Date,
  yesterday: Date,
  existingDates: Set<string>,
): HabitCatchUpResult {
  const missedDates: string[] = []
  let counters = initialCounters
  const cursor = new Date(gapStart)
  while (cursor <= yesterday) {
    const dateStr = iso(cursor)
    if (isHabitDueToday(schedule, cursor) && !existingDates.has(dateStr)) {
      missedDates.push(dateStr)
      counters = computeHabitUpdate(counters, 'missed')
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return { missedDates, counters }
}

export interface HabitProjection {
  dueToday: boolean
  completedToday: boolean
  currentStreak: number
  bestStreak: number
  lifetimeCompletionRate: number | null // null until there's at least one tracked day
  status: HabitStatus
}

// Single source of truth for "what does this habit look like right now" — every UI
// surface (TodayHabitRow, the Growth summary card, HabitsPage) reads this instead of
// each recomputing its own view of the same counters. Lifetime-only (from the habit's
// own running counters) — the 30-day windowed completion % is a separate, on-demand
// concern (needs a bounded Supabase query this function, being pure, can't make).
export function projectHabitState(habit: Habit, today: Date): HabitProjection {
  const schedule: HabitSchedule = {
    frequency: habit.frequency,
    weeklyDay: habit.weekly_day,
    monthlyDay: habit.monthly_day,
    daysOfWeek: habit.days_of_week,
    snoozedUntil: habit.snoozed_until,
  }
  const dueToday = habit.status === 'active' && isHabitDueToday(schedule, today)
  const completedToday = habit.last_completed_date === iso(today)
  const totalTracked = habit.total_completions + habit.total_paused + habit.total_missed
  const lifetimeCompletionRate = totalTracked > 0 ? habit.total_completions / totalTracked : null

  return {
    dueToday,
    completedToday,
    currentStreak: habit.current_streak,
    bestStreak: habit.best_streak,
    lifetimeCompletionRate,
    status: habit.status,
  }
}
