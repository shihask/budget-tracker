import { describe, it, expect } from 'vitest'
import { budgetLine, inMonth, monthBounds, monthKey, shiftMonth, summarize, toPaise } from '../lib/budget'
import type { HouseholdBudget, HouseholdTransaction } from '../types'

let seq = 0
function tx(p: Partial<HouseholdTransaction>): HouseholdTransaction {
  seq++
  return {
    id: `t${seq}`, household_id: 'h', type: 'expense', amount: 100, category_id: 'groceries',
    description: null, txn_date: '2026-10-15', paid_by_member_id: 'a', created_by_member_id: 'a',
    updated_by_member_id: 'a', created_at: '2026-10-15T10:00:00Z', updated_at: '2026-10-15T10:00:00Z', ...p,
  }
}
const budget = (category_id: string | null, monthly_limit: number): HouseholdBudget =>
  ({ id: `b-${category_id}`, household_id: 'h', category_id, monthly_limit, updated_at: '' })

describe('month bounds', () => {
  it('covers the 1st to the last day, end exclusive', () => {
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-11-01' })
    expect(inMonth('2026-10-01', '2026-10')).toBe(true)
    expect(inMonth('2026-10-31', '2026-10')).toBe(true)
    expect(inMonth('2026-11-01', '2026-10')).toBe(false)
    expect(inMonth('2026-09-30', '2026-10')).toBe(false)
  })
  it('handles February and leap years', () => {
    expect(inMonth('2028-02-29', '2028-02')).toBe(true)
    expect(monthBounds('2027-02').end).toBe('2027-03-01')
  })
  it('rolls over December → January', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(monthBounds('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
    expect(inMonth('2027-01-01', '2026-12')).toBe(false)
  })
  it('keys a local date by its local month', () => {
    expect(monthKey(new Date(2026, 9, 31, 23, 59))).toBe('2026-10')
  })
})

describe('summarize', () => {
  it("partner A's ₹2,000 groceries reduce the household and grocery budgets by ₹2,000", () => {
    const budgets = [budget(null, 35000), budget('groceries', 8000)]
    const before = summarize([], budgets, '2026-10')
    const after = summarize([tx({ amount: 2000, paid_by_member_id: 'a' })], budgets, '2026-10')
    expect(after.expense - before.expense).toBe(2000)
    expect(before.overall.remaining! - after.overall.remaining!).toBe(2000)
    const g = after.categories.find(c => c.categoryId === 'groceries')!
    expect(g.spent).toBe(2000)
    expect(g.remaining).toBe(6000)
  })

  it('never lets income reduce spending or add to a budget', () => {
    const s = summarize([tx({ amount: 500 }), tx({ type: 'income', amount: 60000, category_id: 'salary' })], [budget(null, 1000)], '2026-10')
    expect(s.income).toBe(60000)
    expect(s.expense).toBe(500)
    expect(s.overall.remaining).toBe(500)
    expect(s.categories.map(c => c.categoryId)).toEqual(['groceries'])
  })

  it('counts every expense category in the overall budget, including ones without a budget and uncategorised', () => {
    const s = summarize([tx({ amount: 100 }), tx({ amount: 50, category_id: 'rent' }), tx({ amount: 25, category_id: null })],
      [budget(null, 1000), budget('groceries', 300)], '2026-10')
    expect(s.overall.spent).toBe(175)
    expect(s.categories.find(c => c.categoryId === 'rent')!.status).toBe('none')
    expect(s.categories.find(c => c.categoryId === null)!.spent).toBe(25)
  })

  it('reflects an edit that moves a row to another month or category, and a delete', () => {
    const rows = [tx({ id: 'x', amount: 400 }), tx({ amount: 100 })]
    expect(summarize(rows, [], '2026-10').expense).toBe(500)
    const movedMonth = rows.map(r => r.id === 'x' ? { ...r, txn_date: '2026-11-02' } : r)
    expect(summarize(movedMonth, [], '2026-10').expense).toBe(100)
    expect(summarize(movedMonth, [], '2026-11').expense).toBe(400)
    const movedCategory = rows.map(r => r.id === 'x' ? { ...r, category_id: 'rent' } : r)
    const s = summarize(movedCategory, [budget('groceries', 1000)], '2026-10')
    expect(s.categories.find(c => c.categoryId === 'groceries')!.spent).toBe(100)
    expect(s.categories.find(c => c.categoryId === 'rent')!.spent).toBe(400)
    expect(summarize(rows.filter(r => r.id !== 'x'), [], '2026-10').expense).toBe(100)
  })

  it('lists a budgeted category with no spend yet', () => {
    const s = summarize([], [budget('groceries', 8000)], '2026-10')
    expect(s.categories).toEqual([expect.objectContaining({ categoryId: 'groceries', spent: 0, remaining: 8000, status: 'ok' })])
  })

  it('flags category limits that add up to more than the overall budget', () => {
    expect(summarize([], [budget(null, 1000), budget('a', 700), budget('b', 400)], '2026-10').categoryLimitsExceedOverall).toBe(true)
    expect(summarize([], [budget(null, 1100), budget('a', 700), budget('b', 400)], '2026-10').categoryLimitsExceedOverall).toBe(false)
    expect(summarize([], [budget('a', 700)], '2026-10').categoryLimitsExceedOverall).toBe(false)
  })

  it('keeps paise exact over many rows', () => {
    const rows = Array.from({ length: 1000 }, () => tx({ amount: 0.1 }))
    expect(summarize(rows, [], '2026-10').expense).toBe(100)
    const odd = Array.from({ length: 999 }, (_, i) => tx({ amount: (i % 7) + 0.01 * (i % 13) }))
    const expected = odd.reduce((s, r) => s + toPaise(r.amount), 0) / 100
    expect(summarize(odd, [], '2026-10').expense).toBe(expected)
  })
})

describe('budgetLine', () => {
  it('reports over-budget as an amount, with the bar capped at full', () => {
    const l = budgetLine(toPaise(1250), 1000)
    expect(l).toMatchObject({ spent: 1250, remaining: -250, over: 250, progress: 1, status: 'over' })
  })
  it('treats a ₹0 budget as "spend nothing", with no division by zero', () => {
    expect(budgetLine(0, 0)).toMatchObject({ remaining: 0, over: 0, progress: 0, status: 'ok' })
    expect(budgetLine(toPaise(1), 0)).toMatchObject({ remaining: -1, over: 1, progress: 1, status: 'over' })
  })
  it('marks a budget as near at 80% and exactly-used as not over', () => {
    expect(budgetLine(toPaise(800), 1000).status).toBe('near')
    expect(budgetLine(toPaise(799), 1000).status).toBe('ok')
    expect(budgetLine(toPaise(1000), 1000)).toMatchObject({ status: 'near', remaining: 0, over: 0, progress: 1 })
  })
  it('has no remaining without a budget', () => {
    expect(budgetLine(toPaise(10), null)).toMatchObject({ limit: null, remaining: null, status: 'none' })
  })
})
