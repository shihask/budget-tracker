import { describe, it, expect } from 'vitest'
import { getCreditCardBilling } from './credit-card'
import type { CreditCard, Transaction, TransactionType } from '@/types'

function card(over: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card1', name: 'Axis Rupay CC', last_four: '4571',
    credit_limit: 250000, cycle_start_day: 26, bill_day: 25, due_day: 11,
    current_balance: 0, is_active: true,
    ...over,
  } as CreditCard
}

let seq = 0
function tx(date: string, amount: number, type: TransactionType = 'expense', over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${seq++}`, transaction_date: date, description: 'x', amount,
    transaction_type: type, category_id: null, from_account_id: null, to_account_id: null,
    notes: null, created_at: date, credit_card_id: 'card1',
    ...over,
  } as Transaction
}

describe('getCreditCardBilling — dates', () => {
  // These are LOCAL dates. Before the fix these all rendered a day early in any timezone east of
  // UTC, which showed up as the Upcoming list saying "10 Sep" while the card said "DUE DATE 11th".
  const today = new Date(2026, 8, 9) // 9 Sep 2026

  it('returns the local date, not the UTC-shifted one', () => {
    const b = getCreditCardBilling(card(), [], today)
    expect(b.lastBillDate).toBe('2026-08-25')
    expect(b.nextBillDate).toBe('2026-09-25')
    expect(b.nextDueDate).toBe('2026-09-11')
  })

  it('agrees with the card day-of-month the user configured', () => {
    const b = getCreditCardBilling(card({ bill_day: 25, due_day: 11 }), [], today)
    expect(Number(b.nextDueDate.slice(-2))).toBe(11)
    expect(Number(b.nextBillDate.slice(-2))).toBe(25)
  })

  it('rolls to next month once the day has passed', () => {
    const b = getCreditCardBilling(card(), [], new Date(2026, 8, 26))
    expect(b.lastBillDate).toBe('2026-09-25')
    expect(b.nextBillDate).toBe('2026-10-25')
  })

  it('clamps day 31 into a short month rather than skipping it', () => {
    const c31 = card({ bill_day: 31, due_day: 31 })
    const b = getCreditCardBilling(c31, [], new Date(2026, 3, 15)) // 15 Apr
    expect(b.lastBillDate).toBe('2026-03-31')
    expect(b.nextBillDate).toBe('2026-04-30') // not 1 May
    expect(b.nextDueDate).toBe('2026-04-30')
  })

  it('clamps into February', () => {
    const b = getCreditCardBilling(card({ bill_day: 30 }), [], new Date(2026, 1, 10))
    expect(b.lastBillDate).toBe('2026-01-30')
    expect(b.nextBillDate).toBe('2026-02-28')
  })
})

describe('getCreditCardBilling — billed/unbilled split', () => {
  const today = new Date(2026, 8, 9) // 9 Sep 2026, last bill 25 Aug

  it('treats a charge ON the bill date as billed, not unbilled', () => {
    // The comparison is `transaction_date <= lastBillStr`. With the old UTC shift lastBillStr was
    // 24 Aug, so a 25 Aug charge fell on the wrong side of the split.
    const c = card({ current_balance: 1000 })
    const b = getCreditCardBilling(c, [tx('2026-08-25', 1000)], today)
    expect(b.billedAmount).toBe(1000)
    expect(b.unbilledAmount).toBe(0)
  })

  it('treats a charge after the bill date as unbilled', () => {
    const c = card({ current_balance: 1000 })
    const b = getCreditCardBilling(c, [tx('2026-08-26', 1000)], today)
    expect(b.billedAmount).toBe(0)
    expect(b.unbilledAmount).toBe(1000)
  })

  it('splits a mixed cycle', () => {
    const c = card({ current_balance: 4806.86 })
    const b = getCreditCardBilling(c, [
      tx('2026-08-20', 572.39),   // billed
      tx('2026-09-01', 4234.47),  // unbilled
    ], today)
    expect(b.billedAmount).toBe(572.39)
    expect(b.unbilledAmount).toBe(4234.47)
    expect(b.statementAmount).toBe(572.39)
  })

  it('nets payments made since the bill against the statement', () => {
    const c = card({ current_balance: 300 })
    const b = getCreditCardBilling(c, [
      tx('2026-08-20', 500),
      tx('2026-09-02', 200, 'credit_card_payment'),
    ], today)
    expect(b.statementAmount).toBe(500)
    expect(b.paidSinceBill).toBe(200)
    expect(b.billedAmount).toBe(300)
  })

  it('ignores other cards rows', () => {
    const c = card({ current_balance: 1000 })
    const b = getCreditCardBilling(c, [tx('2026-09-01', 1000, 'expense', { credit_card_id: 'other' })], today)
    expect(b.unbilledAmount).toBe(0)
    expect(b.billedAmount).toBe(1000)
  })
})
