import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { SettlementResult } from '../../types'

// The public share page's settlement list — the same markup it has always had, with
// kitty wording. Read-only. Entries without fromKind/toKind (older shape) read as
// member-to-member.
export function PublicSettlementList({ settlement, hasExpenses }: { settlement: SettlementResult; hasExpenses: boolean }) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* With nothing spent there is nothing to settle — even though the maths would
          "return" contributions from the kitty. Same rule as the Settlement tab. */}
      {settlement.settlements.length === 0 || !hasExpenses ? (
        <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted, textAlign: 'center', paddingTop: 30 }}>
          {!hasExpenses
            ? 'Nothing to settle yet'
            : settlement.balanced === false ? "Settlement couldn't be verified yet" : 'All settled up!'}
        </div>
      ) : (
        <div style={{ background: c.surface, borderRadius: 18, padding: 16, border: `1px solid ${c.faint}` }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Suggested Settlements</div>
          {settlement.settlements.map((s, i) => {
            const fromKitty = s.fromKind === 'kitty', toKitty = s.toKind === 'kitty'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < settlement.settlements.length - 1 ? 12 : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: fromKitty ? c.ink : '#EF4444' }}>{s.fromMemberName}</div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>{fromKitty ? 'suggested from kitty balance' : 'owes'}</div>
                </div>
                <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{fmt(s.amount)}</div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>{toKitty ? 'to top up' : 'to'}</div>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: toKitty ? c.ink : '#10B981' }}>{s.toMemberName}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
