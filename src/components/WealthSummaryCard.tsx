import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import type { AppState } from '@/types'

interface Props {
  state: AppState
  onGoToSavings: () => void
  onGoToBorrowing: () => void
}

export function WealthSummaryCard({ state, onGoToSavings, onGoToBorrowing }: Props) {
  const c = useTheme()

  const trackSavings   = state.settings.track_savings    ?? false
  const trackBorrowing = state.settings.track_borrowings ?? true

  const totalInvested = trackSavings
    ? state.savings.filter(s => s.is_active).reduce((sum, s) => sum + s.current_installment * s.amount, 0)
    : 0

  const totalLent = trackBorrowing
    ? state.borrowings
        .filter(b => (b.direction ?? 'lent') === 'lent')
        .reduce((sum, b) => sum + (b.remaining_amount ?? (b.total_amount - b.paid_amount)), 0)
    : 0

  const totalAssets = totalInvested + totalLent

  // Only render when there's something meaningful to show
  if (totalAssets === 0 || (!trackSavings && !trackBorrowing)) return null

  const rows: { label: string; value: number; onClick: () => void; color: string; accent: string }[] = []

  if (trackSavings && totalInvested > 0) {
    rows.push({ label: 'Savings & Investments', value: totalInvested, onClick: onGoToSavings, color: '#10B981', accent: 'rgba(16,185,129,0.1)' })
  }
  if (trackBorrowing && totalLent > 0) {
    rows.push({ label: 'Lent Out', value: totalLent, onClick: onGoToBorrowing, color: '#F97316', accent: 'rgba(249,115,22,0.08)' })
  }

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #10B981, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Wealth Summary</div>
      </div>

      {/* Breakdown rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {rows.map(row => (
          <div
            key={row.label}
            onClick={row.onClick}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: row.accent, borderRadius: 12, padding: '10px 14px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
              <span style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>{row.label}</span>
            </div>
            <span style={{ font: '700 13px Plus Jakarta Sans', color: row.color }}>{fmt(row.value)}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div style={{ borderTop: `1px solid ${c.faint}`, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Assets Built</div>
        </div>
        <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{fmt(totalAssets)}</div>
      </div>
    </Card>
  )
}
