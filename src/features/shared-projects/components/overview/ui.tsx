import { ChevronRight } from 'lucide-react'
import type { ColorTokens } from '@/lib/tokens'
import { FONT } from './styles'

export function SectionHeader({ c, title, count, action }: {
  c: ColorTokens
  title: string
  count?: number
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
      <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}{count !== undefined && <span style={{ color: c.muted, fontWeight: 600 }}> · {count}</span>}
      </div>
      {action && <LinkButton c={c} label={action.label} onClick={action.onClick} />}
    </div>
  )
}

export function LinkButton({ c, label, onClick }: { c: ColorTokens; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
        background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
        color: c.accent, font: `700 12px ${FONT}`, whiteSpace: 'nowrap',
      }}
    >
      {label}<ChevronRight size={14} strokeWidth={2.5} />
    </button>
  )
}

export function Bar({ c, pct, color, height = 6 }: { c: ColorTokens; pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: c.faint, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: height / 2, background: color,
        width: `${Math.max(0, Math.min(100, pct))}%`, transition: 'width 0.3s ease',
      }} />
    </div>
  )
}
