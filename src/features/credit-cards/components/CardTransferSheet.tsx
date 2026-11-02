import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, localIso, round2, selectOnFocus } from '@/lib/utils'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { INCOME_GROUP, TRANSFER_GROUP, BORROWING_GROUP, ADJUSTMENT_GROUP } from '@/lib/constants'
import {
  validateCardTransfer, feeCategoryPlacement, CardTransferNotConfirmedError, type CardTransferSave,
} from '@/lib/card-transfer'
import { BottomSheet } from '@/components/BottomSheet'
import type { AppState, CreditCard } from '@/types'

const SYSTEM_GROUPS = new Set([INCOME_GROUP, TRANSFER_GROUP, BORROWING_GROUP, ADJUSTMENT_GROUP])

const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const parseAmount = (s: string): number | null => (s.trim() === '' ? null : evaluateAmountExpression(s))

interface Props {
  /** The card the action was started from; the sheet is open while this is set. */
  card: CreditCard | null
  state: AppState
  onClose: () => void
  onSave: (input: CardTransferSave) => Promise<unknown>
}

/**
 * Credit Card → Bank Transfer: money moved from a card to a bank through a rent /
 * tuition gateway. Form, then a confirmation of exactly what will move.
 *
 * The two ids are generated once per opening and reused on every retry, so a
 * save whose answer was lost can be confirmed again without recording twice.
 * Mount it with a key that changes per opening (useCreditCardSheets does).
 */
