import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { iso } from '@/lib/utils'
import { MoneyPlantWatermark } from './MoneyPlantWatermark'
import { CreateHabitSheet } from './CreateHabitSheet'
import { HABIT_CATEGORY_META, DEFAULT_HABIT_CATEGORY_META, HABIT_FREQUENCY_OPTIONS } from '@/lib/habit-presets'
import type { AppState, Habit, HabitFrequency, HabitStatus } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  onAddHabit: (form: {
    title: string; category: string; preset_key: string | null; frequency: HabitFrequency
    days_of_week?: number[]; weekly_day?: number | null; monthly_day?: number | null
  }) => Promise<void>
  onSetHabitStatus: (habitId: string, status: HabitStatus) => Promise<void>
  onSwipeProgress?: (pct: number) => void
}

const FREQUENCY_LABEL: Record<HabitFrequency, string> = Object.fromEntries(
  HABIT_FREQUENCY_OPTIONS.map(o => [o.value, o.label])
) as Record<HabitFrequency, string>

function Stat({ label, value, c }: { label: string; value: string; c: ReturnType<typeof useTheme> }) {
  return (
    <div>
      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{value}</div>
      <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function HabitListItem({ habit, onSetHabitStatus, c }: { habit: Habit; onSetHabitStatus: Props['onSetHabitStatus']; c: ReturnType<typeof useTheme> }) {
  const meta = HABIT_CATEGORY_META[habit.category] ?? DEFAULT_HABIT_CATEGORY_META
  const total = habit.total_completions + habit.total_paused + habit.total_missed
  const rate = total > 0 ? Math.round((habit.total_completions / total) * 100) : null

  return (
    <div style={{ borderRadius: 16, padding: '14px 16px', background: c.surface, border: `1px solid ${c.faint}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{habit.title}</div>
          <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{FREQUENCY_LABEL[habit.frequency]}</div>
        </div>
        {habit.status === 'active' && (
          <button onClick={() => onSetHabitStatus(habit.id, 'on_hold')} style={{ background: c.surface2, border: 'none', borderRadius: 9, padding: '5px 9px', cursor: 'pointer', font: '700 11px Plus Jakarta Sans', color: c.sub, flexShrink: 0 }}>
            On Hold
          </button>
        )}
        {habit.status === 'on_hold' && (
          <button onClick={() => onSetHabitStatus(habit.id, 'active')} style={{ background: c.accent + '18', border: `1px solid ${c.accent}40`, borderRadius: 9, padding: '5px 9px', cursor: 'pointer', font: '700 11px Plus Jakarta Sans', color: c.accent, flexShrink: 0 }}>
            Resume
          </button>
        )}
        {habit.status === 'archived' && (
          <span style={{ font: '700 11px Plus Jakarta Sans', color: c.muted }}>Archived</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        <Stat label="Streak" value={`${habit.current_streak}d`} c={c} />
        <Stat label="Best" value={`${habit.best_streak}d`} c={c} />
        <Stat label="Completed" value={`${habit.total_completions}`} c={c} />
        {rate !== null && <Stat label="Rate" value={`${rate}%`} c={c} />}
      </div>
      {habit.status !== 'archived' && (
        <button
          onClick={() => onSetHabitStatus(habit.id, 'archived')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 0', font: '600 11px Plus Jakarta Sans', color: c.muted, textAlign: 'left' }}
        >
          Archive
        </button>
      )}
    </div>
  )
}

// Full-screen overlay following the PlantPage/GrowPage/AchievementsPage pattern.
export function HabitsPage({ open, onClose, state, onAddHabit, onSetHabitStatus, onSwipeProgress }: Props) {
  const c = useTheme()
  const [createOpen, setCreateOpen] = useState(false)

  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!open) { setClosing(false); setDragX(0); setEntryPlayed(false) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev; document.documentElement.style.overflow = prevHtml }
  }, [open])

  const triggerClose = () => {
    setClosing(true); onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx); setDragX(x); onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) triggerClose()
    else { setSnapping(true); setDragX(0); onSwipeProgress?.(0); setTimeout(() => setSnapping(false), 300) }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  if (!open) return null

  const todayStr = iso(new Date())
  const active = state.habits.filter(h => h.status === 'active')
  const todaysWins = active.filter(h => h.last_completed_date === todayStr)
  const onHold = state.habits.filter(h => h.status === 'on_hold')
  const archived = state.habits.filter(h => h.status === 'archived')
  const longestStreak = active.reduce((max, h) => Math.max(max, h.current_streak), 0)

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 200,
        overflowY: dragX > 0 ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        willChange: 'transform',
        ...(closing
          ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : dragX > 0
          ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
          : snapping
          ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : entryPlayed ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >
      <div style={{ position: 'fixed', top: 0, right: -30, width: 220, pointerEvents: 'none', zIndex: 0, opacity: 0.045, color: c.ink }}>
        <MoneyPlantWatermark />
      </div>

      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Habits</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
              {active.length} active · longest streak {longestStreak}d
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            style={{ background: c.accent, border: 'none', borderRadius: 999, width: 36, height: 36, cursor: 'pointer', color: '#fff', font: '800 18px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            +
          </button>
        </div>
      </div>

      {todaysWins.length > 0 && (
        <>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 20px 10px' }}>
            Today's Wins
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
            {todaysWins.map(h => <HabitListItem key={h.id} habit={h} onSetHabitStatus={onSetHabitStatus} c={c} />)}
          </div>
        </>
      )}

      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 20px 10px' }}>
        Active
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
        {active.length > 0 ? (
          active.map(h => <HabitListItem key={h.id} habit={h} onSetHabitStatus={onSetHabitStatus} c={c} />)
        ) : (
          <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: 0 }}>No habits yet — tap + to add your first one.</p>
        )}
      </div>

      {onHold.length > 0 && (
        <>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 20px 10px' }}>
            On Hold
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
            {onHold.map(h => <HabitListItem key={h.id} habit={h} onSetHabitStatus={onSetHabitStatus} c={c} />)}
          </div>
        </>
      )}

      {archived.length > 0 && (
        <>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 20px 10px' }}>
            Archived
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
            {archived.map(h => <HabitListItem key={h.id} habit={h} onSetHabitStatus={onSetHabitStatus} c={c} />)}
          </div>
        </>
      )}

      <div style={{ height: 'calc(40px + env(safe-area-inset-bottom, 0px))' }} />

      <CreateHabitSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={onAddHabit} />
    </div>
  )
}
