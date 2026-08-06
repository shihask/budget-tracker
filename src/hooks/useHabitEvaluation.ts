import { useEffect, useRef } from 'react'
import { computeHabitCatchUp, type HabitCounters, type HabitSchedule } from '@/lib/habit-engine'
import { iso, addDays, TODAY } from '@/lib/utils'
import type { Habit, HabitCompletion } from '@/types'

// Called once in App.tsx — same lesson as useDailyChallenge/useAchievements: one
// evaluation point, not hooked into every mutation site. Mirrors useDailyChallenge's
// evaluatePastDays shape (a habit not opened in a few days needs its skipped-over due
// days scored retroactively), but batches each habit's gap into one read + one write
// instead of one write per day.
export function useHabitEvaluation(
  habits: Habit[],
  applyHabitCatchUp: (habitId: string, missedDates: string[], finalCounters: HabitCounters, lastEvaluatedDate: string) => Promise<void>,
  fetchHabitCompletions: (habitId: string, sinceDate: string) => Promise<HabitCompletion[]>,
) {
  const evaluatingRef = useRef(false)

  useEffect(() => {
    if (evaluatingRef.current) return

    async function evaluate() {
      evaluatingRef.current = true
      const yesterdayStr = iso(addDays(TODAY, -1))

      for (const habit of habits) {
        // On-hold/archived habits have no due dates — nothing to evaluate.
        if (habit.status !== 'active') continue
        if (!habit.last_evaluated_date || habit.last_evaluated_date >= yesterdayStr) continue

        const gapStart = new Date(habit.last_evaluated_date)
        gapStart.setDate(gapStart.getDate() + 1)

        // One bounded read for the whole gap, not one query per day. Existing rows are
        // not expected here under normal operation (recordHabitCompletion always writes
        // "today" and closes the gap up to today as it does) — this is a defensive
        // check, not the common path: a day the user already marked is never
        // overwritten by this pass.
        const existing = await fetchHabitCompletions(habit.id, iso(gapStart))
        const existingDates = new Set(existing.map(c => c.date))

        const schedule: HabitSchedule = {
          frequency: habit.frequency,
          weeklyDay: habit.weekly_day,
          monthlyDay: habit.monthly_day,
          daysOfWeek: habit.days_of_week,
          snoozedUntil: habit.snoozed_until,
        }
        const initialCounters: HabitCounters = {
          streak: habit.current_streak,
          bestStreak: habit.best_streak,
          completions: habit.total_completions,
          paused: habit.total_paused,
          missed: habit.total_missed,
        }

        const { missedDates, counters } = computeHabitCatchUp(schedule, initialCounters, gapStart, new Date(yesterdayStr), existingDates)

        // Always advances last_evaluated_date to yesterday, even when nothing was due
        // in the gap (missedDates empty) — otherwise a habit with no due days in a long
        // window would be re-walked on every load instead of just once.
        await applyHabitCatchUp(habit.id, missedDates, counters, yesterdayStr)
      }

      evaluatingRef.current = false
    }

    evaluate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits])
}