export function CardTransferSheet({ card, state, onClose, onSave }: Props) {
  const c = useTheme()
  const cards = useMemo(() => (state.credit_cards || []).filter(cc => cc.is_active !== false), [state.credit_cards])
  const accounts = useMemo(() => state.accounts.filter(a => a.is_active), [state.accounts])

  // The parent remounts this sheet (key) for every opening, so these initial
  // values — and the ids — are fresh each time and stable across retries.
  const [cardId, setCardId] = useState(card?.id ?? '')
  const [toAccountId, setToAccountId] = useState(() => (accounts.length === 1 ? accounts[0].id : ''))
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('0')
  const [date, setDate] = useState(() => localIso(new Date()))
  const [time, setTime] = useState(nowTime)
  const [description, setDescription] = useState('')
  const [feeCategoryId, setFeeCategoryId] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [ackOverLimit, setAckOverLimit] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ids] = useState(() => ({ transferId: crypto.randomUUID(), feeId: crypto.randomUUID() }))

  const amountVal = parseAmount(amount)
  const feeVal = parseAmount(fee) ?? 0
  const check = validateCardTransfer({ cardId, toAccountId, amount: amountVal, fee: feeVal, date }, state)
  const placement = feeCategoryPlacement(state)
  const needsFeeCategory = feeVal > 0 && placement.kind === 'ask'
  const expenseCategories = state.categories.filter(cat => !SYSTEM_GROUPS.has(cat.group_name))
  const blocked = Object.keys(check.errors).length > 0 || (needsFeeCategory && !feeCategoryId) || (check.overLimit && !ackOverLimit)

  const sourceName = cards.find(cc => cc.id === cardId)?.name ?? ''
  const destName = accounts.find(a => a.id === toAccountId)?.name ?? ''

  const review = () => {
    setShowErrors(true)
    if (blocked) return
    setError(null)
    setStep('confirm')
  }

  const confirm = async () => {
    if (saving || blocked || amountVal === null) return
    setSaving(true); setError(null)
    try {
      await onSave({
        ...ids,
        cardId, toAccountId,
        amount: round2(amountVal), fee: round2(feeVal),
        feeCategoryId: needsFeeCategory ? feeCategoryId : null,
        date, time: time || null, description,
      })
      onClose()
    } catch (err) {
      const e = err as { code?: string; message?: string }
      if (err instanceof CardTransferNotConfirmedError) setError(err.message)
      else if (e.code === 'PT409') setError('A transfer with these ids was already saved with different details. Close this sheet and check your transactions before entering it again.')
      else setError(e.message || "Couldn't save the transfer.")
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }
  const fieldError = (msg?: string) => showErrors && msg
    ? <div style={{ font: '600 11px Plus Jakarta Sans', color: c.bad, marginTop: 4 }}>{msg}</div>
    : null
  const amountInput = (value: string, set: (v: string) => void) => (
    <input type="text" inputMode="decimal" value={value} placeholder="0" style={inp}
      onFocus={e => selectOnFocus(e.target)}
      onChange={e => set(sanitizeAmountInput(e.target.value))}
      onBlur={e => { const r = parseAmount(e.target.value); set(r === null ? '' : String(round2(r))) }} />
  )
  const summaryRow = (label: string, value: string, strong = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0' }}>
      <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>{label}</span>
      <span style={{ font: `${strong ? 800 : 700} 13px Plus Jakarta Sans`, color: c.ink, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const btn = (primary: boolean): React.CSSProperties => ({
    flex: primary ? 2 : 1, background: primary ? c.accent : c.surface2, color: primary ? '#fff' : c.muted,
    border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
  })

  return (
    <BottomSheet open={!!card} onClose={() => { if (!saving) onClose() }} maxHeight="90svh" zIndex={350} showHelpButton={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ArrowRightLeft size={18} color={c.accent} />
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink }}>{step === 'form' ? 'Transfer to Bank' : 'Confirm Transfer'}</div>
      </div>

      {step === 'form' ? (
        <>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
            Transfer money from your credit card to your bank account.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>From credit card</label>
              <select value={cardId} onChange={e => setCardId(e.target.value)} style={inp}>
                {cards.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
              </select>
              {fieldError(check.errors.cardId)}
            </div>
            <div>
              <label style={lbl}>To account</label>
              <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} style={inp}>
                <option value="">Select account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {fieldError(check.errors.toAccountId)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={lbl}>Amount received</label>
                {amountInput(amount, setAmount)}
                {fieldError(check.errors.amount)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={lbl}>Processing fee</label>
                {amountInput(fee, setFee)}
                {fieldError(check.errors.fee)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.surface2, borderRadius: 11, padding: '10px 12px' }}>
              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Total card charge</span>
              <span style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>{fmt(check.total, { decimals: 2 })}</span>
            </div>
            {needsFeeCategory && (
              <div>
                <label style={lbl}>Fee category</label>
                <select value={feeCategoryId} onChange={e => setFeeCategoryId(e.target.value)} style={inp}>
                  <option value="">Select category</option>
                  {expenseCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                {fieldError(!feeCategoryId ? 'Choose a category for the processing fee' : undefined)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1.4, minWidth: 0 }}>
                <label style={lbl}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
                {fieldError(check.errors.date)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={lbl}>Time</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Tuition fee transfer" style={inp} />
            </div>
            {check.overLimit && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: c.warnSoft, borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}>
                <AlertTriangle size={16} color={c.warn} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>
                  {fmt(check.total, { decimals: 2 })} is more than this card's available credit of {fmt(check.available ?? 0, { decimals: 2 })}.
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <input type="checkbox" checked={ackOverLimit} onChange={e => setAckOverLimit(e.target.checked)} />
                    The bank allowed it — record it anyway
                  </span>
                </span>
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={onClose} style={btn(false)}>Cancel</button>
            <button onClick={review} style={{ ...btn(true), opacity: blocked && showErrors ? 0.6 : 1 }}>Review transfer</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: 12, background: c.surface2, borderRadius: 12, padding: '6px 12px' }}>
            {summaryRow('From', sourceName)}
            {summaryRow('To', destName)}
            {summaryRow('Amount received', fmt(amountVal ?? 0, { decimals: 2 }))}
            {summaryRow('Processing fee', fmt(feeVal, { decimals: 2 }))}
            <div style={{ borderTop: `1px solid ${c.faint}`, margin: '2px 0' }} />
            {summaryRow('Total credit card charge', fmt(check.total, { decimals: 2 }), true)}
          </div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 12, lineHeight: 1.5 }}>
            Your bank account will receive {fmt(amountVal ?? 0, { decimals: 2 })}. Your credit card outstanding will increase by {fmt(check.total, { decimals: 2 })}.
            {' '}The {fmt(amountVal ?? 0, { decimals: 2 })} is borrowed money, not income{feeVal > 0 ? `; the ${fmt(feeVal, { decimals: 2 })} fee is recorded as an expense` : ''}.
          </div>
          {error && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 12, lineHeight: 1.45 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => { if (!saving) { setStep('form'); setError(null) } }} style={btn(false)}>Cancel</button>
            <button onClick={confirm} disabled={saving} style={{ ...btn(true), opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Confirm Transfer'}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
