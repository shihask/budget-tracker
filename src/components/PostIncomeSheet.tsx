import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from './BottomSheet'
import { getStrategyPcts } from './BudgetStrategyCard'
import type { BudgetStrategySettings } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  amount: number
  budgetStrategySettings: BudgetStrategySettings
}

export function PostIncomeSheet({ open, onClose, amount, budgetStrategySettings }: Props) {
  const c = useTheme()
  const pcts = getStrategyPcts(budgetStrategySettings)

  if (!pcts) return null

  const needs = Math.round(amount * pcts.needs / 100)
  const wants = Math.round(amount * pcts.wants / 100)
  const savings = Math.round(amount * pcts.savings / 100)

  const buckets = [
    { label: 'Needs', amount: needs, pct: pcts.needs, color: '#3B82F6' },
    { label: 'Wants', amount: wants, pct: pcts.wants, color: '#F97316' },
    { label: 'Savings', amount: savings, pct: pcts.savings, color: c.accent },
  ]

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Income Received
        </div>
        <div style={{ font: '800 32px Plus Jakarta Sans', color: c.good, letterSpacing: '-0.02em', marginTop: 4 }}>
          {fmt(amount)}
        </div>
      </div>

      <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        Suggested Allocation
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {buckets.map(b => (
          <div key={b.label} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: c.surface2, borderRadius: 14, padding: '12px 14px',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: b.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: b.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{b.label}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{b.pct}% of income</div>
            </div>
            <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
              {fmt(b.amount)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textAlign: 'center', marginBottom: 16, lineHeight: 1.5 }}>
        Based on your {pcts.label} strategy
      </div>

      <button
        onClick={onClose}
        style={{
          width: '100%', background: c.accent, color: '#fff', border: 'none',
          borderRadius: 14, padding: '14px',
          font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
        }}
      >
        Got it
      </button>
    </BottomSheet>
  )
}
