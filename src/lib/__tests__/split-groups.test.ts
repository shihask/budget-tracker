import { describe, it, expect } from 'vitest'
import { groupSplitTransactions, splitGroupLegs, isSplitValid, splitRemainder, splitHint } from '../splitGroups'
import type { SplitLegInput, Transaction } from '@/types'

const GROUP = 'group-kitchen'

function tx(overrides: Partial<Transaction> & { id: string; amount: number }): Transaction {
  return {
    description: 'Kitchen work',
    transaction_date: '2026-08-17',
    transaction_type: 'expense',
    category_id: 'cat-reno',
    from_account_id: 'acc-axis',
    to_account_id: null,
    notes: null,
    created_at: '2026-08-17T10:00:00Z',
    split_group_id: null,
    ...overrides,
  }
}

/** The trigger case: ₹30,000 kitchen work, ₹20,000 Axis + ₹10,000 cash. */
const AXIS_LEG = tx({ id: 'leg-axis', amount: 20000, from_account_id: 'acc-axis', split_group_id: GROUP })
const CASH_LEG = tx({ id: 'leg-cash', amount: 10000, from_account_id: 'acc-cash', split_group_id: GROUP })

const FOOD = tx({ id: 'tx-food', amount: 450, description: 'Food', from_account_id: 'acc-axis' })
const FUEL = tx({ id: 'tx-fuel', amount: 900, description: 'Fuel', from_account_id: 'acc-cash' })

describe('groupSplitTransactions', () => {
  it('collapses a split into one entry carrying both legs', () => {
    const all = [AXIS_LEG, CASH_LEG, FOOD]
    const groups = groupSplitTransactions(all, all, { collapse: true })

    expect(groups).toHaveLength(2)
    const split = groups[0]
    expect(split.isSplit).toBe(true)
    expect(split.legs).toHaveLength(2)
    expect(split.total).toBe(30000)
    expect(split.groupSize).toBe(2)
  })

  it('never merges ordinary transactions with each other', () => {
    // Every pre-split row shares a null split_group_id — keying on it naively would
    // collapse the entire ledger into a single card.
    const all = [FOOD, FUEL]
    const groups = groupSplitTransactions(all, all, { collapse: true })

    expect(groups).toHaveLength(2)
    expect(groups.every(g => !g.isSplit)).toBe(true)
    expect(groups.map(g => g.total)).toEqual([450, 900])
  })

  it('keeps legs together when they are not adjacent (amount_desc ordering)', () => {
    // Sorted by amount: Axis 20000, Cash 10000 straddle the 15000 row between them.
    const other = tx({ id: 'tx-rent', amount: 15000, description: 'Rent' })
    const sorted = [AXIS_LEG, other, CASH_LEG]
    const groups = groupSplitTransactions(sorted, sorted, { collapse: true })

    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe(GROUP)
    expect(groups[0].total).toBe(30000)
    // The group holds the position of the first leg encountered, not the last.
    expect(groups[1].primary.id).toBe('tx-rent')
  })

  it('does not collapse under an account filter, and does not lie about the total', () => {
    const all = [AXIS_LEG, CASH_LEG]
    const visible = [CASH_LEG]   // filtered to the Cash account
    const groups = groupSplitTransactions(visible, all, { collapse: false })

    expect(groups).toHaveLength(1)
    expect(groups[0].isSplit).toBe(true)
    // Shows the ₹10,000 that actually came from Cash …
    expect(groups[0].total).toBe(10000)
    // … while still knowing it belongs to a two-leg ₹30,000 group, which the
    // delete prompt and the group-edit route both need.
    expect(groups[0].groupSize).toBe(2)
    expect(groups[0].groupTotal).toBe(30000)
  })

  it('resolves group metadata from `all` even when `visible` holds a single leg', () => {
    const groups = groupSplitTransactions([AXIS_LEG], [AXIS_LEG, CASH_LEG], { collapse: false })
    expect(groups[0].groupTotal).toBe(30000)
  })

  it('collapses before a row limit applies, so a straddling group never orphans a leg', () => {
    // Six later transactions push the Cash leg past a limit of 6 rows. Grouping first
    // means the split occupies one slot; slicing first would render a lone ₹20,000.
    const later = Array.from({ length: 5 }, (_, i) =>
      tx({ id: `tx-later-${i}`, amount: 100 + i, description: `Later ${i}` }))
    const all = [...later, AXIS_LEG, CASH_LEG]

    const grouped = groupSplitTransactions(all, all, { collapse: true }).slice(0, 6)

    expect(grouped).toHaveLength(6)
    const split = grouped.find(g => g.key === GROUP)
    expect(split).toBeDefined()
    expect(split!.legs).toHaveLength(2)
    expect(split!.total).toBe(30000)
  })

  it('derives every total from the legs — there is no stored group total', () => {
    const all = [AXIS_LEG, CASH_LEG]
    const [split] = groupSplitTransactions(all, all, { collapse: true })
    expect(split.total).toBe(AXIS_LEG.amount + CASH_LEG.amount)
    expect(split.groupTotal).toBe(AXIS_LEG.amount + CASH_LEG.amount)
  })
})

