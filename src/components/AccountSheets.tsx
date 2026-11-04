import { useState, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, round2, selectOnFocus } from '@/lib/utils'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { AmountOperatorRow } from './AmountOperatorRow'
import { BottomSheet, HelpText } from './BottomSheet'
import type { Account, AccountType } from '@/types'

export type AccountForm = { name: string; type: AccountType; current_balance: string }

function useFieldStyles() {
  const c = useTheme()
  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }
  return { c, inp, lbl }
}

// ── Edit ─────────────────────────────────────────────────────────────────────

interface EditAccountSheetProps {
  account: Account | null
  open: boolean
  onClose: () => void
  onSave: (id: string, form: { name: string; type: string; current_balance: number }) => Promise<void>
}

export function EditAccountSheet({ account, open, onClose, onSave }: EditAccountSheetProps) {
  const { c, inp, lbl } = useFieldStyles()
  const [form, setForm] = useState<AccountForm>({ name: '', type: 'bank', current_balance: '' })
  const [saving, setSaving] = useState(false)
  const balanceRef = useRef<HTMLInputElement | null>(null)
  const [balanceFocused, setBalanceFocused] = useState(false)

  // Reset the form on each opening (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && account) setForm({ name: account.name, type: account.type, current_balance: String(round2(account.current_balance)) })
  }

  const handleSave = async () => {
    if (!account) return
    const rawBal = evaluateAmountExpression(form.current_balance)
    const bal = rawBal === null ? NaN : round2(rawBal)
    if (!form.name.trim() || isNaN(bal)) return
    setSaving(true)
    try {
      await onSave(account.id, { name: form.name.trim(), type: form.type, current_balance: bal })
      onClose()
    } catch { /* stays open so the user can retry */ }
    setSaving(false)
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Edit Account</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lbl}>Account name</label>
          <HelpText>A recognizable name for this account. e.g. Axis Bank, SBI Savings, Cash.</HelpText>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Axis Bank" style={inp} />
        </div>

        <div>
          <label style={lbl}>Type</label>
          <HelpText>Bank: savings or current account. Cash: physical cash. Wallet: UPI wallets like PhonePe or GPay.</HelpText>
          <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
            {(['bank', 'cash', 'wallet'] as AccountType[]).map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '9px 4px',
                font: '700 11px Plus Jakarta Sans',
                background: form.type === t ? c.accent : 'transparent',
                color: form.type === t ? '#fff' : c.muted,
                cursor: 'pointer',
              }}>
                {t === 'bank' ? 'Bank' : t === 'cash' ? 'Cash' : 'Wallet'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl}>Balance</label>
          <HelpText>Current balance in this account right now.</HelpText>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
            <input ref={balanceRef} type="text" inputMode="decimal" value={form.current_balance}
              onChange={e => setForm(f => ({ ...f, current_balance: sanitizeAmountInput(e.target.value) }))}
              onFocus={e => { selectOnFocus(e.target); setBalanceFocused(true) }}
              onBlur={e => {
                setBalanceFocused(false)
                const r = evaluateAmountExpression(e.target.value)
                setForm(f => ({ ...f, current_balance: r === null ? '' : String(round2(r)) }))
              }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="0"
              style={{ ...inp, paddingLeft: 28 }} />
          </div>
          {balanceFocused && <AmountOperatorRow inputRef={balanceRef} onChange={v => setForm(f => ({ ...f, current_balance: v }))} />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </BottomSheet>
  )
}

// ── Add ──────────────────────────────────────────────────────────────────────

const EMPTY_FORM: AccountForm = { name: '', type: 'bank', current_balance: '' }

interface AddAccountSheetProps {
  open: boolean
  onClose: () => void
  onAdd: (form: { name: string; type: string; current_balance: number }) => Promise<void>
}

