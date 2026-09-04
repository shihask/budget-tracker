import { useState, useEffect, useRef, useMemo } from 'react'
import { Contact, Search } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import {
  searchMasters, sortMasters, MASTER_ACCENTS,
  MASTER_TYPE_LABEL, MASTER_TYPE_PLURAL,
} from '@/lib/masters'
import { MasterAvatar } from './MasterAvatar'
import { MasterDetailPage } from './MasterDetailPage'
import { MasterFormSheet, type MasterFormValues } from './MasterFormSheet'
import { MASTER_TYPES } from '@/types'
import type { AppState, Master, MasterType, Transaction } from '@/types'

const MASTERS_COLOR = '#6366F1'

/** 'all' is a UI-only filter value, deliberately not a MasterType — it must
 *  never reach the database or a MASTER_ACCENTS lookup. */
type Filter = 'all' | MasterType
const FILTERS: Filter[] = ['all', MASTER_TYPES.PERSON, MASTER_TYPES.MERCHANT]

interface Props {
  state: AppState
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  onAddMaster: (form: MasterFormValues) => Promise<void>
  onUpdateMaster: (id: string, patch: Partial<MasterFormValues>) => Promise<void>
  onDeleteMaster: (id: string) => Promise<void>
  onFetchSpend: (masterId: string) => Promise<{ total: number; count: number; recent: Transaction[] }>
}

export function MastersPage({
  state, onClose, onSwipeProgress, onAddMaster, onUpdateMaster, onDeleteMaster, onFetchSpend,
}: Props) {
  const c = useTheme()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Master | null>(null)

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
    // The detail page and the form sheet sit on top and own their own
    // gestures; don't fight them.
    if (closing || detailId || formOpen) return
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
      setSnapping(true); setDragX(0); onSwipeProgress?.(0)
      setTimeout(() => setSnapping(false), 300)
    }
  }
  const onTouchCancel = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    setSnapping(true); setDragX(0); onSwipeProgress?.(0)
    setTimeout(() => setSnapping(false), 300)
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  // Local, synchronous, no debounce: this is a pass over an in-memory array
  // with no network behind it, so a debounce would only add lag.
  const inFilter = useMemo(
    () => filter === 'all' ? state.masters : state.masters.filter(m => m.type === filter),
    [state.masters, filter],
  )
  const visible = useMemo(
    () => sortMasters(searchMasters(inFilter, search)),
    [inFilter, search],
  )
  const counts = useMemo(() => ({
    all: state.masters.length,
    [MASTER_TYPES.PERSON]: state.masters.filter(m => m.type === MASTER_TYPES.PERSON).length,
    [MASTER_TYPES.MERCHANT]: state.masters.filter(m => m.type === MASTER_TYPES.MERCHANT).length,
  }), [state.masters])

  const detailMaster = state.masters.find(m => m.id === detailId) ?? null

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (m: Master) => { setEditing(m); setFormOpen(true) }

  const handleSave = async (form: MasterFormValues) => {
    if (editing) await onUpdateMaster(editing.id, form)
    else await onAddMaster(form)
  }

  const searching = search.trim().length > 0

  const renderEmpty = () => {
    // Three distinct states. Collapsing them would either nag someone who is
    // just searching, or hide the first-run call to action.
    if (searching) {
      return (
        <Empty
          title={`No masters match “${search.trim()}”.`}
          body="Try a different name or phone number."
          actionLabel="Clear search"
          onAction={() => setSearch('')}
        />
      )
    }
    if (state.masters.length === 0) {
      return (
        <Empty
          icon
          title="No masters yet"
          body="Create people and merchants now. You'll be able to use them in transactions in a future update."
          actionLabel="Create First Master"
          onAction={openCreate}
        />
      )
    }
    // A filter tab is empty but the directory is not.
    const label = filter === 'all' ? 'masters' : MASTER_TYPE_PLURAL[filter].toLowerCase()
    return (
      <Empty
        title={`No ${label} yet`}
        body={`Add your first ${filter === 'all' ? 'master' : MASTER_TYPE_LABEL[filter as MasterType].toLowerCase()} to the directory.`}
        actionLabel="New Master"
        onAction={openCreate}
      />
    )
  }

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
        {/* Header + search + tabs all stick together, so the search bar stays
            reachable however far the directory scrolls. */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(16px + env(safe-area-inset-top,0px)) 16px 12px', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            <button onClick={triggerClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.muted, padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', gap: 5, font: '600 14px Plus Jakarta Sans' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: MASTERS_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Contact size={15} color="#fff" />
              </div>
              <span style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Masters</span>
            </div>
            <button onClick={openCreate} aria-label="New master" style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>

          <div style={{ padding: '0 16px 12px', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={16} color={c.muted} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search masters..."
                aria-label="Search masters"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: `1.5px solid ${c.faint}`, background: c.surface2, borderRadius: 13,
                  padding: '11px 14px 11px 36px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 7 }}>
              {FILTERS.map(f => {
                const on = filter === f
                const label = f === 'all' ? 'All' : MASTER_TYPE_PLURAL[f]
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      flex: 1, cursor: 'pointer', borderRadius: 11, padding: '8px 0',
                      font: '700 12px Plus Jakarta Sans',
                      background: on ? c.ink : c.surface2,
                      color: on ? c.bg : c.sub,
                      border: 'none',
                    }}
                  >
                    {label} {counts[f] > 0 && <span style={{ opacity: 0.6 }}>{counts[f]}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px calc(32px + env(safe-area-inset-bottom,0px))', maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Manage people and merchants used across MoneyPlant.
          </div>

          {visible.length === 0 ? renderEmpty() : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visible.map(m => (
                // key is the id, never the name or index: the list re-sorts on
                // every rename, so a name key would tear the row's identity.
                <button
                  key={m.id}
                  onClick={() => setDetailId(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16,
                    padding: '12px 14px', cursor: 'pointer',
                  }}
                >
                  <MasterAvatar name={m.name} type={m.type} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: MASTER_ACCENTS[m.type].solid, marginTop: 2 }}>
                      {MASTER_TYPE_LABEL[m.type]}
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={c.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {detailMaster && (
        <MasterDetailPage
          master={detailMaster}
          onClose={() => setDetailId(null)}
          onEdit={() => openEdit(detailMaster)}
          onDelete={onDeleteMaster}
          onFetchSpend={onFetchSpend}
        />
      )}

      <MasterFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        state={state}
        onSave={handleSave}
        editMaster={editing}
      />
    </>
  )
}

function Empty({ icon, title, body, actionLabel, onAction }: {
  icon?: boolean
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  const c = useTheme()
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px' }}>
      {icon && (
        <div style={{ width: 60, height: 60, borderRadius: 18, background: `${MASTERS_COLOR}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Contact size={28} color={MASTERS_COLOR} />
        </div>
      )}
      <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>{title}</div>
      <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 22 }}>{body}</div>
      <button
        onClick={onAction}
        style={{ background: MASTERS_COLOR, color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
      >
        {actionLabel}
      </button>
    </div>
  )
}
