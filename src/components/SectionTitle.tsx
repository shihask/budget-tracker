import { useTheme } from '@/lib/theme-context'

interface SectionTitleProps {
  children: React.ReactNode
  action?: string
  onAction?: () => void
}

export function SectionTitle({ children, action, onAction }: SectionTitleProps) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 4px 10px' }}>
      <h2 style={{ font: '700 17px Plus Jakarta Sans, sans-serif', color: c.ink, letterSpacing: '-0.01em', margin: 0 }}>
        {children}
      </h2>
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
