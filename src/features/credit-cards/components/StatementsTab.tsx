import { useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { buildAllStatements } from '@/lib/credit-card-cycles'
import { colorFor } from '@/lib/credit-card-colors'
import { STATEMENT_STATUS_LABEL, statementPillStyle, stmtDate, stmtPeriod } from '@/components/creditCardStatus'
import type { CreditCard, Transaction } from '@/types'
import type { StatementStatus } from '@/lib/credit-card-cycles'

type Filter = 'all' | StatementStatus
const FILTERS: [Filter, string][] = [
  ['all', 'All'], ['paid', 'Paid'], ['partial', 'Partial'], ['due', 'Due'], ['overdue', 'Overdue'],
]

interface Props {
  cards: CreditCard[]
  history: Transaction[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
}

export function StatementsTab({ cards, history, loading, error, onRetry }: Props) {
  const c = useTheme()
  const [filter, setFilter] = useState<Filter>('all')

  const statements = useMemo(
    () => (history ? buildAllStatements(cards, history) : []),
    [cards, history],
  )
  const shown = filter === 'all' ? statements : statements.filter(s => s.status === filter)

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Couldn't load statements</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>{error}</div>
        <button onClick={onRetry} style={{ marginTop: 14, background: c.accentSoft, color: c.accent, border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    )
  }

  // Skeleton rows at the real row height, so nothing below shifts when data lands.
  if (loading && !history) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="cc-skeleton" style={{ height: 62, borderRadius: 14, background: c.surface2 }} />
        ))}
      </div>
    )
  }

  if (statements.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '44px 24px' }}>
        <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>No statements yet</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 6, lineHeight: 1.6 }}>
          Statements will appear after your first billing cycle is generated.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(([k, label]) => {
          const active = filter === k
          return (
            <button key={k} onClick={() => setFilter(k)} style={{
              font: '600 11px Plus Jakarta Sans', padding: '6px 10px', borderRadius: 999,
              background: active ? c.accentSoft : c.surface2,
              color: active ? c.accent : c.muted,
              border: 'none', cursor: 'pointer',
            }}>{label}</button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        // Chips stay visible above, so the emptiness is explicable and undoable.
        <div style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>
            No {STATEMENT_STATUS_LABEL[filter as StatementStatus].toLowerCase()} statements
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(s => {
            const col = colorFor(s.cardName)
            return (
              <div key={`${s.cardId}-${s.statementDate}`} style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.faint}`, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: col, flexShrink: 0 }} />
                  <span style={{ flex: 1, font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.cardName}</span>
                  <span style={statementPillStyle(c, s.status)}>{STATEMENT_STATUS_LABEL[s.status]}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                      {stmtDate(s.statementDate)} · due {stmtDate(s.dueDate, false)}
                    </div>
                    <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                      {stmtPeriod(s.periodStart, s.statementDate)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>{fmt(s.amount)}</div>
                    {s.status === 'partial' && (
                      <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.warn, marginTop: 1 }}>{fmt(s.remaining)} left</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
