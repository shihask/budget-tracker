import { useState } from 'react'
import { FileText, Image, Pencil, Trash2, Undo2, X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import type { ProjectAttachment, ProjectMember, ProjectTransaction } from '../../types'
import { describeTransaction, deleteLabel, formatLongDate, GROUP_MONEY_LABEL, PAYMENT_LABEL, paymentParties } from '../../lib/transactions'
import { resolveSharedBy, sharedByText } from '../../lib/sharedBy'
import { FONT } from '../overview/styles'
import { KittyPill } from './TransactionRow'
import { kindTile } from './kindTile'

interface Props {
  open: boolean
  /** Kept while the sheet slides closed; null once the row no longer exists. */
  txn: ProjectTransaction | null
  attachments: ProjectAttachment[]
  /** This project's members — "Shared by" names resolve only against these. */
  members: ProjectMember[]
  canEdit: boolean
  onClose: () => void
  onEdit: (txn: ProjectTransaction) => void
  onDelete: (id: string) => Promise<void>
  /** May return a promise; a rejection is shown in the sheet. */
  onViewAttachment: (path: string) => void | Promise<void>
  /** false on the public share page: receipt files are private to project members. */
  canViewReceipts?: boolean
  onDeleteAttachment: (att: ProjectAttachment) => Promise<void>
}

const errorText = (e: unknown) => (e instanceof Error && e.message) ? e.message : 'Something went wrong. Try again.'

// Viewing and managing one transaction. Editing itself stays in ProjectTransactionSheet.
export function TransactionDetailSheet({ open, txn, attachments, members, canEdit, onClose, onEdit, onDelete, onViewAttachment, onDeleteAttachment, canViewReceipts = true }: Props) {
  const c = useTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => { setError(null); onClose() }

  if (!txn) return <BottomSheet open={false} onClose={close} showHelpButton={false}>{null}</BottomSheet>

  const v = describeTransaction(txn)
  const tile = kindTile(c, v.kind)
  const isContrib = v.sign === 1
  const isGroup = v.kind === 'group-money'
  const isPayment = v.kind === 'settlement'
  const typeLabel = isPayment ? PAYMENT_LABEL : isGroup ? GROUP_MONEY_LABEL : isContrib ? 'Contribution' : 'Expense'
  const own = attachments.filter(a => a.project_transaction_id === txn.id)
  const shared = isContrib || isPayment ? null : resolveSharedBy(txn.shared_by, members)
  const parties = isPayment ? paymentParties(txn) : null

  const handleDelete = async () => {
    if (!confirm(deleteLabel(txn))) return
    setBusy(true); setError(null)
    try { await onDelete(txn.id); close() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const handleDeleteReceipt = async (att: ProjectAttachment) => {
    if (!confirm(`Delete receipt "${att.file_name}"?`)) return
    setBusy(true); setError(null)
    try { await onDeleteAttachment(att) } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const rows: { label: string; value: React.ReactNode }[] = isPayment ? [
    { label: 'From', value: parties!.from },
    { label: 'To', value: parties!.to },
    { label: 'Date', value: formatLongDate(txn.transaction_date) },
    ...(txn.description ? [{ label: 'Note', value: txn.description }] : []),
    { label: 'In settlement', value: "Moves money between them. Not spending — trip totals and shares don't change." },
  ] : [
    isGroup
      ? { label: 'From', value: 'Outside the group' }
      : {
        label: isContrib ? 'Contributed by' : 'Paid by',
        value: v.kind === 'expense-kitty'
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><KittyPill c={c} />Project fund</span>
          : v.memberName,
      },
    ...(v.category ? [{ label: 'Category', value: v.category }] : []),
    ...(!isContrib ? [{
      label: 'Shared by',
      value: shared && (shared.malformed || (!shared.everyone && shared.people.length === 0))
        ? <span style={{ color: c.bad }}>{sharedByText(shared)} — no one can be charged. Edit who shared it.</span>
        : sharedByText(shared!),
    }] : []),
    { label: 'Date', value: formatLongDate(txn.transaction_date) },
    ...(isContrib && txn.description ? [{ label: 'Note', value: txn.description }] : []),
    ...(txn.notes ? [{ label: 'Notes', value: <span style={{ whiteSpace: 'pre-wrap' }}>{txn.notes}</span> }] : []),
    ...(isGroup ? [{ label: 'In settlement', value: "Lowers everyone's share. Not credited to any member." }] : []),
  ]

  return (
    <BottomSheet open={open} onClose={close} showHelpButton={false}>
      <div style={{ padding: '0 4px 12px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div aria-hidden style={{
            width: 40, height: 40, borderRadius: 12, background: tile.bg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <tile.Icon size={18} color={tile.fg} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `800 26px ${FONT}`, color: isContrib ? c.good : c.ink, lineHeight: 1.15 }}>
              {isContrib ? '+' : isPayment ? '' : '−'}{fmt(txn.amount)}
            </div>
            <div style={{ font: `600 14px ${FONT}`, color: c.sub, marginTop: 2, overflowWrap: 'anywhere' }}>
              {isContrib ? typeLabel : v.title}
            </div>
          </div>
          <span style={{ font: `700 11px ${FONT}`, color: c.muted, background: c.surface2, padding: '3px 8px', borderRadius: 999, flexShrink: 0 }}>
            {typeLabel}
          </span>
        </div>

        {/* Facts */}
        <div style={{ marginTop: 16, borderTop: `1px solid ${c.faint}` }}>
          {rows.map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${c.faint}` }}>
              <div style={{ width: 110, flexShrink: 0, font: `500 13px ${FONT}`, color: c.muted }}>{r.label}</div>
              <div style={{ flex: 1, minWidth: 0, font: `600 13px ${FONT}`, color: c.ink, overflowWrap: 'anywhere' }}>{r.value}</div>
            </div>
          ))}
        </div>

        {/* Receipts */}
        {own.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Receipts · {own.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {own.map(att => {
                const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(att.file_name)
                const Icon = isImage ? Image : FileText
                return (
                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: c.surface2 }}>
                    <Icon size={15} color={c.sub} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, font: `500 13px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.file_name}
                    </span>
                    {canViewReceipts && (
                      <button onClick={() => { setError(null); Promise.resolve(onViewAttachment(att.path)).catch(e => setError(errorText(e))) }} style={{
                        flexShrink: 0, background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer',
                        color: c.accent, font: `700 12px ${FONT}`,
                      }}>View</button>
                    )}
                    {canEdit && (
                      <button aria-label={`Delete ${att.file_name}`} disabled={busy} onClick={() => handleDeleteReceipt(att)} style={{
                        flexShrink: 0, background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: c.muted, display: 'flex',
                      }}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {!canViewReceipts && (
              <div style={{ font: `500 11px ${FONT}`, color: c.muted, marginTop: 6 }}>
                Receipts can be opened by project members in MoneyPlant.
              </div>
            )}
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: c.badSoft, color: c.bad, font: `600 12px ${FONT}` }}>
            {error}
          </div>
        )}

        {/* Actions — owner and editors only */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {/* Payments are immutable: undo, never edit. */}
            {!isPayment && (
              <button
                onClick={() => { close(); onEdit(txn) }}
                disabled={busy}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px 0', borderRadius: 14, border: 'none', background: c.accent, color: '#fff',
                  font: `700 14px ${FONT}`, cursor: 'pointer',
                }}
              >
                <Pencil size={15} /> Edit
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={busy}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '12px 0', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.bad,
                font: `700 14px ${FONT}`, cursor: 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >
              {isPayment
                ? <><Undo2 size={15} /> {busy ? 'Undoing…' : 'Undo payment'}</>
                : <><Trash2 size={15} /> {busy ? 'Deleting…' : 'Delete'}</>}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
