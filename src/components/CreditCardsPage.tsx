import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import { CreditCardTile } from './CreditCardTile'
import { useCreditCardSheets } from './CreditCardSheets'
import { getCreditCardBilling } from '@/lib/credit-card'
import { localYmd, buildAllStatements } from '@/lib/credit-card-cycles'
import { StatementDetailsPage } from './StatementDetailsPage'
import { thisMonthCardSpend } from '@/lib/credit-card-analytics'
import { stmtDate } from './creditCardStatus'
import { colorFor } from '@/lib/credit-card-colors'
import { StatementsTab } from '@/features/credit-cards/components/StatementsTab'
import { AnalyticsTab } from '@/features/credit-cards/components/AnalyticsTab'
import type { AppState, CreditCard, Transaction } from '@/types'

type CardPayload = Omit<CreditCard, 'id' | 'user_id' | 'is_active'>
type Tab = 'cards' | 'statements' | 'analytics'
const TABS: [Tab, string][] = [['cards', 'Cards'], ['statements', 'Statements'], ['analytics', 'Analytics']]

/** 6 months of analytics plus one so the oldest statement window is whole. */
const HISTORY_MONTHS = 7

interface Props {
  state: AppState
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onAdd: (form: CardPayload) => Promise<void>
  onUpdate: (id: string, form: CardPayload) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onPayBill: (card: CreditCard, amount: number, accountId: string) => Promise<void>
  onAdjustBalance: (cardId: string, actualBalance: number, billedAmount?: number) => Promise<void>
  fetchCardHistory: (sinceDate: string) => Promise<Transaction[]>
}

