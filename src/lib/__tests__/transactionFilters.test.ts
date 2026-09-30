import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TXN_FILTERS, narrowsTransactions, escapeIlike, mergeLoadedWins, filterAndSortTransactions,
} from '@/lib/transactionFilters'
import type { Transaction } from '@/types'

const tx = (p: Partial<Transaction>): Transaction => ({
  id: 'x', user_id: 'u', transaction_date: '2026-09-01', description: '', amount: 100,
  transaction_type: 'expense', category_id: null, from_account_id: 'a1', to_account_id: null,
  notes: '', created_at: '2026-09-01T00:00:00Z', ...p,
} as Transaction)

describe('narrowsTransactions', () => {
  it('is false with no filters, or only system rows / sorting changed', () => {
    expect(narrowsTransactions(DEFAULT_TXN_FILTERS)).toBe(false)
    expect(narrowsTransactions({ ...DEFAULT_TXN_FILTERS, showSystemTxns: true })).toBe(false)
    expect(narrowsTransactions({ ...DEFAULT_TXN_FILTERS, search: '   ' })).toBe(false)
  })

  it('is true for every narrowing filter', () => {
    for (const patch of [
      { search: 'petrol' }, { account: 'a1' }, { category: 'c1' }, { group: 'Food' },
      { event: 'e1' }, { event: 'none' }, { dateFrom: '2026-01-01' }, { dateTo: '2026-01-31' },
      { amount: 450 },
    ]) expect(narrowsTransactions({ ...DEFAULT_TXN_FILTERS, ...patch })).toBe(true)
  })
})

describe('escapeIlike', () => {
  it('escapes wildcards and the escape char so they match literally', () => {
    expect(escapeIlike('50% off')).toBe('50\\% off')
    expect(escapeIlike('a_b')).toBe('a\\_b')
    expect(escapeIlike('c:\\x')).toBe('c:\\\\x')
    expect(escapeIlike('plain chai')).toBe('plain chai')
  })
})

describe('mergeLoadedWins', () => {
  it('finds a match older than the loaded window', () => {
    const loaded = [tx({ id: 'new', description: 'Petrol Axis', transaction_date: '2026-09-20' })]
    const fetched = [
      tx({ id: 'new', description: 'Petrol Axis', transaction_date: '2026-09-20' }),
      tx({ id: 'old', description: 'petrol HP', transaction_date: '2026-01-05', amount: 2000 }),
    ]
    const rows = filterAndSortTransactions(
      mergeLoadedWins(loaded, fetched), [], { ...DEFAULT_TXN_FILTERS, search: 'petrol' }, 'date_desc')
    expect(rows.map(t => t.id)).toEqual(['new', 'old'])
  })

  it('keeps the loaded copy, so an edit this session beats a stale fetch', () => {
    const loaded = [tx({ id: 'a', description: 'Dinner' })]
    const fetched = [tx({ id: 'a', description: 'Petrol' })]
    const rows = filterAndSortTransactions(
      mergeLoadedWins(loaded, fetched), [], { ...DEFAULT_TXN_FILTERS, search: 'petrol' }, 'date_desc')
    expect(rows).toHaveLength(0)
  })

  it('returns loaded itself when nothing is added', () => {
    const loaded = [tx({ id: 'a' })]
    expect(mergeLoadedWins(loaded, [])).toBe(loaded)
    expect(mergeLoadedWins(loaded, [tx({ id: 'a' })])).toBe(loaded)
  })
})
