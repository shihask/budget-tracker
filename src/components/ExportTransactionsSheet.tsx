import { useState, useEffect, useMemo, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmtDate, openDatePicker } from '@/lib/utils'
import { BottomSheet } from './BottomSheet'
import { filterAndSortTransactions, DEFAULT_TXN_FILTERS, type TransactionFilterState, type TxnSortKey } from '@/lib/transactionFilters'
import { exportTransactionsCsv } from '@/lib/exportTransactionsCsv'
import type { AppState } from '@/types'

interface ExportTransactionsSheetProps {
  open: boolean
  onClose: () => void
  state: AppState
  userId: string
  allTransactionsLoaded: boolean
  initialFilters: TransactionFilterState
  initialSortKey: TxnSortKey
}

export function ExportTransactionsSheet({ open, onClose, state, userId, allTransactionsLoaded, initialFilters, initialSortKey }: ExportTransactionsSheetProps) {
  const c = useTheme()
  const [filters, setFilters] = useState(initialFilters)
  const [sortKey, setSortKey] = useState(initialSortKey)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportedCount, setExportedCount] = useState<number | null>(null)
  const dateToRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setFilters(initialFilters)
    setSortKey(initialSortKey)
    setExportError(null)
    setExportedCount(null)
  }, [open])

  const accounts = state.accounts.filter(a => a.is_active)
  const creditCards = state.credit_cards || []
  const groups = state.groups

  const matched = useMemo(
    () => filterAndSortTransactions(state.transactions, state.categories, filters, sortKey),
    [state.transactions, state.categories, filters, sortKey]
  )

  const filterSummary = useMemo(() => {
    const parts: string[] = []
    if (filters.search.trim()) parts.push(`"${filters.search.trim()}"`)
    if (filters.account !== 'all') {
      const acc = accounts.find(a => a.id === filters.account) || creditCards.find(cc => cc.id === filters.account)
      if (acc) parts.push(acc.name)
    }
    if (filters.group !== 'all') parts.push(filters.group)
    if (filters.category !== 'all') {
      const cat = state.categories.find(cat => cat.id === filters.category)
      if (cat) parts.push(cat.name)
    }
    if (filters.dateFrom && filters.dateTo) parts.push(`${fmtDate(filters.dateFrom)} – ${fmtDate(filters.dateTo)}`)
    else if (filters.dateFrom) parts.push(`From ${fmtDate(filters.dateFrom)}`)
    else if (filters.dateTo) parts.push(`Until ${fmtDate(filters.dateTo)}`)
    return parts.length ? parts.join(' · ') : 'All transactions'
  }, [filters, accounts, creditCards, state.categories])

  const hasFilters = !!filters.search || filters.account !== 'all' || filters.category !== 'all' ||
    filters.group !== 'all' || !!filters.dateFrom || !!filters.dateTo

  const resetFilters = () => setFilters(DEFAULT_TXN_FILTERS)

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const count = await exportTransactionsCsv(
        userId,
        { categories: state.categories, accounts: state.accounts, creditCards },
        filters,
        sortKey,
      )
      setExportedCount(count)
      setTimeout(onClose, 1200)
    } catch (_) {
      setExportError('Something went wrong. Please try again.')
    }
    setExporting(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`,
    borderRadius: 11, padding: '9px 12px', font: '600 13px Plus Jakarta Sans',
    color: c.ink, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="92svh" zIndex={300}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Export Transactions</div>
        {hasFilters && (
          <button onClick={resetFilters} style={{ background: c.badSoft, color: c.bad, border: 'none', borderRadius: 999, padding: '6px 12px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
            Reset
          </button>
        )}
      </div>
      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
        Download the matching transactions as a CSV file.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          placeholder="Search description..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={inp}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filters.group} onChange={e => setFilters(f => ({ ...f, group: e.target.value, category: 'all' }))} style={{ ...inp, flex: 1 }}>
            <option value="all">All groups</option>
            {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>
          <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ ...inp, flex: 1 }}>
            <option value="all">All categories</option>
            {state.categories.filter(cat => filters.group === 'all' || cat.group_name === filters.group).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filters.account} onChange={e => setFilters(f => ({ ...f, account: e.target.value }))} style={{ ...inp, flex: 1 }}>
            <option value="all">All accounts</option>
            <optgroup label="Bank / Cash">
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
            {creditCards.length > 0 && (
              <optgroup label="Credit Cards">
                {creditCards.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
              </optgroup>
            )}
          </select>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as TxnSortKey)} style={{ ...inp, flex: 1 }}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => {
              const value = e.target.value
              setFilters(f => ({ ...f, dateFrom: value }))
              if (value && !filters.dateTo) openDatePicker(dateToRef.current)
            }}
            style={{ ...inp, flex: 1 }}
          />
          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>to</span>
          <input ref={dateToRef} type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} style={{ ...inp, flex: 1 }} />
        </div>
        <button
          onClick={() => setFilters(f => ({ ...f, showSystemTxns: !f.showSystemTxns }))}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: `1.5px solid ${filters.showSystemTxns ? c.accent : c.faint}`,
            borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
            font: '600 12px Plus Jakarta Sans',
            color: filters.showSystemTxns ? c.accent : c.muted,
            width: '100%',
          }}
        >
          <span style={{
            width: 16, height: 16, borderRadius: 4, border: `2px solid ${filters.showSystemTxns ? c.accent : c.faint}`,
            background: filters.showSystemTxns ? c.accent : 'transparent',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {filters.showSystemTxns && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2 6 5 9 10 3"/></svg>}
          </span>
          Include system transactions (Opening Balance, Balance Adjustment)
        </button>
      </div>

      <div style={{ marginTop: 16, background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 2 }}>{filterSummary}</div>
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
          {allTransactionsLoaded
            ? `${matched.length} transaction${matched.length === 1 ? '' : 's'} match`
            : `${matched.length}+ loaded — more may match`}
        </div>
      </div>

      {exportError && (
        <div style={{ marginTop: 12, font: '600 12px Plus Jakarta Sans', color: c.bad, lineHeight: 1.5 }}>{exportError}</div>
      )}
      {exportedCount !== null && !exportError && (
        <div style={{ marginTop: 12, font: '600 12px Plus Jakarta Sans', color: c.good, lineHeight: 1.5 }}>
          Exported {exportedCount} transaction{exportedCount === 1 ? '' : 's'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onClose} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1 }}
        >
          {exporting
            ? 'Preparing export…'
            : allTransactionsLoaded
            ? `Export ${matched.length} Transaction${matched.length === 1 ? '' : 's'}`
            : 'Export Transactions'}
        </button>
      </div>
    </BottomSheet>
  )
}
