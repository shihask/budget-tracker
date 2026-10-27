
import * as Sentry from '@sentry/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { monthKey, monthLabel, shiftMonth } from '../lib/budget'

/** Household's own boundary: if the feature throws, the rest of the app keeps
 *  rendering. Unlike Kakeibo's, the fallback is a closable page — Household is a
 *  full-screen page under App's scrim, and rendering nothing would strand it. */
export function HouseholdBoundary({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Sentry.ErrorBoundary fallback={<CrashedPage onClose={onClose} />}>
      {children}
    </Sentry.ErrorBoundary>
  )
}

function CrashedPage({ onClose }: { onClose: () => void }) {
  const c = useTheme()
  return (
    <div role="alert" style={{ position: 'fixed', inset: 0, zIndex: 200, background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Household couldn't open</div>
      <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20, maxWidth: 300, lineHeight: 1.5 }}>
        Your personal finances aren't affected. Close this and try again in a moment.
      </div>
      <Button onClick={onClose}>Close</Button>
    </div>
  )
}

// ── Small building blocks ─────────────────────────────────────────────────────

export function Button({ children, onClick, kind = 'primary', disabled, busy, full, ariaLabel, type = 'button' }: {
  children: React.ReactNode
  onClick?: () => void
  kind?: 'primary' | 'secondary' | 'danger' | 'quiet'
  disabled?: boolean
  busy?: boolean
  full?: boolean
  ariaLabel?: string
  type?: 'button' | 'submit'
}) {
  const c = useTheme()
  const off = disabled || busy
  const palette = {
    primary:   { bg: c.accent, fg: '#fff', border: 'none' },
    secondary: { bg: c.surface2, fg: c.ink, border: `1.5px solid ${c.faint}` },
    danger:    { bg: c.badSoft, fg: c.bad, border: 'none' },
    quiet:     { bg: 'transparent', fg: c.sub, border: 'none' },
  }[kind]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      style={{
        background: palette.bg, color: palette.fg, border: palette.border,
        borderRadius: 14, padding: '13px 18px', minHeight: 44,
        font: '700 14px Plus Jakarta Sans', cursor: off ? 'not-allowed' : 'pointer',
        opacity: off ? 0.6 : 1, width: full ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {children}
    </button>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const c = useTheme()
  return (
    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
      {children}
    </div>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const c = useTheme()
  return <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, ...style }}>{children}</div>
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  const c = useTheme()
  return <label htmlFor={htmlFor} style={{ display: 'block', font: '700 12px Plus Jakarta Sans', color: c.sub, margin: '0 0 6px' }}>{children}</label>
}

export function ErrorText({ children, id }: { children: React.ReactNode; id?: string }) {
  const c = useTheme()
  if (!children) return null
  return <div id={id} role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 6, lineHeight: 1.45 }}>{children}</div>
}

export function ProgressBar({ progress, tone, label }: { progress: number; tone: 'ok' | 'near' | 'over'; label: string }) {
  const c = useTheme()
  const color = tone === 'over' ? c.bad : tone === 'near' ? c.warn : c.accent
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
      style={{ height: 8, borderRadius: 999, background: c.surface2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 999, background: color, transition: 'width 0.3s' }} />
    </div>
  )
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const c = useTheme()
  const isCurrent = month === monthKey(new Date())
  const btn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 11, border: 'none', background: c.surface2, color: c.ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
      <button type="button" style={btn} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
      <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }} aria-live="polite">{monthLabel(month)}</div>
      <button type="button" style={{ ...btn, opacity: isCurrent ? 0.35 : 1, cursor: isCurrent ? 'default' : 'pointer' }}
        onClick={() => { if (!isCurrent) onChange(shiftMonth(month, 1)) }} disabled={isCurrent} aria-label="Next month">
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

export function Skeleton({ height = 72 }: { height?: number }) {
  const c = useTheme()
  return <div aria-hidden style={{ height, borderRadius: 18, background: c.surface2, marginBottom: 12, opacity: 0.7 }} />
}

/** "Shared household" pill — every household screen carries it, so shared money
 *  is never mistaken for personal money. */
export function SharedBadge() {
  const c = useTheme()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: c.accentSoft, color: c.accent, font: '700 11px Plus Jakarta Sans' }}>
      Shared household
    </span>
  )
}
