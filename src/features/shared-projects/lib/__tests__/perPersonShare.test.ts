import { describe, it, expect } from 'vitest'
import { computeSettlement } from '../settlement'
import { perPersonShare, shareLine } from '../settlementCopy'
import type { ProjectMember, ProjectTransaction } from '../../types'

const member = (name: string, order: number, share_ratio = 1, is_active = true): ProjectMember => ({
  id: name.toLowerCase(), project_id: 'p', name, email: null, share_ratio, display_order: order, is_active, created_at: '',
})
let n = 0
const contrib = (amount: number, who: string | null): ProjectTransaction => ({
  id: `t${n++}`, project_id: 'p', member_id: who?.toLowerCase() ?? null, transaction_type: 'contribution', amount,
  description: null, category: null, notes: null, transaction_date: '2026-11-18', display_order: 0, created_at: '',
})
const spend = (amount: number, who: string | null = null, shared_by?: string[]): ProjectTransaction => ({
  ...contrib(amount, who), transaction_type: 'expense', ...(shared_by ? { shared_by: shared_by.map(s => s.toLowerCase()) } : {}),
})
const four = ['A', 'B', 'C', 'D'].map((x, i) => member(x, i))
const byName = (d: ReturnType<typeof computeSettlement>, name: string) => d.participants.find(p => p.name === name)!

describe('perPersonShare', () => {
  it('equal shares: the engine share, not total ÷ members', () => {
    const d = computeSettlement(four, [contrib(12000, 'A'), spend(12000)])
    expect(perPersonShare(d)).toEqual({ kind: 'equal', amount: 300000, sharers: 4, members: 4, rounded: false, groupMoney: 0 })
  })

  it('the Wayanad example: ₹14,000 spent, ₹2,000 group money, 4 people → ₹3,000 each', () => {
    const d = computeSettlement(four, [contrib(10000, 'A'), contrib(2000, null), spend(14000)])
    expect(perPersonShare(d)).toEqual({ kind: 'equal', amount: 300000, sharers: 4, members: 4, rounded: false, groupMoney: 200000 })
  })

  it('1-paisa rounding still reads as equal', () => {
    const three = four.slice(0, 3)
    const d = computeSettlement(three, [spend(1000, 'A')])
    const p = perPersonShare(d)
    expect(p).toMatchObject({ kind: 'equal', amount: 33333, sharers: 3, rounded: true })
  })

  it('an inactive member with no share: equal among the rest, "4 of 5"', () => {
    const five = [...four, member('E', 4, 1, false)]
    const d = computeSettlement(five, [spend(8000, 'A')])
    expect(byName(d, 'E').share).toBe(0)
    expect(perPersonShare(d)).toMatchObject({ kind: 'equal', amount: 200000, sharers: 4, members: 5 })
  })

  it('share ratios make shares differ', () => {
    const ratios = [member('A', 0, 2), member('B', 1), member('C', 2)]
    const d = computeSettlement(ratios, [spend(4000, 'A')])
    expect(perPersonShare(d)).toEqual({ kind: 'differs', min: 100000, max: 200000, groupMoney: 0 })
  })

  it('"Shared by" makes shares differ', () => {
    const d = computeSettlement(four, [spend(4000, 'A'), spend(1200, 'B', ['B', 'C', 'D'])])
    expect(perPersonShare(d)).toEqual({ kind: 'differs', min: 100000, max: 140000, groupMoney: 0 })
  })

  it('group money above spending: everyone gets the surplus (negative share)', () => {
    const d = computeSettlement(four, [contrib(6000, null), spend(4000, 'A')])
    expect(perPersonShare(d)).toMatchObject({ kind: 'equal', amount: -50000, sharers: 4, groupMoney: 600000 })
  })

  it('group money exactly covering spending: everyone ₹0', () => {
    const d = computeSettlement(four, [contrib(4000, null), spend(4000, 'A')])
    expect(perPersonShare(d)).toMatchObject({ kind: 'equal', amount: 0, sharers: 4, members: 4 })
  })

  it('hidden when nothing is spent, with fewer than 2 members, or when unverified', () => {
    expect(perPersonShare(computeSettlement(four, [contrib(1000, 'A')]))).toBeNull()
    expect(perPersonShare(computeSettlement([member('A', 0)], [spend(1000, 'A')]))).toBeNull()
    const bad = computeSettlement(four, [spend(Number.NaN, 'A')])
    expect(bad.balanced).toBe(false)
    expect(perPersonShare(bad)).toBeNull()
  })

  it('every member\'s share sums to the shared cost, so the equal figure × sharers reconciles', () => {
    const d = computeSettlement(four, [contrib(10000, 'A'), contrib(2000, null), spend(14000)])
    const p = perPersonShare(d)!
    if (p.kind !== 'equal') throw new Error('expected equal')
    expect(p.amount * p.sharers).toBe(d.totals.sharedCost)
  })
})

describe('shareLine', () => {
  it('positive, surplus, none', () => {
    const d = computeSettlement(four, [spend(4000, 'A')])
    expect(shareLine(byName(d, 'B'))).toBe('Share ₹1,000')
    const s = computeSettlement(four, [contrib(6000, null), spend(4000, 'A')])
    expect(shareLine(byName(s, 'B'))).toBe('Gets ₹500 of the surplus')
    const five = [...four, member('E', 4, 1, false)]
    expect(shareLine(byName(computeSettlement(five, [spend(4000, 'A')]), 'E'))).toBe('No share of spending')
  })
})
