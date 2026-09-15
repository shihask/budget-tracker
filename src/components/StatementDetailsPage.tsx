import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { catById } from '@/lib/data'
import { Card } from './Card'
import { buildUnbilledCycle, getStatementTransactions } from '@/lib/credit-card-cycles'
import type { UnbilledCycle } from '@/lib/credit-card-cycles'
import { STATEMENT_STATUS_LABEL, statementPillStyle, stmtDate, stmtPeriod } from './creditCardStatus'
import type { AppState, CreditCard, Transaction } from '@/types'
import type { Statement } from '@/lib/credit-card-cycles'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const UNBILLED = 'unbilled'

/** One chip per cycle, grouped under its year the way a bank app lists statements. A statement is
 *  filed by the month it is generated in (25 Aug → August); Unbilled is filed under the year it will
 *  bill in, so it heads the list — normally in the current year's group. */
function groupChips(unbilled: UnbilledCycle, statements: Statement[]): { year: number; chips: [string, string][] }[] {
  const groups: { year: number; chips: [string, string][] }[] = []
  const push = (date: string, key: string, label: string) => {
    const year = Number(date.slice(0, 4))
    const last = groups[groups.length - 1]
    if (last?.year === year) last.chips.push([key, label])
    else groups.push({ year, chips: [[key, label]] })
  }
  push(unbilled.statementDate, UNBILLED, 'Unbilled')
  for (const s of statements) push(s.statementDate, s.statementDate, MONTH_NAMES[Number(s.statementDate.slice(5, 7)) - 1])
  return groups
}

interface Props {
  state: AppState
  card: CreditCard
  /** Every cycle of this card, newest first, empty ones included (`buildCardCycles`). */
  statements: Statement[]
  /** The statement the page opens on — its `statementDate`. */
  initialStatementDate: string
  /** This card's archive; null while it loads. */
  history: Transaction[] | null
  error: string | null
  onRetry: () => void
  onClose: () => void
  onPay: (statement: Statement) => void
}

/**
 * One card's billing cycles, in full: what a statement came to, what settled it, and every purchase
 * behind the number — plus the open unbilled cycle, where the latest spend lives.
 *
 * Selection is held as a statement date rather than the object, so a payment that re-derives
 * `statements` updates the open view instead of leaving a stale amount on screen.
 *
 * Deliberately takes no onSwipeProgress: swiping this away reveals the opaque Credit Cards page
 * beneath, not the dashboard, so dimming App's scrim would be wrong. Same reasoning as
 * EventDetailPage.
 */
