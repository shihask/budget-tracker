import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import type { AppState } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
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

const G1 = '#C5E8A0'   // lightest — newest growth
const G2 = '#8CC96A'
const G3 = '#5B9E4A'
const G4 = '#3D7A30'   // darkest — oldest growth

function PlantSVG({ stageIdx, opacity = 1, viewBoxOverride }: { stageIdx: number; opacity?: number; viewBoxOverride?: string }) {
  return (
    <svg viewBox={viewBoxOverride ?? STAGE_VIEWBOX[stageIdx]} style={{ opacity, display: 'block', width: '100%', maxWidth: 220, height: 'auto' }}>
      <Pot />

      {/* Stage 0 – Seed */}
      {stageIdx === 0 && (
        <ellipse cx="100" cy="242" rx="8" ry="5" fill="#7B5E2A" />
      )}

      {/* Stage 1 – Sprout (1–4 leaves) */}
      {stageIdx >= 1 && (
        <>
          <Stem topY={226} />
          <Leaf x={112} y={230} angle={-38} rx={10} ry={4.5} color={G1} />
        </>
      )}

      {/* Stage 2 – First Leaves (5–14 leaves) */}
      {stageIdx >= 2 && (
        <>
          <Stem topY={200} />
          <Leaf x={86} y={237} angle={40} rx={14} ry={6} color={G2} />
          <Leaf x={114} y={218} angle={-40} rx={14} ry={6} color={G2} />
          <Leaf x={108} y={200} angle={-22} rx={10} ry={4.5} color={G1} />
        </>
      )}

      {/* Stage 3 – Young Plant (15–29 leaves) */}
      {stageIdx >= 3 && (
        <>
          <Stem topY={168} bend={4} />
          <Leaf x={84} y={238} angle={42} rx={16} ry={6.5} color={G3} />
          <Leaf x={116} y={220} angle={-42} rx={16} ry={6.5} color={G3} />
          <Leaf x={83} y={198} angle={38} rx={14} ry={5.5} color={G2} />
          <Leaf x={117} y={180} angle={-38} rx={14} ry={5.5} color={G2} />
          <Leaf x={105} y={167} angle={-18} rx={10} ry={4} color={G1} />
        </>
      )}

      {/* Stage 4 – Growing (30–59 leaves) */}
      {stageIdx >= 4 && (
        <>
          <Stem topY={132} bend={5} />
          <Leaf x={82} y={238} angle={44} rx={17} ry={7} color={G4} />
          <Leaf x={118} y={220} angle={-44} rx={17} ry={7} color={G3} />
          <Leaf x={80} y={200} angle={40} rx={15} ry={6} color={G3} />
          <Leaf x={120} y={182} angle={-40} rx={15} ry={6} color={G2} />
          <Leaf x={82} y={162} angle={36} rx={14} ry={5.5} color={G2} />
          <Leaf x={118} y={145} angle={-36} rx={13} ry={5} color={G1} />
          <Leaf x={104} y={132} angle={-14} rx={10} ry={4} color={G1} />
        </>
      )}

      {/* Stage 5 – Mature (60–99 leaves) */}
      {stageIdx >= 5 && (
        <>
          <Stem topY={96} bend={6} />
          <path d="M100,175 C88,168 78,158 70,148" stroke="#4E7A40" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M100,148 C112,141 122,131 130,121" stroke="#4E7A40" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Leaf x={82} y={238} angle={44} rx={18} ry={7.5} color={G4} />
          <Leaf x={118} y={218} angle={-44} rx={18} ry={7.5} color={G4} />
          <Leaf x={79} y={198} angle={40} rx={16} ry={6.5} color={G3} />
          <Leaf x={121} y={178} angle={-40} rx={16} ry={6.5} color={G3} />
          <Leaf x={68} y={148} angle={50} rx={14} ry={5.5} color={G3} />
          <Leaf x={62} y={138} angle={40} rx={12} ry={5} color={G2} />
          <Leaf x={130} y={120} angle={-50} rx={14} ry={5.5} color={G2} />
          <Leaf x={82} y={155} angle={38} rx={14} ry={5.5} color={G2} />
          <Leaf x={118} y={135} angle={-38} rx={13} ry={5} color={G2} />
          <Leaf x={104} y={96} angle={-12} rx={10} ry={4} color={G1} />
        </>
      )}

      {/* Stage 6 – Blooming (100+ leaves) */}
      {stageIdx >= 6 && (
        <>
          <Stem topY={68} bend={6} />
          <path d="M100,110 C86,104 76,94 68,84" stroke="#4E7A40" strokeWidth="2" fill="none" strokeLinecap="round" />
          <Leaf x={82} y={238} angle={44} rx={18} ry={7.5} color={G4} />
          <Leaf x={118} y={218} angle={-44} rx={18} ry={7.5} color={G4} />
          <Leaf x={79} y={198} angle={40} rx={16} ry={6.5} color={G4} />
          <Leaf x={121} y={178} angle={-40} rx={16} ry={6.5} color={G3} />
          <Leaf x={68} y={148} angle={50} rx={14} ry={5.5} color={G3} />
          <Leaf x={62} y={138} angle={40} rx={12} ry={5} color={G3} />
          <Leaf x={130} y={120} angle={-50} rx={14} ry={5.5} color={G2} />
          <Leaf x={82} y={155} angle={38} rx={14} ry={5.5} color={G2} />
          <Leaf x={118} y={135} angle={-38} rx={13} ry={5} color={G2} />
          <Leaf x={66} y={84} angle={50} rx={13} ry={5} color={G2} />
          <Leaf x={104} y={68} angle={-12} rx={10} ry={4} color={G1} />
          {/* Flowers */}
          <circle cx="100" cy="58" r="8" fill="#FFD970" opacity="0.92" />
          <circle cx="88" cy="54" r="6" fill="#FFB347" opacity="0.85" />
          <circle cx="112" cy="56" r="6" fill="#FFD970" opacity="0.82" />
          <circle cx="100" cy="58" r="3.5" fill="#E07020" />
          <circle cx="88" cy="54" r="2.5" fill="#E07020" />
          <circle cx="112" cy="56" r="2.5" fill="#E07020" />
        </>
      )}
    </svg>
  )
}

