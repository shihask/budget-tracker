import { useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
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

interface BucketRowProps {
  label: string
  actual: number
  target: number
  color: string
}

function BucketRow({ label, actual, target, color }: BucketRowProps) {
  const c = useTheme()
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
  const over = actual > target
  const barColor = over ? c.bad : color

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ font: `700 13px Plus Jakarta Sans`, color: over ? c.bad : c.ink }}>
            {fmt(actual)}
          </span>
          <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
            / {target > 0 ? fmt(target) : '—'}
          </span>
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
    </div>
  )
}

export function BudgetStrategyCard({ state, d, onOpenSettings }: BudgetStrategyCardProps) {
  const c = useTheme()
  const data = useStrategyData(state, d)
  if (!data) return null

  const { pcts, base, income, actuals, targets, needsScore, wantsScore, savingsScore, overallScore } = data
  const noBase = income === 0

  return (
    <div style={{
      background: c.surface, borderRadius: 18, padding: '16px 16px 14px',
      border: `1px solid ${c.faint}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
            Budget Strategy
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {pcts.label} · based on {base === 'available_funds' ? 'available funds' : 'income'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!noBase && (
            <div style={{
              background: overallScore >= 80 ? c.good : overallScore >= 50 ? c.warn : c.bad,
              color: '#fff', borderRadius: 20,
              padding: '3px 10px',
              font: '700 12px Plus Jakarta Sans',
            }}>
              {overallScore}%
            </div>
          )}
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
      </div>

      {noBase ? (
        <div style={{ padding: '4px 0 8px' }}>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
            Budget Strategy analyzes how income is allocated.
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
          <BucketRow label="Needs"   actual={actuals.needs}   target={targets.needs}   color="#3B82F6" />
          <BucketRow label="Wants"   actual={actuals.wants}   target={targets.wants}   color="#F97316" />
          <BucketRow label="Savings" actual={actuals.savings} target={targets.savings} color={c.accent} />
        </>
      )}

      {!noBase && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: `1px solid ${c.faint}`,
          display: 'flex', gap: 0,
        }}>
          {[
            { label: 'Needs', score: needsScore },
            { label: 'Wants', score: wantsScore },
            { label: 'Savings', score: savingsScore },
            { label: 'Overall', score: overallScore, bold: true },
          ].map(({ label, score, bold }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                font: `${bold ? '800' : '700'} ${bold ? 14 : 13}px Plus Jakarta Sans`,
                color: score >= 80 ? c.good : score >= 50 ? c.warn : c.bad,
              }}>
                {score}%
              </div>
              <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
