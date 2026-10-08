import type { CreditCard, Transaction, TransactionType } from '@/types'
import { round2 } from '@/lib/utils'
import { localYmd, clampedDay } from '@/lib/credit-card-cycles'

const CC_SPEND_TYPES = new Set<TransactionType>(['expense', 'commitment'])

export interface CreditCardBilling {
  totalOutstanding: number
  billedAmount: number
  unbilledAmount: number
  lastBillDate: string
  /** The next due day strictly after today — a calendar fact, not "when the outstanding bill is due".
   *  On the due day itself this is already next month's date; use `statementDueDate` for the bill. */
  nextDueDate: string
  /** When the statement generated at `lastBillDate` (i.e. `billedAmount`) falls due: the first due day
   *  after that bill date. Equals today on the due day, and is in the past once it is overdue. */
  statementDueDate: string
  nextBillDate: string
  /** Gross statement before payments. billedAmount is already net of them, so the Current Statement
   *  preview needs this to show Total / Paid / Remaining. Additive only — nothing else reads it. */
  statementAmount: number
  /** Payments made since the last bill date, i.e. what has been settled against that statement. */
  paidSinceBill: number
  /** Refunds credited to the card since the last bill. Banks apply them to the billed amount first,
   *  exactly like a payment, so they settle that statement too; kept apart from `paidSinceBill`
   *  because no money was paid. */
  refundedSinceBill: number
}

/** The most recent bill_day on or before `today`.
 *
 *  Uses clampedDay, so bill_day 31 lands on 30 Apr / 28 Feb rather than rolling into the next month
 *  the way `new Date(y, m, 31)` silently does — the form allows 1–31, so this is reachable. */
function getLastBillDate(billDay: number, today: Date): Date {
  const d = clampedDay(today.getFullYear(), today.getMonth(), billDay)
  if (d > today) return clampedDay(today.getFullYear(), today.getMonth() - 1, billDay)
  return d
}

/** The next occurrence of `day` strictly after `today`, clamped the same way. */
function getNextDate(day: number, today: Date): Date {
  const d = clampedDay(today.getFullYear(), today.getMonth(), day)
  if (d <= today) return clampedDay(today.getFullYear(), today.getMonth() + 1, day)
  return d
}

export function getCreditCardBilling(
  card: CreditCard,
  transactions: Transaction[],
  today: Date = new Date(),
): CreditCardBilling {
  const lastBill = getLastBillDate(card.bill_day, today)
  // localYmd, not toISOString(): the latter converts local midnight to UTC and renders a day early
  // for every timezone east of UTC (IST included). That shifted every date this returns, and — because
  // lastBillStr is compared against transaction_date below — also mis-split billed vs unbilled by a day.
  const lastBillStr = localYmd(lastBill)

  // Reconstruct the statement amount at the last bill date by reversing all post-bill activity,
  // while tracking payments and refunds made since — they settle that statement (fully or partially).
  let balanceAtBill = card.current_balance
  let paidSinceBill = 0
  let refundedSinceBill = 0
  for (const t of transactions) {
    if (t.credit_card_id !== card.id || t.transaction_date <= lastBillStr) continue
    if (CC_SPEND_TYPES.has(t.transaction_type)) {
      balanceAtBill -= t.amount
    } else if (t.transaction_type === 'credit_card_payment') {
      balanceAtBill += t.amount
      paidSinceBill += t.amount
    } else if (t.transaction_type === 'cc_balance_adjustment') {
      balanceAtBill += t.is_credit ? -t.amount : t.amount
    } else if (t.transaction_type === 'income') {
      // A refund credited to the card (a reimbursement). Applied to the bill first, like a
      // payment; only what the bill no longer needs comes off the unbilled amount below.
      balanceAtBill += t.amount
      refundedSinceBill += t.amount
    }
  }

  const statementAmount = Math.max(0, round2(balanceAtBill))
  // Never more than the card owes in total (a credit adjustment can leave it owing less than the
  // statement's figure).
  const billedAmount = Math.max(0, round2(Math.min(statementAmount - paidSinceBill - refundedSinceBill, card.current_balance)))
  const unbilledAmount = Math.max(0, round2(card.current_balance - billedAmount))

  return {
    totalOutstanding: card.current_balance,
    billedAmount,
    unbilledAmount,
    lastBillDate: lastBillStr,
    nextDueDate: localYmd(getNextDate(card.due_day, today)),
    statementDueDate: localYmd(getNextDate(card.due_day, lastBill)),
    nextBillDate: localYmd(getNextDate(card.bill_day, today)),
    statementAmount,
    paidSinceBill: round2(paidSinceBill),
    refundedSinceBill: round2(refundedSinceBill),
  }
}
