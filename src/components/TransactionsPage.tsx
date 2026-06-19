import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { CAT_COLORS, ACCOUNT_PALETTE } from '@/lib/tokens'
import { fmt, fmtDate, fmtTime } from '@/lib/utils'
import { catById as buildCatById } from '@/lib/data'
import { Glyph } from './Glyph'
import { CategorySelect } from './CategorySelect'
import { BottomSheet, HelpText } from './BottomSheet'
import type { AppState, Transaction, TransactionType } from '@/types'
import { BORROWING_CREDIT_CATS } from '@/lib/constants'

type EditForm = {
  description: string
  amount: string
  transaction_date: string
  transaction_type: TransactionType
  category_id: string
  from_account_id: string
  to_account_id: string
}

interface TransactionsPageProps {
  state: AppState
  onDelete: (t: Transaction) => Promise<void>
  onUpdate: (old: Transaction, form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }) => Promise<void>
  onClose: () => void
  onSwipeProgress?: (pct: number) => void
  dark: boolean
  onToggleTheme: () => void
  userName: string
  userEmail: string
  synced: boolean
  onSignOut: () => void
  onSettings: () => void
  onCategories: () => void
  onAddCategory: (name: string, group_name: string) => Promise<string>
  onReversePayment: (t: Transaction) => Promise<void>
  initialEditTx?: Transaction | null
  onAdd?: () => void
  onToggleChallengeExclusion?: (txnId: string) => Promise<void>
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export function TransactionsPage({ state, onDelete, onUpdate, onClose, onSwipeProgress, dark, onToggleTheme, userName, userEmail, synced, onSignOut, onSettings, onCategories, onAddCategory, onReversePayment, initialEditTx, onAdd, onToggleChallengeExclusion }: TransactionsPageProps) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)

  useEffect(() => {
    if (initialEditTx) openEdit(initialEditTx)
  }, [])

  // Lock the page behind this full-screen overlay so the dashboard doesn't
  // show a second scrollbar / scroll underneath. Restore on close.
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

  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [showSystemTxns, setShowSystemTxns] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [quickCatTx, setQuickCatTx] = useState<Transaction | null>(null)
  const [quickCatId, setQuickCatId] = useState('')
  const [quickCatSaving, setQuickCatSaving] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
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
  const initials = userName.split(' ').map((w: string) => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])
  const accounts = state.accounts.filter(a => a.is_active)
  const groups = state.groups

  const filtered = useMemo(() => {
    let txns = [...state.transactions]
    if (!showSystemTxns) txns = txns.filter(t => t.transaction_type !== 'opening_balance' && t.transaction_type !== 'balance_adjustment')
    if (search.trim()) txns = txns.filter(t => t.description.toLowerCase().includes(search.toLowerCase()))
    if (filterAccount !== 'all') txns = txns.filter(t => t.from_account_id === filterAccount || (t as any).credit_card_id === filterAccount)
    if (filterCategory !== 'all') txns = txns.filter(t => t.category_id === filterCategory)
    if (filterGroup !== 'all') txns = txns.filter(t => catMap[t.category_id!]?.group_name === filterGroup)
    if (filterDateFrom) txns = txns.filter(t => t.transaction_date >= filterDateFrom)
    if (filterDateTo) txns = txns.filter(t => t.transaction_date <= filterDateTo)
    txns.sort((a, b) => {
      if (sortKey === 'date_desc') {
        if (a.transaction_date !== b.transaction_date) return a.transaction_date < b.transaction_date ? 1 : -1
        return a.created_at < b.created_at ? 1 : -1
      }
      if (sortKey === 'date_asc') {
        if (a.transaction_date !== b.transaction_date) return a.transaction_date > b.transaction_date ? 1 : -1
        return a.created_at > b.created_at ? 1 : -1
      }
      if (sortKey === 'amount_desc') return b.amount - a.amount
      if (sortKey === 'amount_asc')  return a.amount - b.amount
      return 0
    })
    return txns
  }, [state.transactions, search, filterAccount, filterCategory, filterGroup, filterDateFrom, filterDateTo, sortKey, showSystemTxns])

  const totalFiltered = filtered.reduce((s, t) => s + t.amount, 0)

  const [borrowingDeleteTarget, setBorrowingDeleteTarget] = useState<Transaction | null>(null)

  const handleDelete = async (t: Transaction) => {
    if (!confirm(`Delete "${t.description}" (${fmt(t.amount)})?`)) return
    // Check if this transaction is linked to a borrowing
    if (t.borrowing_id) {
      setBorrowingDeleteTarget(t)
      return
    }
    setDeleting(t.id)
    try { await onDelete(t) } catch (_) {}
    setDeleting(null)
  }

  const doDeleteWithBorrowingChoice = async (t: Transaction, reverseInTracker: boolean) => {
    setBorrowingDeleteTarget(null)
    setDeleting(t.id)
    try {
      if (reverseInTracker) await onReversePayment(t)
      else await onDelete(t)
    } catch (_) {}
    setDeleting(null)
  }

  const openEdit = (t: Transaction) => {
    setEditingTx(t)
    setEditForm({
      description: t.description,
      amount: String(t.amount),
      transaction_date: t.transaction_date,
      transaction_type: t.transaction_type,
      category_id: t.category_id || '',
      from_account_id: t.from_account_id || (t as any).credit_card_id || '',
      to_account_id: t.to_account_id || '',
    })
  }

  const closeEdit = () => { setEditingTx(null); setEditForm(null) }

  const openQuickCat = (e: React.MouseEvent, t: Transaction) => {
    e.stopPropagation()
    setQuickCatTx(t)
    setQuickCatId(t.category_id || '')
  }

  const handleQuickCatSave = async () => {
    if (!quickCatTx) return
    setQuickCatSaving(true)
    try {
      await onUpdate(quickCatTx, {
        description: quickCatTx.description,
        amount: quickCatTx.amount,
        transaction_date: quickCatTx.transaction_date,
        transaction_type: quickCatTx.transaction_type,
        category_id: quickCatId || null,
        from_account_id: quickCatTx.from_account_id || null,
        to_account_id: quickCatTx.to_account_id || null,
      })
      setQuickCatTx(null)
    } catch (_) {}
    setQuickCatSaving(false)
  }

  const handleEditSave = async () => {
    if (!editingTx || !editForm) return
    const amount = parseFloat(editForm.amount)
    if (!editForm.description.trim() || isNaN(amount) || amount <= 0) return
    setSaving(true)
    try {
      await onUpdate(editingTx, {
        description: editForm.description.trim(),
        amount,
        transaction_date: editForm.transaction_date,
        transaction_type: editForm.transaction_type,
        category_id: editForm.category_id || null,
        from_account_id: editForm.from_account_id || null,
        to_account_id: editForm.transaction_type === 'transfer' ? (editForm.to_account_id || null) : null,
      })
      closeEdit()
    } catch (_) {}
    setSaving(false)
  }

  const clearFilters = () => {
    setSearch(''); setFilterAccount('all'); setFilterCategory('all')
    setFilterGroup('all'); setFilterDateFrom(''); setFilterDateTo('')
  }
  const hasFilters = search || filterAccount !== 'all' || filterCategory !== 'all' ||
    filterGroup !== 'all' || filterDateFrom || filterDateTo

  const inp: React.CSSProperties = {
    width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 11, padding: '9px 12px', font: '600 13px Plus Jakarta Sans',
    color: c.ink, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
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

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: c.bg, borderBottom: `1px solid ${c.faint}` }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px' }}>
          <button onClick={triggerClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>All Transactions</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{filtered.length} entries · {fmt(totalFiltered)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasFilters && (
              <button onClick={clearFilters} style={{ background: c.badSoft, color: c.bad, border: 'none', borderRadius: 999, padding: '6px 12px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                Clear
              </button>
            )}
            {/* Filter toggle */}
            <button
              onClick={() => setFiltersVisible(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: filtersVisible ? c.accent : c.surface2,
                transition: 'background 0.2s ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={filtersVisible ? '#fff' : c.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
                <line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
            </button>
            {/* Add transaction */}
            {onAdd && (
              <button
                onClick={onAdd}
                style={{
                  width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: c.accent,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            )}
            {/* Theme toggle */}
            <button onClick={onToggleTheme} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: `1px solid ${c.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Glyph name={dark ? 'sun' : 'moon'} color={c.ink} size={16} />
            </button>
            {/* Avatar */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                style={{ width: 36, height: 36, borderRadius: 999, background: c.accent, color: '#fff', font: '800 13px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer', position: 'relative' }}
              >
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
                  <button onClick={() => { setMenuOpen(false); onCategories() }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', color: c.ink, font: '700 13px Plus Jakarta Sans', textAlign: 'left' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                    Categories
                  </button>
                  <button onClick={() => { setMenuOpen(false); onSettings() }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer', color: c.ink, font: '700 13px Plus Jakarta Sans', textAlign: 'left' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                    Settings
                  </button>
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
        <div style={{
          overflow: 'hidden',
          maxHeight: filtersVisible ? '380px' : '0px',
          opacity: filtersVisible ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
          willChange: 'max-height, opacity',
        }}>
          <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Search description..." value={search} onChange={e => setSearch(e.target.value)} style={inp} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCategory('all') }} style={{ ...inp, flex: 1 }}>
                <option value="all">All groups</option>
                {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="all">All categories</option>
                {state.categories.filter(cat => filterGroup === 'all' || cat.group_name === filterGroup).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="all">All accounts</option>
                <optgroup label="Bank / Cash">
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
                {(state.credit_cards || []).length > 0 && (
                  <optgroup label="Credit Cards">
                    {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                  </optgroup>
                )}
              </select>
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={{ ...inp, flex: 1 }}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...inp, flex: 1 }} />
              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>to</span>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
            <button
              onClick={() => setShowSystemTxns(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: `1.5px solid ${showSystemTxns ? c.accent : c.faint}`,
                borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                font: '600 12px Plus Jakarta Sans',
                color: showSystemTxns ? c.accent : c.muted,
                width: '100%',
              }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4, border: `2px solid ${showSystemTxns ? c.accent : c.faint}`,
                background: showSystemTxns ? c.accent : 'transparent',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {showSystemTxns && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2 6 5 9 10 3"/></svg>}
              </span>
              Show system transactions (Opening Balance, Balance Adjustment)
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', font: '600 14px Plus Jakarta Sans', color: c.muted }}>No transactions found</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            {filtered.map((t, i) => {
              const cat = catMap[t.category_id!]
              const col = (cat && CAT_COLORS[cat.name]) || c.muted
              const acc = state.accounts.find(a => a.id === t.from_account_id)
              const creditCard = !acc ? (state.credit_cards || []).find(cc => cc.id === t.from_account_id || cc.id === (t as any).credit_card_id) : null
              const toAcc = (t.transaction_type === 'transfer' || t.transaction_type === 'savings_withdrawal') && t.to_account_id ? state.accounts.find(a => a.id === t.to_account_id) : null
              const displayAcc = t.transaction_type === 'savings_withdrawal' ? toAcc : acc
              const accLabel = t.transaction_type === 'transfer' && toAcc
                ? `${acc?.name || '?'} → ${toAcc.name}`
                : displayAcc ? displayAcc.name : acc ? acc.name : creditCard ? creditCard.name : ''
              const accIdx = acc ? state.accounts.findIndex(a => a.id === acc.id) : -1
              const accColor = acc ? ACCOUNT_PALETTE[Math.max(0, accIdx) % ACCOUNT_PALETTE.length] : creditCard ? '#6366F1' : c.muted
              const isDeleting = deleting === t.id
              const prevDate = i > 0 ? filtered[i - 1].transaction_date : null
              const showDateHeader = t.transaction_date !== prevDate

              return (
                <div key={t.id}>
                  {showDateHeader && (
                    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '14px 0 6px' }}>
                      {fmtDate(t.transaction_date)}
                    </div>
                  )}
                  <div
                    onClick={() => !isDeleting && openEdit(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: c.surface, borderRadius: 16, padding: '12px 14px', border: `1px solid ${c.faint}`, opacity: isDeleting ? 0.5 : 1, cursor: 'pointer', transition: 'opacity 0.15s' }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: col + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px Plus Jakarta Sans', color: col }}>
                      {t.description.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        {t.transaction_type === 'savings_contribution' && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: '#10B981', background: 'rgba(16,185,129,0.1)', borderRadius: 999, padding: '2px 7px' }}>Savings</span>
                        )}
                        {t.transaction_type === 'savings_withdrawal' && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: '#10B981', background: 'rgba(16,185,129,0.1)', borderRadius: 999, padding: '2px 7px' }}>Withdrawal</span>
                        )}
                        {cat && t.transaction_type !== 'savings_contribution' && t.transaction_type !== 'savings_withdrawal'
                          ? <span style={{ font: '600 10px Plus Jakarta Sans', color: col, background: col + '18', borderRadius: 999, padding: '2px 7px' }}>{cat.name}</span>
                          : t.transaction_type !== 'transfer' && t.transaction_type !== 'savings_contribution' && t.transaction_type !== 'savings_withdrawal' && (
                            <span
                              onClick={e => openQuickCat(e, t)}
                              style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px', border: `1px dashed ${c.faint}`, cursor: 'pointer' }}
                            >
                              + category
                            </span>
                          )
                        }
                        {accLabel && <span style={{ font: '600 10px Plus Jakarta Sans', color: accColor, background: accColor + '18', borderRadius: 999, padding: '2px 7px' }}>{accLabel}</span>}
                        {(state.settings.challenge_excluded_txn_ids ?? []).includes(t.id) && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px', border: `1px dashed ${c.faint}` }}>excl. challenge</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <div style={{ font: '800 14px Plus Jakarta Sans', color:
                          t.transaction_type === 'income' ? c.good :
                          t.transaction_type === 'savings_withdrawal' ? '#10B981' :
                          t.transaction_type === 'savings_contribution' ? '#10B981' :
                          t.transaction_type === 'transfer' ? c.accent :
                          (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') ? '#6366F1' :
                          c.bad }}>
                          {(t.transaction_type === 'income' || t.transaction_type === 'savings_withdrawal') ? '+' :
                           t.transaction_type === 'savings_contribution' ? '−' :
                           t.transaction_type === 'transfer' ? '⇄' :
                           (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment')
                             ? (BORROWING_CREDIT_CATS.has(catMap[t.category_id!]?.name ?? '') ? '+' : '−')
                             : '−'}{fmt(t.amount, { decimals: t.amount % 1 ? 2 : 0 })}
                        </div>
                        <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{fmtTime(t.created_at)}</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(t) }}
                        disabled={isDeleting}
                        style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <BottomSheet open={!!(editingTx && editForm)} onClose={closeEdit} maxHeight="88svh" zIndex={300}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Edit Transaction</div>

            {editForm && <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label>Description</Label>
                <HelpText>What this transaction was for.</HelpText>
                <input
                  value={editForm.description}
                  onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                  style={inp}
                  placeholder="Description"

                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Amount</Label>
                  <HelpText>Transaction amount in rupees.</HelpText>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={editForm.amount}
                    onChange={e => !editingTx?.borrowing_id && setEditForm(f => f ? { ...f, amount: e.target.value } : f)}
                    onFocus={e => e.target.select()}
                    style={{ ...inp, ...(editingTx?.borrowing_id ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    readOnly={!!editingTx?.borrowing_id}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Date</Label>
                  <HelpText>When this transaction occurred.</HelpText>
                  <input
                    type="date"
                    value={editForm.transaction_date}
                    onChange={e => setEditForm(f => f ? { ...f, transaction_date: e.target.value } : f)}
                    style={inp}
                  />
                </div>
              </div>

              <div>
                <Label>Type</Label>
                <select value={editForm.transaction_type} disabled style={{ ...inp, opacity: 0.5, cursor: 'not-allowed' }}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                  <option value="commitment">Commitment</option>
                  <option value="borrowing">Borrowing</option>
                  <option value="borrowing_repayment">Borrowing Repayment</option>
                  <option value="savings_contribution">Savings Contribution</option>
                  <option value="savings_withdrawal">Savings Withdrawal</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {editForm.transaction_type !== 'transfer' && editForm.transaction_type !== 'savings_contribution' && editForm.transaction_type !== 'savings_withdrawal' && (
                  <div style={{ flex: 1 }}>
                    <Label>Category</Label>
                    <HelpText>Used for spending analytics and reports.</HelpText>
                    {editingTx?.borrowing_id ? (
                      <div style={{ ...inp, opacity: 0.5, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{state.categories.find(c => c.id === editForm.category_id)?.name || 'Uncategorized'}</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      </div>
                    ) : (
                      <CategorySelect
                        value={editForm.category_id}
                        onChange={v => setEditForm(f => f ? { ...f, category_id: v } : f)}
                        state={state}
                        onAddCategory={onAddCategory}
                        style={inp}
                        includeEmpty
                        emptyLabel="No category"
                      />
                    )}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <Label>{editForm.transaction_type === 'transfer' || editForm.transaction_type === 'savings_contribution' ? 'From' : editForm.transaction_type === 'savings_withdrawal' ? 'To Account' : 'Account'}</Label>
                  <HelpText>Which account was debited or credited.</HelpText>
                  <select
                    value={editForm.from_account_id}
                    onChange={e => setEditForm(f => f ? { ...f, from_account_id: e.target.value } : f)}
                    style={inp}
                  >
                    <option value="">No account</option>
                    <optgroup label="Bank / Cash">
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                    {(state.credit_cards || []).length > 0 && !['income', 'borrowing', 'transfer', 'savings_contribution', 'savings_withdrawal'].includes(editForm.transaction_type) && (
                      <optgroup label="Credit Cards">
                        {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                {(editForm.transaction_type === 'transfer') && (
                  <div style={{ flex: 1 }}>
                    <Label>To</Label>
                    <select
                      value={editForm.to_account_id}
                      onChange={e => setEditForm(f => f ? { ...f, to_account_id: e.target.value } : f)}
                      style={inp}
                    >
                      <option value="">No account</option>
                      <optgroup label="Bank / Cash">
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Challenge exclusion toggle — only for expenses when challenge is active */}
            {editingTx && editForm?.transaction_type === 'expense' && (state.settings.challenge_enabled ?? false) && onToggleChallengeExclusion && (() => {
              const isExcluded = (state.settings.challenge_excluded_txn_ids ?? []).includes(editingTx.id)
              return (
                <div style={{ marginTop: 16, background: c.surface2, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>Exclude from Daily Challenge</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                      {isExcluded ? "This transaction won't count toward today's goal" : "This transaction counts toward today's spending goal"}
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleChallengeExclusion(editingTx.id)}
                    style={{
                      flexShrink: 0, padding: '6px 14px', borderRadius: 99, cursor: 'pointer',
                      font: '700 12px Plus Jakarta Sans',
                      background: isExcluded ? c.good + '22' : c.surface,
                      color: isExcluded ? c.good : c.muted,
                      border: `1.5px solid ${isExcluded ? c.good + '55' : c.faint}`,
                    }}
                  >
                    {isExcluded ? 'Excluded' : 'Exclude'}
                  </button>
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={closeEdit}
                style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            </>}
      </BottomSheet>

      {/* Quick categorize sheet */}
      <BottomSheet open={!!quickCatTx} onClose={() => setQuickCatTx(null)} zIndex={350}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Set Category</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>{quickCatTx?.description}</div>
        <CategorySelect
          value={quickCatId}
          onChange={setQuickCatId}
          state={state}
          onAddCategory={onAddCategory}
          style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}
          includeEmpty
          emptyLabel="None"
          filterGroup={quickCatTx?.transaction_type === 'income' ? 'Income' : undefined}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setQuickCatTx(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleQuickCatSave} disabled={quickCatSaving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: quickCatSaving ? 'not-allowed' : 'pointer', opacity: quickCatSaving ? 0.7 : 1 }}>
            {quickCatSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </BottomSheet>

      {/* Borrowing-linked delete confirmation */}
      {borrowingDeleteTarget && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setBorrowingDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Borrowing-linked transaction</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
              This transaction is linked to a borrowing entry. Do you want to also reverse it in the borrowing tracker?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => doDeleteWithBorrowingChoice(borrowingDeleteTarget, true)}
                style={{ width: '100%', background: c.bad, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete + reverse in tracker
              </button>
              <button
                onClick={() => doDeleteWithBorrowingChoice(borrowingDeleteTarget, false)}
                style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Delete transaction only
              </button>
              <button
                onClick={() => setBorrowingDeleteTarget(null)}
                style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
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
