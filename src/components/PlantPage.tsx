import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import { Glyph } from './Glyph'
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

// ── SVG plant: 7 stages ───────────────────────────────────────────────────────
interface LeafProps { x: number; y: number; angle: number; rx?: number; ry?: number; color: string }
function Leaf({ x, y, angle, rx = 15, ry = 6, color }: LeafProps) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${angle},${x},${y})`} fill={color} />
}

function Pot() {
  return (
    <>
      <path d="M73,252 L68,285 L132,285 L127,252 Z" fill="#B5581A" />
      <rect x="70" y="244" width="60" height="10" rx="5" fill="#D4784F" />
      <ellipse cx="100" cy="254" rx="27" ry="6" fill="#5C3C1E" />
    </>
  )
}

function Stem({ topY, bend = 0 }: { topY: number; bend?: number }) {
  const midY = (254 + topY) / 2
  return (
    <path
      d={`M100,254 C${100 + bend},${midY} ${100 - bend},${midY * 0.7 + topY * 0.3} 100,${topY}`}
      stroke="#4E7A40" strokeWidth="3.5" fill="none" strokeLinecap="round"
    />
  )
}

const G1 = '#C5E8A0'
const G2 = '#8CC96A'
const G3 = '#5B9E4A'
const G4 = '#3D7A30'

function PlantSVG({ stageIdx, opacity = 1, viewBoxOverride }: { stageIdx: number; opacity?: number; viewBoxOverride?: string }) {
  return (
    <svg viewBox={viewBoxOverride ?? STAGE_VIEWBOX[stageIdx]} style={{ opacity, display: 'block', width: '100%', maxWidth: 220, height: 'auto' }}>
      <Pot />
      {stageIdx === 0 && <ellipse cx="100" cy="242" rx="8" ry="5" fill="#7B5E2A" />}
      {stageIdx >= 1 && (<><Stem topY={226} /><Leaf x={112} y={230} angle={-38} rx={10} ry={4.5} color={G1} /></>)}
      {stageIdx >= 2 && (<><Stem topY={200} /><Leaf x={86} y={237} angle={40} rx={14} ry={6} color={G2} /><Leaf x={114} y={218} angle={-40} rx={14} ry={6} color={G2} /><Leaf x={108} y={200} angle={-22} rx={10} ry={4.5} color={G1} /></>)}
      {stageIdx >= 3 && (<><Stem topY={168} bend={4} /><Leaf x={84} y={238} angle={42} rx={16} ry={6.5} color={G3} /><Leaf x={116} y={220} angle={-42} rx={16} ry={6.5} color={G3} /><Leaf x={83} y={198} angle={38} rx={14} ry={5.5} color={G2} /><Leaf x={117} y={180} angle={-38} rx={14} ry={5.5} color={G2} /><Leaf x={105} y={167} angle={-18} rx={10} ry={4} color={G1} /></>)}
      {stageIdx >= 4 && (<><Stem topY={132} bend={5} /><Leaf x={82} y={238} angle={44} rx={17} ry={7} color={G4} /><Leaf x={118} y={220} angle={-44} rx={17} ry={7} color={G3} /><Leaf x={80} y={200} angle={40} rx={15} ry={6} color={G3} /><Leaf x={120} y={182} angle={-40} rx={15} ry={6} color={G2} /><Leaf x={82} y={162} angle={36} rx={14} ry={5.5} color={G2} /><Leaf x={118} y={145} angle={-36} rx={13} ry={5} color={G1} /><Leaf x={104} y={132} angle={-14} rx={10} ry={4} color={G1} /></>)}
      {stageIdx >= 5 && (<><Stem topY={96} bend={6} /><path d="M100,175 C88,168 78,158 70,148" stroke="#4E7A40" strokeWidth="2.5" fill="none" strokeLinecap="round" /><path d="M100,148 C112,141 122,131 130,121" stroke="#4E7A40" strokeWidth="2.5" fill="none" strokeLinecap="round" /><Leaf x={82} y={238} angle={44} rx={18} ry={7.5} color={G4} /><Leaf x={118} y={218} angle={-44} rx={18} ry={7.5} color={G4} /><Leaf x={79} y={198} angle={40} rx={16} ry={6.5} color={G3} /><Leaf x={121} y={178} angle={-40} rx={16} ry={6.5} color={G3} /><Leaf x={68} y={148} angle={50} rx={14} ry={5.5} color={G3} /><Leaf x={62} y={138} angle={40} rx={12} ry={5} color={G2} /><Leaf x={130} y={120} angle={-50} rx={14} ry={5.5} color={G2} /><Leaf x={82} y={155} angle={38} rx={14} ry={5.5} color={G2} /><Leaf x={118} y={135} angle={-38} rx={13} ry={5} color={G2} /><Leaf x={104} y={96} angle={-12} rx={10} ry={4} color={G1} /></>)}
      {stageIdx >= 6 && (<><Stem topY={68} bend={6} /><path d="M100,110 C86,104 76,94 68,84" stroke="#4E7A40" strokeWidth="2" fill="none" strokeLinecap="round" /><Leaf x={82} y={238} angle={44} rx={18} ry={7.5} color={G4} /><Leaf x={118} y={218} angle={-44} rx={18} ry={7.5} color={G4} /><Leaf x={79} y={198} angle={40} rx={16} ry={6.5} color={G4} /><Leaf x={121} y={178} angle={-40} rx={16} ry={6.5} color={G3} /><Leaf x={68} y={148} angle={50} rx={14} ry={5.5} color={G3} /><Leaf x={62} y={138} angle={40} rx={12} ry={5} color={G3} /><Leaf x={130} y={120} angle={-50} rx={14} ry={5.5} color={G2} /><Leaf x={82} y={155} angle={38} rx={14} ry={5.5} color={G2} /><Leaf x={118} y={135} angle={-38} rx={13} ry={5} color={G2} /><Leaf x={66} y={84} angle={50} rx={13} ry={5} color={G2} /><Leaf x={104} y={68} angle={-12} rx={10} ry={4} color={G1} /><circle cx="100" cy="58" r="8" fill="#FFD970" opacity="0.92" /><circle cx="88" cy="54" r="6" fill="#FFB347" opacity="0.85" /><circle cx="112" cy="56" r="6" fill="#FFD970" opacity="0.82" /><circle cx="100" cy="58" r="3.5" fill="#E07020" /><circle cx="88" cy="54" r="2.5" fill="#E07020" /><circle cx="112" cy="56" r="2.5" fill="#E07020" /></>)}
    </svg>
  )
}

const STAGE_VIEWBOX = [
  '30 228 140 70',
  '30 210 140 88',
  '22 185 156 118',
  '16 150 168 155',
  '12 115 176 190',
  ' 6  75 188 230',
  ' 6  45 188 260',
]

const STAGE_LABELS = ['Seed', 'Sprout', 'First Leaves', 'Young Plant', 'Growing', 'Mature', 'Blooming']
const STAGE_THRESHOLDS = [0, 1, 5, 15, 30, 60, 100]
const NEXT_STAGE_REWARDS = [
  'Your first stem will emerge from the soil.',
  'Your plant grows its first pair of leaves.',
  'New branches begin to form.',
  'Your plant grows taller and wider.',
  'Strong branches spread outward.',
  'Flowers bloom at the top.',
  '',
]
const STAGE_MESSAGES = [
  'Your MoneyPlant is waiting.\nComplete today\'s goal to sprout your first stem.',
  'Your first sprout emerged.\nKeep going to grow your first leaf.',
  'Your plant has its first leaves.\nConsistency is making it real.',
  'Young and establishing.\nYour plant is finding its shape.',
  'Growing strong.\nYour consistent habits are showing.',
  'Mature and flourishing.\nYou\'ve built real financial consistency.',
  'Blooming.\nYou\'ve grown your MoneyPlant.',
]

export function PlantPage({ open, onClose, state, dark, onToggleTheme, userName, userEmail, synced, onSignOut, onSwipeProgress }: Props) {
  const c = useTheme()
  const settings = state.settings

  // ── Swipe-back gesture ────────────────────────────────────────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    return () => {
      document.body.style.overflow = prev
      document.documentElement.style.overflow = prevHtml
    }
  }, [open])

  const triggerClose = () => {
    setClosing(true)
    onSwipeProgress?.(1)
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
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
    onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  if (!open) return null

  // ── Plant data ────────────────────────────────────────────────────────────────
  const leaves      = settings.challenge_leaves       ?? 0
  const monthLeaves = settings.challenge_month_leaves ?? 0
  const streak      = settings.challenge_streak       ?? 0
  const ageDays     = settings.challenge_total_days   ?? 0
  const pot         = settings.challenge_pot          ?? 0
  const enabled     = settings.challenge_enabled      ?? false

  const difficulty = settings.challenge_difficulty ?? 'medium'
  const calc = enabled ? computeChallenge(state, difficulty) : null

  const stageIdx = calc ? calc.plantGrowth.stageIdx : (() => {
    let idx = 0
    for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
      if (leaves >= STAGE_THRESHOLDS[i]) { idx = i; break }
    }
    return idx
  })()

  const nextGoal     = calc?.plantGrowth.nextGoal ?? 0
  const canGrowToday = calc !== null && calc.status !== 'exceeded' && nextGoal > 0
  const ghostStage   = Math.min(6, stageIdx + 1) as 0|1|2|3|4|5|6
  const sharedViewBox = canGrowToday && stageIdx < 6 ? STAGE_VIEWBOX[ghostStage] : STAGE_VIEWBOX[stageIdx]

  const curThreshold  = STAGE_THRESHOLDS[stageIdx] ?? 0
  const nextThreshold = STAGE_THRESHOLDS[stageIdx + 1] ?? null
  const leavesInStage = leaves - curThreshold
  const stageSize     = nextThreshold !== null ? nextThreshold - curThreshold : 1
  const stageProgress = Math.min(1, leavesInStage / stageSize)

  const leavesIfSuccess = calc && calc.status !== 'exceeded'
    ? 2 + (streak + 1 === 7 ? 3 : streak + 1 === 30 ? 10 : streak + 1 === 90 ? 25 : 0)
    : 0

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
          : entryPlayed
          ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Your MoneyPlant</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{STAGE_LABELS[stageIdx]} · {leaves} {leaves === 1 ? 'leaf' : 'leaves'}</div>
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

      {/* Stage roadmap */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 20px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {STAGE_LABELS.map((label, i) => {
          const isPast    = i < stageIdx
          const isCurrent = i === stageIdx
          return (
            <div key={i} style={{
              padding: isCurrent ? '6px 16px' : '4px 11px', borderRadius: 99, flexShrink: 0,
              background: isCurrent ? c.accent : isPast ? c.good + '22' : c.surface2,
              border: `1.5px solid ${isCurrent ? c.accent : isPast ? c.good + '55' : c.faint}`,
              font: isCurrent ? '700 13px Plus Jakarta Sans' : '600 11px Plus Jakarta Sans',
              color: isCurrent ? '#fff' : isPast ? c.good : c.muted,
            }}>
              {isPast ? `✓ ${label}` : label}
            </div>
          )
        })}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 20px 0' }}>
        {[
          { label: 'Total Leaves', value: `${leaves}` },
          { label: 'Streak',       value: `${streak} days` },
          { label: 'Age',          value: `${ageDays} days` },
          { label: 'This Month',   value: `+${monthLeaves}` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 14,
            padding: '10px 0', textAlign: 'center',
          }}>
            <div style={{ font: '700 17px Plus Jakarta Sans', color: c.ink }}>{value}</div>
            <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Plant visualization */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 50px 4px', position: 'relative' }}>
        {canGrowToday && stageIdx < 6 && (
          <div style={{ position: 'absolute', top: 20, left: 50, right: 50 }}>
            <PlantSVG stageIdx={ghostStage} viewBoxOverride={sharedViewBox} opacity={0.14} />
          </div>
        )}
        <PlantSVG stageIdx={stageIdx as 0|1|2|3|4|5|6} viewBoxOverride={sharedViewBox} opacity={1} />
      </div>

      {/* Stage message */}
      <div style={{ textAlign: 'center', padding: '4px 28px 0' }}>
        {STAGE_MESSAGES[stageIdx].split('\n').map((line, i) => (
          <div key={i} style={{
            font: i === 0 ? '600 14px Plus Jakarta Sans' : '500 13px Plus Jakarta Sans',
            color: i === 0 ? c.ink : c.muted,
            marginTop: i === 0 ? 0 : 3, lineHeight: 1.5,
          }}>{line}</div>
        ))}
        {canGrowToday && (
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.accent, marginTop: 6 }}>
            Complete today's challenge to grow a new leaf
          </div>
        )}
      </div>

      {/* Next Growth */}
      {stageIdx < 6 && nextThreshold !== null && (
        <div style={{ margin: '14px 20px 0', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Next Growth</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{STAGE_LABELS[stageIdx + 1]}</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>{nextGoal} {nextGoal === 1 ? 'leaf' : 'leaves'} away</div>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: c.surface2, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', borderRadius: 99, background: c.good, width: `${stageProgress * 100}%`, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>{NEXT_STAGE_REWARDS[stageIdx]}</div>
          {calc && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}`, font: '600 12px Plus Jakarta Sans', color: calc.status === 'exceeded' ? c.muted : c.accent }}>
              {calc.status === 'exceeded'
                ? `Try again tomorrow to grow toward ${STAGE_LABELS[stageIdx + 1]}.`
                : `Complete today's Daily Growth Goal to unlock ${STAGE_LABELS[stageIdx + 1]} tomorrow.`}
            </div>
          )}
        </div>
      )}

      {/* Today's Opportunity */}
      {calc && calc.status !== 'exceeded' && leavesIfSuccess > 0 && (
        <div style={{ margin: '16px 20px 0', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>Today's Opportunity</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {calc.spentToday > 0 ? (
                <>
                  <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink }}>{fmt(Math.max(0, Math.round(calc.remaining)))}</div>
                  <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>left in today's goal</div>
                </>
              ) : (
                <>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.sub }}>Nothing spent yet today</div>
                  <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Goal: {fmt(Math.round(calc.adjustedTarget))}</div>
                </>
              )}
            </div>
            <div style={{ background: c.good + '18', border: `1px solid ${c.good}40`, borderRadius: 12, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.good }}>+{leavesIfSuccess}</div>
              <div style={{ font: '500 11px Plus Jakarta Sans', color: c.good, marginTop: 1 }}>{leavesIfSuccess === 1 ? 'leaf' : 'leaves'}</div>
            </div>
          </div>
          {calc.spentToday > 0 && calc.remaining > 0 && (
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
              Stay within {fmt(Math.round(calc.remaining))} more today to earn your {leavesIfSuccess === 1 ? 'leaf' : 'leaves'}
            </div>
          )}
        </div>
      )}

      {/* Challenge Impact */}
      {pot > 0 && (
        <div style={{ margin: '12px 20px 0', background: c.surface2, borderRadius: 14, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ font: '500 13px Plus Jakarta Sans', color: c.sub }}>Challenge Impact</span>
          <span style={{ font: '700 14px Plus Jakarta Sans', color: c.accent }}>{fmt(Math.round(pot))} below target</span>
        </div>
      )}

      <div style={{ height: 'calc(40px + env(safe-area-inset-bottom, 0px))' }} />
    </div>
  )
}
