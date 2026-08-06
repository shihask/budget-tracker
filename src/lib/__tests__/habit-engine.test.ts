import { describe, it, expect } from 'vitest'
import { isHabitDueToday, computeHabitUpdate, computeHabitCatchUp, projectHabitState, type HabitSchedule, type HabitCounters } from '@/lib/habit-engine'
import { iso } from '@/lib/utils'
import type { Habit, HabitCompletionStatus } from '@/types'

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

// Known reference dates by weekday, chosen to be unambiguous under isHabitDueToday's
// local getDay() read regardless of what timezone the test runner is in.
const SUNDAY = new Date(2026, 0, 4) // 2026-01-04 is a Sunday
const MONDAY = new Date(2026, 0, 5)
const TUESDAY = new Date(2026, 0, 6)
const WEDNESDAY = new Date(2026, 0, 7)
const SATURDAY = new Date(2026, 0, 10)
const FEB_28_2026 = new Date(2026, 1, 28) // 2026 is not a leap year, Feb has 28 days
const APR_30 = new Date(2026, 3, 30)
const JAN_31 = new Date(2026, 0, 31)

describe('isHabitDueToday — daily/weekdays/weekends', () => {
  it('daily is always due', () => {
    for (const d of [SUNDAY, MONDAY, SATURDAY]) {
      expect(isHabitDueToday({ frequency: 'daily' }, d)).toBe(true)
    }
  })
  it('weekdays is due Mon-Fri, not Sat/Sun', () => {
    expect(isHabitDueToday({ frequency: 'weekdays' }, MONDAY)).toBe(true)
    expect(isHabitDueToday({ frequency: 'weekdays' }, WEDNESDAY)).toBe(true)
    expect(isHabitDueToday({ frequency: 'weekdays' }, SATURDAY)).toBe(false)
    expect(isHabitDueToday({ frequency: 'weekdays' }, SUNDAY)).toBe(false)
  })
  it('weekends is due Sat/Sun only', () => {
    expect(isHabitDueToday({ frequency: 'weekends' }, SATURDAY)).toBe(true)
    expect(isHabitDueToday({ frequency: 'weekends' }, SUNDAY)).toBe(true)
    expect(isHabitDueToday({ frequency: 'weekends' }, MONDAY)).toBe(false)
  })
})

describe('isHabitDueToday — specific_days honors per-habit daysOfWeek', () => {
  it('fires only on the configured days', () => {
    const schedule: HabitSchedule = { frequency: 'specific_days', daysOfWeek: [1, 3] } // Mon, Wed
    expect(isHabitDueToday(schedule, MONDAY)).toBe(true)
    expect(isHabitDueToday(schedule, WEDNESDAY)).toBe(true)
    expect(isHabitDueToday(schedule, TUESDAY)).toBe(false)
  })
  it('empty daysOfWeek never fires', () => {
    expect(isHabitDueToday({ frequency: 'specific_days', daysOfWeek: [] }, MONDAY)).toBe(false)
  })
})

describe('isHabitDueToday — weekly honors per-habit weeklyDay anchor', () => {
  it('fires only on the configured weekday, not the Monday default', () => {
    const fridayAnchor: HabitSchedule = { frequency: 'weekly', weeklyDay: 5 }
    const friday = new Date(2026, 0, 9)
    expect(isHabitDueToday(fridayAnchor, friday)).toBe(true)
    expect(isHabitDueToday(fridayAnchor, MONDAY)).toBe(false)
  })
  it('falls back to Monday when weeklyDay is not set', () => {
    expect(isHabitDueToday({ frequency: 'weekly' }, MONDAY)).toBe(true)
    expect(isHabitDueToday({ frequency: 'weekly' }, TUESDAY)).toBe(false)
  })
})

