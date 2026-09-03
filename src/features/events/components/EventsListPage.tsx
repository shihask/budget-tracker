import { useState, useEffect, useRef, useMemo } from 'react'
import { CalendarHeart } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { eventSpent, eventTransactions } from '@/lib/events'
import { EventTile, EVENT_COLOR } from './EventTile'
import { EventDetailPage } from './EventDetailPage'
import type { AppState, LifeEvent, Transaction } from '@/types'

/** Below this a search box is noise — most people carry one or two events.
 *  ProjectsListPage shows its search unconditionally and it reads as clutter at n=1. */
const SEARCH_THRESHOLD = 6

interface Props {
  state: AppState
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  /** Opens the add form immediately — set by the dashboard card's `+`. */
  initialAddOpen?: boolean
  /** Pushes straight to one event's detail — how the dashboard tile keeps its
   *  direct tap while still leaving List underneath in the back stack. */
  initialEventId?: string | null
  onAddEvent: () => void
  onEditEvent: (e: LifeEvent) => void
  onLinkMore: (eventId: string) => void
  onEditTransaction: (t: Transaction) => void
  onUpdateEvent: (id: string, patch: Partial<LifeEvent>) => Promise<void>
  onDeleteEvent: (id: string) => Promise<void>
}

export function EventsListPage({
  state, onClose, onSwipeProgress, initialAddOpen, initialEventId,
  onAddEvent, onEditEvent, onLinkMore, onEditTransaction, onUpdateEvent, onDeleteEvent,
}: Props) {
  const c = useTheme()
  const [search, setSearch] = useState('')
  const [detailId, setDetailId] = useState<string | null>(initialEventId ?? null)

  // The dashboard `+` opens the page with the form already up. Init-only, like
  // CommitmentsPage/ProjectsListPage — a later flag change is deliberately ignored.
  const firedInitialAdd = useRef(false)
  useEffect(() => {
    if (initialAddOpen && !firedInitialAdd.current) {
      firedInitialAdd.current = true
      onAddEvent()
    }
  }, [initialAddOpen, onAddEvent])

  // ── Swipe-back ────────────────────────────────────────────────────────────
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const t = setTimeout(() => setEntryPlayed(true), 360)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const triggerClose = () => {
    setClosing(true)
    onSwipeProgress?.(1)
    setTimeout(() => { onSwipeProgress?.(0); onClose() }, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // The detail page sits on top and owns its own gesture; don't fight it.
    if (closing || detailId) return
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
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
    onSwipeProgress?.(x / W)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); dragXRef.current = 0; onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const showSearch = state.events.length > SEARCH_THRESHOLD
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? state.events.filter(e => e.name.toLowerCase().includes(q)) : state.events
  }, [state.events, search])

  const active = matches.filter(e => e.status === 'active')
  // Completed and archived read the same when you're scanning — the distinction
  // only matters when acting on an event, which happens on its detail page.
  const past = matches
    .filter(e => e.status !== 'active')
    .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))

  const activeTracked = active.reduce((s, e) => s + eventSpent(state.transactions, e.id), 0)
  const detailEvent = state.events.find(e => e.id === detailId) ?? null

  const renderSection = (title: string, events: LifeEvent[]) => events.length === 0 ? null : (
    <div style={{ marginBottom: 22 }}>
      <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map(e => (
          <EventTile
            key={e.id}
            event={e}
            spent={eventSpent(state.transactions, e.id)}
            txnCount={eventTransactions(state.transactions, e.id).length}
            onOpen={() => setDetailId(e.id)}
          />
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 200, background: c.bg,
          display: 'flex', flexDirection: 'column',
          overflowY: dragX > 0 ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          willChange: 'transform',
          ...(closing
            ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
            : dragX > 0
            ? { transform: `translateX(${dragX}px)`, animation: 'none', boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
            : snapping
            ? { transform: 'translateX(0)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)', animation: 'none' }
            : entryPlayed
            ? {}
            : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `calc(16px + env(safe-area-inset-top,0px)) 16px 14px`, borderBottom: `1px solid ${c.faint}`, background: c.bg, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={triggerClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.muted, padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', gap: 5, font: '600 14px Plus Jakarta Sans' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: EVENT_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarHeart size={15} color="#fff" />
            </div>
            <span style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Life Events</span>
          </div>
          <button onClick={onAddEvent} aria-label="Add life event" style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>

        <div style={{ padding: '16px 16px calc(32px + env(safe-area-inset-bottom,0px))', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {state.events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: `${EVENT_COLOR}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CalendarHeart size={28} color={EVENT_COLOR} />
              </div>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Track a one-off event</div>
              <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 24 }}>
                A wedding, trip or house build — grouped together and kept out of your weekly budget.
              </div>
              <button onClick={onAddEvent} style={{ background: EVENT_COLOR, color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
                Create an event
              </button>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <SummaryTile label="Active events" value={String(active.length)} />
                <SummaryTile label="Tracked spend" value={fmt(activeTracked)} />
              </div>

              {showSearch && (
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search events…"
                  style={{
                    width: '100%', boxSizing: 'border-box', marginBottom: 18,
                    border: `1.5px solid ${c.faint}`, background: c.surface2, borderRadius: 13,
                    padding: '11px 14px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
                  }}
                />
              )}

              {renderSection('Active', active)}
              {renderSection('Past events', past)}

              {active.length === 0 && past.length === 0 && (
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '40px 0' }}>
                  No events match “{search}”.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detailEvent && (
        <EventDetailPage
          state={state}
          event={detailEvent}
          onClose={() => setDetailId(null)}
          onEdit={() => onEditEvent(detailEvent)}
          onLinkMore={() => onLinkMore(detailEvent.id)}
          onEditTransaction={onEditTransaction}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
        />
      )}
    </>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  const c = useTheme()
  return (
    <div style={{ flex: 1, background: c.surface2, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{label}</div>
    </div>
  )
}