export function AddAccountSheet({ open, onClose, onAdd }: AddAccountSheetProps) {
  const { c, inp, lbl } = useFieldStyles()
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const balanceRef = useRef<HTMLInputElement | null>(null)
  const [balanceFocused, setBalanceFocused] = useState(false)

  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setForm(EMPTY_FORM)
  }

  const handleAdd = async () => {
    const bal = round2(evaluateAmountExpression(form.current_balance) ?? 0)
    if (!form.name.trim()) return
    setAdding(true)
    try {
      await onAdd({ name: form.name.trim(), type: form.type, current_balance: bal })
      onClose()
    } catch { /* stays open so the user can retry */ }
    setAdding(false)
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Add Account</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lbl}>Account name</label>
          <HelpText>A recognizable name for this account. e.g. Axis Bank, SBI Savings, Cash.</HelpText>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Axis Bank, Cash" style={inp} />
        </div>

        <div>
          <label style={lbl}>Type</label>
          <HelpText>Bank: savings or current account. Cash: physical cash. Wallet: UPI wallets like PhonePe or GPay.</HelpText>
          <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
            {(['bank', 'cash', 'wallet'] as AccountType[]).map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '9px 4px',
                font: '700 11px Plus Jakarta Sans',
                background: form.type === t ? c.accent : 'transparent',
                color: form.type === t ? '#fff' : c.muted,
                cursor: 'pointer',
              }}>
                {t === 'bank' ? 'Bank' : t === 'cash' ? 'Cash' : 'Wallet'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl}>Opening balance</label>
          <HelpText>Current balance in this account right now.</HelpText>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
            <input ref={balanceRef} type="text" inputMode="decimal" value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: sanitizeAmountInput(e.target.value) }))}
              onFocus={e => { selectOnFocus(e.target); setBalanceFocused(true) }}
              onBlur={e => {
                setBalanceFocused(false)
                const r = evaluateAmountExpression(e.target.value)
                setForm(f => ({ ...f, current_balance: r === null ? '' : String(round2(r)) }))
              }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="0"
              style={{ ...inp, paddingLeft: 28 }} />
          </div>
          {balanceFocused && <AmountOperatorRow inputRef={balanceRef} onChange={v => setForm(f => ({ ...f, current_balance: v }))} />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleAdd} disabled={adding || !form.name.trim()} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.7 : 1 }}>
          {adding ? 'Adding...' : 'Add Account'}
        </button>
      </div>
    </BottomSheet>
  )
}

// ── Adjust balance───────────────────────────────────────────────────────────

interface AdjustBalanceSheetProps {
  account: Account | null
  open: boolean
  onClose: () => void
  onAdjust: (accountId: string, actualBalance: number) => Promise<void>
  onAddTransaction?: () => void
}

