import { useState, useEffect, useRef, useCallback } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from '@/components/AppDialog'
import { MASTER_ACCENTS, MASTER_TYPE_LABEL } from '@/lib/masters'
import { fmt, fmtDate } from '@/lib/utils'
import { MasterAvatar } from './MasterAvatar'
import { MASTER_TYPES } from '@/types'
import type { Master, Transaction } from '@/types'

/** "04 Sep 2026". Not `fmtDate` from utils — that collapses recent dates to
 *  "Today"/"Yesterday" and drops the year, which is wrong for a record's
 *  created stamp. */
function fmtCreated(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface MasterSpend { total: number; count: number; recent: Transaction[] }

interface Props {
  master: Master
  onClose: () => void
  onEdit: () => void
  onDelete: (id: string) => Promise<void>
  /** Reads from the DB, not state.transactions, which holds only the last 200
   *  rows — see fetchMasterSpend. */
  onFetchSpend: (masterId: string) => Promise<MasterSpend>
}

/** A full page nested under MastersPage, mirroring EventsListPage →
 *  EventDetailPage, so the back stack reads Settings → Masters → Detail.
 *
 *  Deliberately takes no onSwipeProgress: swiping this away reveals the opaque
 *  list page beneath, not the dashboard, so dimming App's scrim would be wrong. */
export function MasterDetailPage({ master, onClose, onEdit, onDelete, onFetchSpend }: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const [busy, setBusy] = useState(false)
  const accent = MASTER_ACCENTS[master.type]

  // Three states, kept distinct on purpose: a failed fetch must never be
  // mistakable for zero spend. Rendering a zero total on failure would assert "you have
  // never spent here", a claim the app cannot make when the query failed.
  const [spend, setSpend] = useState<MasterSpend | null>(null)
  const [spendError, setSpendError] = useState(false)
  // Bumped to re-run the fetch on Retry without duplicating the effect's logic.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    // This component stays mounted while `master` changes (the list swaps the
    // prop rather than remounting), so a slow request for master A could resolve
    // after B's and render A's totals under B's name. The cancel flag makes the
    // latest request the only one that can write.
    let cancelled = false
    setSpend(null)
    setSpendError(false)
    onFetchSpend(master.id)
      .then(r => { if (!cancelled) setSpend(r) })
      .catch(() => { if (!cancelled) setSpendError(true) })
    return () => { cancelled = true }
  }, [master.id, onFetchSpend, reloadKey])

  const loadSpend = useCallback(() => setReloadKey(k => k + 1), [])

  // ── Swipe-back ────────────────────────────────────────────────────────────
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
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); return
    }
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
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0)
    setTimeout(() => setSnapping(false), 300)
  }

  const handleDelete = async () => {
    // Copy updated for v1.61: masters now tag transactions, so the old
    // "not connected to transactions yet" reassurance would be a lie. The FK is
    // ON DELETE SET NULL and the delete is a soft delete, so no spending is ever
    // touched — but the tag does disappear from tagged rows, and saying so is the
    // honest version of the same reassurance.
    const tagged = spend?.count ?? 0
    const ok = await confirm(
      tagged > 0
        ? `Delete ${master.name}? The ${tagged} transaction${tagged === 1 ? '' : 's'} tagged to ${master.name} will be kept at their full amounts — they just lose the tag. No financial data is affected.`
        : `Delete ${master.name}? This only removes it from the Master Directory. No financial data is affected.`,
      { confirmLabel: 'Delete', danger: true },
    )
    if (!ok) return
    setBusy(true)
    try {
      await onDelete(master.id)
      // Close before the list re-renders without this row, so the page is never
      // left pointing at a master that no longer exists.
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 210, background: c.bg,
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
      <div style={{ display: 'flex', alignItems: 'center', padding: 'calc(16px + env(safe-area-inset-top,0px)) 16px 14px', borderBottom: `1px solid ${c.faint}`, background: c.bg, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={triggerClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.muted, padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', gap: 5, font: '600 14px Plus Jakarta Sans' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Masters
        </button>
      </div>

      <div style={{ padding: '24px 16px calc(32px + env(safe-area-inset-bottom,0px))', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <MasterAvatar name={master.name} type={master.type} size={76} />
          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 14, textAlign: 'center', wordBreak: 'break-word' }}>
            {master.name}
          </div>
          <div style={{ marginTop: 8, background: accent.soft, color: accent.solid, borderRadius: 999, padding: '5px 12px', font: '700 12px Plus Jakarta Sans' }}>
            {MASTER_TYPE_LABEL[master.type]}
          </div>
        </div>

        {/* Spend summary. "Total spent" reads wrong for a person you lend to or
            receive from, so people get the neutral noun until Lend & Borrow lands. */}
        <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.faint}`, padding: '16px', marginBottom: 12 }}>
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {master.type === MASTER_TYPES.MERCHANT ? 'Total spent' : 'Total'}
          </div>

          {spendError ? (
            <div>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>
                Couldn't load this total.
              </div>
              <button
                onClick={loadSpend}
                style={{ background: c.surface2, color: c.ink, border: 'none', borderRadius: 10, padding: '8px 16px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          ) : spend === null ? (
            /* Skeleton, not a zero — see the comment on `spend`. */
            <div style={{ width: 120, height: 28, borderRadius: 8, background: c.surface2 }} />
          ) : (
            <>
              <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
                {fmt(spend.total)}
              </div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
                {spend.count} transaction{spend.count === 1 ? '' : 's'}
              </div>
            </>
          )}
        </div>

        {spend && spend.recent.length > 0 && (
          <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.faint}`, overflow: 'hidden', marginBottom: 12 }}>
            {spend.recent.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${c.faint}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '600 14px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description}
                  </div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                    {fmtDate(t.transaction_date)}
                  </div>
                </div>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(t.amount)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.faint}`, overflow: 'hidden', marginBottom: 20 }}>
          {master.type === MASTER_TYPES.PERSON && master.phone && <Row label="Phone" value={master.phone} />}
          {master.notes && <Row label="Notes" value={master.notes} />}
          {master.created_at && <Row label="Created" value={fmtCreated(master.created_at)} />}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onEdit}
            disabled={busy}
            style={{ flex: 1, background: c.surface2, color: c.ink, border: 'none', borderRadius: 16, padding: '14px 0', font: '700 14px Plus Jakarta Sans', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            <Pencil size={15} color={c.ink} /> Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            style={{ flex: 1, background: c.badSoft, color: c.bad, border: 'none', borderRadius: 16, padding: '14px 0', font: '700 14px Plus Jakarta Sans', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            <Trash2 size={15} color={c.bad} /> Delete
          </button>
        </div>
      </div>

      {dialogNode}
    </div>
  )
}

/** Module level, not defined inside MasterDetailPage: a component created during
 *  render is a new type every render, so React remounts the subtree each time. */
function Row({ label, value }: { label: string; value: string }) {
  const c = useTheme()
  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.faint}` }}>
      <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ font: '600 15px Plus Jakarta Sans', color: c.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  )
}