describe('isSplitValid / splitRemainder', () => {
  const balanced: SplitLegInput[] = [
    { accountId: 'acc-axis', amount: 20000 },
    { accountId: 'acc-cash', amount: 10000 },
  ]

  it('accepts legs that add up to the total', () => {
    expect(splitRemainder(balanced, 30000)).toBe(0)
    expect(isSplitValid(balanced, 30000)).toBe(true)
  })

  it('rejects legs that do not add up — invariant 1', () => {
    expect(isSplitValid(balanced, 29000)).toBe(false)
    expect(splitRemainder(balanced, 29000)).toBe(-1000)   // over by 1000
    expect(splitRemainder(balanced, 35000)).toBe(5000)    // 5000 left to assign
  })

  it('rejects a one-leg split — invariant 2', () => {
    expect(isSplitValid([{ accountId: 'acc-axis', amount: 30000 }], 30000)).toBe(false)
  })

  it('rejects an unassigned account or a zero leg', () => {
    expect(isSplitValid([{ accountId: '', amount: 20000 }, { accountId: 'acc-cash', amount: 10000 }], 30000)).toBe(false)
    expect(isSplitValid([{ accountId: 'acc-axis', amount: 30000 }, { accountId: 'acc-cash', amount: 0 }], 30000)).toBe(false)
  })

  it('rejects the same account funding two legs', () => {
    expect(isSplitValid(
      [{ accountId: 'acc-axis', amount: 20000 }, { accountId: 'acc-axis', amount: 10000 }],
      30000,
    )).toBe(false)
  })

  it('never says "All assigned" while the split is still unsaveable', () => {
    // The original bug: 30000 + 0 balances to a zero remainder, so a remainder-only
    // check reported "All assigned" while the zero-amount leg kept save disabled.
    const zeroLeg: SplitLegInput[] = [
      { accountId: 'acc-axis', amount: 30000 },
      { accountId: 'acc-cash', amount: 0 },
    ]
    expect(splitHint(zeroLeg, 30000).text).toBe('Every payment needs an amount')
    expect(splitHint(zeroLeg, 30000).ok).toBe(false)
  })

  it('keeps the hint and isSplitValid in lockstep across every case', () => {
    const cases: Array<[SplitLegInput[], number]> = [
      [balanced, 30000],
      [balanced, 29000],
      [balanced, 0],
      [[{ accountId: 'acc-axis', amount: 30000 }], 30000],
      [[{ accountId: 'acc-axis', amount: 30000 }, { accountId: 'acc-cash', amount: 0 }], 30000],
      [[{ accountId: '', amount: 20000 }, { accountId: 'acc-cash', amount: 10000 }], 30000],
      [[{ accountId: 'acc-axis', amount: 20000 }, { accountId: 'acc-axis', amount: 10000 }], 30000],
    ]
    for (const [legs, total] of cases) {
      expect(splitHint(legs, total).ok).toBe(isSplitValid(legs, total))
    }
  })

  it('stays silent until an amount is entered', () => {
    expect(splitHint(balanced, 0).text).toBe('')
  })

  it('tolerates decimal amounts without float drift', () => {
    const legs: SplitLegInput[] = [
      { accountId: 'acc-axis', amount: 0.1 },
      { accountId: 'acc-cash', amount: 0.2 },
    ]
    expect(splitRemainder(legs, 0.3)).toBe(0)
    expect(isSplitValid(legs, 0.3)).toBe(true)
  })
})

describe('splitGroupLegs', () => {
  it('returns every sibling of a split leg', () => {
    expect(splitGroupLegs(CASH_LEG, [AXIS_LEG, CASH_LEG, FOOD]).map(t => t.id))
      .toEqual(['leg-axis', 'leg-cash'])
  })

  it('returns the row itself for an ordinary transaction', () => {
    expect(splitGroupLegs(FOOD, [AXIS_LEG, CASH_LEG, FOOD])).toEqual([FOOD])
  })
})