export function AdjustBalanceSheet({ account, open, onClose, onAdjust, onAddTransaction }: AdjustBalanceSheetProps) {
  const c = useTheme()
  const [input, setInput] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [inputFocused, setInputFocused] = useState(false)

  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && account) { setInput(String(round2(account.current_balance))); setDone(false) }
  }

  const handleAdjust = async () => {
    if (!account) return
    const rawActual = evaluateAmountExpression(input)
    if (rawActual === null) return
    const actual = round2(rawActual)
    setAdjusting(true)
    try {
      await onAdjust(account.id, actual)
      setDone(true)
    } catch { /* stays on the form so the user can retry */ }
    setAdjusting(false)
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      {account && (() => {
        const rawActual = evaluateAmountExpression(input)
        const actual = rawActual === null ? NaN : round2(rawActual)
        const diff = isNaN(actual) ? null : round2(actual - round2(account.current_balance))
        const diffFmt = diff === null ? null : diff === 0 ? 'No change' : fmt(diff, { sign: true })
        const diffColor = diff === null || diff === 0 ? c.muted : diff > 0 ? c.good : c.bad

        return done ? (
          <div style={{ paddingBottom: 8 }}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 6, letterSpacing: '-0.01em' }}>Balance updated</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20, lineHeight: 1.6 }}>
              A <strong style={{ color: c.ink }}>Balance Adjustment</strong> transaction was recorded for audit purposes. It won't affect your spending reports or budget strategy.
            </div>
            <div style={{ background: c.surface2, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>New balance</span>
                <span style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>{fmt(actual)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Adjustment</span>
                <span style={{ font: '700 13px Plus Jakarta Sans', color: diffColor }}>{diffFmt}</span>
              </div>
            </div>
            <button onClick={onClose}
              style={{ width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <div style={{ paddingBottom: 8 }}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.01em' }}>Adjust Balance</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 18, lineHeight: 1.6 }}>
              Enter the actual balance from your bank statement. A Balance Adjustment transaction will be created for the difference.
            </div>

            {/* Current vs actual */}
            <div style={{ background: c.surface2, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${c.faint}` }}>
                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>MoneyPlant balance</span>
                <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(account.current_balance)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: diff !== null && diff !== 0 ? 10 : 0 }}>
                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Actual balance</span>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', font: '700 13px Plus Jakarta Sans', color: c.muted }}>₹</span>
                  <input
                    ref={inputRef}
                    type="text" inputMode="decimal"
                    value={input}
                    onChange={e => setInput(sanitizeAmountInput(e.target.value))}
                    onFocus={e => { selectOnFocus(e.target); setInputFocused(true) }}
                    onBlur={e => {
                      setInputFocused(false)
                      const r = evaluateAmountExpression(e.target.value)
                      setInput(r === null ? '' : String(round2(r)))
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      const r = evaluateAmountExpression(e.currentTarget.value)
                      setInput(r === null ? '' : String(round2(r)))
                    }}
                    style={{
                      background: c.surface, border: `1.5px solid ${c.faint}`,
                      borderRadius: 10, padding: '8px 10px 8px 24px',
                      font: '700 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
                      width: 130, textAlign: 'right', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {inputFocused && (
                <div style={{ marginTop: 8, marginBottom: -4 }}>
                  <AmountOperatorRow inputRef={inputRef} onChange={setInput} />
                </div>
              )}
              {diff !== null && diff !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: c.muted }}>Difference</span>
                  <span style={{ font: '800 14px Plus Jakarta Sans', color: diffColor }}>{diffFmt}</span>
                </div>
              )}
            </div>

            {/* Two options */}
            {diff !== null && diff !== 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  How to handle this difference?
                </div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, padding: '10px 12px', background: c.surface2, borderRadius: 12 }}>
                  <div style={{ marginBottom: 6 }}>
                    <strong style={{ color: c.ink }}>Create Balance Adjustment</strong> — Records an adjustment transaction for audit trail. Use when you don't know the cause.
                  </div>
                  <div>
                    <strong style={{ color: c.ink }}>Add Transaction Instead</strong> — If you know what caused the difference (e.g. interest credited, bank charge), record a proper Income or Expense transaction and then return here.
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {diff !== null && diff !== 0 && onAddTransaction && (
                <button
                  onClick={() => { onClose(); onAddTransaction() }}
                  style={{ flex: 1, padding: '13px', borderRadius: 12, border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.muted, font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
                >
                  Add Transaction
                </button>
              )}
              <button
                onClick={handleAdjust}
                disabled={adjusting || diff === null || diff === 0}
                style={{
                  flex: 2, padding: '13px', borderRadius: 12, border: 'none',
                  background: diff !== null && diff !== 0 ? c.accent : c.faint,
                  color: diff !== null && diff !== 0 ? '#fff' : c.muted,
                  font: '700 13px Plus Jakarta Sans',
                  cursor: adjusting || diff === null || diff === 0 ? 'not-allowed' : 'pointer',
                  opacity: adjusting ? 0.7 : 1,
                }}
              >
                {adjusting ? 'Adjusting…' : diff === 0 ? 'No change' : 'Create Balance Adjustment'}
              </button>
            </div>
          </div>
        )
      })()}
    </BottomSheet>
  )
}
