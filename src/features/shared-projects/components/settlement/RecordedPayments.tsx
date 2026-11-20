import { useState } from 'react'
import { ArrowLeftRight, Undo2 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ProjectTransaction } from '../../types'
import { paymentParties, deleteLabel, formatDayHeader } from '../../lib/transactions'
import { FONT, cardStyle } from '../overview/styles'
import { errorText } from '../members/memberUi'

interface Props {
  transactions: ProjectTransaction[]
  /** Owner or editor. Viewers and the share link see the list without Undo. */
  canEdit: boolean
  onUndo?: (id: string) => Promise<void>
}

/** Recorded settlement payments, newest first. Immutable: undo only. */
export function RecordedPayments({ transactions, canEdit, onUndo }: Props) {
  const c = useTheme()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const payments = transactions
    .filter(t => t.transaction_type === 'settlement')
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
  if (payments.length === 0) return null

  const undo = async (t: ProjectTransaction) => {
    if (!onUndo || !confirm(deleteLabel(t))) return
    setBusyId(t.id); setError(null)
    try { await onUndo(t.id) }
    catch (e) { setError(errorText(e)) }
    finally { setBusyId(null) }
  }

  return (
    <section>
      <div style={{ font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 4px 8px' }}>
        Recorded payments · {payments.length}
      </div>
      <div style={{ ...cardStyle(c), padding: 0, overflow: 'hidden' }}>
        {payments.map((t, i) => {
          const { from, to } = paymentParties(t)
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '10px 14px', borderTop: i === 0 ? 'none' : `1px solid ${c.faint}` }}>
              <div aria-hidden style={{ width: 30, height: 30, borderRadius: 10, background: c.surface2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeftRight size={14} color={c.sub} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from} → {to}</div>
                <div style={{ font: `500 11px ${FONT}`, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatDayHeader(t.transaction_date)}{t.description ? ` · ${t.description}` : ''}
                </div>
              </div>
              <div style={{ font: `700 14px ${FONT}`, color: c.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(t.amount)}</div>
              {canEdit && onUndo && (
                <button onClick={() => undo(t)} disabled={busyId === t.id} aria-label={`Undo payment ${from} to ${to}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '6px 10px', borderRadius: 10,
                  border: `1px solid ${c.faint}`, background: c.surface, color: c.sub, font: `700 12px ${FONT}`, cursor: 'pointer',
                }}>
                  <Undo2 size={13} /> {busyId === t.id ? '…' : 'Undo'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, background: c.badSoft, color: c.bad, font: `600 12px ${FONT}` }}>{error}</div>
      )}
    </section>
  )
}
