import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { localIso, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { salaryDefaults } from '@/lib/salary-prompt'
import { getEarlyPaydayTolerance } from '@/lib/financial-cycle'
import { BottomSheet } from '@/components/BottomSheet'
import { QuickAmountBody } from '@/components/QuickAmountSheet'
import { CategorySelect } from '@/components/CategorySelect'
import { INCOME_GROUP } from '@/lib/constants'
import type { AppState, NewTransactionInput } from '@/types'

interface Props {
  /** The payday being asked about; null keeps the sheet closed. */
  payday: Date | null
  state: AppState
  onSave: (form: NewTransactionInput) => Promise<unknown>
  /** "Not yet received" and closing the sheet — the caller snoozes until tomorrow. */
  onNotYet: () => void
  onAddCategory: (name: string, group_name: string) => Promise<string>
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** "Did your salary come in?" — prefilled with the usual amount and account, both editable. */
export function SalaryPromptSheet({ payday, state, onSave, onNotYet, onAddCategory }: Props) {
  const c = useTheme()
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset on every open, during render (same pattern as EventExpenseSheet), keyed
  // on the payday so a re-render with fresh state doesn't wipe what's being typed.
  const paydayKey = payday ? localIso(payday) : null
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (paydayKey !== openedFor) {
    setOpenedFor(paydayKey)
    if (payday) {
      const def = salaryDefaults(state)
      setAmount(def.amount ? String(def.amount) : '')
      setAccountId(def.accountId)
      setCategoryId(def.categoryId ?? '')
      setDate(localIso(new Date()))
      setError(null)
    }
  }

  const today = localIso(new Date())
  const earliest = payday
    ? localIso(new Date(payday.getFullYear(), payday.getMonth(), payday.getDate() - getEarlyPaydayTolerance('monthly')))
    : today
  const isPaydayToday = paydayKey === today

  const fieldStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 10px',
    font: '600 13px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase',
  }

  const handleSave = async () => {
    const amt = evaluateAmountExpression(amount)
    if (amt === null || amt <= 0 || !accountId || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        description: 'Salary',
        transaction_date: date >= earliest && date <= today ? date : today,
        amount: round2(amt),
        transaction_type: 'income',
        category_id: categoryId || null,
        from_account_id: accountId,
      })
    } catch (err) {
      console.error('Failed to record salary', err)
      setError(err instanceof Error && err.message ? err.message : "Couldn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={!!payday} onClose={onNotYet} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>
          {isPaydayToday
            ? 'Today is payday. Record your salary once it reaches your account.'
            : `Payday was ${payday ? fmtDay(payday) : ''}. Record your salary once it reaches your account.`}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Received on</div>
          <input type="date" value={date} min={earliest} max={today}
            onChange={e => setDate(e.target.value)} style={fieldStyle} />
        </div>
        <QuickAmountBody
          title="Has your salary come in?"
          // Salary never lands on a credit card.
          accounts={state.accounts}
          creditCards={[]}
          accountId={accountId}
          onAccountChange={setAccountId}
          amount={amount}
          onAmountChange={setAmount}
          onSave={handleSave}
          onCancel={onNotYet}
          cancelLabel="Not yet received"
          saving={saving}
          autoFocus={false}
          categoryNode={
            <CategorySelect
              value={categoryId}
              onChange={setCategoryId}
              state={state}
              onAddCategory={onAddCategory}
              filterGroup={INCOME_GROUP}
              style={fieldStyle}
            />
          }
        />
        {error && (
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 10 }}>{error}</div>
        )}
      </div>
    </BottomSheet>
  )
}
