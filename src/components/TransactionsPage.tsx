import { useState, useMemo, useRef, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { CAT_COLORS, ACC_COLORS } from '@/lib/tokens'
import { fmt, fmtDate } from '@/lib/utils'
import { catById as buildCatById } from '@/lib/data'
import type { AppState, Transaction, TransactionType } from '@/types'

type EditForm = {
  description: string
  amount: string
  transaction_date: string
  transaction_type: TransactionType
  category_id: string
  from_account_id: string
}

interface TransactionsPageProps {
  state: AppState
  onDelete: (t: Transaction) => Promise<void>
  onUpdate: (old: Transaction, form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<void>
  onClose: () => void
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export function TransactionsPage({ state, onDelete, onUpdate, onClose }: TransactionsPageProps) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)

  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const current = el.scrollTop
        const diff = current - lastScrollY.current
        if (current === 0) {
          setFiltersVisible(true)
        } else if (diff > 8) {
          setFiltersVisible(false)
        }
        lastScrollY.current = current
        ticking.current = false
      })
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [])
  const accounts = state.accounts.filter(a => a.is_active)
  const groups = ['Lifestyle', 'Commitment', 'Renovation', 'Family', 'Transfer']

  const filtered = useMemo(() => {
    let txns = [...state.transactions]
    if (search.trim()) txns = txns.filter(t => t.description.toLowerCase().includes(search.toLowerCase()))
    if (filterAccount !== 'all') txns = txns.filter(t => t.from_account_id === filterAccount)
    if (filterCategory !== 'all') txns = txns.filter(t => t.category_id === filterCategory)
    if (filterGroup !== 'all') txns = txns.filter(t => catMap[t.category_id!]?.group_name === filterGroup)
    if (filterDateFrom) txns = txns.filter(t => t.transaction_date >= filterDateFrom)
    if (filterDateTo) txns = txns.filter(t => t.transaction_date <= filterDateTo)
    txns.sort((a, b) => {
      if (sortKey === 'date_desc')   return a.transaction_date < b.transaction_date ? 1 : -1
      if (sortKey === 'date_asc')    return a.transaction_date > b.transaction_date ? 1 : -1
      if (sortKey === 'amount_desc') return b.amount - a.amount
      if (sortKey === 'amount_asc')  return a.amount - b.amount
      return 0
    })
    return txns
  }, [state.transactions, search, filterAccount, filterCategory, filterGroup, filterDateFrom, filterDateTo, sortKey])

  const totalFiltered = filtered.reduce((s, t) => s + t.amount, 0)

  const handleDelete = async (t: Transaction) => {
    if (!confirm(`Delete "${t.description}" (${fmt(t.amount)})?`)) return
    setDeleting(t.id)
    try { await onDelete(t) } catch (_) {}
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
      from_account_id: t.from_account_id || '',
    })
  }

  const closeEdit = () => { setEditingTx(null); setEditForm(null) }

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
    <div ref={scrollRef} style={{ position: 'fixed', inset: 0, background: c.bg, zIndex: 100, overflowY: 'auto', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>

      {/* Outer sticky wrapper — slides up to hide filters, keeps title visible */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        willChange: 'transform',
        background: c.bg,
      }}>
        {/* Always-visible title bar */}
        <div style={{ padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 10px', borderBottom: `1px solid ${filtersVisible ? 'transparent' : c.faint}`, transition: 'border-color 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 999, background: c.surface2, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>All Transactions</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{filtered.length} entries · {fmt(totalFiltered)}</div>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} style={{ background: c.badSoft, color: c.bad, border: 'none', borderRadius: 999, padding: '6px 12px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filters — smooth slide + fade */}
        <div style={{
          overflow: 'hidden',
          maxHeight: filtersVisible ? '260px' : '0px',
          opacity: filtersVisible ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
          willChange: 'max-height, opacity',
          padding: filtersVisible ? '0 16px 12px' : '0 16px',
          borderBottom: `1px solid ${c.faint}`,
        }}>
          <div style={{ paddingTop: 10 }}>
            <input placeholder="Search description..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCategory('all') }} style={{ ...inp, flex: 1 }}>
                <option value="all">All groups</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="all">All categories</option>
                {state.categories.filter(cat => filterGroup === 'all' || cat.group_name === filterGroup).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="all">All accounts</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
              const accColor = acc ? (ACC_COLORS[acc.name] || c.accent) : c.muted
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: c.surface, borderRadius: 16, padding: '12px 14px', border: `1px solid ${c.faint}`, opacity: isDeleting ? 0.5 : 1 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: col + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px Plus Jakarta Sans', color: col }}>
                      {t.description.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        {cat && <span style={{ font: '600 10px Plus Jakarta Sans', color: col, background: col + '18', borderRadius: 999, padding: '2px 7px' }}>{cat.name}</span>}
                        {acc && <span style={{ font: '600 10px Plus Jakarta Sans', color: accColor, background: accColor + '18', borderRadius: 999, padding: '2px 7px' }}>{acc.name}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ font: '800 14px Plus Jakarta Sans', color: t.transaction_type === 'income' ? c.good : c.bad }}>
                        {t.transaction_type === 'income' ? '+' : '−'}{fmt(t.amount, { decimals: t.amount % 1 ? 2 : 0 })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openEdit(t)}
                          disabled={isDeleting}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.accent, padding: '2px 0', font: '600 11px Plus Jakarta Sans' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          disabled={isDeleting}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.bad + 'AA', padding: '2px 0', font: '600 11px Plus Jakarta Sans' }}
                        >
                          {isDeleting ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      {editingTx && editForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={closeEdit} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto', maxHeight: '88svh' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 20px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Edit Transaction</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label>Description</Label>
                <input
                  value={editForm.description}
                  onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                  style={inp}
                  placeholder="Description"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Amount</Label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={e => setEditForm(f => f ? { ...f, amount: e.target.value } : f)}
                    style={inp}
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Date</Label>
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
                <select
                  value={editForm.transaction_type}
                  onChange={e => setEditForm(f => f ? { ...f, transaction_type: e.target.value as TransactionType } : f)}
                  style={inp}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                  <option value="commitment">Commitment</option>
                  <option value="borrowing">Borrowing</option>
                  <option value="borrowing_repayment">Borrowing Repayment</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Category</Label>
                  <select
                    value={editForm.category_id}
                    onChange={e => setEditForm(f => f ? { ...f, category_id: e.target.value } : f)}
                    style={inp}
                  >
                    <option value="">No category</option>
                    {state.categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Account</Label>
                  <select
                    value={editForm.from_account_id}
                    onChange={e => setEditForm(f => f ? { ...f, from_account_id: e.target.value } : f)}
                    style={inp}
                  >
                    <option value="">No account</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
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
          </div>
        </div>
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
