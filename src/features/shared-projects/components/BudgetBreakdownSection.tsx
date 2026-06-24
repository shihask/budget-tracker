import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { BudgetSummary, ProjectRole } from '../types'

interface Props {
  budgetSummary: BudgetSummary
  targetAmount: number
  role: ProjectRole
  onManage?: () => void
}

export function BudgetBreakdownSection({ budgetSummary, targetAmount, role, onManage }: Props) {
  const c = useTheme()
  const { breakdowns, totalAllocated, unallocatedAmount, uncategorizedSpend } = budgetSummary
  const canEdit = role === 'owner' || role === 'editor'

  if (breakdowns.length === 0 && !canEdit) return null

  return (
    <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Budget Breakdown
        </div>
        {canEdit && onManage && (
          <button
            onClick={onManage}
            style={{ background: 'none', border: 'none', padding: '2px 8px', cursor: 'pointer', color: c.accent, font: '600 12px Plus Jakarta Sans' }}
          >
            {breakdowns.length > 0 ? 'Manage' : '+ Add Budget'}
          </button>
        )}
      </div>

      {breakdowns.length === 0 ? (
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '8px 0' }}>
          No budget categories defined
        </div>
      ) : (
        <>
          {/* Allocation summary */}
          {targetAmount > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                  Allocated: {fmt(totalAllocated)} of {fmt(targetAmount)}
                </div>
                {unallocatedAmount > 0 && (
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                    {fmt(unallocatedAmount)} unallocated
                  </div>
                )}
              </div>
              {unallocatedAmount < 0 && (
                <div style={{ font: '600 11px Plus Jakarta Sans', color: '#F59E0B', marginTop: 2 }}>
                  Budget exceeds target by {fmt(Math.abs(unallocatedAmount))}
                </div>
              )}
            </div>
          )}

          {/* Category breakdowns */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {breakdowns.map(b => {
              const barColor = b.pct < 80 ? '#10B981' : b.pct < 100 ? '#F59E0B' : '#EF4444'
              return (
                <div key={b.budgetId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{b.category}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                      {fmt(b.spent)} / {fmt(b.budgetAmount)}
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: c.faint, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: barColor,
                      width: `${Math.min(100, b.pct)}%`, transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: b.remaining >= 0 ? '#10B981' : '#EF4444' }}>
                      {b.remaining >= 0 ? `${fmt(b.remaining)} remaining` : `${fmt(Math.abs(b.remaining))} over budget`}
                    </div>
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>
                      {b.pct.toFixed(0)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Uncategorized spend */}
          {uncategorizedSpend > 0 && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: c.surface2, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Uncategorized</div>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(uncategorizedSpend)}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
