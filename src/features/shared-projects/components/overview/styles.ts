import type { ColorTokens } from '@/lib/tokens'

export const FONT = 'Plus Jakarta Sans'

export function cardStyle(c: ColorTokens): React.CSSProperties {
  return {
    background: c.surface, borderRadius: 18, padding: 14,
    border: `1px solid ${c.faint}`, minWidth: 0, boxSizing: 'border-box',
  }
}

export const shortDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