/** The Credit Cards home: overview, upcoming bills, and Cards / Statements / Analytics. */
export function CreditCardsPage({
  state, onClose, onSwipeProgress,
  onAdd, onUpdate, onDelete, onPayBill, onAdjustBalance, fetchCardHistory,
}: Props) {
  const c = useTheme()

  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('cards')
  /** The open statement, held as its `${cardId}-${statementDate}` key rather than the object. The
   *  live statement is re-derived below, so paying one updates the open page instead of leaving a
   *  stale amount on screen. Mirrors EventsListPage's detailId. */
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  // ── Long-span history, fetched from the DB rather than the 200-row in-memory window ──────────
  const [history, setHistory] = useState<Transaction[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const since = new Date()
      since.setMonth(since.getMonth() - HISTORY_MONTHS)
      setHistory(await fetchCardHistory(localYmd(since)))
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setHistoryLoading(false)
  }, [fetchCardHistory])

  /** Fetch once, the first time a tab that needs it is opened. Driven from the tab click rather than
   *  an effect — the fetch is a reaction to a user action, not a synchronisation with anything. */
  const selectTab = useCallback((next: Tab) => {
    setTab(next)
    if (next !== 'cards' && !history && !historyLoading && !historyError) void loadHistory()
  }, [history, historyLoading, historyError, loadHistory])

  /** Any successful mutation makes the cached history stale. Refetch silently when a data tab is
   *  showing (the stale numbers stay up meanwhile rather than flashing a skeleton); otherwise just
   *  drop it so the next switch refetches. */
  const invalidateHistory = useCallback(() => {
    if (tab === 'cards') { setHistory(null); setHistoryError(null); return }
    void loadHistory()
  }, [tab, loadHistory])

  // Wrapping here is what makes the cache policy unforgettable: every mutation on this page goes
  // through useCreditCardSheets, so no call site can skip invalidation.
  const withInvalidate = useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) => async (...args: A) => {
      await fn(...args)
      invalidateHistory()
    },
    [invalidateHistory],
  )

  const { openAdd, openEdit, openAdjust, openPay, confirmDelete, sheets, anyOpen } = useCreditCardSheets({
    mode: 'full',
    state,
    onAdd: withInvalidate(onAdd),
    onUpdate: withInvalidate(onUpdate),
    onDelete: withInvalidate(onDelete),
    onPayBill: withInvalidate(onPayBill),
    onAdjustBalance: withInvalidate(onAdjustBalance),
  })

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev; document.documentElement.style.overflow = prevHtml }
  }, [])

  const triggerClose = () => {
    setClosing(true); onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // An open sheet or the statement detail owns the gesture — otherwise the page slides out from
    // under it.
    if (closing || anyOpen || detailKey) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); onSwipeProgress?.(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx); setDragX(x); onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) triggerClose()
    else { setSnapping(true); setDragX(0); onSwipeProgress?.(0); setTimeout(() => setSnapping(false), 300) }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  const cards = useMemo(() => state.credit_cards || [], [state.credit_cards])

  const totals = useMemo(() => {
    let outstanding = 0, billed = 0, limit = 0
    for (const cd of cards) {
      outstanding += cd.current_balance
      limit += cd.credit_limit
      billed += Math.max(0, getCreditCardBilling(cd, state.transactions).billedAmount)
    }
    const available = limit - outstanding
    const utilPct = limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0
    return { outstanding, billed, limit, available, utilPct }
  }, [cards, state.transactions])

  // Short-span, so the in-memory window is safe — no fetch needed for this one.
  const monthSpend = useMemo(() => thisMonthCardSpend(state.transactions), [state.transactions])

  /** Next bill and due date per card, soonest first. */
  const upcoming = useMemo(() => {
    const today = localYmd(new Date())
    const items: { date: string; label: string; sub: string; amount: number | null; color: string }[] = []
    for (const cd of cards) {
      const b = getCreditCardBilling(cd, state.transactions)
      items.push({ date: b.nextBillDate, label: cd.name, sub: 'Statement generated', amount: null, color: colorFor(cd.name) })
      if (b.billedAmount > 0) {
        items.push({ date: b.nextDueDate, label: cd.name, sub: 'Payment due', amount: b.billedAmount, color: c.bad })
      }
    }
    return items.filter(i => i.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4)
  }, [cards, state.transactions, c.bad])

  const utilColor = totals.utilPct > 80 ? c.bad : totals.utilPct > 50 ? c.warn : c.accent

  // Re-derived every render from the current history, so the open detail follows a payment: paying
  // invalidates the cache, buildStatements re-runs, and this resolves to the updated statement. If
  // the key no longer resolves (card deleted), the detail closes on its own.
  const detail = useMemo(() => {
    if (!detailKey || !history) return null
    const statement = buildAllStatements(cards, history).find(
      s => `${s.cardId}-${s.statementDate}` === detailKey,
    )
    if (!statement) return null
    const card = cards.find(cd => cd.id === statement.cardId)
    return card ? { statement, card } : null
  }, [detailKey, history, cards])

  const metric = (label: string, value: number, color: string) => (
    <div style={{ flex: 1, minWidth: 0, background: c.surface, borderRadius: 12, border: `1px solid ${c.faint}`, padding: '9px 11px' }}>
      <div style={{ font: '600 9.5px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ font: '700 15px Plus Jakarta Sans', color, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(value)}</div>
    </div>
  )

  return (
    <>
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 200,
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
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Credit Cards</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
              {cards.length} card{cards.length !== 1 ? 's' : ''} · Billed {fmt(totals.billed)}
            </div>
          </div>
          <button
            onClick={openAdd}
            aria-label="Add credit card"
            style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))', maxWidth: 540, margin: '0 auto' }}>
        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>No credit cards yet</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 6, lineHeight: 1.6 }}>
              Add a card to track its outstanding balance, statement and due dates.
            </div>
            <button
              onClick={openAdd}
              style={{ marginTop: 18, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '12px 22px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              Add Card
            </button>
          </div>
        ) : (
          <>
            {/* Hero */}
            <Card pad={18} style={{ marginBottom: 10 }}>
              <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Outstanding</div>
              <div style={{ font: '800 30px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em', marginTop: 2 }}>{fmt(totals.outstanding)}</div>
              <div style={{ height: 7, borderRadius: 999, background: c.surface2, overflow: 'hidden', marginTop: 14 }}>
                <div style={{ width: `${totals.utilPct}%`, height: '100%', borderRadius: 999, background: utilColor, transition: 'width 0.5s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ font: '700 12px Plus Jakarta Sans', color: utilColor }}>{totals.utilPct}% utilized</span>
                <span style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>
                  {fmt(totals.available)} available of {fmt(totals.limit)}
                </span>
              </div>
            </Card>

            {/* Quick metrics */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {metric('Billed', totals.billed, totals.billed > 0 ? c.bad : c.ink)}
              {metric('Available', totals.available, c.good)}
              {metric('This Month', monthSpend, c.accent)}
            </div>

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div style={{ background: c.surface2, borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Upcoming</div>
                {upcoming.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < upcoming.length - 1 ? `1px solid ${c.faint}` : 'none' }}>
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: u.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 12.5px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.label}</div>
                      <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{stmtDate(u.date, false)} · {u.sub}</div>
                    </div>
                    {u.amount !== null && (
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(u.amount)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Segmented control */}
            <div style={{ display: 'flex', gap: 4, background: c.surface2, borderRadius: 12, padding: 4, marginBottom: 14 }}>
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => selectTab(k)} style={{
                  flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '8px 0',
                  font: '700 12.5px Plus Jakarta Sans', transition: 'all 0.2s',
                  background: tab === k ? c.surface : 'transparent',
                  color: tab === k ? c.ink : c.muted,
                  boxShadow: tab === k ? c.cardShadow : 'none',
                }}>{label}</button>
              ))}
            </div>

            {tab === 'cards' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {cards.map(card => (
                  <CreditCardTile
                    key={card.id}
                    card={card}
                    state={state}
                    expanded={expandedId === card.id}
                    onToggle={() => setExpandedId(expandedId === card.id ? null : card.id)}
                    onPay={() => openPay(card)}
                    showCurrentStatement
                    manage={{
                      onEdit: () => openEdit(card),
                      onAdjust: () => openAdjust(card),
                      onDelete: () => { void confirmDelete(card) },
                    }}
                  />
                ))}
              </div>
            )}

            {tab === 'statements' && (
              <StatementsTab cards={cards} history={history} loading={historyLoading} error={historyError} onRetry={loadHistory} onOpen={s => setDetailKey(`${s.cardId}-${s.statementDate}`)} />
            )}

            {tab === 'analytics' && (
              <AnalyticsTab cards={cards} history={history} loading={historyLoading} error={historyError} onRetry={loadHistory} />
            )}
          </>
        )}
      </div>

      {sheets}
    </div>

    {/* Rendered OUTSIDE the container above, not inside it. That container sets
        `will-change: transform`, which makes it the containing block for any position:fixed
        descendant — a detail page nested inside would be positioned against the scrolling page box
        instead of the viewport, so it would scroll away and expose the list beneath. BottomSheet
        escapes this via createPortal; a plain child does not. Same placement as
        EventsListPage → EventDetailPage. */}
    {detail && history && (
      <StatementDetailsPage
        state={state}
        card={detail.card}
        statement={detail.statement}
        history={history}
        onClose={() => setDetailKey(null)}
        onPay={() => openPay(detail.card, detail.statement.remaining)}
      />
    )}
    </>
  )
}
