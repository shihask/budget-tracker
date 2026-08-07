import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { MoneyPlantWatermark } from './MoneyPlantWatermark'
import { ACHIEVEMENTS, type AchievementCategory, type AchievementDefinition } from '@/lib/achievement-definitions'
import { calculateProgress } from '@/lib/achievement-engine'
import type { AppState } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  onSwipeProgress?: (pct: number) => void
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  budget: '🏆 Budget',
  growth: '🌱 Growth',
  savings: '💎 Savings',
  reflection: '🧠 Reflection',
  habits: '🌿 Habits',
}
const CATEGORY_ORDER: AchievementCategory[] = ['budget', 'growth', 'savings', 'reflection', 'habits']

function formatProgress(unit: string | undefined, current: number, target: number): string {
  if (unit === '₹') return `${fmt(current)} / ${fmt(target)}`
  return `${current} / ${target}${unit ? ` ${unit}` : ''}`
}

function BadgeCard({ def, state, unlockedAt, c }: { def: AchievementDefinition; state: AppState; unlockedAt: string | null; c: ReturnType<typeof useTheme> }) {
  const unlocked = unlockedAt !== null
  const secretLocked = !unlocked && def.visibility === 'secret'
  const progress = !unlocked && !secretLocked ? calculateProgress(def, state) : null

  return (
    <div style={{
      borderRadius: 16, padding: '12px 14px',
      background: unlocked ? c.surface : c.surface2,
      border: `1px solid ${unlocked ? c.faint : 'transparent'}`,
      opacity: unlocked ? 1 : 0.85,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, filter: unlocked ? 'none' : 'grayscale(1)' }}>
          {secretLocked ? '❓' : unlocked ? '🏆' : '🔒'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>
            {secretLocked ? 'Secret Achievement' : def.title}
          </div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
            {secretLocked ? 'Keep growing...' : def.description}
          </div>
        </div>
      </div>
      {unlocked && (
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.good, marginTop: 8 }}>
          Unlocked {new Date(unlockedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      )}
      {progress && !unlocked && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 5, borderRadius: 99, background: c.faint, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, (progress.current / progress.target) * 100)}%`, background: c.accent }} />
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.sub }}>
            {formatProgress(progress.unit, progress.current, progress.target)}
          </div>
        </div>
      )}
    </div>
  )
}

// Full-screen overlay following the PlantPage/GrowPage pattern (open/onClose, swipe-to-dismiss,
// sticky header, scroll-locked body). Badges are grouped by category, not a separate "secret"
// section — with only one secret badge in Phase 3, a dedicated section would be near-empty and
// duplicate its category slot; the mystery placeholder shows inline until it unlocks.
export function AchievementsPage({ open, onClose, state, onSwipeProgress }: Props) {
  const c = useTheme()

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

  const unlockedByAchievementId = new Map(state.user_achievements.map(a => [a.achievement_id, a.unlocked_at]))
  const recent = [...state.user_achievements]
    .sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))
    .slice(0, 3)
    .map(a => ACHIEVEMENTS.find(def => def.id === a.achievement_id))
    .filter((def): def is AchievementDefinition => !!def)

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
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Achievements</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
              {state.user_achievements.length} / {ACHIEVEMENTS.length} unlocked
            </div>
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 20px 10px' }}>
            Recent
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
            {recent.map(def => (
              <BadgeCard key={def.id} def={def} state={state} unlockedAt={unlockedByAchievementId.get(def.id) ?? null} c={c} />
            ))}
          </div>
        </>
      )}

      {CATEGORY_ORDER.map(category => (
        <div key={category}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '22px 20px 10px' }}>
            {CATEGORY_LABELS[category]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
            {ACHIEVEMENTS.filter(def => def.category === category).map(def => (
              <BadgeCard key={def.id} def={def} state={state} unlockedAt={unlockedByAchievementId.get(def.id) ?? null} c={c} />
            ))}
          </div>
        </div>
      ))}

      <div style={{ height: 'calc(40px + env(safe-area-inset-bottom, 0px))' }} />
    </div>
  )
}
