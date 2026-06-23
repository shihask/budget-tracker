import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CategorySelect } from './CategorySelect'
import { BottomSheet, HelpText } from './BottomSheet'
import { Glyph } from './Glyph'
import type { AppState, Borrowing } from '@/types'

type BForm = {
  person_name: string
  total_amount: string
  paid_amount: string
  notes: string
  direction: 'lent' | 'borrowed'
  account_id: string
  transaction_date: string
}

type PayForm = {
  amount: string
  account_id: string
  category_id: string
  incoming: boolean
}

type SortKey = 'remaining_desc' | 'remaining_asc' | 'amount_desc' | 'amount_asc' | 'name_asc' | 'name_desc'

const EMPTY_BFORM: BForm = { person_name: '', total_amount: '', paid_amount: '0', notes: '', direction: 'lent', account_id: '', transaction_date: new Date().toISOString().slice(0, 10) }
const EMPTY_PAY: PayForm = { amount: '', account_id: '', category_id: '', incoming: true }

interface BorrowingPageProps {
  state: AppState
  onAdd: (form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed'; transaction_date?: string }, addTransaction: boolean, accountId: string | null) => Promise<void>
  onUpdate: (id: string, form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' }) => Promise<void>
  onDelete: (id: string, deleteTransactions: boolean) => Promise<void>
  onPayment: (b: Borrowing, amount: number, accountId: string | null, incoming: boolean, categoryId: string | null, addTransaction: boolean) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  initialAddOpen?: boolean
  dark: boolean
  onToggleTheme: () => void
  userName: string
  userEmail: string
  synced: boolean
  onSignOut: () => void
}

const avatarColors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899']
const colorFor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length]

export function BorrowingPage({ state, onAdd, onUpdate, onDelete, onPayment, onAddCategory, onClose, onSwipeProgress, initialAddOpen, dark, onToggleTheme, userName, userEmail, synced, onSignOut }: BorrowingPageProps) {
  const c = useTheme()
  const accounts = state.accounts.filter(a => a.is_active)

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterDirection, setFilterDirection] = useState<'all' | 'lent' | 'borrowed'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'cleared'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('remaining_desc')
  const [filtersVisible, setFiltersVisible] = useState(false)

  // ── Add / Edit form ───────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addInfoOpen, setAddInfoOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BForm>(EMPTY_BFORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // ── Payment form ──────────────────────────────────────────────────────────────
  const [payTarget, setPayTarget] = useState<Borrowing | null>(null)
  const [payForm, setPayForm] = useState<PayForm>(EMPTY_PAY)
  const [paying, setPaying] = useState(false)

  // ── Confirm modals ────────────────────────────────────────────────────────────
  const [addConfirm, setAddConfirm] = useState(false)
  const [payConfirm, setPayConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [pendingAddForm, setPendingAddForm] = useState<{ person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' } | null>(null)

  // ── Avatar menu ───────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // ── Swipe-back gesture ────────────────────────────────────────────────────────
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

  // Lock the dashboard behind this full-screen overlay (no ghost scrollbar / background scroll).
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

  const initials = userName.split(' ').map((w: string) => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()

  // ── Filtered & sorted list ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = [...state.borrowings]
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(b => b.person_name.toLowerCase().includes(q) || (b.notes || '').toLowerCase().includes(q))
    }
    if (filterDirection !== 'all') items = items.filter(b => (b.direction || 'lent') === filterDirection)
    if (filterStatus === 'active') items = items.filter(b => (b.remaining_amount ?? (b.total_amount - b.paid_amount)) > 0)
    if (filterStatus === 'cleared') items = items.filter(b => (b.remaining_amount ?? (b.total_amount - b.paid_amount)) <= 0)
    items.sort((a, b) => {
      const ra = a.remaining_amount ?? (a.total_amount - a.paid_amount)
      const rb = b.remaining_amount ?? (b.total_amount - b.paid_amount)
      if (sortKey === 'remaining_desc') return rb - ra
      if (sortKey === 'remaining_asc') return ra - rb
      if (sortKey === 'amount_desc') return b.total_amount - a.total_amount
      if (sortKey === 'amount_asc') return a.total_amount - b.total_amount
      if (sortKey === 'name_asc') return a.person_name.localeCompare(b.person_name)
      if (sortKey === 'name_desc') return b.person_name.localeCompare(a.person_name)
      return 0
    })
    return items
  }, [state.borrowings, search, filterDirection, filterStatus, sortKey])

