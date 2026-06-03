import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { CAT_COLORS, ACC_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { Glyph } from './Glyph'
import { MONTH_START, catById as buildCatById } from '@/lib/data'
import type { AppState, DerivedMetrics } from '@/types'

// ── Renovation Tracker ────────────────────────────────────────────────────────
interface RenovationProps { state: AppState; d: DerivedMetrics }

export function RenovationSection({ state, d }: RenovationProps) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)
  const items = state.transactions.filter(
    t => catMap[t.category_id!]?.group_name === 'Renovation'
      && new Date(t.transaction_date) >= MONTH_START
  )

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Renovation</div>
          <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>This month</div>
        </div>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: '#F97316', letterSpacing: '-0.02em' }}>
          {fmt(d.renovationMonth)}
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No renovation spend yet this month.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F9731622', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name="doc" color="#F97316" size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink }}>{t.description}</div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{catMap[t.category_id!]?.name}</div>
              </div>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(t.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Recent Transactions ───────────────────────────────────────────────────────
interface RecentTxnsProps { state: AppState; limit?: number; onSeeAll?: () => void }

export function RecentTxns({ state, limit = 6, onSeeAll }: RecentTxnsProps) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)
  const acctById = Object.fromEntries(state.accounts.map(a => [a.id, a]))
  const txns = state.transactions.slice(0, limit)

  return (
    <Card pad={6}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 12px 8px' }}>
        <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Recent activity</div>
        <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
      </div>
      {txns.length === 0 ? (
        <div style={{ padding: '16px 12px', font: '600 13px Plus Jakarta Sans', color: c.muted }}>No transactions yet.</div>
      ) : txns.map((t) => {
        const cat = catMap[t.category_id!]
        const col = (cat && CAT_COLORS[cat.name]) || c.muted
        const acc = acctById[t.from_account_id!]
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderTop: `1px solid ${c.faint}` }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: col + '20', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 14px Plus Jakarta Sans', color: col }}>
              {t.description.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
              <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>{cat ? cat.name : 'Other'} · {acc ? acc.name : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ font: '800 14px Plus Jakarta Sans', color: t.transaction_type === 'income' ? c.good : c.bad }}>
                {t.transaction_type === 'income' ? '+' : '−'}{fmt(t.amount, { decimals: t.amount % 1 ? 2 : 0 })}
              </div>
              <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted }}>{fmtDate(t.transaction_date)}</div>
            </div>
          </div>
        )
      })}
    </Card>
  )
}
