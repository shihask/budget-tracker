import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CreditCardTile } from './CreditCardTile'
import { useCreditCardSheets } from './CreditCardSheets'
import { getCreditCardBilling } from '@/lib/credit-card'
import type { AppState, CreditCard } from '@/types'

type CardPayload = Omit<CreditCard, 'id' | 'user_id' | 'is_active'>

interface Props {
  state: AppState
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onAdd: (form: CardPayload) => Promise<void>
  onUpdate: (id: string, form: CardPayload) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onPayBill: (card: CreditCard, amount: number, accountId: string) => Promise<void>
  onAdjustBalance: (cardId: string, actualBalance: number, billedAmount?: number) => Promise<void>
}

/** The Credit Cards home: every card, its billing detail, and all card management. */
export function CreditCardsPage({ state, onClose, onSwipeProgress, onAdd, onUpdate, onDelete, onPayBill, onAdjustBalance }: Props) {
  const c = useTheme()

  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [entryPlayed, setEntryPlayed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  const { openAdd, openEdit, openAdjust, openPay, confirmDelete, sheets, anyOpen } = useCreditCardSheets({
    mode: 'full', state, onAdd, onUpdate, onDelete, onPayBill, onAdjustBalance,
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
    // An open sheet owns the gesture — otherwise the page slides out from under it.
    if (closing || anyOpen) return
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

  const cards = state.credit_cards || []

  const totalOutstanding = cards.reduce((s, cd) => s + cd.current_balance, 0)
  const totalBilled = cards.reduce((s, cd) => {
    const b = getCreditCardBilling(cd, state.transactions)
    return s + Math.max(0, b.billedAmount)
  }, 0)
  const totalAvailable = cards.reduce((s, cd) => s + (cd.credit_limit - cd.current_balance), 0)

  const stat = (label: string, value: number, color: string) => (
    <div style={{ flex: 1, background: c.surface, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ font: '800 17px Plus Jakarta Sans', color, letterSpacing: '-0.02em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(value)}</div>
    </div>
  )

  return (
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
              {cards.length} card{cards.length !== 1 ? 's' : ''} · Billed {fmt(totalBilled)}
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {stat('Outstanding', totalOutstanding, c.ink)}
              {stat('Billed', totalBilled, totalBilled > 0 ? c.bad : c.ink)}
              {stat('Available', totalAvailable, c.good)}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {cards.map(card => (
                <CreditCardTile
                  key={card.id}
                  card={card}
                  state={state}
                  expanded={expandedId === card.id}
                  onToggle={() => setExpandedId(expandedId === card.id ? null : card.id)}
                  onPay={() => openPay(card)}
                  manage={{
                    onEdit: () => openEdit(card),
                    onAdjust: () => openAdjust(card),
                    onDelete: () => { void confirmDelete(card) },
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sheets}
    </div>
  )
}
