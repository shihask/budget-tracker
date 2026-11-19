import { PieChart } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { BudgetSummary, ProjectRole } from '../types'
import { budgetStatus, type BudgetStatus } from '../lib/overview'
import { FONT, cardStyle } from './overview/styles'
import { Bar, SectionHeader } from './overview/ui'

interface Props {
  budgetSummary: BudgetSummary
  targetAmount: number
  role: ProjectRole
  onManage?: () => void
}

// Shared by the Overview tab and the public share page (role="viewer", no
// onManage). Every action stays behind `canManage`, so the public page is read-only.
export function BudgetBreakdownSection({ budgetSummary, targetAmount, role, onManage }: Props) {
  const c = useTheme()
  const { breakdowns, totalAllocated, unallocatedAmount, uncategorizedSpend } = budgetSummary
  const canManage = (role === 'owner' || role === 'editor') && !!onManage

  const tone: Record<BudgetStatus, { color: string; label: string }> = {
    ok: { color: c.good, label: 'On track' },
    near: { color: c.warn, label: 'Near limit' },
    over: { color: c.bad, label: 'Over budget' },
  }

  if (breakdowns.length === 0) {
    if (!canManage) return null
    return (
      <div style={{ ...cardStyle(c), display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: c.accentSoft, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PieChart size={16} color={c.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: '1 1 190px', minWidth: 0 }}>
          <div style={{ font: `700 13px ${FONT}`, color: c.ink }}>Track spending by category</div>
          <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 1 }}>
            Set budgets for food, stay, travel and other trip expenses.
          </div>
        </div>
        <button
          onClick={onManage}
          style={{
            flexShrink: 0, padding: '7px 12px', borderRadius: 10, border: 'none',
            background: c.accentSoft, color: c.accent, font: `700 12px ${FONT}`, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Add budget
        </button>
        </div>
      </div>
    )
  }

  return (
    <div style={cardStyle(c)}>
      <SectionHeader c={c} title="Budget breakdown" action={canManage ? { label: 'Manage', onClick: onManage! } : undefined} />

      {targetAmount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', font: `500 11px ${FONT}`, color: c.muted, marginTop: -4, marginBottom: 10 }}>
          <span>Allocated {fmt(totalAllocated)} of {fmt(targetAmount)}</span>
          {unallocatedAmount > 0 && <span>{fmt(unallocatedAmount)} unallocated</span>}
          {unallocatedAmount < 0 && (
            <span style={{ color: c.warn, fontWeight: 600 }}>Budgets exceed target by {fmt(Math.abs(unallocatedAmount))}</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {breakdowns.map(b => {
          const t = tone[budgetStatus(b.pct)]
          return (
            <div key={b.budgetId} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <div style={{ font: `700 13px ${FONT}`, color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.category}
                </div>
                <div style={{ font: `600 12px ${FONT}`, color: c.sub, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {fmt(b.spent)} <span style={{ color: c.muted }}>/ {fmt(b.budgetAmount)}</span>
                </div>
              </div>
              <Bar c={c} pct={b.pct} color={t.color} height={5} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, font: `600 11px ${FONT}` }}>
                <span style={{ color: t.color }}>
                  {b.remaining >= 0 ? `${t.label} · ${fmt(b.remaining)} left` : `Over budget by ${fmt(Math.abs(b.remaining))}`}
                </span>
                <span style={{ color: c.muted }}>{b.pct.toFixed(0)}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {uncategorizedSpend > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12,
          padding: '8px 12px', background: c.surface2, borderRadius: 10, font: `600 12px ${FONT}`,
        }}>
          <span style={{ color: c.muted }}>Not in a budget</span>
          <span style={{ color: c.ink, fontWeight: 700 }}>{fmt(uncategorizedSpend)}</span>
        </div>
      )}
    </div>
  )
}
