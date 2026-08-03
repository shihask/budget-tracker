import { useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft, type ToneKey } from '@/lib/tokens'
import { fmt } from '@/lib/utils'
import type { AppState, DerivedMetrics } from '@/types'
import { computeStrategyData } from '@/lib/budget-strategy'

export { STRATEGY_PRESETS, getStrategyPcts, getAutoBucket, getCategoryBucket } from '@/lib/budget-strategy'

interface BudgetStrategyCardProps {
  state: AppState
  d: DerivedMetrics
  onOpenSettings?: () => void
}

export function useStrategyData(state: AppState, d: DerivedMetrics) {
  return useMemo(() => computeStrategyData(state, d), [state, d])
}

type Tone = Extract<ToneKey, 'good' | 'warn' | 'bad'>

// Needs/Wants are ceiling metrics — target is a "don't exceed". Same 80/50
// cut points the badges already used for color; this just names the bands.
function ceilingStatus(score: number): { label: string; tone: Tone } {
  if (score >= 100) return { label: 'On Track', tone: 'good' }
  if (score >= 80) return { label: 'Watch', tone: 'warn' }
  if (score >= 50) return { label: 'Over Budget', tone: 'warn' }
  return { label: 'Critical', tone: 'bad' }
}

// Savings is a floor metric — target is a "reach this".
function floorStatus(score: number): { label: string; tone: Tone } {
  if (score >= 100) return { label: 'Target Reached', tone: 'good' }
  if (score >= 80) return { label: 'Near Target', tone: 'good' }
  if (score >= 50) return { label: 'Behind Target', tone: 'warn' }
  return { label: 'Behind Target', tone: 'bad' }
}

function overallStatus(score: number): { label: string; tone: Tone } {
  if (score >= 80) return { label: 'Budget On Track', tone: 'good' }
  if (score >= 50) return { label: 'Needs Attention', tone: 'warn' }
  return { label: 'Off Track', tone: 'bad' }
}

