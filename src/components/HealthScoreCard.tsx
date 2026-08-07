import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { HealthScoreResult } from '@/lib/health-score'

interface Props {
  result: HealthScoreResult
}

const TREND_ARROW: Record<'up' | 'down' | 'flat', string> = { up: '↑', down: '↓', flat: '→' }

// Composite 0-100 score + grade + trend, built purely from signals other Grow
// subsystems already track (see src/lib/health-score.ts) — no new persisted state
// beyond a same-day-vs-yesterday localStorage cache for the trend arrow.
export function HealthScoreCard({ result }: Props) {
  const c = useTheme()
  const [expanded, setExpanded] = useState(false)

  const cardStyle: React.CSSProperties = {
    borderRadius: 20, padding: 18, background: c.surface,
    border: `1px solid ${c.faint}`, boxShadow: c.cardShadow,
  }
  const trendColor = result.trend === 'up' ? c.good : result.trend === 'down' ? c.bad : c.muted

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>💚</span>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Financial Health</div>
        </div>
        {result.components.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', font: '700 12px Plus Jakarta Sans', color: c.accent, flexShrink: 0 }}
          >
            {expanded ? 'Hide breakdown' : 'Breakdown →'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ font: '800 32px Plus Jakarta Sans', color: c.ink }}>{result.score}</span>
        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.sub }}>{result.grade}</span>
        {result.trend && (
          <span style={{ font: '700 15px Plus Jakarta Sans', color: trendColor }}>{TREND_ARROW[result.trend]}</span>
        )}
      </div>

      {(result.strongest || result.weakest) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {result.strongest && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.good }}>
              ✓ Strongest: {result.strongest.label}
            </div>
          )}
          {result.weakest && result.weakest.key !== result.strongest?.key && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.warn }}>
              Needs attention: {result.weakest.label}
            </div>
          )}
        </div>
      )}

      {expanded && result.components.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.faint}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.components.map(comp => (
            <div key={comp.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{comp.label}</span>
                <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{comp.score}</span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: c.surface2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${comp.score}%`, background: c.accent }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
