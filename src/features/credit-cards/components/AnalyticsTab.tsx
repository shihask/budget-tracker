import { useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { WeeklyBars } from '@/components/Charts'
import { monthlySpend, spendByCard, cardInsights } from '@/lib/credit-card-analytics'
import type { CreditCard, Transaction } from '@/types'

interface Props {
  cards: CreditCard[]
  history: Transaction[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
}

const SKELETON_BAR_HEIGHTS = [46, 78, 34, 92, 60, 70]

export function AnalyticsTab({ cards, history, loading, error, onRetry }: Props) {
  const c = useTheme()

  const monthly = useMemo(() => (history ? monthlySpend(history) : []), [history])
  const byCard = useMemo(() => (history ? spendByCard(history, cards) : []), [history, cards])
  const insights = useMemo(() => cardInsights(monthly, byCard), [monthly, byCard])

  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
  }
  const block: React.CSSProperties = {
    background: c.surface, borderRadius: 16, border: `1px solid ${c.faint}`, padding: 14, marginBottom: 12,
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Couldn't load analytics</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>{error}</div>
        <button onClick={onRetry} style={{ marginTop: 14, background: c.accentSoft, color: c.accent, border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    )
  }

  // Skeletons at the real heights — the hero, metrics and tabs stay put while this swaps.
  if (loading && !history) {
    return (
      <div>
        <div style={block}>
          <div style={sectionLabel}>Monthly Spending</div>
          <div style={{ height: 132, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', paddingBottom: 18 }}>
            {SKELETON_BAR_HEIGHTS.map((h, i) => (
              <div key={i} className="cc-skeleton" style={{ width: 28, height: h, borderRadius: 6, background: c.surface2 }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="cc-skeleton" style={{ flex: 1, height: 66, borderRadius: 12, background: c.surface2 }} />
          ))}
        </div>
      </div>
    )
  }

  const hasSpend = monthly.some(m => m.value > 0)
  if (!hasSpend) {
    return (
      <div style={{ textAlign: 'center', padding: '44px 24px' }}>
        <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>No card spending yet</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 6, lineHeight: 1.6 }}>
          Charge an expense to a credit card and your trends will appear here.
        </div>
      </div>
    )
  }

  const maxCard = Math.max(...byCard.map(r => r.total), 1)

  return (
    <div>
      <div style={block}>
        <div style={sectionLabel}>Monthly Spending</div>
        <WeeklyBars data={monthly} />
      </div>

      {byCard.length > 0 && (
        <div style={block}>
          <div style={sectionLabel}>Spending by Card</div>
          {byCard.map((row, i) => (
            <div key={row.cardId} style={{ marginBottom: i < byCard.length - 1 ? 11 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                <span style={{ font: '600 12.5px Plus Jakarta Sans', color: c.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                <span style={{ font: '700 12.5px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(row.total)}</span>
              </div>
              <div style={{ height: 5, background: c.faint, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((row.total / maxCard) * 100)}%`, background: row.color, borderRadius: 999, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {([
          ['Highest Month', insights.highestMonth ? fmt(insights.highestMonth.value) : '—', insights.highestMonth?.label ?? ''],
          ['Monthly Average', fmt(insights.monthlyAverage), 'with data'],
          ['Top Card', insights.topCard ? fmt(insights.topCard.total) : '—', insights.topCard?.name ?? ''],
        ] as const).map(([label, value, sub]) => (
          <div key={label} style={{ flex: 1, minWidth: 0, background: c.surface, borderRadius: 12, border: `1px solid ${c.faint}`, padding: '10px 11px' }}>
            <div style={{ font: '600 9.5px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