  const totalLentRemaining = state.borrowings
    .filter(b => (b.direction || 'lent') === 'lent')
    .reduce((s, b) => s + Math.max(0, b.remaining_amount ?? (b.total_amount - b.paid_amount)), 0)
  const totalOwedRemaining = state.borrowings
    .filter(b => (b.direction || 'lent') === 'borrowed')
    .reduce((s, b) => s + Math.max(0, b.remaining_amount ?? (b.total_amount - b.paid_amount)), 0)

  const hasFilters = search || filterDirection !== 'all' || filterStatus !== 'all'
  const clearFilters = () => { setSearch(''); setFilterDirection('all'); setFilterStatus('all') }

  // ── Add / Edit handlers ───────────────────────────────────────────────────────
  const openAdd = () => { setEditingId(null); setForm({ ...EMPTY_BFORM, account_id: accounts[0]?.id || '', transaction_date: new Date().toISOString().slice(0, 10) }); setSheetOpen(true) }
  const openEdit = (b: Borrowing) => {
    setEditingId(b.id)
    setForm({ person_name: b.person_name, total_amount: String(b.total_amount), paid_amount: String(b.paid_amount), notes: b.notes || '', direction: b.direction || 'lent', account_id: accounts[0]?.id || '', transaction_date: new Date().toISOString().slice(0, 10) })
    setSheetOpen(true)
  }
  const closeSheet = () => { setSheetOpen(false); setEditingId(null); setForm(EMPTY_BFORM); setAddInfoOpen(false) }

