import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { Glyph } from './Glyph'
import { fmt, iso, TODAY } from '@/lib/utils'
import { GrowChallengeCard } from './GrowChallengeCard'
import { DailyReflectionSheet } from './DailyReflectionSheet'
import { MoneyPlantWatermark } from './MoneyPlantWatermark'
import { MintCoachCard } from './MintCoachCard'
import { TodaysBriefingCard } from './TodaysBriefingCard'
import { HealthScoreCard } from './HealthScoreCard'
import { TodayHabitRow } from './TodayHabitRow'
import { ACHIEVEMENTS } from '@/lib/achievement-definitions'
import { isHabitDueToday, type HabitSchedule } from '@/lib/habit-engine'
import type { AppState, DerivedMetrics, HabitCompletionStatus } from '@/types'
import type { ChallengeCalc } from '@/lib/challenge'
import type { DailyChallengeState } from '@/hooks/useDailyChallenge'
import type { GrowInsights } from '@/hooks/useGrowInsights'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  d: DerivedMetrics
  challenge: DailyChallengeState
  insights: GrowInsights
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  onOpenSalaryDateEdit: () => void
  onOpenPlant: () => void
  onOpenAchievements: () => void
  onOpenHabits: () => void
  onGoalContribution: (goalId: string, amount: number) => Promise<void>
  onRecordReflection: (todayStr: string) => Promise<void>
  onRecordHabitCompletion: (habitId: string, status: HabitCompletionStatus) => Promise<void>
  onOpenChat: (initialMessage: string) => void
  dark: boolean
  onToggleTheme: () => void
  userName: string
  userEmail: string
  synced: boolean
  onSignOut: () => void
  onSwipeProgress?: (pct: number) => void
}

const CONTINUE_CONVERSATION_PROMPT = "Can you explain today's coaching?"

const DUE_TODAY_DISPLAY_CAP = 3

const STAGE_LABELS = ['Seed', 'Sprout', 'First Leaves', 'Young Plant', 'Growing', 'Mature', 'Blooming']

function SeedlingIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12"/>
      <path d="M12 12C12 12 6 11 6 5s6-1 6 5z"/>
      <path d="M12 12c0 0 6 1 6-5s-6-1-6 5z"/>
    </svg>
  )
}

function StatusPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, borderRadius: 99, padding: '3px 9px',
      font: '700 11px Plus Jakarta Sans', color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function ProgressRow({ name, pill, c }: { name: string; pill: React.ReactNode; c: ReturnType<typeof useTheme> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{name}</span>
      {pill}
    </div>
  )
}

function SectionLabel({ children, c }: { children: React.ReactNode; c: ReturnType<typeof useTheme> }) {
  return (
    <div style={{
      font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase',
      letterSpacing: '0.06em', margin: '22px 20px 10px',
    }}>
      {children}
    </div>
  )
}

