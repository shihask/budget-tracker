import { describe, it, expect } from 'vitest'
import {
  isDueCovered, coveredDue, isPaidForCycle, paidForChoices, getNextRecurringDueDate, scheduledDuesAround,
} from '@/lib/recurring'
import { localIso } from '@/lib/utils'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const isos = (ds: Date[]) => ds.map(localIso)

// Salary on the 29th: the cycle runs 29 Sep – 28 Oct.
const CYCLE_START = D(2026, 9, 29)
const CYCLE_END = D(2026, 10, 28)
const TODAY = D(2026, 9, 30)

const regalGold = (o: { paid_through?: string | null } = {}) => ({ frequency: 'monthly' as const, due_day: 27, paid_through: null, ...o })
const postOfficeRd = (o: { paid_through?: string | null } = {}) => ({ frequency: 'monthly' as const, due_day: 10, paid_through: null, ...o })

describe('scheduledDuesAround', () => {
  it('clamps day 31 to short months', () => {
    expect(isos(scheduledDuesAround('monthly', 31, D(2026, 2, 10), 0, 1))).toEqual(['2026-02-28', '2026-03-31'])
  })
})

describe('isDueCovered', () => {
  it('paid_through covers every due on or before it, nothing after', () => {
    const sv = postOfficeRd({ paid_through: '2026-10-10' })
    expect(isDueCovered(sv, '2026-09-29', D(2026, 10, 10))).toBe(true)
    expect(isDueCovered(sv, '2026-09-29', D(2026, 9, 10))).toBe(true)
    expect(isDueCovered(sv, '2026-09-29', D(2026, 11, 10))).toBe(false)
  })

  it('legacy rows keep the calendar-period rule', () => {
    // Paid 29 Sep with no paid_through → covers Sep's due, not Oct's (the bug report).
    expect(isDueCovered(postOfficeRd(), '2026-09-29', D(2026, 9, 10))).toBe(true)
    expect(isDueCovered(postOfficeRd(), '2026-09-29', D(2026, 10, 10))).toBe(false)
  })
})

describe('paidForChoices — the default "Paying for"', () => {
  it('first payment on payday defaults to this cycle\'s due, not last month\'s', () => {
    // Regal Gold paid 30 Sep, last paid 30 Aug (legacy): 27 Sep was before this cycle began.
    const ch = paidForChoices(regalGold(), '2026-08-30', TODAY, CYCLE_START)!
    expect(isos(ch.options)).toEqual(['2026-09-27', '2026-10-27', '2026-11-27'])
    expect(localIso(ch.defaultDue)).toBe('2026-10-27')
  })

  it('Post Office RD paid on payday defaults to 10 Oct', () => {
    const ch = paidForChoices(postOfficeRd(), '2026-08-29', D(2026, 9, 29), CYCLE_START)!
    expect(localIso(ch.defaultDue)).toBe('2026-10-10')
  })

  it('legacy late payment inside the cycle defaults to the missed due', () => {
    // Salary on the 1st (cycle 1–30 Sep), due 27th, paying 30 Sep: late for 27 Sep.
    const ch = paidForChoices(regalGold(), '2026-08-27', TODAY, D(2026, 9, 1))!
    expect(localIso(ch.defaultDue)).toBe('2026-09-27')
  })

  it('known history: a genuinely missed due is the default even before the cycle', () => {
    // Paid through 27 Oct, missed 27 Nov, paying 1 Dec (cycle began 29 Nov).
    const ch = paidForChoices(regalGold({ paid_through: '2026-10-27' }), '2026-09-30', D(2026, 12, 1), D(2026, 11, 29))!
    expect(localIso(ch.defaultDue)).toBe('2026-11-27')
    expect(isos(ch.options)).toEqual(['2026-11-27', '2026-12-27', '2027-01-27'])
  })

  it('known history paid ahead: next month', () => {
    const ch = paidForChoices(regalGold({ paid_through: '2026-10-27' }), '2026-09-30', D(2026, 10, 29), D(2026, 10, 29))!
    expect(localIso(ch.defaultDue)).toBe('2026-11-27')
  })

  it('yearly / no due day → no picker', () => {
    expect(paidForChoices({ frequency: 'yearly', due_day: 5, paid_through: null }, null, TODAY, CYCLE_START)).toBeNull()
    expect(paidForChoices({ frequency: 'monthly', due_day: null, paid_through: null }, null, TODAY, CYCLE_START)).toBeNull()
  })
})

describe('isPaidForCycle — hides Record / shows "Paid for"', () => {
  it('paid 29 Sep for 10 Oct → done for the cycle ending 28 Oct', () => {
    expect(isPaidForCycle(postOfficeRd({ paid_through: '2026-10-10' }), '2026-09-29', TODAY, CYCLE_END)).toBe(true)
    // still done on 1 Oct — a calendar rule would flip it back to unpaid here
    expect(isPaidForCycle(postOfficeRd({ paid_through: '2026-10-10' }), '2026-09-29', D(2026, 10, 1), CYCLE_END)).toBe(true)
  })

  it('next cycle (salary 29 Oct) asks for 10 Nov', () => {
    expect(isPaidForCycle(postOfficeRd({ paid_through: '2026-10-10' }), '2026-09-29', D(2026, 10, 29), D(2026, 11, 28))).toBe(false)
  })

  it('an overdue unpaid due is never "paid"', () => {
    expect(isPaidForCycle(regalGold({ paid_through: '2026-08-27' }), '2026-08-30', TODAY, CYCLE_END)).toBe(false)
  })

  it('weekly items look to the end of the week, not the salary cycle', () => {
    // Wed 30 Sep 2026; due Friday (5). Paid through Fri 2 Oct → next Fri 9 Oct is next week.
    const wk = { frequency: 'weekly' as const, due_day: 5, paid_through: '2026-10-02' }
    expect(isPaidForCycle(wk, '2026-09-30', TODAY, CYCLE_END)).toBe(true)
  })
})

describe('coveredDue / getNextRecurringDueDate', () => {
  it('legacy display: the due in the payment\'s calendar month', () => {
    expect(localIso(coveredDue(regalGold(), '2026-09-30')!)).toBe('2026-09-27')
  })

  it('next due skips everything paid through', () => {
    const sv = { ...regalGold({ paid_through: '2026-10-27' }), last_contribution_date: '2026-09-30' }
    expect(localIso(getNextRecurringDueDate(sv, TODAY)!)).toBe('2026-11-27')
  })
})
