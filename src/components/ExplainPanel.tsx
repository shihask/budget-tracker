import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { getDetectorLabel } from '@/lib/detector-labels'
import type { ExplainInfo } from '@/lib/briefing'
import type { EstimateConfidence } from '@/types'

const CONFIDENCE_LABEL: Record<EstimateConfidence, string> = {
  high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', none: '',
}

// The one renderer for ExplainInfo — used by BriefingItemRow (both Today's Briefing
// and the standalone MintSuggestionCard route through it) so "Why?" always looks and
// reads the same regardless of which engine produced the item.
export function ExplainPanel({ info }: { info: ExplainInfo }) {
  const c = useTheme()

  return (
    <div style={{
      marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          font: '700 11px Plus Jakarta Sans', color: c.muted,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {getDetectorLabel(info.detector)}
        </span>
        {info.confidence && info.confidence !== 'none' && (
          <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
            · {CONFIDENCE_LABEL[info.confidence]}
          </span>
        )}
      </div>

      {info.reasons && info.reasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {info.reasons.map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', font: '500 12px Plus Jakarta Sans', color: c.sub }}>
              <span>{r.label}</span>
              <span style={{ color: c.ink, fontWeight: 700 }}>{fmt(r.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {info.recommendation && (
        <p style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, margin: 0, lineHeight: 1.5 }}>
          {info.recommendation}
        </p>
      )}
    </div>
  )
}
