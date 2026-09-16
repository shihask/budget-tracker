import { useState, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { fmt, round2, selectOnFocus } from '@/lib/utils'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { AmountOperatorRow } from './AmountOperatorRow'
import { BottomSheet, HelpText, HelpToggle } from './BottomSheet'
import { getCreditCardBilling } from '@/lib/credit-card'
import type { AppState, CreditCard } from '@/types'

type CardPayload = Omit<CreditCard, 'id' | 'user_id' | 'is_active'>

export type PayOnlyParams = {
  mode: 'pay-only'
  state: AppState
  onPayBill: (card: CreditCard, amount: number, accountId: string) => Promise<void>
}

export type FullParams = {
  mode: 'full'
  state: AppState
  onAdd: (form: CardPayload) => Promise<void>
  onUpdate: (id: string, form: CardPayload) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onPayBill: (card: CreditCard, amount: number, accountId: string) => Promise<void>
  onAdjustBalance: (cardId: string, actualBalance: number, billedAmount?: number) => Promise<void>
}

type Params = PayOnlyParams | FullParams

export interface PayApi {
  /** Opens the Pay Bill sheet. Prefills the current billed amount (falling back to total
   *  outstanding) unless `prefillAmount` is given — the statement details page passes that
   *  statement's remaining, so paying a historical or part-settled statement offers the right
   *  figure instead of the current cycle's. */
  openPay: (card: CreditCard, prefillAmount?: number) => void
  /** True while any sheet this surface owns is open — the page's swipe guard reads this. */
  anyOpen: boolean
  sheets: React.ReactNode
}

export interface FullApi extends PayApi {
  openAdd: () => void
  openEdit: (card: CreditCard) => void
  openAdjust: (card: CreditCard) => void
  confirmDelete: (card: CreditCard) => Promise<void>
}

type CardForm = {
  name: string
  last_four: string
  credit_limit: string
  cycle_start_day: string
  bill_day: string
  due_day: string
  current_balance: string
}

const EMPTY_FORM: CardForm = {
  name: '', last_four: '', credit_limit: '', cycle_start_day: '1',
  bill_day: '15', due_day: '30', current_balance: '0',
}

/**
 * The credit-card management sheets, shared by the dashboard section and the Credit Cards page.
 *
 * `mode` decides which sheets exist: the dashboard passes `'pay-only'` and never mounts the
 * Add/Edit or Adjust markup or handlers; the page passes `'full'`. Hooks can't be conditional, so
 * the state below is always declared — `mode` gates only which actions are returned and which
 * sheets `sheets` renders.
 */
export function useCreditCardSheets(p: PayOnlyParams): PayApi
export function useCreditCardSheets(p: FullParams): FullApi
export function useCreditCardSheets(p: Params): FullApi {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const full = p.mode === 'full' ? p : null
  const state = p.state

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CardForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [payTarget, setPayTarget] = useState<CreditCard | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payAccountId, setPayAccountId] = useState('')
  const [paying, setPaying] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<CreditCard | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustBilled, setAdjustBilled] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)
  const creditLimitRef = useRef<HTMLInputElement | null>(null)
  const currentBalanceRef = useRef<HTMLInputElement | null>(null)
  const payAmountRef = useRef<HTMLInputElement | null>(null)
  const adjustAmountRef = useRef<HTMLInputElement | null>(null)
  const adjustBilledRef = useRef<HTMLInputElement | null>(null)
  const [creditLimitFocused, setCreditLimitFocused] = useState(false)
  const [currentBalanceFocused, setCurrentBalanceFocused] = useState(false)
  const [payAmountFocused, setPayAmountFocused] = useState(false)
  const [adjustAmountFocused, setAdjustAmountFocused] = useState(false)
  const [adjustBilledFocused, setAdjustBilledFocused] = useState(false)

  const accounts = state.accounts.filter(a => a.is_active)
  const cards = state.credit_cards || []

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setSheetOpen(true) }
  const openEdit = (card: CreditCard) => {
    setEditingId(card.id)
    setForm({
      name: card.name, last_four: card.last_four || '',
      credit_limit: String(card.credit_limit),
      cycle_start_day: String(card.cycle_start_day),
      bill_day: String(card.bill_day),
      due_day: String(card.due_day),
      current_balance: String(round2(card.current_balance)),
    })
    setSheetOpen(true)
  }
  const closeSheet = () => { setSheetOpen(false); setEditingId(null); setForm(EMPTY_FORM) }

  const openPay = (card: CreditCard, prefillAmount?: number) => {
    const billing = getCreditCardBilling(card, state.transactions)
    setPayTarget(card)
    setPayAmount(String(round2(prefillAmount ?? (billing.billedAmount || card.current_balance))))
    setPayAccountId(accounts[0]?.id || '')
  }

  const openAdjust = (card: CreditCard) => {
    const billing = getCreditCardBilling(card, state.transactions)
    setAdjustTarget(card)
    setAdjustAmount(String(round2(card.current_balance)))
    setAdjustBilled(String(round2(billing.billedAmount)))
  }

  const deleteCard = async (id: string, name: string) => {
    if (!full) return
    if (!(await confirm(`Delete "${name || 'this card'}"? This cannot be undone.`))) return
    await full.onDelete(id)
    closeSheet()
  }

  const confirmDelete = (card: CreditCard) => deleteCard(card.id, card.name)

  const handleSave = async () => {
    if (!full) return
    if (!form.name.trim() || !form.credit_limit || evaluateAmountExpression(form.credit_limit) === null) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      last_four: form.last_four || null,
      credit_limit: round2(evaluateAmountExpression(form.credit_limit) ?? 0),
      cycle_start_day: parseInt(form.cycle_start_day) || 1,
      bill_day: parseInt(form.bill_day) || 15,
      due_day: parseInt(form.due_day) || 30,
      current_balance: round2(evaluateAmountExpression(form.current_balance) ?? 0),
    }
    try {
      if (editingId) await full.onUpdate(editingId, payload)
      else await full.onAdd(payload)
      closeSheet()
    } catch (_) {}
    setSaving(false)
  }

  const handlePayBill = async () => {
    const amt = evaluateAmountExpression(payAmount)
    if (!payTarget || amt === null || !payAccountId) return
    setPaying(true)
    try {
      await p.onPayBill(payTarget, round2(amt), payAccountId)
      setPayTarget(null)
    } catch (_) {}
    setPaying(false)
  }

  const handleAdjustBalance = async () => {
    const amt = evaluateAmountExpression(adjustAmount)
    if (!full || !adjustTarget || amt === null) return
    setAdjusting(true)
    try {
      const billing = getCreditCardBilling(adjustTarget, state.transactions)
      const rawBilled = adjustBilled ? evaluateAmountExpression(adjustBilled) : null
      const newBilled = rawBilled === null ? undefined : round2(rawBilled)
      const billedChanged = newBilled !== undefined && Math.abs(newBilled - billing.billedAmount) > 0.01
      await full.onAdjustBalance(adjustTarget.id, round2(amt), billedChanged ? newBilled : undefined)
      setAdjustTarget(null)
    } catch (_) {}
    setAdjusting(false)
  }

  const InfoIcon = ({ id, text }: { id: string; text: string }) => (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setTooltip(tooltip === id ? null : id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px', color: c.muted, display: 'flex', alignItems: 'center' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
      {tooltip === id && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: c.ink, color: c.bg, borderRadius: 10, padding: '8px 10px',
          font: '600 11px Plus Jakarta Sans', lineHeight: 1.5, zIndex: 10,
          width: 200, whiteSpace: 'normal', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {text}
        </div>
      )}
    </span>
  )

  const payBillSheet = (
    <BottomSheet open={!!payTarget} onClose={() => setPayTarget(null)} zIndex={350} showHelpButton={false}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Pay Bill</div>
      {payTarget && (() => {
        const b = getCreditCardBilling(payTarget, state.transactions)
        return (
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
            {payTarget.name} · Billed {fmt(b.billedAmount)}{b.unbilledAmount > 0 ? ` · Unbilled ${fmt(b.unbilledAmount)}` : ''} · Total {fmt(payTarget.current_balance)}
          </div>
        )
      })()}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lbl}>Payment Amount</label>
          <input ref={payAmountRef} type="text" inputMode="decimal"
            onFocus={e => { selectOnFocus(e.target); setPayAmountFocused(true) }}
            onBlur={e => {
              setPayAmountFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              setPayAmount(r === null ? '' : String(round2(r)))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              setPayAmount(r === null ? '' : String(round2(r)))
            }}
            value={payAmount} onChange={e => setPayAmount(sanitizeAmountInput(e.target.value))} placeholder="0" style={inp} />
          {payAmountFocused && <AmountOperatorRow inputRef={payAmountRef} onChange={setPayAmount} />}
        </div>
        <div>
          <label style={lbl}>Pay from Account</label>
          <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)} style={inp}>
            <option value="">Select account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={() => setPayTarget(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handlePayBill} disabled={paying || !payAmount || !payAccountId} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: paying ? 0.7 : 1 }}>
          {paying ? 'Processing...' : `Pay ${fmt(evaluateAmountExpression(payAmount) ?? 0)}`}
        </button>
      </div>
    </BottomSheet>
  )

  const addEditSheet = (
    <BottomSheet open={sheetOpen} onClose={closeSheet} maxHeight="90svh" zIndex={350} showHelpButton={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink }}>{editingId ? 'Edit Card' : 'Add Credit Card'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HelpToggle />
          {editingId && (
            <button onClick={() => deleteCard(editingId, form.name)}
              style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lbl}>Card Name</label>
          <HelpText>A recognizable name. e.g. Axis Visa, HDFC Millenia.</HelpText>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Axis Visa" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Last 4 digits</label>
            <HelpText>Last 4 digits of your card number — helps identify it at a glance. Optional.</HelpText>
            <input value={form.last_four} onChange={e => setForm(f => ({ ...f, last_four: e.target.value.slice(0, 4) }))} placeholder="4571" maxLength={4} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>
              Credit Limit
              <InfoIcon id="limit" text="The maximum amount you can spend on this card. Check your card statement or bank app." />
            </label>
            <HelpText>Your total approved credit limit on this card.</HelpText>
            <input ref={creditLimitRef} type="text" inputMode="decimal"
              onFocus={e => { selectOnFocus(e.target); setCreditLimitFocused(true) }}
              onBlur={e => {
                setCreditLimitFocused(false)
                const r = evaluateAmountExpression(e.target.value)
                setForm(f => ({ ...f, credit_limit: r === null ? '' : String(round2(r)) }))
              }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                const r = evaluateAmountExpression(e.currentTarget.value)
                setForm(f => ({ ...f, credit_limit: r === null ? '' : String(round2(r)) }))
              }}
              value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: sanitizeAmountInput(e.target.value) }))} placeholder="100000" style={inp} />
            {creditLimitFocused && <AmountOperatorRow inputRef={creditLimitRef} onChange={v => setForm(f => ({ ...f, credit_limit: v }))} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>
              Cycle Start
              <InfoIcon id="cycle" text="The day your billing cycle begins each month. E.g. if your cycle is 16th to 15th, enter 16." />
            </label>
            <HelpText>Day of the month when your billing cycle starts.</HelpText>
            <input type="number" inputMode="numeric" onFocus={e => e.target.select()} value={form.cycle_start_day} onChange={e => setForm(f => ({ ...f, cycle_start_day: e.target.value }))} min="1" max="31" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>
              Bill Date
              <InfoIcon id="bill" text="The date your statement is generated each month. Your total spend up to this date becomes the bill amount." />
            </label>
            <HelpText>Day when your monthly statement is generated by the bank.</HelpText>
            <input type="number" inputMode="numeric" onFocus={e => e.target.select()} value={form.bill_day} onChange={e => setForm(f => ({ ...f, bill_day: e.target.value }))} min="1" max="31" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>
              Due Date
              <InfoIcon id="due" text="The last date to pay your bill without penalty. Usually 15-20 days after the bill date." />
            </label>
            <HelpText>Last day to pay your bill without incurring interest or late fees.</HelpText>
            <input type="number" inputMode="numeric" onFocus={e => e.target.select()} value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} min="1" max="31" style={inp} />
          </div>
        </div>
        {!editingId ? (
          <div>
            <label style={lbl}>
              Current Outstanding
              <InfoIcon id="balance" text="How much you currently owe on this card right now. Check your bank app or last statement." />
            </label>
            <HelpText>How much you currently owe on this card. Check your card app or last statement.</HelpText>
            <input ref={currentBalanceRef} type="text" inputMode="decimal"
              onFocus={e => { selectOnFocus(e.target); setCurrentBalanceFocused(true) }}
              onBlur={e => {
                setCurrentBalanceFocused(false)
                const r = evaluateAmountExpression(e.target.value)
                setForm(f => ({ ...f, current_balance: r === null ? '' : String(round2(r)) }))
              }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                const r = evaluateAmountExpression(e.currentTarget.value)
                setForm(f => ({ ...f, current_balance: r === null ? '' : String(round2(r)) }))
              }}
              value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: sanitizeAmountInput(e.target.value) }))} placeholder="0" style={inp} />
            {currentBalanceFocused && <AmountOperatorRow inputRef={currentBalanceRef} onChange={v => setForm(f => ({ ...f, current_balance: v }))} />}
          </div>
        ) : (
          <div style={{ background: c.surface2, borderRadius: 11, padding: '10px 12px' }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Current Outstanding</div>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(cards.find(cd => cd.id === editingId)?.current_balance ?? 0)}</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>Use "Adjust Balance" from the card to correct this.</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={closeSheet} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.name || !form.credit_limit} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Card'}
        </button>
      </div>
    </BottomSheet>
  )

  const adjustSheet = (
    <BottomSheet open={!!adjustTarget} onClose={() => setAdjustTarget(null)} zIndex={350} showHelpButton={false}>
      {(() => {
        const billing = adjustTarget ? getCreditCardBilling(adjustTarget, state.transactions) : null
        const adjustAmountVal = evaluateAmountExpression(adjustAmount)
        const adjustBilledVal = evaluateAmountExpression(adjustBilled)
        const totalChanged = adjustTarget && adjustAmount !== '' && adjustAmountVal !== null && Math.abs(adjustAmountVal - adjustTarget.current_balance) > 0.01
        const billedChanged = billing && adjustBilled !== '' && adjustBilledVal !== null && Math.abs(adjustBilledVal - billing.billedAmount) > 0.01
        const billedExceedsTotal = adjustBilled !== '' && adjustBilledVal !== null && adjustAmountVal !== null && adjustBilledVal > adjustAmountVal + 0.01
        const hasChange = totalChanged || billedChanged
        return <>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Adjust Balance</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 16 }}>
            {adjustTarget?.name} · Current outstanding {adjustTarget ? fmt(adjustTarget.current_balance) : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Total Outstanding</label>
              <input ref={adjustAmountRef} type="text" inputMode="decimal"
                onFocus={e => { selectOnFocus(e.target); setAdjustAmountFocused(true) }}
                onBlur={e => {
                  setAdjustAmountFocused(false)
                  const r = evaluateAmountExpression(e.target.value)
                  setAdjustAmount(r === null ? '' : String(round2(r)))
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  const r = evaluateAmountExpression(e.currentTarget.value)
                  setAdjustAmount(r === null ? '' : String(round2(r)))
                }}
                value={adjustAmount} onChange={e => setAdjustAmount(sanitizeAmountInput(e.target.value))} placeholder="0" style={inp} />
              {adjustAmountFocused && <AmountOperatorRow inputRef={adjustAmountRef} onChange={setAdjustAmount} />}
            </div>
            <div>
              <label style={lbl}>Billed Amount</label>
              <input ref={adjustBilledRef} type="text" inputMode="decimal"
                onFocus={e => { selectOnFocus(e.target); setAdjustBilledFocused(true) }}
                onBlur={e => {
                  setAdjustBilledFocused(false)
                  const r = evaluateAmountExpression(e.target.value)
                  setAdjustBilled(r === null ? '' : String(round2(r)))
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  const r = evaluateAmountExpression(e.currentTarget.value)
                  setAdjustBilled(r === null ? '' : String(round2(r)))
                }}
                value={adjustBilled} onChange={e => setAdjustBilled(sanitizeAmountInput(e.target.value))} placeholder="0" style={inp} />
              {adjustBilledFocused && <AmountOperatorRow inputRef={adjustBilledRef} onChange={setAdjustBilled} />}
              {billedExceedsTotal ? (
                <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.bad, marginTop: 4 }}>
                  Billed can't exceed total outstanding ({fmt(adjustAmountVal!)}). Update Total Outstanding first.
                </div>
              ) : adjustAmount && adjustBilled !== '' && (
                <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>
                  Unbilled: {fmt(Math.max(0, (adjustAmountVal ?? 0) - (adjustBilledVal ?? 0)))}
                </div>
              )}
            </div>
          </div>
          {hasChange && !billedExceedsTotal && (
            <div style={{ marginTop: 10, background: c.surface2, borderRadius: 10, padding: '8px 12px', font: '600 12px Plus Jakarta Sans', color: c.muted, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {totalChanged && (() => {
                const diff = adjustAmountVal! - adjustTarget!.current_balance
                return <div>Outstanding {diff > 0 ? 'increases' : 'decreases'} by {fmt(Math.abs(diff))}</div>
              })()}
              {billedChanged && (() => {
                const diff = adjustBilledVal! - billing!.billedAmount
                return <div>Billed {diff > 0 ? 'increases' : 'decreases'} by {fmt(Math.abs(diff))}</div>
              })()}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => setAdjustTarget(null)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={handleAdjustBalance}
              disabled={adjusting || !hasChange || billedExceedsTotal}
              style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: adjusting || billedExceedsTotal ? 0.5 : 1 }}
            >
              {adjusting ? 'Adjusting...' : 'Adjust Balance'}
            </button>
          </div>
        </>
      })()}
    </BottomSheet>
  )

  return {
    openAdd, openEdit, openPay, openAdjust, confirmDelete,
    anyOpen: full ? (sheetOpen || !!payTarget || !!adjustTarget) : !!payTarget,
    sheets: full
      ? <>{addEditSheet}{payBillSheet}{adjustSheet}{dialogNode}</>
      : payBillSheet,
  }
}
