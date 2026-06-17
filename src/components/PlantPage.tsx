import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import { Glyph } from './Glyph'
import { PlantSVG, STAGE_VIEWBOX, STAGE_THRESHOLDS, NEXT_STAGE_REWARDS } from './PlantSVG'
import { MoneyPlantWatermark } from './MoneyPlantWatermark'
import type { AppState } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  dark: boolean
  onToggleTheme: () => void
  userName: string
  userEmail: string
  synced: boolean
  onSignOut: () => void
  onSwipeProgress?: (pct: number) => void
}

const STAGE_LABELS_PLAIN = ['Seed', 'Sprout', 'First Leaves', 'Young Plant', 'Growing', 'Mature', 'Blooming']
const STAGE_LABELS_RICH  = ['🌰 Seed', '🌱 Sprout', '🍃 First Leaves', '🌿 Young Plant', '🪴 Growing', '🌳 Mature', '🌺 Blooming']
const STAGE_MESSAGES = [
  'Your MoneyPlant is waiting.\nComplete today\'s goal to sprout your first stem.',
  'Your first sprout emerged.\nKeep going to grow your first leaf.',
  'Your plant has its first leaves.\nConsistency is making it real.',
  'Young and establishing.\nYour plant is finding its shape.',
  'Growing strong.\nYour consistent habits are showing.',
  'Mature and flourishing.\nYou\'ve built real financial consistency.',
  'Blooming.\nYou\'ve grown your MoneyPlant.',
]

const PLANT_ANIM_STYLE = `
@keyframes plantEntry {
  from { opacity: 0; transform: scale(0.93) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
@keyframes fadeOutScale {
  0%   { opacity: 1; transform: scale(1)    translateY(0); }
  100% { opacity: 0; transform: scale(0.86) translateY(-10px); }
}
@keyframes plantGrowFrom {
  0%   { opacity: 0; transform: scale(0.72) translateY(18px); }
  55%  { transform: scale(1.06) translateY(-4px); }
  100% { opacity: 1; transform: scale(1)    translateY(0); }
}
@keyframes leafFloat {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);   }
  20%  { opacity: 1; transform: translateX(-50%) translateY(-12px) scale(1.1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-72px) scale(0.85); }
}
@keyframes celebFadeIn {
  from { opacity: 0; transform: scale(0.94) translateY(16px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
@keyframes bloomPulse {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.04); }
}
`

