import { useMemo, useState } from 'react'
import { Search, X, ChevronDown, Plus } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ColorTokens } from '@/lib/tokens'
import type { ProjectAttachment, ProjectMember, ProjectTransaction } from '../../types'
import {
  TYPE_FILTERS, NO_FILTERS, filterTransactions, groupByDay, resultTotals, hasActiveFilters,
  formatDayHeader, matchesType, transactionKind, type TransactionFilters,
} from '../../lib/transactions'
import { FONT, cardStyle } from '../overview/styles'
import { LinkButton } from '../overview/ui'
import { TransactionRow } from './TransactionRow'
import { TransactionDetailSheet } from './TransactionDetailSheet'
import { PaidByFilterSheet, type PaidByOption } from './PaidByFilterSheet'
import { useIsWide } from '../shared/useIsWide'

interface Props {
  transactions: ProjectTransaction[]
  attachments: ProjectAttachment[]
  members: ProjectMember[]
  /** Owner or editor. Viewers can read everything but never see a write action. */
  canEdit: boolean
  onAdd: (mode: 'contribution' | 'expense') => void
  onEdit: (txn: ProjectTransaction) => void
  onDelete: (id: string) => Promise<void>
  onViewAttachment: (path: string) => void
  onDeleteAttachment: (att: ProjectAttachment) => Promise<void>
}

