import { useState, useEffect, useMemo, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { catById } from '@/lib/data'
import { Card } from './Card'
import { getStatementTransactions } from '@/lib/credit-card-cycles'
import { STATEMENT_STATUS_LABEL, statementPillStyle, stmtDate, stmtPeriod } from './creditCardStatus'
import type { AppState, CreditCard, Transaction } from '@/types'
import type { Statement } from '@/lib/credit-card-cycles'

interface Props {
  state: AppState
  card: CreditCard
  statement: Statement
  history: Transaction[]
  onClose: () => void
  onPay: () => void
}

/**
 * One statement, in full: what it came to, what settled it, and every purchase behind the number.
 *
 * Deliberately takes no onSwipeProgress: swiping this away reveals the opaque Credit Cards page
 * beneath, not the dashboard, so dimming App's scrim would be wrong. Same reasoning as
 * EventDetailPage.
 */
export function StatementDetailsPage({ state, card, statement, history, onClose, onPay }: Props) {
  const c = useTheme()

  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  const triggerClose = () => {
    setClosing(true)
    setTimeout(onClose, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) { gestureRef.current = null; setDragX(0); return }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    setDragX(Math.max(0, dx))
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) triggerClose()
    else { setSnapping(true); setDragX(0); setTimeout(() => setSnapping(false), 300) }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0)
    setTimeout(() => setSnapping(false), 300)
  }

  // fetchCardHistory selects '*', which returns no joined `category` object — resolving through
  // catMap is what keeps every row from rendering uncategorised.
  const catMap = useMemo(() => catById(state.categories), [state.categories])
  const purchases = useMemo(
    () => getStatementTransactions(statement, history),
    [statement, history],
  )

  const statusColor =
    statement.status === 'paid' ? c.good
    : statement.status === 'partial' ? c.warn
    : statement.status === 'overdue' ? c.bad
    : c.muted

  const canPay = statement.status !== 'paid' && statement.remaining > 0

  const figure = (label: string, value: string, color: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ font: '600 9.5px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ font: '700 13.5px Plus Jakarta Sans', color, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )

  const totalRow = (label: string, value: string, opts: { strong?: boolean; color?: string } = {}) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: opts.strong ? '10px 0 0' : '5px 0',
      borderTop: opts.strong ? `1px solid ${c.faint}` : 'none',
      marginTop: opts.strong ? 6 : 0,
    }}>
      <span style={{ font: `${opts.strong ? '700' : '600'} ${opts.strong ? 13 : 12}px Plus Jakarta Sans`, color: opts.strong ? c.ink : c.muted }}>{label}</span>
      <span style={{ font: `${opts.strong ? '800' : '700'} ${opts.strong ? 15 : 12.5}px Plus Jakarta Sans`, color: opts.color ?? c.ink }}>{value}</span>
    </div>
  )

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 220,
        overflowY: dragX > 0 ? 'hidden' : 'auto',
        overscrollBehavior: 'contain',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        willChange: 'transform',
        ...(closing
          ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : dragX > 0
          ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
          : snapping
          ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
          : entryPlayed ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</div>
            <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{stmtDate(statement.statementDate)}</div>
          </div>
          <span style={statementPillStyle(c, statement.status)}>{STATEMENT_STATUS_LABEL[statement.status]}</span>
        </div>
      </div>

      <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))', maxWidth: 540, margin: '0 auto' }}>
        {/* Hero — identified before it is quantified. The statement date is how a real card statement
            is named, and what the user matches against the one their bank sent. */}
        <Card pad={18} style={{ marginBottom: 12 }}>
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Statement · {stmtDate(statement.statementDate)}
          </div>
          <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {stmtPeriod(statement.periodStart, statement.statementDate)}
          </div>
          <div style={{ font: '800 30px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em', marginTop: 12 }}>
            {fmt(statement.amount)}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.faint}` }}>
            {figure('Paid', fmt(statement.paid), statement.paid > 0 ? c.good : c.ink)}
            {figure('Remaining', fmt(statement.remaining), statement.remaining > 0 ? statusColor : c.good)}
            {figure('Due', stmtDate(statement.dueDate, false), statement.status === 'overdue' ? c.bad : c.ink)}
          </div>
        </Card>

        {/* Purchases */}
        <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '4px 2px 8px' }}>
          Purchases{purchases.length > 0 ? ` · ${purchases.length}` : ''}
        </div>
        <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.faint}`, padding: '4px 14px', marginBottom: 12 }}>
          {purchases.length === 0 ? (
            <div style={{ font: '600 12.5px Plus Jakarta Sans', color: c.muted, padding: '14px 0', textAlign: 'center' }}>
              No purchases in this cycle
            </div>
          ) : (
            purchases.map((t, i) => {
              const cat = catMap[t.category_id ?? '']
              const col = (cat && CAT_COLORS[cat.name]) || c.muted
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
                  borderBottom: i < purchases.length - 1 ? `1px solid ${c.faint}` : 'none',
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: col + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px Plus Jakarta Sans', color: col }}>
                    {t.description.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      {cat && (
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: col, background: col + '18', borderRadius: 999, padding: '2px 7px' }}>{cat.name}</span>
                      )}
                      <span style={{ font: '500 10.5px Plus Jakarta Sans', color: c.muted }}>{stmtDate(t.transaction_date, false)}</span>
                    </div>
                  </div>
                  <div style={{ font: '800 14px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(t.amount)}</div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer — reconciles by construction: purchases + adjustments = amount */}
        <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
          {totalRow('Purchases', fmt(statement.purchases))}
          {statement.adjustments !== 0 && totalRow(
            'Adjustments',
            `${statement.adjustments < 0 ? '−' : '+'}${fmt(Math.abs(statement.adjustments))}`,
            { color: statement.adjustments < 0 ? c.good : c.ink },
          )}
          {totalRow('Statement Total', fmt(statement.amount), { strong: true })}
        </div>

        {/* Payment history — where a partial payment becomes legible */}
        {statement.payments.length > 0 && (
          <>
            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '4px 2px 8px' }}>
              Payment History
            </div>
            <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.faint}`, padding: '4px 14px', marginBottom: 12 }}>
              {statement.payments.map((p, i) => (
                <div key={`${p.id}-${i}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0',
                  borderBottom: i < statement.payments.length - 1 ? `1px solid ${c.faint}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 999, background: c.goodSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span style={{ font: '600 12.5px Plus Jakarta Sans', color: c.ink }}>{stmtDate(p.date)}</span>
                  </div>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: c.good, flexShrink: 0 }}>{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Action */}
        {canPay ? (
          <button
            onClick={onPay}
            style={{ width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Pay {fmt(statement.remaining)}
          </button>
        ) : (
          <div style={{ background: c.goodSoft, borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9.5"/>
            </svg>
            <div>
              <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.good }}>Fully Paid</div>
              {statement.paidOn && (
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.good, opacity: 0.85, marginTop: 1 }}>
                  Paid on {stmtDate(statement.paidOn)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
