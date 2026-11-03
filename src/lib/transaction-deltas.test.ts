import { describe, it, expect } from 'vitest'
import { cardDelta, delta } from './transaction-deltas'

describe('cardDelta', () => {
  it('a card purchase raises the outstanding', () => {
    expect(cardDelta('expense', 500)).toBe(500)
  })

  it('a refund to the card lowers the outstanding', () => {
    expect(cardDelta('income', 500)).toBe(-500)
  })

  // payCreditCardBill writes p_from_delta = -amount AND p_cc_delta = -amount. Edit and
  // delete reverse with -cardDelta, so a wrong sign here deducts the bill from the card a
  // second time when the payment's bank account is corrected.
  it('a bill payment lowers the outstanding while also debiting the bank', () => {
    expect(cardDelta('credit_card_payment', 10000)).toBe(-10000)
    expect(delta('credit_card_payment', 10000)).toBe(-10000)
  })

  // adjustCreditCardBalance writes amount = |diff|, p_cc_delta = diff, is_credit = diff > 0.
  it('a card balance adjustment follows is_credit', () => {
    expect(cardDelta('cc_balance_adjustment', 500, true)).toBe(500)
    expect(cardDelta('cc_balance_adjustment', 500, false)).toBe(-500)
  })

  it('deleting a lowering adjustment restores the card instead of lowering it again', () => {
    expect(-cardDelta('cc_balance_adjustment', 500, false)).toBe(500)
  })

  it('editing a lowering adjustment from 500 to 600 lowers the card by 100 more', () => {
    expect(-cardDelta('cc_balance_adjustment', 500, false) + cardDelta('cc_balance_adjustment', 600, false)).toBe(-100)
  })

  it('editing a bill payment without changing the amount nets to zero on the card', () => {
    const reverseOld = -cardDelta('credit_card_payment', 10000)
    const applyNew   =  cardDelta('credit_card_payment', 10000)
    expect(reverseOld + applyNew).toBe(0)
  })
})
