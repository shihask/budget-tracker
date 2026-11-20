import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { localIso } from '@/lib/utils'
import { BottomSheet } from '@/components/BottomSheet'
import type { Transfer } from '../../lib/settlement'
import { toPaise } from '../../lib/settlement'
import { rs } from '../../lib/settlementCopy'
import { FONT } from '../overview/styles'
import { errorText as baseErrorText } from '../members/memberUi'

interface Props {
  open: boolean
  /** The suggested transfer being paid. The parent remounts this sheet per opening. */
  transfer: Transfer | null
  /** Kitty ledger balance in paise — for the "more than the kitty holds" warning. */
  kittyBalance: number
  onClose: () => void
  /** amount in rupees (≤ 2 decimals, > 0). Throws to show an error. */
  onSave: (form: { amount: number; date: string; note: string }) => Promise<void>
}

const errorText = (e: unknown): string => {
  const m = baseErrorText(e)
  return m === 'Something went wrong. Try again.' ? "Couldn't record the payment. Check your connection and try again." : m
}

export function RecordPaymentSheet({ open, transfer, kittyBalance, onClose, onSave }: Props) {
  const c = useTheme()
  const [amount, setAmount] = useState(transfer ? String(transfer.amount / 100) : '')
  const [date, setDate] = useState(localIso(new Date()))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!transfer) return <BottomSheet open={false} onClose={onClose} showHelpButton={false}>{null}</BottomSheet>

  const paise = toPaise(Number(amount))
  const valid = amount.trim() !== '' && paise !== null && paise > 0
  const over = valid && paise! > transfer.amount ? paise! - transfer.amount : 0
  const beyondKitty = valid && transfer.from.kind === 'kitty' && paise! > kittyBalance

  const save = async () => {
    if (!valid || saving) return
    setSaving(true); setError(null)
    try { await onSave({ amount: paise! / 100, date, note: note.trim() }); onClose() }
    catch (e) { setError(errorText(e)) }
    finally { setSaving(false) }
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: `600 15px ${FONT}`, color: c.ink, outline: 'none', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { font: `700 12px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }
  const warn = (text: string) => (
    <div role="alert" style={{ display: 'flex', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 12, background: c.warnSoft }}>
      <AlertTriangle size={15} color={c.warn} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ font: `500 12px ${FONT}`, color: c.ink, lineHeight: 1.5 }}>{text}</div>
    </div>
  )

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 12px' }}>
        <div style={{ font: `800 20px ${FONT}`, color: c.ink }}>Record payment</div>
        <div style={{ font: `600 14px ${FONT}`, color: c.sub, marginTop: 4, overflowWrap: 'anywhere' }}>
          {transfer.from.name} → {transfer.to.name}
        </div>
        <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 2 }}>
          Suggested {rs(transfer.amount)}. Record what was actually paid — part of it is fine.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <div style={label}>Amount</div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" style={input} aria-label="Amount paid" />
            {amount.trim() !== '' && !valid && (
              <div style={{ font: `600 12px ${FONT}`, color: c.bad, marginTop: 6 }}>Enter an amount above ₹0, with at most 2 decimals.</div>
            )}
          </div>
          <div>
            <div style={label}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} aria-label="Date paid" />
          </div>
          <div>
            <div style={label}>Note (optional)</div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. UPI, cash" style={input} aria-label="Note" />
          </div>
        </div>

        {over > 0 && warn(`This is ${rs(over)} more than suggested. The extra will be owed back the other way.`)}
        {beyondKitty && warn(`This is more than the kitty balance (${rs(Math.max(0, kittyBalance))}). The kitty will need topping up.`)}

        {error && (
          <div role="alert" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: c.badSoft, color: c.bad, font: `600 12px ${FONT}`, overflowWrap: 'anywhere' }}>
            {error}
          </div>
        )}

        <button onClick={save} disabled={!valid || saving} style={{
          width: '100%', padding: '14px 0', marginTop: 18, borderRadius: 16, border: 'none',
          background: valid ? c.accent : c.faint, color: '#fff', font: `700 16px ${FONT}`,
          cursor: valid ? 'pointer' : 'default', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Recording…' : 'Record payment'}
        </button>
        <div style={{ font: `500 11px ${FONT}`, color: c.muted, marginTop: 8, textAlign: 'center' }}>
          Payments can't be edited later — you can undo and record again.
        </div>
      </div>
    </BottomSheet>
  )
}