export function StatementDetailsPage({ state, card, statements, initialStatementDate, history, error, onRetry, onClose, onPay }: Props) {
  const c = useTheme()
  const [selected, setSelected] = useState(initialStatementDate)
  const ready = history !== null
  const txns = useMemo(() => history ?? [], [history])

  // Bring the opening chip into view once the chips exist — opening an older statement from the
  // Statements tab would otherwise select a chip scrolled off to the right.
  const activeChipRef = useRef<HTMLButtonElement | null>(null)
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!ready || scrolledRef.current) return
    scrolledRef.current = true
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [ready])

  const unbilled = useMemo(() => buildUnbilledCycle(card, txns), [card, txns])
  // Falls back to the newest statement if the selected one stopped resolving.
  const statement = selected === UNBILLED ? null : (statements.find(s => s.statementDate === selected) ?? statements[0] ?? null)
  const isUnbilled = ready && !statement

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
  const cycle = statement ?? unbilled
  const purchases = useMemo(
    () => getStatementTransactions(cycle, txns),
    [cycle, txns],
  )

  const statusColor =
    statement?.status === 'paid' ? c.good
    : statement?.status === 'partial' ? c.warn
    : statement?.status === 'overdue' ? c.bad
    : c.muted

  const canPay = !!statement && statement.status !== 'paid' && statement.remaining > 0

  const groups = useMemo(() => groupChips(unbilled, statements), [unbilled, statements])
  /** Years whose month chips are hidden. All start expanded; tapping a year toggles it. */
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(() => new Set())
  const toggleYear = (year: number) => setCollapsedYears(prev => {
    const next = new Set(prev)
    if (next.has(year)) next.delete(year)
    else next.add(year)
    return next
  })
  const activeChip = statement?.statementDate ?? UNBILLED
  /** A cycle with nothing on it at all — no spend, no adjustment, no payment. Gets a neutral note
   *  instead of a "Fully Paid" banner that would claim a payment happened. */
  const isEmptyCycle = !!statement && statement.amount === 0 && statement.payments.length === 0

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
            <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
              {!ready ? stmtDate(initialStatementDate)
                : statement ? stmtDate(statement.statementDate)
                : `Unbilled · since ${stmtDate(unbilled.periodStart, false)}`}
            </div>
          </div>
          {ready && (statement
            ? <span style={statementPillStyle(c, statement.status)}>{STATEMENT_STATUS_LABEL[statement.status]}</span>
            : <span style={statementPillStyle(c, 'due')}>Unbilled</span>)}
        </div>

        {/* Cycle filter — Unbilled first, since that's where the latest spend is, then every statement
            newest first under a year label. In the sticky header so switching never needs a scroll
            back up. */}
        <div className="tab-scroll" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 16px 10px' }}>
          {!ready ? (
            [0, 1, 2, 3].map(i => (
              <div key={i} className="cc-skeleton" style={{ flexShrink: 0, width: 72, height: 28, borderRadius: 999, background: c.surface2 }} />
            ))
          ) : groups.map((g, gi) => {
            const isCollapsed = collapsedYears.has(g.year)
            // Selection hidden inside a collapsed year — tint the year so it isn't lost.
            const holdsActive = isCollapsed && g.chips.some(([key]) => key === activeChip)
            return (
            <div key={g.year} style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              paddingLeft: gi > 0 ? 8 : 0, marginLeft: gi > 0 ? 4 : 0,
              borderLeft: gi > 0 ? `1px solid ${c.faint}` : 'none',
            }}>
              <button
                onClick={() => toggleYear(g.year)}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Show' : 'Hide'} ${g.year} statements`}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, padding: '6px 4px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  font: '700 11px Plus Jakarta Sans', color: holdsActive ? c.accent : c.ink,
                }}
              >
                {g.year}
                {isCollapsed && <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginLeft: 3 }}>{g.chips.length}</span>}
                <ChevronDown size={13} strokeWidth={2.4} style={{ transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }} />
              </button>
              {g.chips.map(([key, label]) => {
                if (isCollapsed) return null
                const active = key === activeChip
                return (
                  <button
                    key={key}
                    ref={active ? activeChipRef : undefined}
                    onClick={() => setSelected(key)}
                    style={{
                      flexShrink: 0, font: '600 11.5px Plus Jakarta Sans', padding: '6px 12px', borderRadius: 999,
                      background: active ? c.accentSoft : c.surface2,
                      color: active ? c.accent : c.muted,
                      border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >{label}</button>
                )
              })}
            </div>
            )
          })}
        </div>
        <style>{`.tab-scroll::-webkit-scrollbar{display:none}`}</style>
      </div>

      <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))', maxWidth: 540, margin: '0 auto' }}>
        {!ready ? (
          error ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Couldn't load this card's statements</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>{error}</div>
              <button onClick={onRetry} style={{ marginTop: 14, background: c.accentSoft, color: c.accent, border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          ) : (
            // Skeleton at the real hero + list heights, so nothing shifts when data lands.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="cc-skeleton" style={{ height: 156, borderRadius: 16, background: c.surface2 }} />
              <div className="cc-skeleton" style={{ height: 180, borderRadius: 16, background: c.surface2 }} />
            </div>
          )
        ) : (<>
        {/* Hero — identified before it is quantified. The statement date is how a real card statement
            is named, and what the user matches against the one their bank sent. */}
        <Card pad={18} style={{ marginBottom: 12 }}>
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {statement ? `Statement · ${stmtDate(statement.statementDate)}` : 'Unbilled spend'}
          </div>
          <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {stmtPeriod(cycle.periodStart, cycle.statementDate)}
          </div>
          <div style={{ font: '800 30px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em', marginTop: 12 }}>
            {fmt(cycle.amount)}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.faint}` }}>
            {statement ? (
              <>
                {figure('Paid', fmt(statement.paid), statement.paid > 0 ? c.good : c.ink)}
                {figure('Remaining', fmt(statement.remaining), statement.remaining > 0 ? statusColor : c.good)}
                {figure('Due', stmtDate(statement.dueDate, false), statement.status === 'overdue' ? c.bad : c.ink)}
              </>
            ) : (
              <>
                {figure('Purchases', String(purchases.length), c.ink)}
                {figure('Bills on', stmtDate(unbilled.statementDate, false), c.ink)}
                {figure('Due', stmtDate(unbilled.dueDate, false), c.ink)}
              </>
            )}
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
          {totalRow('Purchases', fmt(cycle.purchases))}
          {cycle.adjustments !== 0 && totalRow(
            'Adjustments',
            `${cycle.adjustments < 0 ? '−' : '+'}${fmt(Math.abs(cycle.adjustments))}`,
            { color: cycle.adjustments < 0 ? c.good : c.ink },
          )}
          {totalRow(statement ? 'Statement Total' : 'Unbilled Total', fmt(cycle.amount), { strong: true })}
        </div>

        {/* Nothing is owed on the open cycle yet, so it gets a note instead of payments or a Pay button. */}
        {isUnbilled && (
          <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
            These purchases will be billed on {stmtDate(unbilled.statementDate)}, payable by {stmtDate(unbilled.dueDate)}.
          </div>
        )}

        {/* Payment history — where a partial payment becomes legible */}
        {statement && statement.payments.length > 0 && (
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
        {!statement ? null : isEmptyCycle ? (
          <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
            Nothing was billed on this card for this cycle.
          </div>
        ) : canPay ? (
          <button
            onClick={() => onPay(statement)}
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
        </>)}
      </div>
    </div>
  )
}