describe('isHabitDueToday — monthly honors per-habit monthlyDay anchor and clamps to shorter months', () => {
  it('fires on the configured day of month', () => {
    const schedule: HabitSchedule = { frequency: 'monthly', monthlyDay: 28 }
    expect(isHabitDueToday(schedule, FEB_28_2026)).toBe(true)
  })
  it('monthlyDay: 31 clamps to Feb 28 in a non-leap February', () => {
    const schedule: HabitSchedule = { frequency: 'monthly', monthlyDay: 31 }
    expect(isHabitDueToday(schedule, FEB_28_2026)).toBe(true)
    // and does not also fire earlier in the month
    expect(isHabitDueToday(schedule, new Date(2026, 1, 27))).toBe(false)
  })
  it('monthlyDay: 31 clamps to Apr 30 in a 30-day month', () => {
    const schedule: HabitSchedule = { frequency: 'monthly', monthlyDay: 31 }
    expect(isHabitDueToday(schedule, APR_30)).toBe(true)
  })
  it('monthlyDay: 31 fires normally in a 31-day month', () => {
    const schedule: HabitSchedule = { frequency: 'monthly', monthlyDay: 31 }
    expect(isHabitDueToday(schedule, JAN_31)).toBe(true)
  })
  it('falls back to the 1st when monthlyDay is not set', () => {
    expect(isHabitDueToday({ frequency: 'monthly' }, new Date(2026, 2, 1))).toBe(true)
    expect(isHabitDueToday({ frequency: 'monthly' }, new Date(2026, 2, 2))).toBe(false)
  })
})

describe('isHabitDueToday — snoozed_until suppresses an otherwise-due day', () => {
  it('suppresses when snoozedUntil is in the future relative to the checked date', () => {
    const schedule: HabitSchedule = { frequency: 'daily', snoozedUntil: '2026-01-10' }
    expect(isHabitDueToday(schedule, new Date(2026, 0, 6))).toBe(false)
  })
  it('does not suppress once the snooze date has passed', () => {
    const schedule: HabitSchedule = { frequency: 'daily', snoozedUntil: '2026-01-01' }
    expect(isHabitDueToday(schedule, new Date(2026, 0, 6))).toBe(true)
  })
})

describe('computeHabitUpdate', () => {
  const base: HabitCounters = { streak: 3, bestStreak: 5, completions: 10, paused: 2, missed: 1 }

  it('completed extends the streak and updates completions', () => {
    const next = computeHabitUpdate(base, 'completed')
    expect(next.streak).toBe(4)
    expect(next.completions).toBe(11)
    expect(next.paused).toBe(2)
    expect(next.missed).toBe(1)
  })
  it('completed raises bestStreak when the new streak exceeds it', () => {
    const next = computeHabitUpdate({ ...base, streak: 4, bestStreak: 5 }, 'completed')
    expect(next.streak).toBe(5)
    expect(next.bestStreak).toBe(5)
    const next2 = computeHabitUpdate(next, 'completed')
    expect(next2.streak).toBe(6)
    expect(next2.bestStreak).toBe(6)
  })
  it('paused breaks the streak, increments paused not missed', () => {
    const next = computeHabitUpdate(base, 'paused')
    expect(next.streak).toBe(0)
    expect(next.paused).toBe(3)
    expect(next.missed).toBe(1)
    expect(next.completions).toBe(10)
  })
  it('missed breaks the streak, increments missed not paused', () => {
    const next = computeHabitUpdate(base, 'missed')
    expect(next.streak).toBe(0)
    expect(next.missed).toBe(2)
    expect(next.paused).toBe(2)
  })
  it('bestStreak never decreases when the streak resets', () => {
    const next = computeHabitUpdate({ ...base, streak: 10, bestStreak: 10 }, 'missed')
    expect(next.streak).toBe(0)
    expect(next.bestStreak).toBe(10)
  })
})

describe('computeHabitUpdate — contract invariants', () => {
  const statuses: HabitCompletionStatus[] = ['completed', 'paused', 'missed']
  const fixtures: HabitCounters[] = [
    { streak: 0, bestStreak: 0, completions: 0, paused: 0, missed: 0 },
    { streak: 5, bestStreak: 5, completions: 5, paused: 0, missed: 0 },
    { streak: 0, bestStreak: 12, completions: 20, paused: 5, missed: 3 },
    { streak: 29, bestStreak: 30, completions: 100, paused: 10, missed: 8 },
  ]

  it.each(fixtures.flatMap(f => statuses.map(s => [f, s] as const)))(
    'streak >= 0, bestStreak >= streak, counters never decrease, deterministic — fixture %j status %s',
    (current, status) => {
      const result = computeHabitUpdate(current, status)
      expect(result.streak).toBeGreaterThanOrEqual(0)
      expect(result.bestStreak).toBeGreaterThanOrEqual(result.streak)
      expect(result.bestStreak).toBeGreaterThanOrEqual(current.bestStreak)
      expect(result.completions).toBeGreaterThanOrEqual(current.completions)
      expect(result.paused).toBeGreaterThanOrEqual(current.paused)
      expect(result.missed).toBeGreaterThanOrEqual(current.missed)

      // determinism — same inputs, same outputs
      const result2 = computeHabitUpdate(current, status)
      expect(result2).toEqual(result)
    },
  )
})

