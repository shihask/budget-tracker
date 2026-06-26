import type { CreditCard, Transaction, TransactionType } from '@/types'

const CC_SPEND_TYPES = new Set<TransactionType>(['expense', 'commitment'])

export interface CreditCardBilling {
  totalOutstanding: number
  billedAmount: number
  unbilledAmount: number
  lastBillDate: string
  nextDueDate: string
  nextBillDate: string
}

function getLastBillDate(billDay: number, today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), billDay)
  if (d > today) d.setMonth(d.getMonth() - 1)
  return d
}

function getNextDate(day: number, today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), day)
  if (d <= today) d.setMonth(d.getMonth() + 1)
  return d
}

export function getCreditCardBilling(
  card: CreditCard,
  transactions: Transaction[],
  today: Date = new Date(),
): CreditCardBilling {
  const lastBill = getLastBillDate(card.bill_day, today)
  const lastBillStr = lastBill.toISOString().slice(0, 10)

  // Reconstruct balance at last bill date by reversing all post-bill activity
  let balanceAtBill = card.current_balance
  for (const t of transactions) {
    if (t.credit_card_id !== card.id || t.transaction_date <= lastBillStr) continue
    if (CC_SPEND_TYPES.has(t.transaction_type)) {
      balanceAtBill -= t.amount
    } else if (t.transaction_type === 'credit_card_payment') {
      balanceAtBill += t.amount
    } else if (t.transaction_type === 'cc_balance_adjustment') {
      balanceAtBill += t.is_credit ? -t.amount : t.amount
    }
  }

  const billedAmount = Math.max(0, balanceAtBill)
  const unbilledAmount = Math.max(0, card.current_balance - billedAmount)

  return {
    totalOutstanding: card.current_balance,
    billedAmount,
    unbilledAmount,
    lastBillDate: lastBillStr,
    nextDueDate: getNextDate(card.due_day, today).toISOString().slice(0, 10),
    nextBillDate: getNextDate(card.bill_day, today).toISOString().slice(0, 10),
  }
}