function StatusIcon({ tone, color }: { tone: Tone; color: string }) {
  const common = {
    viewBox: '0 0 24 24', width: 11, height: 11, fill: 'none', stroke: color,
    strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (tone === 'good') return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>
  if (tone === 'warn') return (
    <svg {...common}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

interface BucketRowProps {
  label: string
  actual: number
  target: number
  color: string
  kind: 'ceiling' | 'floor'
  score: number
}

function BucketRow({ label, actual, target, color, kind, score }: BucketRowProps) {
  const c = useTheme()
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
  const over = actual > target
  const barColor = over ? c.bad : color
  const stat = kind === 'ceiling' ? ceilingStatus(score) : floorStatus(score)
  const statColor = toneColor(c, stat.tone)

  const primaryLabel = kind === 'ceiling' ? 'Spent' : 'Saved'
  const secondaryLabel = over
    ? (kind === 'ceiling' ? 'Over by' : 'Surplus')
    : (kind === 'ceiling' ? 'Available' : 'Remaining Target')
  const secondaryAmount = Math.abs(target - actual)

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 12.5px Plus Jakarta Sans', color: c.ink }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          {label}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, font: '700 12px Plus Jakarta Sans', color: statColor }}>
            <StatusIcon tone={stat.tone} color={statColor} />
            {stat.label}
          </span>
          {kind === 'floor' && (
            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>{Math.round(score)}%</span>
          )}
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: c.faint, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          background: barColor,
          width: `${Math.min(100, pct)}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ font: '600 9.5px Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.05em', color: c.muted }}>
            {primaryLabel}
          </span>
          <span style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink }}>{fmt(actual)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end', textAlign: 'right' }}>
          <span style={{ font: '600 9.5px Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.05em', color: c.muted }}>
            {secondaryLabel}
          </span>
          <span style={{ font: '700 13.5px Plus Jakarta Sans', color: over ? c.bad : c.ink }}>
            {fmt(secondaryAmount)}{!over && ' left'}
          </span>
          <span style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>of {fmt(target)}</span>
        </div>
      </div>
    </div>
  )
}

type BucketKey = 'needs' | 'wants' | 'savings'

// Presentation-only: reads the scores/actuals/targets StrategyData already computed.
// Does not call the forecast engine or spending history — that's a separate future phase.
function getSmartMove(
  needsScore: number, wantsScore: number, savingsScore: number,
  actuals: Record<BucketKey, number>, targets: Record<BucketKey, number>,
): { text: string; tone: Tone } {
  const scores: [BucketKey, number][] = [['needs', needsScore], ['wants', wantsScore], ['savings', savingsScore]]
  const [focusBucket, focusScore] = scores.reduce((min, cur) => (cur[1] < min[1] ? cur : min))

  if (focusScore >= 100) {
    return { text: "Keep following your plan — you're on track across every budget target this cycle.", tone: 'good' }
  }

  if (focusBucket === 'savings') {
    const gap = targets.savings - actuals.savings
    return { text: `Save another ${fmt(gap)} this cycle to reach your savings target.`, tone: floorStatus(focusScore).tone }
  }

  const label = focusBucket === 'needs' ? 'Needs' : 'Wants'
  const over = actuals[focusBucket] - targets[focusBucket]
  return { text: `Reduce ${label} spending by ${fmt(over)} before next cycle.`, tone: ceilingStatus(focusScore).tone }
}

export function BudgetStrategyCard({ state, d, onOpenSettings }: BudgetStrategyCardProps) {
  const c = useTheme()
  const data = useStrategyData(state, d)
  if (!data) return null

  const { pcts, base, income, actuals, targets, needsScore, wantsScore, savingsScore, overallScore } = data
  const noBase = income === 0

  const needsStat = ceilingStatus(needsScore)
  const wantsStat = ceilingStatus(wantsScore)
  const savingsStat = floorStatus(savingsScore)
  const overall = overallStatus(overallScore)
  const onTrackCount = [needsStat, wantsStat, savingsStat].filter(s => s.tone === 'good').length
  const smartMove = noBase ? null : getSmartMove(needsScore, wantsScore, savingsScore, actuals, targets)

  return (
    <div style={{
      background: c.surface, borderRadius: 18, padding: '16px 16px 14px',
      border: `1px solid ${c.faint}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
            Budget Health
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {pcts.label} · based on {base === 'available_funds' ? 'available funds' : 'income'}
          </div>
        </div>
        {onOpenSettings && (
          <button
            onClick={e => { e.stopPropagation(); onOpenSettings() }}
            style={{
              width: 30, height: 30, borderRadius: 999,
              background: c.surface2, border: `1px solid ${c.faint}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={c.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>

      {noBase ? (
        <div style={{ padding: '4px 0 8px' }}>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
            Budget Health analyzes how income is allocated.
          </div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16, lineHeight: 1.6 }}>
            {base === 'income'
              ? 'No income has been recorded for this cycle yet. Your spending budget (daily/weekly limit) is unaffected — it works from your current balance.'
              : 'No available funds detected. Check your account balances and emergency fund settings.'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: c.surface2, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Current Balance
              </div>
              <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>
                {fmt(d.actualBalance)}
              </div>
            </div>
            <div style={{ flex: 1, background: c.surface2, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Available to Spend
              </div>
              <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>
                {fmt(d.realFreeMoney)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 14px', borderRadius: 14, marginBottom: 16,
            background: toneSoft(c, overall.tone),
          }}>
            <div style={{ font: '800 32px Plus Jakarta Sans', lineHeight: 1, flexShrink: 0, color: toneColor(c, overall.tone) }}>
              {overallScore}<span style={{ font: '700 16px Plus Jakarta Sans', opacity: 0.7 }}>%</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '800 13.5px Plus Jakarta Sans', color: toneColor(c, overall.tone) }}>{overall.label}</div>
              <div style={{ font: '500 11.5px Plus Jakarta Sans', color: c.sub, marginTop: 2 }}>
                {onTrackCount} of 3 spending goals are on track.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <span title={`Needs: ${needsStat.label}`} style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor(c, needsStat.tone) }} />
              <span title={`Wants: ${wantsStat.label}`} style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor(c, wantsStat.tone) }} />
              <span title={`Savings: ${savingsStat.label}`} style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor(c, savingsStat.tone) }} />
            </div>
          </div>

          <BucketRow label="Needs"   actual={actuals.needs}   target={targets.needs}   color="#3B82F6" kind="ceiling" score={needsScore} />
          <BucketRow label="Wants"   actual={actuals.wants}   target={targets.wants}   color="#F97316" kind="ceiling" score={wantsScore} />
          <BucketRow label="Savings" actual={actuals.savings} target={targets.savings} color={c.accent} kind="floor" score={savingsScore} />

          {smartMove && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2, padding: '12px 13px', borderRadius: 12,
              background: toneSoft(c, smartMove.tone),
            }}>
              <div style={{ font: '700 10px Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.06em', color: c.accent }}>
                🌱 Smart Move
              </div>
              <div style={{ font: '500 12.5px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
                {smartMove.text}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
