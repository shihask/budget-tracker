import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState, Commitment } from '@/types'

interface Props {
  state: AppState
  onMarkPaid?: (cm: Commitment, recordExpense: boolean, accountId: string | null) => Promise<void>
}

interface Reminder {
  id: string
  type: 'credit_card_due' | 'credit_card_bill' | 'commitment_due'
  title: string
  subtitle: string
  daysLeft: number
  urgent: boolean // <= 3 days
  warning: boolean // <= 7 days
  commitment?: Commitment
}

function getDaysUntil(day: number): number {
  const today = new Date()
  const target = new Date(today.getFullYear(), today.getMonth(), day)
  if (target <= today) target.setMonth(target.getMonth() + 1)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function buildReminders(state: AppState): Reminder[] {
  const reminders: Reminder[] = []
  const now = new Date()

  // Credit card due dates
  for (const card of (state.credit_cards || [])) {
    if (!card.is_active || card.current_balance <= 0) continue

    const daysUntilDue = getDaysUntil(card.due_day)
    const daysUntilBill = getDaysUntil(card.bill_day)

    if (daysUntilDue <= 7) {
      reminders.push({
        id: `cc-due-${card.id}`,
        type: 'credit_card_due',
        title: `${card.name} payment due`,
        subtitle: `₹${card.current_balance.toLocaleString('en-IN')} outstanding`,
        daysLeft: daysUntilDue,
        urgent: daysUntilDue <= 3,
        warning: daysUntilDue <= 7,
      })
    } else if (daysUntilBill <= 3) {
      reminders.push({
        id: `cc-bill-${card.id}`,
        type: 'credit_card_bill',
        title: `${card.name} bill generates soon`,
        subtitle: `Current spend: ${fmt(card.current_balance)}`,
        daysLeft: daysUntilBill,
        urgent: false,
        warning: true,
      })
    }
  }

  // Upcoming commitment due dates (not yet paid this month)
  for (const cm of state.commitments) {
    if (!cm.is_active || !cm.is_recurring || !cm.due_day) continue

    // Skip if already paid this month
    if (cm.last_paid_date) {
      const paid = new Date(cm.last_paid_date)
      if (paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()) continue
    }

    const daysUntilDue = getDaysUntil(cm.due_day)
    if (daysUntilDue <= 5) {
      reminders.push({
        id: `cm-${cm.id}`,
        type: 'commitment_due',
        title: `${cm.name} due soon`,
        subtitle: `₹${cm.amount.toLocaleString('en-IN')} · ${cm.due_day}th every month`,
        daysLeft: daysUntilDue,
        urgent: daysUntilDue <= 2,
        warning: daysUntilDue <= 5,
        commitment: cm,
      })
    }
  }

  // Sort by urgency
  return reminders.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function RemindersBar({ state, onMarkPaid }: Props) {
  const c = useTheme()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [payTarget, setPayTarget] = useState<Commitment | null>(null)
  const [payAccountId, setPayAccountId] = useState<string>('')
  const [paying, setPaying] = useState(false)

  const reminders = buildReminders(state).filter(r => !dismissed.has(r.id))

  const payIsCC = payTarget ? (state.credit_cards || []).some(cc => cc.id === payTarget.from_account_id) : false
  const payCardName = payTarget && payIsCC
    ? ((state.credit_cards || []).find(cc => cc.id === payTarget.from_account_id)?.name || 'card')
    : ''

  const openPay = (cm: Commitment) => {
    setPayTarget(cm)
    setPayAccountId(cm.from_account_id || state.accounts[0]?.id || '')
  }
  const closePay = () => { setPayTarget(null); setPaying(false) }

  const doPay = async (recordExpense: boolean) => {
    if (!payTarget || !onMarkPaid) return
    setPaying(true)
    try {
      await onMarkPaid(payTarget, recordExpense, recordExpense ? (payAccountId || null) : null)
      closePay()
    } catch {
      setPaying(false)
    }
  }

  return (
    <>
      {reminders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reminders.map(r => {
            const bgColor = r.urgent ? '#FEF2F2' : '#FFFBEB'
            const borderColor = r.urgent ? '#FECACA' : '#FDE68A'
            const iconColor = r.urgent ? '#EF4444' : '#F59E0B'
            const textColor = r.urgent ? '#991B1B' : '#92400E'
            const canPay = r.type === 'commitment_due' && r.commitment && !!onMarkPaid

            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: bgColor, border: `1px solid ${borderColor}`,
                borderRadius: 14, padding: '11px 14px',
              }}>
                {/* Icon */}
                <div style={{ width: 34, height: 34, borderRadius: 10, background: iconColor + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {r.type === 'credit_card_due' || r.type === 'credit_card_bill' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round">
                      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  )}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '700 13px Plus Jakarta Sans', color: textColor }}>{r.title}</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: textColor + 'AA', marginTop: 2 }}>{r.subtitle}</div>
                </div>

                {/* Days badge + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {canPay && (
                    <button onClick={() => openPay(r.commitment!)}
                      style={{ background: c.good, border: 'none', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ font: '800 11px Plus Jakarta Sans', color: '#fff' }}>Mark paid</span>
                    </button>
                  )}
                  <div style={{ background: iconColor, borderRadius: 8, padding: '4px 8px', textAlign: 'center' }}>
                    <div style={{ font: '800 14px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>{r.daysLeft}</div>
                    <div style={{ font: '600 9px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', lineHeight: 1, marginTop: 1 }}>days</div>
                  </div>
                  <button onClick={() => setDismissed(s => new Set([...s, r.id]))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: textColor + '80' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mark-paid confirmation */}
      {payTarget && onMarkPaid && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={closePay} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
              Mark {payTarget.name} paid
            </div>

            {payIsCC ? (
              <>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>
                  This adds <strong style={{ color: c.ink }}>{fmt(payTarget.amount)}</strong> to your <strong style={{ color: c.ink }}>{payCardName}</strong> statement.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={paying} onClick={() => doPay(false)}
                    style={{ width: '100%', background: c.good, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: paying ? 'default' : 'pointer', opacity: paying ? 0.6 : 1 }}>
                    {paying ? 'Marking…' : 'Yes, mark paid'}
                  </button>
                  <button disabled={paying} onClick={closePay}
                    style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 14 }}>
                  Log <strong style={{ color: c.ink }}>{fmt(payTarget.amount)}</strong> as an expense, or just mark it paid without recording a transaction.
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Pay from</label>
                  <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                    style={{ width: '100%', background: c.surface2, border: `1px solid ${c.faint}`, borderRadius: 12, padding: '11px 12px', font: '700 14px Plus Jakarta Sans', color: c.ink, outline: 'none', boxSizing: 'border-box' }}>
                    {(state.accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={paying} onClick={() => doPay(true)}
                    style={{ width: '100%', background: c.good, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: paying ? 'default' : 'pointer', opacity: paying ? 0.6 : 1 }}>
                    {paying ? 'Marking…' : 'Mark paid + log expense'}
                  </button>
                  <button disabled={paying} onClick={() => doPay(false)}
                    style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: paying ? 'default' : 'pointer' }}>
                    Just mark paid
                  </button>
                  <button disabled={paying} onClick={closePay}
                    style={{ width: '100%', background: 'none', color: c.muted, border: 'none', borderRadius: 12, padding: '8px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
