import { useTheme } from '@/lib/theme-context'
import { iso } from '@/lib/utils'
import { HABIT_CATEGORY_META, DEFAULT_HABIT_CATEGORY_META } from '@/lib/habit-presets'
import type { Habit } from '@/types'

interface Props {
  habit: Habit
  onComplete: () => void
  onPause: () => void
}

// Streak-based frequencies show a day streak; weekly/monthly habits show completion
// count + rate instead — a "3-day streak" means nothing for a monthly "Invest ₹500" habit.
const STREAK_FREQUENCIES = new Set(['daily', 'weekdays', 'weekends', 'specific_days'])

// Compact row, not a full card — with several active habits due the same day, full-size
// cards like Mission/Reflection would make the page very long. Collapses to a done/paused
// line once acted on, same pattern Reflection already uses.
export function TodayHabitRow({ habit, onComplete, onPause }: Props) {
  const c = useTheme()
  const todayStr = iso(new Date())
  const meta = HABIT_CATEGORY_META[habit.category] ?? DEFAULT_HABIT_CATEGORY_META
  const actedToday = habit.last_evaluated_date === todayStr
  const completedToday = actedToday && habit.last_completed_date === todayStr

  const badge = STREAK_FREQUENCIES.has(habit.frequency)
    ? `${habit.current_streak} ${habit.current_streak === 1 ? 'day' : 'days'}`
    : (() => {
        const total = habit.total_completions + habit.total_paused + habit.total_missed
        const rate = total > 0 ? Math.round((habit.total_completions / total) * 100) : 0
        return `${habit.total_completions} completed · ${rate}%`
      })()

  return (
    <div style={{
      borderRadius: 14, padding: '10px 12px', background: c.surface,
      border: `1px solid ${c.faint}`, display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{habit.title}</div>
        <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{badge}</div>
      </div>

      {actedToday ? (
        <span style={{
          font: '700 11px Plus Jakarta Sans',
          color: completedToday ? c.good : c.muted,
          background: completedToday ? c.good + '18' : c.surface2,
          borderRadius: 99, padding: '4px 9px', flexShrink: 0,
        }}>
          {completedToday ? '✅ Completed' : '⏸ Paused'}
        </span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onPause}
            style={{ background: c.surface2, border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', font: '700 11px Plus Jakarta Sans', color: c.sub }}
          >
            Pause Today
          </button>
          <button
            onClick={onComplete}
            style={{ background: c.accent, border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', font: '700 11px Plus Jakarta Sans', color: '#fff' }}
          >
            Completed
          </button>
        </div>
      )}
    </div>
  )
}
