import { useRef, useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { selectOnFocus, round2 } from '@/lib/utils'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { AmountOperatorRow } from '@/components/AmountOperatorRow'
import { BottomSheet } from '@/components/BottomSheet'
import type { Account, CreditCard } from '@/types'

/** The "type an amount, pick an account, save" core shared by QuickAdd's
 *  long-press chip popup and the Life Events dashboard card. One implementation,
 *  two hosts — the chip popup is absolutely positioned inside its chip, the event
 *  card opens it in a BottomSheet, so only the shell differs. */
interface BodyProps {
  title: string
  accounts: Account[]
  creditCards: CreditCard[]
  accountId: string
  onAccountChange: (id: string) => void
  amount: string
  onAmountChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving?: boolean
  autoFocus?: boolean
  /** Optional category picker, supplied by the host so this stays free of any
   *  dependency on CategorySelect/AppState. The chip popup omits it — its
   *  category comes from the tapped chip's history. */
  categoryNode?: React.ReactNode
}

export function QuickAmountBody({
  title, accounts, creditCards, accountId, onAccountChange,
  amount, onAmountChange, onSave, onCancel, saving = false, autoFocus = false, categoryNode,
}: BodyProps) {
  const c = useTheme()
  const amountRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (autoFocus) setTimeout(() => amountRef.current?.focus(), 80)
  }, [autoFocus])

  const parsed = evaluateAmountExpression(amount) ?? 0
  const valid = parsed > 0 && !!accountId

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase' }}>Amount</div>
          <input
            ref={amountRef}
            type="text"
            value={amount}
            onChange={e => onAmountChange(sanitizeAmountInput(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter' && valid) onSave() }}
            placeholder="0"
            inputMode="decimal"
            onFocus={e => { selectOnFocus(e.target); setFocused(true) }}
            onBlur={e => {
              setFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              onAmountChange(r === null ? '' : String(round2(r)))
            }}
            style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 10px', font: '700 18px Plus Jakarta Sans', color: c.ink, outline: 'none' }}
          />
          {focused && <AmountOperatorRow inputRef={amountRef} onChange={onAmountChange} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase' }}>Account</div>
          <select value={accountId} onChange={e => onAccountChange(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 6px', font: '600 12px Plus Jakarta Sans', color: c.ink, outline: 'none' }}>
            {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            {creditCards.map(cc => <option key={cc.id} value={cc.id}>{cc.name} (CC)</option>)}
          </select>
        </div>
      </div>
      {categoryNode && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase' }}>Category</div>
          {categoryNode}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={!valid || saving}
          style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: valid ? 'pointer' : 'default', opacity: (!valid || saving) ? 0.6 : 1 }}>
          {saving ? 'Saving…' : `Save ₹${amount || '0'}`}
        </button>
      </div>
    </>
  )
}

interface SheetProps extends Omit<BodyProps, 'autoFocus'> {
  open: boolean
  subtitle?: string
}

export function QuickAmountSheet({ open, subtitle, ...body }: SheetProps) {
  const c = useTheme()
  return (
    <BottomSheet open={open} onClose={body.onCancel} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        {subtitle && (
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>{subtitle}</div>
        )}
        <QuickAmountBody {...body} autoFocus={open} />
      </div>
    </BottomSheet>
  )
}