export function GrowPage({
  open, onClose, state, d, challenge, insights, onUpdateSettings, onOpenSalaryDateEdit, onOpenPlant, onOpenAchievements, onOpenHabits,
  onGoalContribution, onRecordReflection, onRecordHabitCompletion, onOpenChat,
  dark, onToggleTheme, userName, userEmail, synced, onSignOut, onSwipeProgress,
}: Props) {
  const c = useTheme()
  const settings = state.settings
  const { calc, enabled, difficulty, streak, remaining, progressPct, isOverTarget } = challenge
  const { coachText, coachFresh, briefing, healthScore, habitConsistencyPct } = insights

  // ── Swipe-back gesture — mirrors PlantPage.tsx exactly ──────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [reflectionOpen, setReflectionOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!open) { setClosing(false); setDragX(0); setEntryPlayed(false) }
  }, [open])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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

  const todayStr = iso(TODAY)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const initials = userName.split(' ').map((w: string) => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()

  const todaySpend = state.transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date === todayStr)
    .reduce((s, t) => s + t.amount, 0)
  const reflectedToday = settings.last_reflection_date === todayStr
  const todayContribution = state.goal_contributions
    .filter(gc => gc.source === 'daily_challenge' && gc.created_at?.slice(0, 10) === todayStr)
    .reduce((s, gc) => s + gc.amount, 0)

  const openReflect = () => {
    onRecordReflection(todayStr)
    setReflectionOpen(true)
  }

  const activeHabits = state.habits.filter(h => h.status === 'active')
  const dueTodayHabits = activeHabits
    .filter(h => isHabitDueToday(
      { frequency: h.frequency, weeklyDay: h.weekly_day, monthlyDay: h.monthly_day, daysOfWeek: h.days_of_week, snoozedUntil: h.snoozed_until } as HabitSchedule,
      TODAY,
    ))
    .sort((a, b) => b.current_streak - a.current_streak || a.created_date.localeCompare(b.created_date) || a.id.localeCompare(b.id))
  const habitsCompletedToday = dueTodayHabits.filter(h => h.last_completed_date === todayStr)
  const visibleDueTodayHabits = dueTodayHabits.slice(0, DUE_TODAY_DISPLAY_CAP)
  const extraDueTodayCount = dueTodayHabits.length - visibleDueTodayHabits.length

  const hasRecovery = !!calc && calc.recoveryAmount > 0
  const opportunityCount = 1 /* Mission */ + 1 /* Reflection */ + (hasRecovery ? 1 : 0) + dueTodayHabits.length
  const completedCount = (!isOverTarget ? 1 : 0) + (reflectedToday ? 1 : 0) + (hasRecovery ? (!isOverTarget ? 1 : 0) : 0) + habitsCompletedToday.length
  const heroProgressPct = opportunityCount > 0 ? Math.round((completedCount / opportunityCount) * 100) : 0
  const allDone = completedCount === opportunityCount

  const missionPill = isOverTarget
    ? <StatusPill label="Off Track" color={c.bad} bg={c.bad + '18'} />
    : <StatusPill label="On Track" color={c.good} bg={c.good + '18'} />
  const reflectionPill = reflectedToday
    ? <StatusPill label="Done" color={c.good} bg={c.good + '18'} />
    : <StatusPill label="Pending" color={c.warn} bg={c.warnSoft} />
  const recoveryPill = !hasRecovery
    ? <StatusPill label="Not Needed" color={c.muted} bg={c.surface2} />
    : missionPill

  const mostRecentUnlock = [...state.user_achievements].sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))[0]
  const mostRecentAchievement = mostRecentUnlock ? ACHIEVEMENTS.find(def => def.id === mostRecentUnlock.achievement_id) : undefined

  const plantColor = calc ? (
    calc.plantGrowth.milestone === 'blooming' ? '#E879F9'
    : calc.plantGrowth.milestone === 'mature'  ? '#34D399'
    : calc.plantGrowth.milestone === 'growing' ? '#34D399'
    : calc.plantGrowth.milestone === 'young'   ? c.good
    : calc.plantGrowth.milestone === 'first_leaf' ? c.good
    : calc.plantGrowth.milestone === 'sprout'  ? c.accent
    : c.muted
  ) : c.muted

  const cardStyle: React.CSSProperties = {
    borderRadius: 20, padding: 18, background: c.surface,
    border: `1px solid ${c.faint}`, boxShadow: c.cardShadow,
  }

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 100,
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
      {/* Page watermark */}
      <div style={{ position: 'fixed', top: 0, right: -30, width: 220, pointerEvents: 'none', zIndex: 0, opacity: 0.045, color: c.ink }}>
        <MoneyPlantWatermark />
      </div>

      {/* ── Sticky header ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Grow</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>Your daily home for financial habits</div>
          </div>
          <button onClick={onToggleTheme} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: `1px solid ${c.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Glyph name={dark ? 'sun' : 'moon'} color={c.ink} size={16} />
          </button>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(v => !v)} style={{ width: 36, height: 36, borderRadius: 999, background: c.accent, color: '#fff', font: '800 13px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer', position: 'relative' }}>
              {initials}
              <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: 999, background: synced ? '#22C55E' : '#F59E0B', border: `2px solid ${c.bg}` }} />
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 400, background: c.surface, borderRadius: 16, padding: '6px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: `1px solid ${c.faint}`, minWidth: 200 }}>
                <div style={{ padding: '10px 12px 8px' }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{userName}</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{userEmail}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: synced ? '#22C55E18' : '#F59E0B18', borderRadius: 999, padding: '3px 8px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: synced ? '#22C55E' : '#F59E0B', flexShrink: 0 }} />
                    <span style={{ font: '600 10px Plus Jakarta Sans', color: synced ? '#22C55E' : '#F59E0B' }}>{synced ? 'Synced with cloud' : 'Offline — local data'}</span>
                  </div>
                </div>
                <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />
                <button onClick={() => { setMenuOpen(false); onSignOut() }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', color: c.bad, font: '700 13px Plus Jakarta Sans', textAlign: 'left' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!enabled || !calc ? (
        /* ── Disabled state: keeps Grow useful from the first visit ──────────── */
        <div style={{ margin: '20px', ...cardStyle, textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <SeedlingIcon color={c.accent} size={32} />
          </div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Welcome to Grow</div>
          <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: '0 0 20px', lineHeight: 1.6 }}>
            Enable Daily Challenge to start building daily habits — a spending target, recovery coaching, and reflection, all in one place.
          </p>
          <button
            onClick={() => onUpdateSettings({ challenge_enabled: true })}
            style={{
              padding: '11px 28px', borderRadius: 12,
              background: c.accent, border: 'none', cursor: 'pointer',
              font: '700 14px Plus Jakarta Sans', color: '#fff',
            }}
          >
            Enable
          </button>
        </div>
      ) : (
        <>
          {/* ── Hero ──────────────────────────────────────────────────────────── */}
          <div style={{ padding: '20px 20px 0' }}>
            {allDone ? (
              <>
                <div style={{ font: '800 21px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
                  🌱 Great work!
                </div>
                <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: '4px 0 14px' }}>
                  Everything for today is complete. See you tomorrow.
                </p>
              </>
            ) : (
              <>
                <div style={{ font: '800 21px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
                  🌱 {greeting}, {userName}
                </div>
                <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: '4px 0 14px' }}>
                  Let's grow your money today. {opportunityCount} {opportunityCount === 1 ? 'opportunity' : 'opportunities'} to grow today.
                </p>
              </>
            )}

            {/* Unified progress — the chips below are supporting detail, not the headline */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>Today's Growth</span>
              <span style={{ font: '800 13px Plus Jakarta Sans', color: c.accent }}>{completedCount}/{opportunityCount}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: c.surface2, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${heroProgressPct}%`, background: c.good, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <ProgressRow name="Mission" pill={missionPill} c={c} />
              <ProgressRow name="Reflection" pill={reflectionPill} c={c} />
              <ProgressRow name="Recovery" pill={recoveryPill} c={c} />
            </div>
          </div>

          {/* ── Mint Coach + Today's Briefing — the first thing read after the greeting,
                 the answer to "what should I know today." Coach (when available)
                 synthesizes what matters; Briefing enumerates the ranked facts behind it.
                 Different jobs — Coach never repeats Briefing's items verbatim (see
                 mint-coach-prompt.ts), and the two are deliberately never merged. ── */}
          {(coachText || briefing.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 20px 0' }}>
              {coachText && (
                <MintCoachCard
                  text={coachText}
                  fresh={coachFresh}
                  onContinueConversation={() => onOpenChat(CONTINUE_CONVERSATION_PROMPT)}
                />
              )}
              <TodaysBriefingCard items={briefing} />
            </div>
          )}

          {/* ── Today's Growth ───────────────────────────────────────────────── */}
          <SectionLabel c={c}>Today's Growth</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px' }}>
            <GrowChallengeCard
              state={state} d={d} calc={calc} difficulty={difficulty} streak={streak}
              remaining={remaining} progressPct={progressPct} isOverTarget={isOverTarget}
              onUpdateSettings={onUpdateSettings} onOpenSalaryDateEdit={onOpenSalaryDateEdit}
            />

            {hasRecovery && (
              <div style={cardStyle}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.accent, marginBottom: 6 }}>Today's Opportunity</div>
                <p style={{ font: '500 13px Plus Jakarta Sans', color: c.ink, margin: 0, lineHeight: 1.6 }}>
                  Stay below {fmt(Math.round(calc.adjustedTarget))} today and you'll get back on track.
                </p>
                <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '4px 0 0' }}>
                  One good day puts you back on track.
                </p>
              </div>
            )}

            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Reflection</div>
                {reflectedToday && <StatusPill label="Completed today" color={c.good} bg={c.good + '18'} />}
              </div>
              {reflectedToday ? (
                <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: 0, lineHeight: 1.6 }}>
                  Nice work — today's reflection is done.
                  {todayContribution > 0 && <> Goal contribution: <strong style={{ color: c.ink }}>{fmt(todayContribution)}</strong>.</>}
                </p>
              ) : (
                <>
                  <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: '0 0 12px', lineHeight: 1.6 }}>
                    Today's spending so far: <strong style={{ color: c.ink }}>{fmt(todaySpend)}</strong>
                  </p>
                  <button
                    onClick={openReflect}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 12,
                      background: c.accent + '18', border: `1px solid ${c.accent}40`, cursor: 'pointer',
                      font: '700 13px Plus Jakarta Sans', color: c.accent,
                    }}
                  >
                    Reflect
                  </button>
                </>
              )}
            </div>

            {visibleDueTodayHabits.map(habit => (
              <TodayHabitRow
                key={habit.id}
                habit={habit}
                onComplete={() => onRecordHabitCompletion(habit.id, 'completed')}
                onPause={() => onRecordHabitCompletion(habit.id, 'paused')}
              />
            ))}
            {extraDueTodayCount > 0 && (
              <button
                onClick={onOpenHabits}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 2px 4px',
                  font: '700 12px Plus Jakarta Sans', color: c.accent, textAlign: 'left',
                }}
              >
                +{extraDueTodayCount} more · View All →
              </button>
            )}
          </div>

          {/* ── Growth ────────────────────────────────────────────────────────── */}
          <SectionLabel c={c}>Growth</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: calc.plantGrowth.nextGoal > 0 ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SeedlingIcon color={plantColor} size={18} />
                  <div>
                    <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{STAGE_LABELS[calc.plantGrowth.stageIdx]}</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                      {calc.plantGrowth.leaves} {calc.plantGrowth.leaves === 1 ? 'Leaf' : 'Leaves'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={onOpenPlant}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px',
                    font: '700 13px Plus Jakarta Sans', color: c.accent, flexShrink: 0,
                  }}
                >
                  View Plant →
                </button>
              </div>
              {calc.plantGrowth.nextGoal > 0 && calc.plantGrowth.stageIdx < STAGE_LABELS.length - 1 && (
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, background: c.surface2, borderRadius: 10, padding: '7px 10px' }}>
                  Next: <strong style={{ color: c.ink }}>{STAGE_LABELS[calc.plantGrowth.stageIdx + 1]}</strong> — {calc.plantGrowth.nextGoal} {calc.plantGrowth.nextGoal === 1 ? 'leaf' : 'leaves'} to grow
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>🔥 Streak</div>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                    {streak} {streak === 1 ? 'day' : 'days'}
                  </div>
                </div>
                {calc.successRate !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>Success Rate</div>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                      {calc.successRate}%
                      <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                        {' '}({settings.challenge_success_days ?? 0}/{settings.challenge_total_days ?? 0})
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {streak === 0 && (
                <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '8px 0 0' }}>
                  Complete today's mission to start your streak.
                </p>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>🏆 Achievements</div>
                <button
                  onClick={onOpenAchievements}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    font: '700 13px Plus Jakarta Sans', color: c.accent, flexShrink: 0,
                  }}
                >
                  View All →
                </button>
              </div>
              <p style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, margin: 0 }}>
                {mostRecentAchievement
                  ? <>Most recent: <strong style={{ color: c.ink }}>{mostRecentAchievement.title}</strong></>
                  : 'No badges yet — keep going!'}
              </p>
              <p style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, margin: '4px 0 0' }}>
                {state.user_achievements.length} / {ACHIEVEMENTS.length} unlocked
              </p>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>🌿 Habits</div>
                <button
                  onClick={onOpenHabits}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    font: '700 13px Plus Jakarta Sans', color: c.accent, flexShrink: 0,
                  }}
                >
                  {activeHabits.length > 0 ? 'View All →' : 'Get Started →'}
                </button>
              </div>
              {activeHabits.length > 0 ? (
                <>
                  <p style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, margin: 0 }}>
                    {activeHabits.length} active · {habitsCompletedToday.length} completed today
                  </p>
                  <p style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, margin: '4px 0 0' }}>
                    Longest streak {Math.max(0, ...activeHabits.map(h => h.current_streak))}d
                    {habitConsistencyPct != null && (
                      <> · {habitConsistencyPct}% consistency — last 30 days</>
                    )}
                  </p>
                </>
              ) : (
                <p style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, margin: 0 }}>
                  Build small recurring habits — skip a tea, cook at home, walk instead. No habits yet.
                </p>
              )}
            </div>

            <HealthScoreCard result={healthScore} />
          </div>
        </>
      )}

      <div style={{ height: 'calc(40px + env(safe-area-inset-bottom, 0px))' }} />

      <DailyReflectionSheet
        open={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        state={state}
        d={d}
        mode="today"
        onGoalContribution={onGoalContribution}
      />
    </div>
  )
}
