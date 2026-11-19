import { Target } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ProjectSummary } from '../../types'
import { targetProgress } from '../../lib/overview'
import { FONT, cardStyle } from './styles'
import { Bar, SectionHeader } from './ui'

interface Props {
  summary: ProjectSummary
  target: number
  /** Present for owners/editors only — opens the existing project edit sheet. */
  onSetTarget?: () => void
}

export function TargetProgressCard({ summary, target, onSetTarget }: Props) {
  const c = useTheme()
  const t = targetProgress(summary, target)

  if (!t) {
    if (!onSetTarget) return null
    return (
      <button
        onClick={onSetTarget}
        style={{
          ...cardStyle(c), width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: c.accentSoft, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Target size={16} color={c.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `700 13px ${FONT}`, color: c.ink }}>Set a trip budget</div>
          <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 1 }}>See how much of it you've spent</div>
        </div>
        <span style={{ font: `700 12px ${FONT}`, color: c.accent, flexShrink: 0 }}>Set</span>
      </button>
    )
  }

  const over = t.left < -0.01
  return (
    <div style={cardStyle(c)}>
      <SectionHeader c={c} title="Trip budget" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ font: `500 13px ${FONT}`, color: c.sub }}>
          <span style={{ font: `800 17px ${FONT}`, color: c.ink }}>{fmt(t.spent)}</span> of {fmt(t.target)}
        </div>
        <div style={{ font: `800 13px ${FONT}`, color: over ? c.bad : c.ink }}>{Math.round(t.pct)}%</div>
      </div>
      <Bar c={c} pct={t.pct} color={over ? c.bad : c.accent} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <div style={{ font: `700 12px ${FONT}`, color: over ? c.bad : c.good }}>
          {over ? `${fmt(Math.abs(t.left))} over target` : `${fmt(t.left)} left`}
        </div>
        <div style={{ font: `500 12px ${FONT}`, color: c.muted }}>
          Member contributions {fmt(summary.totalContributions)} · {summary.fundingProgress.toFixed(0)}% of target
        </div>
      </div>
    </div>
  )
}
