import * as Sentry from '@sentry/react'
import { useTheme } from '@/lib/theme-context'

/** Kakeibo is optional: if any of it throws, it disappears — the dashboard and
 *  Analytics around it keep rendering. Reported to Sentry like any crash. */
export function KakeiboBoundary({ children }: { children: React.ReactNode }) {
  return <Sentry.ErrorBoundary fallback={<></>}>{children}</Sentry.ErrorBoundary>
}

export function KButton({ children, onClick, kind = 'primary', disabled, ariaLabel }: {
  children: React.ReactNode
  onClick: () => void
  kind?: 'primary' | 'quiet'
  disabled?: boolean
  ariaLabel?: string
}) {
  const c = useTheme()
  const primary = kind === 'primary'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        background: primary ? (disabled ? c.faint : c.accent) : 'transparent',
        color: primary ? (disabled ? c.muted : '#fff') : c.sub,
        border: primary ? 'none' : `1.5px solid ${c.faint}`,
        borderRadius: 11, padding: '9px 14px',
        font: '700 13px Plus Jakarta Sans',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const c = useTheme()
  return (
    <div style={{ font: '700 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
      {children}
    </div>
  )
}

export function Row({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: `${strong ? 700 : 600} 13px Plus Jakarta Sans`, color: strong ? c.ink : c.sub }}>{label}</div>
        {hint && <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{ font: `${strong ? 800 : 700} 14px Plus Jakarta Sans`, color: c.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{value}</div>
    </div>
  )
}