// Crop viewBox per stage so seed/sprout don't leave a blank sky above them
const STAGE_VIEWBOX = [
  '30 228 140 70',    // 0 Seed        — pot only
  '30 210 140 88',    // 1 Sprout      — pot + short stem
  '22 185 156 118',   // 2 First Leaves
  '16 150 168 155',   // 3 Young Plant
  '12 115 176 190',   // 4 Growing
  ' 6  75 188 230',   // 5 Mature
  ' 6  45 188 260',   // 6 Blooming
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

export function PlantSheet({ open, onClose, state }: Props) {
  const c = useTheme()
  const settings = state.settings
  const touchStartY = useRef(0)
  const [dragDelta, setDragDelta] = useState(0)

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  // Swipe-down-to-close handlers (on drag handle only)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    setDragDelta(0)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const delta = Math.max(0, e.touches[0].clientY - touchStartY.current)
    setDragDelta(delta)
  }
  const onTouchEnd = () => {
    if (dragDelta > 80) onClose()
    setDragDelta(0)
  }

  const leaves       = settings.challenge_leaves       ?? 0
  const monthLeaves  = settings.challenge_month_leaves ?? 0
  const streak       = settings.challenge_streak       ?? 0
  const pot          = settings.challenge_pot          ?? 0
  const enabled      = settings.challenge_enabled      ?? false

  const difficulty = settings.challenge_difficulty ?? 'medium'
  const calc = enabled ? computeChallenge(state, difficulty) : null

  const stageIdx     = calc ? calc.plantGrowth.stageIdx : (() => {
    const ms = [0, 1, 5, 15, 30, 60, 100]
    let idx = 0
    for (let i = ms.length - 1; i >= 0; i--) { if (leaves >= ms[i]) { idx = i; break } }
    return idx
  })()

  const nextGoal     = calc?.plantGrowth.nextGoal ?? 0
  const canGrowToday = calc !== null && calc.status !== 'exceeded' && nextGoal > 0
  const ghostStage   = Math.min(6, stageIdx + 1) as 0|1|2|3|4|5|6

  // Shared viewBox for ghost preview — both current and ghost use the next stage's crop
  const sharedViewBox = canGrowToday && stageIdx < 6 ? STAGE_VIEWBOX[ghostStage] : STAGE_VIEWBOX[stageIdx]

  // Stage progress toward next milestone
  const curThreshold  = STAGE_THRESHOLDS[stageIdx] ?? 0
  const nextThreshold = STAGE_THRESHOLDS[stageIdx + 1] ?? null
  const leavesInStage = leaves - curThreshold
  const stageSize     = nextThreshold !== null ? nextThreshold - curThreshold : 1
  const stageProgress = Math.min(1, leavesInStage / stageSize)

  // Today's opportunity: how many leaves can be earned today
  const leavesIfSuccess = calc && calc.status !== 'exceeded' ? 2 + (streak + 1 === 7 ? 3 : streak + 1 === 30 ? 10 : streak + 1 === 90 ? 25 : 0) : 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: c.bg, overflowY: 'auto', overscrollBehavior: 'none',
        display: 'flex', flexDirection: 'column',
        transform: dragDelta > 0 ? `translateY(${dragDelta * 0.4}px)` : undefined,
        transition: dragDelta === 0 ? 'transform 0.25s ease' : undefined,
      }}
    >
      {/* Drag handle — swipe down here to close */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          paddingTop: 'env(safe-area-inset-top, 16px)',
          paddingBottom: 8,
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
          cursor: 'grab', background: c.bg,
          position: 'sticky', top: 0, zIndex: 2,
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 99, background: c.muted, opacity: 0.4 }} />
      </div>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 20px 0',
        position: 'sticky', top: 'calc(env(safe-area-inset-top, 16px) + 20px)', background: c.bg, zIndex: 1,
      }}>
        <span style={{ font: '700 18px Plus Jakarta Sans', color: c.ink }}>Your MoneyPlant</span>
        <button
          onClick={onClose}
          style={{
            background: c.surface2, border: 'none', cursor: 'pointer',
            borderRadius: 99, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sub} strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Stage roadmap — horizontal scrollable chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '12px 20px 0',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {STAGE_LABELS.map((label, i) => {
          const isPast    = i < stageIdx
          const isCurrent = i === stageIdx
          return (
            <div key={i} style={{
              padding: '4px 11px', borderRadius: 99, flexShrink: 0,
              background: isCurrent ? c.accent : isPast ? c.good + '22' : c.surface2,
              border: `1px solid ${isCurrent ? c.accent : isPast ? c.good + '55' : c.faint}`,
              font: '600 11px Plus Jakarta Sans',
              color: isCurrent ? '#fff' : isPast ? c.good : c.muted,
            }}>
              {isPast ? `✓ ${label}` : label}
            </div>
          )
        })}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 20px 0' }}>
        {[
          { label: 'Total Leaves', value: `${leaves}` },
          { label: 'Streak',       value: `${streak} days` },
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

      {/* Plant visualization — ghost and current share the same viewBox so they align */}
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

      {/* Next Growth — shows progress toward next milestone + reward */}
      {stageIdx < 6 && nextThreshold !== null && (
        <div style={{
          margin: '14px 20px 0', background: c.surface,
          border: `1px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px',
        }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Next Growth</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{STAGE_LABELS[stageIdx + 1]}</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
              {nextGoal} {nextGoal === 1 ? 'leaf' : 'leaves'} away
            </div>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: c.surface2, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%', borderRadius: 99, background: c.good,
              width: `${stageProgress * 100}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>
            {NEXT_STAGE_REWARDS[stageIdx]}
          </div>
        </div>
      )}

      {/* Today's Opportunity — remaining budget is the hero number */}
      {calc && calc.status !== 'exceeded' && leavesIfSuccess > 0 && (
        <div style={{
          margin: '16px 20px 0',
          background: c.surface, border: `1px solid ${c.faint}`,
          borderRadius: 16, padding: '14px 16px',
        }}>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>
            Today's Opportunity
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {calc.spentToday > 0 ? (
                <>
                  <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink }}>
                    {fmt(Math.max(0, Math.round(calc.remaining)))}
                  </div>
                  <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                    left in today's goal
                  </div>
                </>
              ) : (
                <>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.sub }}>
                    Nothing spent yet today
                  </div>
                  <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                    Goal: {fmt(Math.round(calc.adjustedTarget))}
                  </div>
                </>
              )}
            </div>
            <div style={{
              background: c.good + '18', border: `1px solid ${c.good}40`,
              borderRadius: 12, padding: '10px 14px', textAlign: 'center',
            }}>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.good }}>
                +{leavesIfSuccess}
              </div>
              <div style={{ font: '500 11px Plus Jakarta Sans', color: c.good, marginTop: 1 }}>
                {leavesIfSuccess === 1 ? 'leaf' : 'leaves'}
              </div>
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
        <div style={{
          margin: '12px 20px 0',
          background: c.surface2, borderRadius: 14, padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ font: '500 13px Plus Jakarta Sans', color: c.sub }}>Challenge Impact</span>
          <span style={{ font: '700 14px Plus Jakarta Sans', color: c.accent }}>
            {fmt(Math.round(pot))} below target
          </span>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  )
}
