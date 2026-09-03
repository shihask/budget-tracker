import { describe, it, expect } from 'vitest'
import { ringFencedEventIds, countsTowardBudget, eventSpent, eventTransactions } from '@/lib/events'
import type { LifeEvent, Transaction } from '@/types'

const ev = (id: string, excluded: boolean): LifeEvent => ({
  id, name: id, icon: 'ring', target_amount: null,
  start_date: null, end_date: null,
  excluded_from_budget: excluded,
  default_category_id: null, default_account_id: null,
  status: 'active',
})

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  transaction_date: '2026-08-20',
  description: 'Stage Decoration',
  amount: 35000,
  transaction_type: 'expense',
  category_id: 'cat-1',
  from_account_id: 'acc-1',
  to_account_id: null,
  notes: null,
  created_at: '2026-08-20',
  ...over,
})

describe('ringFencedEventIds', () => {
  it('collects only events excluded from the budget', () => {
    const ids = ringFencedEventIds([ev('wedding', true), ev('trip', false)])
    expect([...ids]).toEqual(['wedding'])
  })

  it('tolerates a missing events array', () => {
    expect(ringFencedEventIds(undefined).size).toBe(0)
  })
})

describe('countsTowardBudget', () => {
  const fenced = ringFencedEventIds([ev('wedding', true), ev('trip', false)])

  it('excludes spend tagged to a ring-fenced event', () => {
    expect(countsTowardBudget(tx({ event_id: 'wedding' }), fenced)).toBe(false)
  })

  it('includes spend tagged to an event the user chose to count', () => {
    expect(countsTowardBudget(tx({ event_id: 'trip' }), fenced)).toBe(true)
  })

  it('includes untagged spend', () => {
    expect(countsTowardBudget(tx(), fenced)).toBe(true)
    expect(countsTowardBudget(tx({ event_id: null }), fenced)).toBe(true)
  })

  it('includes everything when no event is ring-fenced', () => {
    expect(countsTowardBudget(tx({ event_id: 'wedding' }), new Set())).toBe(true)
  })
})

describe('eventSpent / eventTransactions', () => {
  const txns = [
    tx({ id: 'a', event_id: 'wedding', amount: 35000, transaction_date: '2026-08-20' }),
    tx({ id: 'b', event_id: 'wedding', amount: 18000, transaction_date: '2026-08-25' }),
    tx({ id: 'c', event_id: 'trip', amount: 5000 }),
    tx({ id: 'd', amount: 1200 }),
    // Income tagged to the event must not count as event spend.
    tx({ id: 'e', event_id: 'wedding', amount: 9000, transaction_type: 'income' }),
  ]

  it('sums only expenses tagged to that event', () => {
    expect(eventSpent(txns, 'wedding')).toBe(53000)
  })

  it('spans months — there is no calendar-month bound', () => {
    const across = [
      tx({ id: 'x', event_id: 'wedding', amount: 100, transaction_date: '2026-06-01' }),
      tx({ id: 'y', event_id: 'wedding', amount: 200, transaction_date: '2026-08-27' }),
    ]
    expect(eventSpent(across, 'wedding')).toBe(300)
  })

  it('returns the event timeline newest first', () => {
    expect(eventTransactions(txns, 'wedding').map(t => t.id)).toEqual(['b', 'a'])
  })

  it('is zero for an event with nothing linked', () => {
    expect(eventSpent(txns, 'unknown')).toBe(0)
  })
})
