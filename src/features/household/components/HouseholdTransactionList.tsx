import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { monthLabel } from '../lib/budget'
import { HouseholdIcon } from '../lib/icons'
import type { HouseholdCategory, HouseholdEntryType, HouseholdMember, HouseholdTransaction } from '../types'
import { Button, Card, MonthSwitcher } from './ui'

type Filter = 'all' | HouseholdEntryType

/** Screen 5 — the shared ledger for one month, newest first. */
export function HouseholdTransactionList({ month, onMonth, transactions, categories, members, meMemberId, onOpen, onAdd }: {
  month: string
  onMonth: (m: string) => void
  transactions: HouseholdTransaction[]
  categories: HouseholdCategory[]
  members: HouseholdMember[]
  meMemberId: string
  onOpen: (t: HouseholdTransaction) => void
  onAdd: () => void
}) {
  const c = useTheme()
  const [filter, setFilter] = useState<Filter>('all')
  const catById = new Map(categories.map(cat => [cat.id, cat]))
  const rows = filter === 'all' ? transactions : transactions.filter(t => t.type === filter)

  // Group by date; rows arrive already sorted by txn_date desc, created_at desc.
  const groups: { date: string; rows: HouseholdTransaction[] }[] = []
  for (const t of rows) {
    const last = groups[groups.length - 1]
    if (last && last.date === t.txn_date) last.rows.push(t)
    else groups.push({ date: t.txn_date, rows: [t] })
  }

  const chip = (f: Filter, label: string) => (
    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
      style={{ padding: '7px 13px', minHeight: 34, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: filter === f ? c.ink : c.surface2, color: filter === f ? c.surface : c.sub, font: '700 12px Plus Jakarta Sans' }}>
      {label}
    </button>
  )

  return (
    <div>
      <MonthSwitcher month={month} onChange={onMonth} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {chip('all', 'All')}{chip('expense', 'Expenses')}{chip('income', 'Income')}
      </div>

      {rows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>No shared entries in {monthLabel(month)}</div>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>Entries either of you adds to the household show up here.</div>
          <Button onClick={onAdd}>Add expense</Button>
        </Card>
      ) : groups.map(g => (
        <div key={g.date} style={{ marginBottom: 14 }}>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, margin: '0 0 6px 4px' }}>{fmtDate(g.date)}</div>
          <Card style={{ padding: '4px 12px' }}>
            {g.rows.map(t => (
              <EntryRow key={t.id} txn={t} category={t.category_id ? catById.get(t.category_id) : undefined} members={members} meMemberId={meMemberId} onOpen={() => onOpen(t)} />
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}

/** One shared entry. Shows who paid by their household name only — never an account. */
export function EntryRow({ txn, category, members, meMemberId, onOpen }: {
  txn: HouseholdTransaction
  category: HouseholdCategory | undefined
  members: HouseholdMember[]
  meMemberId: string
  onOpen: () => void
}) {
  const c = useTheme()
  const payer = members.find(m => m.id === txn.paid_by_member_id)
  const payerName = txn.paid_by_member_id === meMemberId ? 'You' : payer?.display_name ?? 'Former member'
  const title = txn.description || category?.name || (txn.type === 'income' ? 'Income' : 'Expense')
  const income = txn.type === 'income'
  return (
    <button type="button" onClick={onOpen} aria-label={`${title}, ${income ? 'income' : 'expense'} ${fmt(txn.amount)}, ${income ? 'received by' : 'paid by'} ${payerName}. Edit`}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', minHeight: 52, background: 'none', border: 'none',
        borderBottom: `1px solid ${c.faint}`, cursor: 'pointer', textAlign: 'left' }}>
      <span aria-hidden style={{ width: 34, height: 34, borderRadius: 11, background: income ? c.goodSoft : c.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <HouseholdIcon name={category?.icon} size={16} color={income ? c.good : c.sub} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: '700 14px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ display: 'block', font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {income ? 'Received by' : 'Paid by'} {payerName}{category && txn.description ? ` · ${category.name}` : ''}
        </span>
      </span>
      <span style={{ font: '800 14px Plus Jakarta Sans', color: income ? c.good : c.ink, flexShrink: 0 }}>
        {income ? '+' : ''}{fmt(txn.amount)}
      </span>
    </button>
  )
}
