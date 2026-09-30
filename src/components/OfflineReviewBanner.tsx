import { CloudOff, CloudUpload } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft } from '@/lib/tokens'

/** Offline status on the dashboard, in AaReviewBanner's visual language.
 *   - offline            → an informational strip (not tappable)
 *   - online + queue > 0 → "N offline transactions to save · Review"
 *  Reconnecting never opens the review sheet or uploads anything by itself. */
export function OfflineReviewBanner({ online, count, onOpen }: { online: boolean; count: number; onOpen: () => void }) {
  const c = useTheme()

  if (!online) {
    const border = toneColor(c, 'warn')
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
        background: toneSoft(c, 'warn'), border: `1px solid ${border}44`, borderLeft: `3px solid ${border}`,
        borderRadius: 12, padding: '10px 12px',
      }}>
        <CloudOff size={16} color={border} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
          You’re offline. New transactions will be saved on this device.
          {count > 0 && ` ${count} waiting to sync.`}
        </span>
      </div>
    )
  }

  if (count === 0) return null
  const border = toneColor(c, 'accent')
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: toneSoft(c, 'accent'), border: `1px solid ${border}44`, borderLeft: `3px solid ${border}`,
        borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
      }}
    >
      <CloudUpload size={16} color={border} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
        {count} offline transaction{count === 1 ? '' : 's'} to save · Review
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}