  // Auto-open the Add sheet when arriving via the dashboard "+" shortcut.
  useEffect(() => {
    if (initialAddOpen) openAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    const total = parseFloat(form.total_amount)
    const paid = parseFloat(form.paid_amount) || 0
    if (!form.person_name.trim() || isNaN(total) || total <= 0) return
    const payload = { person_name: form.person_name.trim(), total_amount: total, paid_amount: paid, notes: form.notes || null, direction: form.direction, transaction_date: form.transaction_date || new Date().toISOString().slice(0, 10) }
    if (!editingId) {
      setPendingAddForm(payload)
      setAddConfirm(true)
      return
    }
    setSaving(true)
    try { await onUpdate(editingId, payload); closeSheet() } catch (_) {}
    setSaving(false)
  }

  const doAdd = async (addAsTransaction: boolean) => {
    if (!pendingAddForm) return
    setSaving(true)
    setAddConfirm(false)
    try {
      await onAdd(pendingAddForm, addAsTransaction, addAsTransaction ? form.account_id || null : null)
      closeSheet()
    } catch (_) {}
    setSaving(false)
    setPendingAddForm(null)
  }

  // ── Delete handlers ───────────────────────────────────────────────────────────
  const doDelete = async (id: string, deleteTransactions: boolean) => {
    setDeleting(id)
    setDeleteConfirm(null)
    try { await onDelete(id, deleteTransactions) } catch (_) {}
    setDeleting(null)
  }

  // ── Payment handlers ──────────────────────────────────────────────────────────
  const openPay = (b: Borrowing) => {
    setPayTarget(b)
    const incoming = (b.direction || 'lent') === 'lent'
    setPayForm({ amount: String(b.remaining_amount || 0), account_id: accounts[0]?.id || '', category_id: '', incoming })
  }
  const closePay = () => { setPayTarget(null); setPayForm(EMPTY_PAY) }

  const doPayment = async (addTransaction: boolean) => {
    if (!payTarget) return
    const amt = parseFloat(payForm.amount)
    setPaying(true)
    setPayConfirm(false)
    try {
      await onPayment(payTarget, amt, payForm.account_id || null, payForm.incoming, payForm.category_id || null, addTransaction)
      closePay()
    } catch (_) {}
    setPaying(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '9px 12px',
    font: '600 13px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  const ConfirmModal = ({ title, message, yesLabel, noLabel, onYes, onNo, yesColor }: {
    title: string; message: React.ReactNode; yesLabel: string; noLabel: string
    onYes: () => void; onNo: () => void; yesColor?: string
  }) => createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onNo} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>{title}</div>
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onYes} style={{ width: '100%', background: yesColor || c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>{yesLabel}</button>
          <button onClick={onNo} style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>{noLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  )

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
      style={{
        position: 'fixed', inset: 0, background: c.bg, zIndex: 100,
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
          : entryPlayed
          ? {}
          : { animation: 'slideInFromRight 0.32s cubic-bezier(0.32,0.72,0,1)' }),
      }}
    >
      {/* ── Sticky header ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Borrowings</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasFilters && (
              <button onClick={clearFilters} style={{ background: c.badSoft, color: c.bad, border: 'none', borderRadius: 999, padding: '6px 12px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                Clear
              </button>
            )}
            {/* Add button */}
            <button onClick={openAdd} style={{ width: 36, height: 36, borderRadius: 999, background: c.accentSoft, color: c.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, font: '700 20px Plus Jakarta Sans' }}>+</button>
            {/* Filter toggle */}
            <button
              onClick={() => setFiltersVisible(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: filtersVisible ? c.accent : c.surface2, transition: 'background 0.2s ease' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={filtersVisible ? '#fff' : c.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
            </button>
            {/* Theme toggle */}
            <button onClick={onToggleTheme} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: `1px solid ${c.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Glyph name={dark ? 'sun' : 'moon'} color={c.ink} size={16} />
            </button>
            {/* Avatar */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(v => !v)} style={{ width: 36, height: 36, borderRadius: 999, background: c.accent, color: '#fff', font: '800 13px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer', position: 'relative' }}>
                {initials}
                <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: 999, background: synced ? '#22C55E' : '#F59E0B', border: `2px solid ${c.bg}` }} />
              </button>
              {menuOpen && (
                <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 400, background: c.surface, borderRadius: 16, padding: '6px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: `1px solid ${c.faint}`, minWidth: 200 }}>
                  <div style={{ padding: '10px 12px 8px' }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{userName}</div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{userEmail}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: synced ? '#22C55E18' : '#F59E0B18', borderRadius: 999, padding: '3px 8px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: synced ? '#22C55E' : '#F59E0B', flexShrink: 0 }} />
                      <span style={{ font: '600 10px Plus Jakarta Sans', color: synced ? '#22C55E' : '#F59E0B' }}>{synced ? 'Synced with cloud' : 'Offline — local data'}</span>
                    </div>
                  </div>
                  <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />
                  <button onClick={() => { setMenuOpen(false); onSignOut() }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', color: c.bad, font: '700 13px Plus Jakarta Sans', textAlign: 'left' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible filters */}
        <div style={{ overflow: 'hidden', maxHeight: filtersVisible ? '200px' : '0px', opacity: filtersVisible ? 1 : 0, transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease', willChange: 'max-height, opacity' }}>
          <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Search person or notes..." value={search} onChange={e => setSearch(e.target.value)} style={inp} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterDirection} onChange={e => setFilterDirection(e.target.value as typeof filterDirection)} style={{ ...inp, flex: 1 }}>
                <option value="all">All types</option>
                <option value="lent">Lent (they owe me)</option>
                <option value="borrowed">Borrowed (I owe them)</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} style={{ ...inp, flex: 1 }}>
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="cleared">Cleared</option>
              </select>
            </div>
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={inp}>
              <option value="remaining_desc">Remaining (high → low)</option>
              <option value="remaining_asc">Remaining (low → high)</option>
              <option value="amount_desc">Total amount (high → low)</option>
              <option value="amount_asc">Total amount (low → high)</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary strip ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px 4px' }}>
        <div style={{ flex: 1, background: c.goodSoft, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.good, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Owed to you</div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.good, marginTop: 2 }}>{fmt(totalLentRemaining)}</div>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {state.borrowings.filter(b => (b.direction || 'lent') === 'lent' && (b.remaining_amount ?? (b.total_amount - b.paid_amount)) > 0).length} active
          </div>
        </div>
        <div style={{ flex: 1, background: c.badSoft, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.bad, textTransform: 'uppercase', letterSpacing: '0.04em' }}>You owe</div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.bad, marginTop: 2 }}>{fmt(totalOwedRemaining)}</div>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {state.borrowings.filter(b => (b.direction || 'lent') === 'borrowed' && (b.remaining_amount ?? (b.total_amount - b.paid_amount)) > 0).length} active
          </div>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', font: '600 14px Plus Jakarta Sans', color: c.muted }}>
            {state.borrowings.length === 0 ? 'No entries yet. Tap + to add.' : 'No entries match your filters.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {filtered.map(b => {
              const pct = b.total_amount > 0 ? Math.round((b.paid_amount / b.total_amount) * 100) : 0
              const done = (b.remaining_amount ?? (b.total_amount - b.paid_amount)) <= 0
              const col = colorFor(b.person_name)
              const isDeleting = deleting === b.id
              const direction = b.direction || 'lent'

              return (
                <div
                  key={b.id}
                  onClick={() => !isDeleting && openEdit(b)}
                  style={{ background: c.surface, borderRadius: 16, padding: '14px', border: `1px solid ${c.faint}`, opacity: isDeleting ? 0.5 : 1, cursor: 'pointer', transition: 'opacity 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0, background: col + '22', color: col, font: '800 15px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {b.person_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{b.person_name}</span>
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: direction === 'lent' ? c.good : c.bad, background: direction === 'lent' ? c.goodSoft : c.badSoft, borderRadius: 999, padding: '2px 7px' }}>
                          {direction === 'lent' ? 'Lent' : 'Borrowed'}
                        </span>
                        {done && <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 999, padding: '2px 7px' }}>Cleared</span>}
                      </div>
                      {b.notes && <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ font: '800 16px Plus Jakarta Sans', color: done ? c.good : c.bad }}>
                        {fmt(b.remaining_amount ?? (b.total_amount - b.paid_amount))}
                      </div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>remaining</div>
                    </div>
                  </div>

                  <div style={{ height: 6, borderRadius: 999, background: c.surface2, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: Math.min(100, pct) + '%', height: '100%', borderRadius: 999, background: done ? c.good : col, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!done && (
                        <button
                          onClick={e => { e.stopPropagation(); openPay(b) }}
                          style={{ background: c.goodSoft, color: c.good, border: 'none', borderRadius: 8, padding: '5px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}
                        >
                          ₹ Record Payment
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(b.id) }}
                        disabled={isDeleting}
                        style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    </div>
                    <span style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>Paid {fmt(b.paid_amount)} of {fmt(b.total_amount)} · {pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Sheet ─────────────────────────────────────────────────────── */}
      <BottomSheet open={sheetOpen} onClose={closeSheet} maxHeight="88svh">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
          <span style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
            {editingId ? 'Edit Entry' : 'Add Borrowing'}
          </span>
          <button onClick={() => setAddInfoOpen(true)} aria-label="What do these fields mean?"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        </div>

        {addInfoOpen && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={() => setAddInfoOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 22, width: '100%', maxWidth: 420, maxHeight: '80svh', overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 14 }}>What each field means</div>
              {[
                ['Type', '"I gave money" = you lent it, so they owe you. "I received money" = you borrowed it, so you owe them. This can\u2019t be changed after the entry is created.'],
                ['Person name', 'Who you lent money to, or borrowed it from.'],
                ['Total amount', 'The full amount of the loan.'],
                ['Repaid by them / Repaid by you', 'How much has already been paid back so far. Leave it 0 for a brand-new entry.'],
                ['Account', 'If you choose to record a transaction, the money is deducted from this account (when you lent) or added to it (when you received).'],
                ['Notes', 'Optional reminder for yourself \u2014 e.g. "repaying monthly" or what it was for.'],
              ].map(([label, desc]) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 2 }}>{label}</div>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.55 }}>{desc}</div>
                </div>
              ))}
              <button onClick={() => setAddInfoOpen(false)}
                style={{ width: '100%', marginTop: 6, background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
                Got it
              </button>
            </div>
          </div>,
          document.body
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Type</Label>
            <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3, opacity: editingId ? 0.7 : 1 }}>
              {(['lent', 'borrowed'] as const).map(d => (
                <button key={d} type="button" disabled={!!editingId}
                  onClick={() => { if (!editingId) setForm(f => ({ ...f, direction: d })) }}
                  style={{
                  flex: 1, border: 'none', borderRadius: 10, padding: '9px', font: '700 12px Plus Jakarta Sans',
                  background: form.direction === d ? (d === 'lent' ? c.good : c.bad) : 'transparent',
                  color: form.direction === d ? '#fff' : c.muted, cursor: editingId ? 'not-allowed' : 'pointer',
                }}>
                  {d === 'lent' ? '↑ I gave money' : '↓ I received money'}
                </button>
              ))}
            </div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
              {editingId
                ? "Type can't be changed after an entry is created"
                : (form.direction === 'lent' ? 'You gave money — they owe you' : 'You received money — you owe them')}
            </div>
          </div>
          <div>
            <Label>Person name</Label>
            <HelpText>Who you lent money to or borrowed from.</HelpText>
            <input value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))} placeholder="e.g. Noushad" style={inp} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Label>Total amount</Label>
              <HelpText>The full amount lent or borrowed.</HelpText>
              <input type="number" inputMode="decimal" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="0" min="0" step="0.01" style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>{form.direction === 'lent' ? 'Repaid by them' : 'Repaid by you'}</Label>
              <HelpText>How much has already been paid back. Set to 0 if nothing has been repaid yet.</HelpText>
              <input type="number" inputMode="decimal" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))} placeholder="0" min="0" step="0.01" style={inp} />
            </div>
          </div>
          {!editingId && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Label>Date</Label>
                <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))} style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <Label>{form.direction === 'lent' ? 'Account (deduct from)' : 'Account (received into)'}</Label>
                <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} style={inp}>
                  <option value="">No account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <div>
            <Label>Notes (optional)</Label>
            <HelpText>Any context — when it happened, agreed repayment plan, etc. Optional.</HelpText>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Lent in April, repaying monthly" style={inp} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={closeSheet} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </BottomSheet>

      {/* ── Payment Sheet ────────────────────────────────────────────────────────── */}
      <BottomSheet open={!!payTarget} onClose={closePay} showHelpButton={false}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Record Payment</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3, marginBottom: 16 }}>
          {payTarget?.person_name} · Remaining {payTarget ? fmt(payTarget.remaining_amount ?? (payTarget.total_amount - payTarget.paid_amount)) : ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Payment amount</Label>
            <input type="number" inputMode="decimal" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" min="0" step="0.01" style={inp} />
          </div>
          <div>
            <Label>Direction</Label>
            <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3, opacity: 0.7 }}>
              {([true, false] as const).map(v => (
                <button key={String(v)} type="button" disabled style={{
                  flex: 1, border: 'none', borderRadius: 10, padding: '9px', font: '700 12px Plus Jakarta Sans',
                  background: payForm.incoming === v ? (v ? c.good : c.bad) : 'transparent',
                  color: payForm.incoming === v ? '#fff' : c.muted, cursor: 'not-allowed',
                }}>
                  {v ? '↓ Receiving' : '↑ Paying out'}
                </button>
              ))}
            </div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
              {payForm.incoming ? 'They paid you back → your balance increases' : 'You paid them → your balance decreases'}
            </div>
          </div>
          <div>
            <Label>Account</Label>
            <select value={payForm.account_id} onChange={e => setPayForm(f => ({ ...f, account_id: e.target.value }))} style={inp}>
              <option value="">No account update</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Category (optional)</Label>
            <CategorySelect value={payForm.category_id} onChange={v => setPayForm(f => ({ ...f, category_id: v }))} state={state} onAddCategory={onAddCategory} style={inp} includeEmpty emptyLabel="No category" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={closePay} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { const amt = parseFloat(payForm.amount); if (!isNaN(amt) && amt > 0) setPayConfirm(true) }} disabled={paying} style={{ flex: 2, background: c.good, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.7 : 1 }}>
            {paying ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </BottomSheet>

      {/* ── Confirm: new entry ───────────────────────────────────────────────────── */}
      {addConfirm && pendingAddForm && (
        <ConfirmModal
          title={pendingAddForm.direction === 'lent' ? 'Record as expense?' : 'Record as income?'}
          message={
            pendingAddForm.direction === 'lent'
              ? <>You gave <strong style={{ color: c.ink }}>{fmt(pendingAddForm.total_amount)}</strong> to <strong style={{ color: c.ink }}>{pendingAddForm.person_name}</strong>. Add this as an expense and deduct from your account?</>
              : <><strong style={{ color: c.ink }}>{pendingAddForm.person_name}</strong> gave you <strong style={{ color: c.ink }}>{fmt(pendingAddForm.total_amount)}</strong>. Add this as an income transaction?</>
          }
          yesLabel={pendingAddForm.direction === 'lent' ? '✓ Yes, add as expense' : '✓ Yes, add as income'}
          noLabel="No, just track it"
          yesColor={pendingAddForm.direction === 'lent' ? c.accent : c.good}
          onYes={() => doAdd(true)}
          onNo={() => doAdd(false)}
        />
      )}

      {/* ── Confirm: payment ─────────────────────────────────────────────────────── */}
      {payConfirm && payTarget && (
        <ConfirmModal
          title={payForm.incoming ? 'Record as income?' : 'Record as expense?'}
          message={
            payForm.incoming
              ? <><strong style={{ color: c.ink }}>{payTarget.person_name}</strong> paid you back <strong style={{ color: c.ink }}>{fmt(parseFloat(payForm.amount))}</strong>. Add this to your income transactions?</>
              : <>You're paying <strong style={{ color: c.ink }}>{fmt(parseFloat(payForm.amount))}</strong> to <strong style={{ color: c.ink }}>{payTarget.person_name}</strong>. Add this as an expense transaction?</>
          }
          yesLabel={payForm.incoming ? '✓ Yes, add as income' : '✓ Yes, add as expense'}
          noLabel="No, just update tracker"
          yesColor={payForm.incoming ? c.good : c.accent}
          onYes={() => doPayment(true)}
          onNo={() => doPayment(false)}
        />
      )}

      {/* ── Confirm: delete ──────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete borrowing entry?"
          message="Do you also want to delete all transactions linked to this borrowing entry?"
          yesLabel="Delete entry + transactions"
          noLabel="Delete entry only"
          yesColor={c.bad}
          onYes={() => doDelete(deleteConfirm, true)}
          onNo={() => doDelete(deleteConfirm, false)}
        />
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  const c = useTheme()
  return (
    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </div>
  )
}