describe('computeHabitCatchUp — lazy evaluation gap-walking', () => {
  const ZERO: HabitCounters = { streak: 0, bestStreak: 0, completions: 0, paused: 0, missed: 0 }

  it('inserts missed rows only for actually-due days, not every calendar day', () => {
    // A weekdays-only habit over a gap that includes a weekend — Sat/Sun must not be
    // marked missed even though they fall inside the gap.
    const thu = new Date(2026, 0, 8), fri = new Date(2026, 0, 9), mon = new Date(2026, 0, 12)
    const schedule: HabitSchedule = { frequency: 'weekdays' }
    const { missedDates, counters } = computeHabitCatchUp(schedule, ZERO, thu, mon, new Set())

    expect(missedDates).toEqual([iso(thu), iso(fri), iso(mon)])
    expect(counters.missed).toBe(3)
    expect(counters.streak).toBe(0)
  })

  it('a day already present in existingDates is never overwritten (immutability holds)', () => {
    const day1 = new Date(2026, 0, 5), day2 = new Date(2026, 0, 6), day3 = new Date(2026, 0, 7)
    const schedule: HabitSchedule = { frequency: 'daily' }
    // day2 was already recorded by the user (completed or paused) — the catch-up pass
    // must skip it, not double-count it as missed.
    const existing = new Set([iso(day2)])
    const { missedDates, counters } = computeHabitCatchUp(schedule, ZERO, day1, day3, existing)

    expect(missedDates).toEqual([iso(day1), iso(day3)])
    expect(counters.missed).toBe(2)
  })

  it('a multi-day gap with nothing due produces no missed rows and does not touch counters', () => {
    const schedule: HabitSchedule = { frequency: 'weekends' }
    const gapStart = new Date(2026, 0, 5) // Monday
    const yesterday = new Date(2026, 0, 9) // Friday
    const { missedDates, counters } = computeHabitCatchUp(schedule, { ...ZERO, streak: 4, bestStreak: 4 }, gapStart, yesterday, new Set())

    expect(missedDates).toEqual([])
    expect(counters).toEqual({ streak: 4, bestStreak: 4, completions: 0, paused: 0, missed: 0 })
  })

  it('is deterministic — same inputs produce the same output', () => {
    const schedule: HabitSchedule = { frequency: 'daily' }
    const gapStart = new Date(2026, 0, 1)
    const yesterday = new Date(2026, 0, 5)
    const r1 = computeHabitCatchUp(schedule, ZERO, gapStart, yesterday, new Set(['2026-01-03']))
    const r2 = computeHabitCatchUp(schedule, ZERO, gapStart, yesterday, new Set(['2026-01-03']))
    expect(r1).toEqual(r2)
  })
})

describe('projectHabitState', () => {
  it('dueToday is false for a non-active habit even on an otherwise-due day', () => {
    const habit = makeHabit({ status: 'on_hold', frequency: 'daily' })
    expect(projectHabitState(habit, MONDAY).dueToday).toBe(false)
  })
  it('dueToday reflects the schedule for an active habit', () => {
    const habit = makeHabit({ status: 'active', frequency: 'weekends' })
    expect(projectHabitState(habit, SATURDAY).dueToday).toBe(true)
    expect(projectHabitState(habit, MONDAY).dueToday).toBe(false)
  })
  it('completedToday is true only when last_completed_date matches the given day', () => {
    // Built via iso() rather than a hand-typed literal — projectHabitState itself
    // compares against iso(today), so the fixture needs to agree with whatever
    // UTC-offset behavior iso() has on the machine running the test.
    const habit = makeHabit({ last_completed_date: iso(MONDAY) })
    expect(projectHabitState(habit, MONDAY).completedToday).toBe(true)
    expect(projectHabitState(habit, TUESDAY).completedToday).toBe(false)
  })
  it('lifetimeCompletionRate is null when nothing has ever been tracked', () => {
    const habit = makeHabit({ total_completions: 0, total_paused: 0, total_missed: 0 })
    expect(projectHabitState(habit, MONDAY).lifetimeCompletionRate).toBeNull()
  })
  it('lifetimeCompletionRate is completions / (completions + paused + missed)', () => {
    const habit = makeHabit({ total_completions: 6, total_paused: 2, total_missed: 2 })
    expect(projectHabitState(habit, MONDAY).lifetimeCompletionRate).toBe(0.6)
  })
})
