import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft } from '@/lib/tokens'

interface AaReviewBannerProps {
  count: number
  onOpen: () => void
}

// The "notification" entry point for AA sync's review-everything flow (see
// the review-everything plan) — a dashboard banner, not a forced modal on
// every load, matching InsightCard's visual language but tappable to open
// DedupReviewSheet. Renders nothing when there's nothing to review.
export function AaReviewBanner({ count, onOpen }: AaReviewBannerProps) {
  const c = useTheme()

  if (count === 0) return null

  const border = toneColor(c, 'accent')
  const bg = toneSoft(c, 'accent')

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        background: bg,
        border: `1px solid ${border}44`,
        borderLeft: `3px solid ${border}`,
        borderRadius: 12,
        padding: '10px 12px',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>🏦</span>
      <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
        {count} bank transaction{count === 1 ? '' : 's'} to review
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}
