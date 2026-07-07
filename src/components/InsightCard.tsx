import { useTheme } from '@/lib/theme-context'
import { toneColor, toneSoft, type ToneKey } from '@/lib/tokens'
import type { AppNotification, NotificationTone } from '@/types'

const TONE_KEY: Record<NotificationTone, ToneKey> = {
  critical: 'bad',
  warning: 'warn',
  info: 'accent',
  positive: 'good',
}

interface InsightCardProps {
  notification: AppNotification | null
  onDismiss?: (id: string) => void
}

export function InsightCard({ notification, onDismiss }: InsightCardProps) {
  const c = useTheme()

  if (!notification) return null

  const border = toneColor(c, TONE_KEY[notification.tone])
  const bg = toneSoft(c, TONE_KEY[notification.tone])
  const icon = notification.tone === 'positive' ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ) : notification.tone === 'info' ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: bg,
      border: `1px solid ${border}44`,
      borderLeft: `3px solid ${border}`,
      borderRadius: 12,
      padding: '10px 12px',
    }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</div>
      <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
        {notification.message}
      </span>
      {notification.dismissible && (
        <button
          onClick={() => onDismiss?.(notification.id)}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, background: 'none', border: 'none',
            padding: 4, cursor: 'pointer', color: c.muted,
            display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  )
}