export function TransactionsTab({ transactions, attachments, members, canEdit, onAdd, onEdit, onDelete, onViewAttachment, onDeleteAttachment }: Props) {
  const c = useTheme()
  const wide = useIsWide()
  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS)
  const [paidByOpen, setPaidByOpen] = useState(false)
  const [detail, setDetail] = useState<{ id: string; open: boolean } | null>(null)

  const filtered = useMemo(() => filterTransactions(transactions, filters), [transactions, filters])
  const groups = useMemo(() => groupByDay(filtered), [filtered])
  const totals = resultTotals(filtered)
  const active = hasActiveFilters(filters)

  const attachmentCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of attachments) m.set(a.project_transaction_id, (m.get(a.project_transaction_id) ?? 0) + 1)
    return m
  }, [attachments])

  // Kitty + every member who is active or still has rows (a removed member's
  // history stays findable).
  const paidByOptions = useMemo((): PaidByOption[] => {
    const counts = new Map<string, number>()
    for (const t of transactions) if (t.member_id) counts.set(t.member_id, (counts.get(t.member_id) ?? 0) + 1)
    const outside = transactions.filter(t => transactionKind(t) === 'group-money').length
    return [
      { id: 'all', label: 'Everyone', count: transactions.length },
      { id: 'kitty', label: 'Kitty', hint: 'project fund', count: transactions.filter(t => transactionKind(t) === 'expense-kitty').length },
      ...(outside > 0 ? [{ id: 'outside', label: 'Outside the group', hint: 'group money', count: outside }] : []),
      ...members
        .filter(m => m.is_active || counts.has(m.id))
        .map(m => ({ id: m.id, label: m.name, hint: m.is_active ? undefined : 'inactive', count: counts.get(m.id) ?? 0 })),
    ]
  }, [transactions, members])
  const paidByLabel = paidByOptions.find(o => o.id === filters.paidBy)?.label ?? 'Everyone'

  const detailTxn = detail ? transactions.find(t => t.id === detail.id) ?? null : null

  if (transactions.length === 0) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ ...cardStyle(c), padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ font: `700 14px ${FONT}`, color: c.ink }}>No transactions yet</div>
          <div style={{ font: `500 13px ${FONT}`, color: c.muted, marginTop: 4, lineHeight: 1.5 }}>
            Record what the group spends and who put money into the kitty.
          </div>
          {canEdit && <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}><AddButtons c={c} onAdd={onAdd} /></div>}
        </div>
      </div>
    )
  }

  const totalParts = [
    filters.type !== 'contribution' && `Expenses ${fmt(totals.expenses)}`,
    filters.type !== 'expense' && `Contributions ${fmt(totals.contributions)}`,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: canEdit && !wide ? 64 : 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40,
          borderRadius: 12, background: c.surface, border: `1px solid ${c.faint}`, boxSizing: 'border-box',
        }}>
          <Search size={15} color={c.muted} style={{ flexShrink: 0 }} />
          <input
            value={filters.query}
            onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
            placeholder="Search transactions"
            aria-label="Search transactions"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: `500 14px ${FONT}`, color: c.ink }}
          />
          {filters.query && (
            <button aria-label="Clear search" onClick={() => setFilters(f => ({ ...f, query: '' }))}
              style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: c.muted, display: 'flex' }}>
              <X size={15} />
            </button>
          )}
        </label>
        {wide && canEdit && <AddButtons c={c} onAdd={onAdd} />}
      </div>

      {/* Type chips scroll inside their own row on narrow phones; Paid by stays pinned
          on the right so the key filter is never scrolled out of sight. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          {TYPE_FILTERS.map(t => {
            const selected = filters.type === t.id
            const count = transactions.filter(x => matchesType(x, t.id)).length
            return (
              <Chip key={t.id} c={c} selected={selected} onClick={() => setFilters(f => ({ ...f, type: t.id }))}>
                {t.label} <span style={{ opacity: 0.7, fontWeight: 600 }}>{count}</span>
              </Chip>
            )
          })}
        </div>
        <div style={{ flexShrink: 0, maxWidth: '45%', display: 'flex', paddingBottom: 2 }}>
          <Chip c={c} selected={filters.paidBy !== 'all'} onClick={() => setPaidByOpen(true)}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{filters.paidBy === 'all' ? 'Paid by' : paidByLabel}</span>
            <ChevronDown size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          </Chip>
        </div>
      </div>

      {/* Result line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '10px 2px 4px', minHeight: 24 }}>
        <div style={{ font: `500 12px ${FONT}`, color: c.muted, minWidth: 0 }}>
          {active ? `Showing ${totals.count}` : `${totals.count} transaction${totals.count === 1 ? '' : 's'}`}
          {totals.count > 0 && <> · {totalParts}</>}
        </div>
        {active && <LinkButton c={c} label="Clear" onClick={() => setFilters(NO_FILTERS)} />}
      </div>

      {groups.length === 0 ? (
        <div style={{ ...cardStyle(c), padding: '16px', textAlign: 'center', font: `500 13px ${FONT}`, color: c.muted }}>
          No transactions match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(g => (
            <section key={g.date}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '10px 4px 6px' }}>
                <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {formatDayHeader(g.date)}
                </div>
                {g.spent > 0 && <div style={{ font: `600 11px ${FONT}`, color: c.muted }}>spent {fmt(g.spent)}</div>}
              </div>
              <div style={{ ...cardStyle(c), padding: 0, overflow: 'hidden' }}>
                {g.items.map((t, i) => (
                  <div key={t.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${c.faint}` }}>
                    <TransactionRow
                      txn={t}
                      attachmentCount={attachmentCounts.get(t.id) ?? 0}
                      wide={wide}
                      onOpen={() => setDetail({ id: t.id, open: true })}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Floating add buttons on phones — owner and editors only */}
      {canEdit && !wide && (
        <div style={{
          position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', gap: 8, zIndex: 140,
        }}>
          <AddButtons c={c} onAdd={onAdd} floating />
        </div>
      )}

      <PaidByFilterSheet
        open={paidByOpen}
        options={paidByOptions}
        value={filters.paidBy}
        onChange={v => setFilters(f => ({ ...f, paidBy: v }))}
        onClose={() => setPaidByOpen(false)}
      />
      <TransactionDetailSheet
        open={!!detail?.open && !!detailTxn}
        txn={detailTxn}
        attachments={attachments}
        canEdit={canEdit}
        onClose={() => setDetail(d => d ? { ...d, open: false } : d)}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewAttachment={onViewAttachment}
        onDeleteAttachment={onDeleteAttachment}
      />
    </div>
  )
}

function Chip({ c, selected, onClick, children }: { c: ColorTokens; selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap', maxWidth: '100%', minWidth: 0,
        padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${selected ? c.accent : c.faint}`,
        background: selected ? c.accentSoft : c.surface,
        color: selected ? c.accent : c.sub, font: `700 12px ${FONT}`,
      }}
    >
      {children}
    </button>
  )
}

/** "+ Expense" is the common case, so it's the solid one. */
function AddButtons({ c, onAdd, floating }: { c: ColorTokens; onAdd: Props['onAdd']; floating?: boolean }) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, height: floating ? 44 : 40, padding: '0 14px',
    borderRadius: floating ? 14 : 12, font: `700 13px ${FONT}`, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    boxShadow: floating ? c.cardShadow : undefined,
  }
  return (
    <>
      <button onClick={() => onAdd('contribution')} style={{ ...base, background: c.surface, color: c.ink, border: `1px solid ${c.faint}` }}>
        <Plus size={15} strokeWidth={2.5} /> Contribution
      </button>
      <button onClick={() => onAdd('expense')} style={{ ...base, background: c.accent, color: '#fff', border: 'none' }}>
        <Plus size={15} strokeWidth={2.5} /> Expense
      </button>
    </>
  )
}
