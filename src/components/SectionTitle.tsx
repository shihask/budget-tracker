import { useTheme } from '@/lib/theme-context'

interface SectionTitleProps {
  children: React.ReactNode
  action?: string
  onAction?: () => void
  onInfo?: () => void
}

export function SectionTitle({ children, action, onAction, onInfo }: SectionTitleProps) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 4px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <h2 style={{ font: '700 17px Plus Jakarta Sans, sans-serif', color: c.ink, letterSpacing: '-0.01em', margin: 0 }}>
          {children}
        </h2>
        {onInfo && (
          <button
            onClick={onInfo}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: c.muted, lineHeight: 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        )}
      </div>
      {action && (
        <span
          onClick={onAction}
          style={{ font: '600 13px Plus Jakarta Sans, sans-serif', color: c.accent, cursor: 'pointer' }}
        >
          {action}
        </span>
      )}
    </div>
  )
}