export function PlantPage({ open, onClose, state, dark, onToggleTheme, userName, userEmail, synced, onSignOut, onSwipeProgress }: Props) {
  const c = useTheme()
  const settings = state.settings

  // ── Swipe-back gesture ────────────────────────────────────────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const [plantAnimKey, setPlantAnimKey] = useState(0)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Compute stageIdx early so the celebration effect can read it
  const leaves     = settings.challenge_leaves ?? 0
  const stageIdx   = (() => {
    let idx = 0
    for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
      if (leaves >= STAGE_THRESHOLDS[i]) { idx = i; break }
    }
    return idx
  })()

  // ── Celebration / transition / float state ───────────────────────────────────
  const [celebrateStage, setCelebrateStage] = useState<number | null>(null)
  const [transitionFrom, setTransitionFrom] = useState<number | null>(null)
  const [floatLeavesCount, setFloatLeavesCount] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    try {
      // Stage-unlock celebration (fires once per stage)
      const celebrated = parseInt(localStorage.getItem('mp_plant_celebrated_stage') || '-1')
      if (stageIdx > celebrated && stageIdx > 0) {
        setCelebrateStage(stageIdx)
        localStorage.setItem('mp_plant_celebrated_stage', String(stageIdx))
      }

      // Stage transition animation
      const prevStage = parseInt(localStorage.getItem('mp_plant_prev_stage') || String(stageIdx))
      if (stageIdx > prevStage) {
        setTransitionFrom(prevStage)
        setTimeout(() => setTransitionFrom(null), 750)
      }
      localStorage.setItem('mp_plant_prev_stage', String(stageIdx))

      // Floating leaf reward (only when same stage, new leaves earned)
      const prevLeaves = parseInt(localStorage.getItem('mp_plant_last_leaves') || String(leaves))
      if (leaves > prevLeaves && stageIdx === prevStage) {
        setFloatLeavesCount(leaves - prevLeaves)
        setTimeout(() => setFloatLeavesCount(null), 2400)
      }
      localStorage.setItem('mp_plant_last_leaves', String(leaves))
    } catch { /* localStorage unavailable */ }
    setPlantAnimKey(k => k + 1)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!open) { setClosing(false); setDragX(0); dragXRef.current = 0; setEntryPlayed(false) }
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
    const x = Math.max(0, dx); dragXRef.current = x; setDragX(x); onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) triggerClose()
    else { setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0); setTimeout(() => setSnapping(false), 300) }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  if (!open) return null

  // ── Remaining plant data ──────────────────────────────────────────────────────
  const monthLeaves  = settings.challenge_month_leaves ?? 0
  const streak       = settings.challenge_streak       ?? 0
  const ageDays      = settings.challenge_total_days   ?? 0
  const pot          = settings.challenge_pot          ?? 0
  const enabled      = settings.challenge_enabled      ?? false
  const difficulty   = settings.challenge_difficulty   ?? 'medium'
  const calc         = enabled ? computeChallenge(state, difficulty) : null

  const nextGoal      = calc?.plantGrowth.nextGoal ?? 0
  const canGrowToday  = calc !== null && calc.status !== 'exceeded' && nextGoal > 0
  const ghostStage    = Math.min(6, stageIdx + 1) as 0|1|2|3|4|5|6
  const sharedViewBox = canGrowToday && stageIdx < 6 ? STAGE_VIEWBOX[ghostStage] : STAGE_VIEWBOX[stageIdx]
  const [,, vbW, vbH] = sharedViewBox.trim().split(/\s+/).map(Number)
  const plantAreaH = Math.round(320 * vbH / vbW) + 32

  const curThreshold  = STAGE_THRESHOLDS[stageIdx] ?? 0
  const nextThreshold = STAGE_THRESHOLDS[stageIdx + 1] ?? null
  const leavesInStage = leaves - curThreshold
  const stageSize     = nextThreshold !== null ? nextThreshold - curThreshold : 1
  const stageProgress = Math.min(1, leavesInStage / stageSize)

  const leavesIfSuccess = calc && calc.status !== 'exceeded'
    ? 2 + (streak + 1 === 7 ? 3 : streak + 1 === 30 ? 10 : streak + 1 === 90 ? 25 : 0)
    : 0

  const isMissed     = calc?.status === 'exceeded'
  const isOnTrack    = calc && !isMissed && calc.spentToday > 0 && calc.remaining >= 0
  const notStarted   = calc && !isMissed && calc.spentToday === 0
  const spendPct     = calc ? Math.min(100, Math.round((calc.spentToday / Math.max(1, calc.adjustedTarget)) * 100)) : 0

  const initials = userName.split(' ').map((w: string) => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()

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
      <style>{PLANT_ANIM_STYLE}</style>

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
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Your MoneyPlant</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{STAGE_LABELS_RICH[stageIdx]} · {leaves} {leaves === 1 ? 'leaf' : 'leaves'}</div>
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

      {/* ── Stage roadmap ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {STAGE_LABELS_PLAIN.map((label, i) => {
          const isPast = i < stageIdx; const isCurrent = i === stageIdx
          return (
            <div key={i} style={{
              padding: isCurrent ? '6px 14px' : '4px 10px', borderRadius: 99, flexShrink: 0,
              background: isCurrent ? c.accent : isPast ? c.good + '22' : c.surface2,
              border: `1.5px solid ${isCurrent ? c.accent : isPast ? c.good + '55' : c.faint}`,
              font: isCurrent ? '700 12px Plus Jakarta Sans' : '600 11px Plus Jakarta Sans',
              color: isCurrent ? '#fff' : isPast ? c.good : c.muted,
            }}>
              {isPast ? `✓ ${label}` : label}
            </div>
          )
        })}
      </div>

      {/* ── HERO: Plant (big, centered) ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 12px 0', position: 'relative', minHeight: plantAreaH }}>
        {/* Ghost preview of next stage — hide during transition */}
        {canGrowToday && stageIdx < 6 && transitionFrom === null && (
          <div style={{ position: 'absolute', top: 16, left: 12, right: 12 }}>
            <PlantSVG stageIdx={ghostStage} viewBoxOverride={sharedViewBox} opacity={0.13}
              style={{ maxWidth: 320, margin: '0 auto' }} />
          </div>
        )}

        {/* Old stage fading out during transition */}
        {transitionFrom !== null && (
          <div style={{ position: 'absolute', top: 16, left: 12, right: 12, zIndex: 1 }}>
            <PlantSVG stageIdx={transitionFrom as 0|1|2|3|4|5|6} viewBoxOverride={STAGE_VIEWBOX[stageIdx]}
              style={{ maxWidth: 320, margin: '0 auto', animation: 'fadeOutScale 0.5s ease forwards' }} />
          </div>
        )}

        {/* Current stage — normal entry or grow-from animation */}
        <div key={plantAnimKey} style={{
          width: '100%', maxWidth: 320, position: 'relative', zIndex: 2,
          animation: transitionFrom !== null
            ? 'plantGrowFrom 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.25s both'
            : 'plantEntry 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <PlantSVG stageIdx={stageIdx as 0|1|2|3|4|5|6} viewBoxOverride={sharedViewBox}
            style={{ maxWidth: 320, margin: '0 auto' }} />
        </div>

        {/* Floating leaf reward */}
        {floatLeavesCount !== null && (
          <div style={{
            position: 'absolute', top: '28%', left: '50%', zIndex: 5,
            font: '800 20px Plus Jakarta Sans', color: c.good,
            animation: 'leafFloat 2.4s ease forwards',
            pointerEvents: 'none', whiteSpace: 'nowrap',
            textShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
            +{floatLeavesCount} 🍃
          </div>
        )}
      </div>

      {/* ── Stage summary (compact, under plant) ──────────────────────────────── */}
      <div style={{ textAlign: 'center', padding: '10px 24px 0' }}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
          {STAGE_LABELS_RICH[stageIdx]}
        </div>
        <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
          Age: {ageDays} {ageDays === 1 ? 'day' : 'days'}
          {stageIdx < 6 && nextGoal > 0 && (
            <> · Next: {STAGE_LABELS_RICH[stageIdx + 1]} — {nextGoal} {nextGoal === 1 ? 'leaf' : 'leaves'} needed</>
          )}
          {stageIdx === 6 && <> · Fully bloomed</>}
        </div>
      </div>

      {/* ── Compact stats row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
        {[
          { label: 'Leaves', value: `${leaves}` },
          { label: 'Streak',  value: `${streak}d` },
          { label: 'Age',     value: `${ageDays}d` },
          { label: 'Month',   value: `+${monthLeaves}` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            flex: 1, background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 12,
            padding: '9px 0', textAlign: 'center',
          }}>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>{value}</div>
            <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Today's Opportunity ───────────────────────────────────────────────── */}
      {calc && (
        <div style={{ margin: '14px 20px 0', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 12 }}>Today's Opportunity</div>

          {isMissed ? (
            /* ── Missed: encouraging, not punishing ── */
            <>
              <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
                <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
                  Not a growth day
                </div>
                <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                  Tomorrow starts fresh.
                </div>
                {stageIdx < 6 && nextGoal > 0 && (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.accent, marginTop: 6 }}>
                    {nextGoal} {nextGoal === 1 ? 'leaf' : 'leaves'} away from {STAGE_LABELS_RICH[stageIdx + 1]}
                  </div>
                )}
              </div>
              {/* Collapsed numbers — visible but de-emphasised */}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                  Goal: {fmt(Math.round(calc.adjustedTarget))}
                </div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                  Spent: {fmt(Math.round(calc.spentToday))}
                </div>
              </div>
            </>
          ) : (
            /* ── On track / not started ── */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>Daily Goal</div>
                  <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(Math.round(calc.adjustedTarget))}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>Today's Spend</div>
                  <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(Math.round(calc.spentToday))}</div>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: c.surface2, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${spendPct}%`, background: isOnTrack ? c.good : c.accent, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>
                {notStarted
                  ? `Track your spending to stay within ${fmt(Math.round(calc.adjustedTarget))} today.`
                  : calc.remaining > 0
                  ? `Stay within ${fmt(Math.round(calc.remaining))} more today to earn your leaves.`
                  : 'Daily goal complete — great work today.'}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: c.good + '12', border: `1px solid ${c.good + '33'}`,
                borderRadius: 12, padding: '10px 14px',
              }}>
                <div>
                  <div style={{ font: '700 13px Plus Jakarta Sans', color: c.good }}>Complete today to earn</div>
                  {stageIdx < 6 && (
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                      Toward: {STAGE_LABELS_PLAIN[stageIdx + 1]}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'center', minWidth: 52 }}>
                  <div style={{ font: '800 20px Plus Jakarta Sans', color: c.good }}>+{leavesIfSuccess}</div>
                  <div style={{ font: '500 10px Plus Jakarta Sans', color: c.good, marginTop: 1 }}>{leavesIfSuccess === 1 ? 'leaf' : 'leaves'}</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Next Growth ───────────────────────────────────────────────────────── */}
      {stageIdx < 6 && nextThreshold !== null && (
        <div style={{ margin: '12px 20px 0', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Next Growth</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{STAGE_LABELS_RICH[stageIdx + 1]}</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>{nextGoal} {nextGoal === 1 ? 'leaf' : 'leaves'} away</div>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: c.surface2, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', borderRadius: 99, background: c.good, width: `${stageProgress * 100}%`, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>{NEXT_STAGE_REWARDS[stageIdx]}</div>
        </div>
      )}

      {/* ── Growth Journey ────────────────────────────────────────────────────── */}
      <div style={{ margin: '12px 20px 0', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px' }}>
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>Growth Journey</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {STAGE_LABELS_RICH.map((label, i) => {
            const isReached  = i < stageIdx
            const isCurrent  = i === stageIdx
            const threshold  = STAGE_THRESHOLDS[i]
            // leaves needed to ENTER this stage (not to leave it)
            const leavesNeeded = Math.max(0, threshold - leaves)

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
                {/* Connector line */}
                {i < STAGE_LABELS_RICH.length - 1 && (
                  <div style={{
                    position: 'absolute', left: 13, top: 26, width: 2, height: 24,
                    background: isReached ? c.good + '55' : c.faint,
                  }} />
                )}
                {/* Dot */}
                <div style={{
                  width: 28, height: 28, borderRadius: 999, flexShrink: 0, marginTop: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isReached ? c.good + '22' : isCurrent ? c.accent : c.surface2,
                  border: `2px solid ${isReached ? c.good : isCurrent ? c.accent : c.faint}`,
                }}>
                  {isReached
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : isCurrent
                    ? <div style={{ width: 8, height: 8, borderRadius: 999, background: c.accent }} />
                    : <div style={{ width: 6, height: 6, borderRadius: 999, background: c.faint }} />
                  }
                </div>
                {/* Label + detail */}
                <div style={{ flex: 1, paddingBottom: i < STAGE_LABELS_RICH.length - 1 ? 20 : 0 }}>
                  <div style={{ font: `${isCurrent ? '700' : '600'} 13px Plus Jakarta Sans`, color: isReached ? c.good : isCurrent ? c.ink : c.muted }}>
                    {label}
                  </div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                    {isReached
                      ? `Reached at ${threshold === 0 ? 'start' : `${threshold} ${threshold === 1 ? 'leaf' : 'leaves'}`}`
                      : isCurrent
                      ? `${leaves} ${leaves === 1 ? 'leaf' : 'leaves'} · current stage`
                      : leavesNeeded > 0
                      ? `${leavesNeeded} more ${leavesNeeded === 1 ? 'leaf' : 'leaves'} to unlock`
                      : 'Fully grown'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Challenge Impact */}
      {pot > 0 && (
        <div style={{ margin: '12px 20px 0', background: c.surface2, borderRadius: 14, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ font: '500 13px Plus Jakarta Sans', color: c.sub }}>Challenge Impact</span>
          <span style={{ font: '700 14px Plus Jakarta Sans', color: c.accent }}>{fmt(Math.round(pot))} below target</span>
        </div>
      )}

      <div style={{ height: 'calc(40px + env(safe-area-inset-bottom, 0px))' }} />

      {/* ── Stage-unlock celebration modal ────────────────────────────────────── */}
      {celebrateStage !== null && (
        celebrateStage === 6 ? (
          /* ── Blooming: full-screen special celebration ── */
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: `linear-gradient(160deg, #0f2414 0%, #1a3d20 50%, #2d5a1b 100%)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px 24px', overflow: 'hidden',
            animation: 'celebFadeIn 0.5s ease both',
          }}>
            {/* Background glow */}
            <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 300, height: 300, borderRadius: 999, background: '#16C98A', opacity: 0.08, filter: 'blur(60px)', pointerEvents: 'none' }} />

            <div style={{ font: '500 40px', marginBottom: 8, animation: 'bloomPulse 2s ease infinite' }}>🌺</div>
            <div style={{ font: '800 24px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 6 }}>
              Your MoneyPlant Has Bloomed
            </div>
            <div style={{ font: '500 14px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>
              You built a real habit. That's rare.
            </div>

            <div style={{ width: '100%', maxWidth: 200, marginBottom: 24, animation: 'plantEntry 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' }}>
              <PlantSVG stageIdx={6} style={{ maxWidth: 200, margin: '0 auto' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, width: '100%', maxWidth: 360, marginBottom: 28 }}>
              {[
                { label: 'Age', value: `${ageDays}d` },
                { label: 'Leaves', value: `${leaves}` },
                { label: 'Growth Days', value: `${settings.challenge_success_days ?? 0}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 8px', textAlign: 'center' }}>
                  <div style={{ font: '800 18px Plus Jakarta Sans', color: '#fff' }}>{value}</div>
                  <div style={{ font: '500 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setCelebrateStage(null)}
              style={{ width: '100%', maxWidth: 360, padding: '15px 0', borderRadius: 16, background: '#16C98A', border: 'none', cursor: 'pointer', font: '700 16px Plus Jakarta Sans', color: '#fff' }}
            >
              Keep Growing
            </button>
          </div>
        ) : (
          /* ── Regular stage unlock: bottom sheet ── */
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px' }}
            onClick={() => setCelebrateStage(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: c.surface, borderRadius: 24, padding: '28px 24px 24px', width: '100%', maxWidth: 400, animation: 'celebFadeIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both', textAlign: 'center' }}
            >
              <div style={{ font: '500 28px', marginBottom: 6 }}>🎉</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>New Growth!</div>
              <div style={{ font: '600 14px Plus Jakarta Sans', color: c.accent, marginBottom: 8 }}>{STAGE_LABELS_RICH[celebrateStage]}</div>
              <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
                {STAGE_MESSAGES[celebrateStage].split('\n')[0]}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{ width: 140 }}>
                  <PlantSVG stageIdx={celebrateStage as 0|1|2|3|4|5|6} style={{ maxWidth: 140, margin: '0 auto', animation: 'plantGrowFrom 0.7s cubic-bezier(0.34,1.56,0.64,1) both' }} />
                </div>
              </div>
              <button onClick={() => setCelebrateStage(null)} style={{ width: '100%', padding: '13px 0', borderRadius: 14, background: c.accent, border: 'none', cursor: 'pointer', font: '700 15px Plus Jakarta Sans', color: '#fff' }}>
                Keep Growing
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}
