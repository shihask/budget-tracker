import { useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import { useAppDialog } from '@/components/AppDialog'
import { catById } from '@/lib/data'
import { eventTransactions, eventSpent } from '@/lib/events'
import { EventIcon } from '../lib/eventIcons'
import { exportEventCsv } from '../lib/exportEventCsv'
import type { AppState, LifeEvent, Transaction } from '@/types'

const EVENT_COLOR = '#E0568A'

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  event: LifeEvent | null
  onEdit: () => void
  onLinkMore: () => void
  onEditTransaction: (t: Transaction) => void
  onUpdateEvent: (id: string, patch: Partial<LifeEvent>) => Promise<void>
  onDeleteEvent: (id: string) => Promise<void>
}

export function EventDetailPage({
  open, onClose, state, event, onEdit, onLinkMore,
  onEditTransaction, onUpdateEvent, onDeleteEvent,
}: Props) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const [busy, setBusy] = useState(false)

  const catMap = useMemo(() => catById(state.categories), [state.categories])
  const txns = useMemo(
    () => event ? eventTransactions(state.transactions, event.id) : [],
    [state.transactions, event])
  const spent = event ? eventSpent(state.transactions, event.id) : 0

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const t of txns) {
      const name = catMap[t.category_id ?? '']?.name ?? 'Uncategorised'
      totals.set(name, (totals.get(name) ?? 0) + t.amount)
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [txns, catMap])

  if (!event) return null

  const target = event.target_amount ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0
  const over = target > 0 && spent > target
  const remaining = target - spent

  const setStatus = async (status: LifeEvent['status']) => {
    setBusy(true)
    try { await onUpdateEvent(event.id, { status }); onClose() }
    finally { setBusy(false) }
  }

  const handleDelete = async () => {
    const ok = await confirm(
      txns.length > 0
        // The reassurance matters: ON DELETE SET NULL means the spending survives.
        ? `Delete ${event.name}? The ${txns.length} linked transaction${txns.length > 1 ? 's' : ''} will be kept — only the event tag is removed, and they will start counting toward your budget again.`
        : `Delete ${event.name}? This event has no linked transactions.`,
      { confirmLabel: 'Delete event', danger: true },
    )
    if (!ok) return
    setBusy(true)
    try { await onDeleteEvent(event.id); onClose() }
    finally { setBusy(false) }
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}>
          <span style={{ display: 'flex', color: EVENT_COLOR, flexShrink: 0 }}>
            <EventIcon name={event.icon} size={21} color="currentColor" />
          </span>
          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink }}>{event.name}</div>
        </div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 18 }}>
          {event.excluded_from_budget ? 'Tracked separately from your weekly budget' : 'Counted in your weekly budget'}
        </div>

        {/* Totals */}
        <div style={{ background: c.surface2, borderRadius: 18, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ font: '700 10.5px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total spent</div>
              <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 2 }}>{fmt(spent)}</div>
            </div>
            {target > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '700 10.5px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {over ? 'Over by' : 'Remaining'}
                </div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: over ? '#EF4444' : '#10B981', marginTop: 2 }}>
                  {fmt(Math.abs(remaining))}
                </div>
              </div>
            )}
          </div>
          {target > 0 && (
            <>
              <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: c.faint, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: over ? '#EF4444' : EVENT_COLOR }} />
              </div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 6 }}>
                {pct}% of {fmt(target)}
              </div>
            </>
          )}
        </div>

        {/* Spend by category */}
        {byCategory.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Spend by category
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byCategory.map(([name, amt]) => (
                <div key={name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', font: '600 12.5px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>
                    <span>{name}</span><span>{fmt(amt)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: c.faint, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: EVENT_COLOR, width: `${spent > 0 ? (amt / spent) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {txns.length} expense{txns.length === 1 ? '' : 's'}
          </div>
          <span onClick={onLinkMore} style={{ font: '600 12.5px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>
            Link more
          </span>
        </div>
        {txns.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '12px 0 20px' }}>
            Nothing linked yet. Use <strong style={{ color: c.ink }}>Link more</strong> to attach expenses you've already recorded.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {txns.map(t => (
              <div key={t.id} onClick={() => onEditTransaction(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                    {[fmtDate(t.transaction_date), catMap[t.category_id ?? '']?.name].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(t.amount)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: `1px solid ${c.faint}` }}>
          <ActionButton label="Edit event" onClick={onEdit} disabled={busy} />
          <ActionButton
            label="Download CSV"
            onClick={() => exportEventCsv(state, event)}
            disabled={busy || txns.length === 0}
          />
          {event.status === 'active'
            ? <ActionButton label="Mark complete" onClick={() => setStatus('completed')} disabled={busy} />
            : <ActionButton label="Reopen event" onClick={() => setStatus('active')} disabled={busy} />}
          {event.status !== 'archived' && (
            <ActionButton label="Archive" onClick={() => setStatus('archived')} disabled={busy} />
          )}
          <ActionButton label="Delete event" onClick={handleDelete} disabled={busy} danger />
        </div>
      </div>
      {dialogNode}
    </BottomSheet>
  )
}

function ActionButton({ label, onClick, disabled, danger }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean
}) {
  const c = useTheme()
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '12px 0', borderRadius: 14, border: 'none',
        background: danger ? '#FEE2E2' : c.surface2,
        color: danger ? '#B91C1C' : c.ink,
        font: '700 14px Plus Jakarta Sans', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >{label}</button>
  )
}
