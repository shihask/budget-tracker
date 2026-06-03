import { useState, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { CAT_COLORS, ACC_COLORS } from '@/lib/tokens'
import { fmt, fmtDate } from '@/lib/utils'
import { catById as buildCatById } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction } from '@/types'

interface TransactionsPageProps {
  state: AppState
  onDelete: (id: string) => void
  onClose: () => void
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export function TransactionsPage({ state, onDelete, onClose }: TransactionsPageProps) {
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
      if (sortKey === 'date_desc')    return a.transaction_date < b.transaction_date ? 1 : -1
      if (sortKey === 'date_asc')     return a.transaction_date > b.transaction_date ? 1 : -1
      if (sortKey === 'amount_desc')  return b.amount - a.amount
      if (sortKey === 'amount_asc')   return a.amount - b.amount
      return 0
    })
    return txns
  }, [state.transactions, search, filterAccount, filterCategory, filterGroup, filterDateFrom, filterDateTo, sortKey])

  const totalFiltered = filtered.reduce((s, t) => s + t.amount, 0)

  const handleDelete = async (t: Transaction) => {
    if (!confirm(`Delete "${t.description}" (${fmt(t.amount)})?`)) return
    setDeleting(t.id)
    try {
      await supabase.from('transactions').delete().eq('id', t.id)
      if (t.from_account_id) {
        const { data: acc } = await supabase.from('accounts').select('current_balance').eq('id', t.from_account_id).single()
        if (acc) await supabase.from('accounts').update({ current_balance: acc.current_balance + t.amount }).eq('id', t.from_account_id)
      }
    } catch (_) {}
    onDelete(t.id)
    setDeleting(null)
  }

  const clearFilters = () => {
    setSearch(''); setFilterAccount('all'); setFilterCategory('all')
    setFilterGroup('all'); setFilterDateFrom(''); setFilterDateTo('')
  }
  const hasFilters = search || filterAccount !== 'all' || filterCategory !== 'all' ||
    filterGroup !== 'all' || filterDateFrom || filterDateTo

  const inputStyle: React.CSSProperties = {
    width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 11, padding: '9px 12px', font: '600 13px Plus Jakarta Sans',
    color: c.ink, outline: 'none',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: c.bg, zIndex: 100, overflowY: 'auto', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: c.bg, zIndex: 10, padding: '52px 16px 12px', borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
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
        <input placeholder="Search description..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCategory('all') }} style={{ ...inputStyle, flex: 1 }}>
            <option value="all">All groups</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="all">All categories</option>
            {state.categories.filter(cat => filterGroup === 'all' || cat.group_name === filterGroup).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="all">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={{ ...inputStyle, flex: 1 }}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>to</span>
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '8px 16px 40px' }}>
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
                      <div style={{ font: '800 14px Plus Jakarta Sans', color: c.ink }}>−{fmt(t.amount, { decimals: t.amount % 1 ? 2 : 0 })}</div>
                      <button onClick={() => handleDelete(t)} disabled={isDeleting} style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', color: c.bad + 'AA', padding: '2px 0', font: '600 11px Plus Jakarta Sans' }}>
                        {isDeleting ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
