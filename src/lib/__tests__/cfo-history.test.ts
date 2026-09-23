import { describe, it, expect } from 'vitest'
import {
  appendCheck, pickBaseline, saveCheck, loadChecks, lifestyleSpendSince,
  BASELINE_MIN_AGE_MS, HISTORY_MAX_AGE_MS, HISTORY_MAX_ENTRIES, type CfoCheck,
} from '../cfo-history'
import type { CfoSnapshot } from '../cfo-snapshot'
import type { AppState, Transaction } from '@/types'

const H = 3_600_000
const NOW = Date.parse('2026-09-24T12:00:00Z')
const check = (msAgo: number, freeMoney = 0): CfoCheck => ({
  at: new Date(NOW - msAgo).toISOString(), liquidCash: 0, freeMoney, cardDebt: 0, mandatoryTotal: 0,
})

describe('pickBaseline', () => {
  it('skips checks younger than the minimum age', () => {
    const base = pickBaseline([check(30 * H, 1), check(1 * H, 2)], NOW)
    expect(base?.freeMoney).toBe(1)
  })
  it('is null when every check is too recent or too old', () => {
    expect(pickBaseline([check(1 * H)], NOW)).toBeNull()
    expect(pickBaseline([check(HISTORY_MAX_AGE_MS + H)], NOW)).toBeNull()
  })
  it('accepts a check exactly at the minimum age', () => {
    expect(pickBaseline([check(BASELINE_MIN_AGE_MS)], NOW)).not.toBeNull()
  })
})

describe('appendCheck', () => {
  it('collapses a burst so yesterday’s baseline survives', () => {
    let list: CfoCheck[] = [check(24 * H, 99)]
    for (let i = 10; i >= 0; i--) list = appendCheck(list, check(i * 60_000), NOW - i * 60_000)
    expect(list).toHaveLength(2)
    expect(pickBaseline(list, NOW)?.freeMoney).toBe(99)
  })
  it('prunes old entries and caps the ring', () => {
    const many = Array.from({ length: 8 }, (_, i) => check((8 - i) * 7 * H))
    const list = appendCheck([check(HISTORY_MAX_AGE_MS + H), ...many], check(0), NOW)
    expect(list.length).toBe(HISTORY_MAX_ENTRIES)
    expect(list.every(c => NOW - Date.parse(c.at) <= HISTORY_MAX_AGE_MS)).toBe(true)
  })
})

describe('saveCheck / loadChecks', () => {
  it('round-trips through a store and survives garbage', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }
    saveCheck('u1', { liquidCash: 1, freeMoney: 2, cardDebt: 3, mandatoryTotal: 4 } as CfoSnapshot, store, NOW)
    expect(loadChecks('u1', store)[0].cardDebt).toBe(3)
    mem.set('mp_cfo_snapshots_u1', '{not json')
    expect(loadChecks('u1', store)).toEqual([])
    expect(loadChecks('u1', null)).toEqual([])
  })
})

describe('lifestyleSpendSince', () => {
  const t = (o: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(), description: 'x', amount: 100, transaction_type: 'expense',
    category_id: 'food', from_account_id: 'a', to_account_id: null, notes: null,
    transaction_date: '2026-09-20', created_at: '2026-09-24T10:00:00Z', ...o,
  })
  const state = (txns: Transaction[]) => ({
    categories: [{ id: 'food', name: 'Food', group_name: 'Lifestyle' }],
    settings: {}, events: [{ id: 'ev', name: 'Trip', excluded_from_budget: true, status: 'active' }],
    transactions: txns,
  }) as unknown as AppState

  it('counts by created_at and excludes ring-fenced events and reimbursements', () => {
    const since = '2026-09-24T00:00:00Z'
    const s = state([
      t({ amount: 300 }),                                         // logged after, backdated → counts
      t({ amount: 999, created_at: '2026-09-23T10:00:00Z' }),     // before baseline
      t({ amount: 500, event_id: 'ev' }),                         // ring-fenced
      t({ id: 'e1', amount: 400 }),
      t({ amount: 150, transaction_type: 'income', reimbursement_for: 'e1', category_id: null }),
    ])
    expect(lifestyleSpendSince(s, since)).toBe(300 + 250)
  })
})
