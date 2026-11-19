import { describe, it, expect } from 'vitest'
import {
  describeTransaction, filterTransactions, groupByDay, resultTotals, deleteLabel,
  formatDayHeader, formatLongDate, hasActiveFilters, NO_FILTERS,
} from '../transactions'
import type { ProjectMember, ProjectTransaction } from '../../types'

const member = (id: string, name: string, is_active = true): ProjectMember => ({
  id, project_id: 'p', name, email: null, share_ratio: 1, display_order: 0, is_active, created_at: '',
})
const kabeer = member('m1', 'Kabeer')
const muneer = member('m2', 'Muneer')
const gone = member('m3', 'Noushad', false)

let n = 0
const tx = (p: Partial<ProjectTransaction> & Pick<ProjectTransaction, 'transaction_type' | 'amount'>): ProjectTransaction => ({
  id: `t${n++}`, project_id: 'p', member_id: null, description: null, category: null, notes: null,
  transaction_date: '2026-11-18', display_order: 0, created_at: '2026-11-18T10:00:00Z', ...p,
})
const withMember = (m: ProjectMember) => ({ member_id: m.id, member: m })

const lunch = tx({ transaction_type: 'expense', amount: 980, description: 'Lunch', category: 'Food', ...withMember(kabeer) })
const fuel = tx({ transaction_type: 'expense', amount: 9700, description: 'Fuel and tolls', category: 'Travel', transaction_date: '2026-11-17' })
const resort = tx({ transaction_type: 'expense', amount: 10467.08, category: 'Stay', notes: 'two nights', ...withMember(gone), transaction_date: '2026-11-17' })
const contrib = tx({ transaction_type: 'contribution', amount: 2000, description: 'advance', ...withMember(muneer), transaction_date: '2026-11-16' })
const all = [contrib, lunch, resort, fuel]

describe('describeTransaction', () => {
  it('personal expense', () => {
    expect(describeTransaction(lunch)).toMatchObject({ kind: 'expense-member', title: 'Lunch', category: 'Food', memberName: 'Kabeer', sign: -1 })
  })
  it('kitty expense has no member', () => {
    expect(describeTransaction(fuel)).toMatchObject({ kind: 'expense-kitty', memberName: null, sign: -1 })
  })
  it('falls back to category, then "Expense" — and never shows the category twice', () => {
    expect(describeTransaction(resort)).toMatchObject({ title: 'Stay', category: 'Stay', subtitleCategory: null })
    expect(describeTransaction(lunch).subtitleCategory).toBe('Food')
    expect(describeTransaction(tx({ transaction_type: 'expense', amount: 5 })).title).toBe('Expense')
  })
  it('contribution is titled by member; one with no member is group money', () => {
    expect(describeTransaction(contrib)).toMatchObject({ kind: 'contribution', title: 'Muneer', sign: 1 })
    expect(describeTransaction(tx({ transaction_type: 'contribution', amount: 1 }))).toMatchObject({ kind: 'group-money', title: 'Group money', memberName: null, sign: 1 })
  })
  it('group money: Paid-by "outside" filter and search', () => {
    const sponsor = tx({ transaction_type: 'contribution', amount: 2000, description: 'sponsor' })
    const list = [...all, sponsor]
    expect(filterTransactions(list, { ...NO_FILTERS, paidBy: 'outside' }).map(t => t.id)).toEqual([sponsor.id])
    expect(filterTransactions(list, { ...NO_FILTERS, query: 'group money' }).map(t => t.id)).toEqual([sponsor.id])
    expect(filterTransactions(list, { ...NO_FILTERS, paidBy: 'kitty' }).map(t => t.id)).toEqual([fuel.id])
  })
})

describe('filterTransactions', () => {
  const f = (p: Partial<typeof NO_FILTERS>) => filterTransactions(all, { ...NO_FILTERS, ...p }).map(t => t.id)
  it('by type', () => {
    expect(f({ type: 'contribution' })).toEqual([contrib.id])
    expect(f({ type: 'expense' })).toHaveLength(3)
  })
  it('Kitty means kitty-paid expenses only', () => {
    expect(f({ paidBy: 'kitty' })).toEqual([fuel.id])
  })
  it('by member, including an inactive one', () => {
    expect(f({ paidBy: gone.id })).toEqual([resort.id])
    expect(f({ paidBy: muneer.id })).toEqual([contrib.id])
  })
  it('search: description, category, notes, member, case-insensitive', () => {
    expect(f({ query: 'LUNCH' })).toEqual([lunch.id])
    expect(f({ query: 'travel' })).toEqual([fuel.id])
    expect(f({ query: 'nights' })).toEqual([resort.id])
    expect(f({ query: 'muneer' })).toEqual([contrib.id])
  })
  it('search by amount, with or without commas and ₹', () => {
    expect(f({ query: '980' })).toEqual([lunch.id])
    expect(f({ query: '₹9,700' })).toEqual([fuel.id])
    expect(f({ query: '10467.08' })).toEqual([resort.id])
  })
  it('combines filters', () => {
    expect(f({ type: 'expense', query: 'food' })).toEqual([lunch.id])
    expect(f({ type: 'contribution', paidBy: 'kitty' })).toEqual([])
  })
  it('hasActiveFilters', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...NO_FILTERS, query: '  ' })).toBe(false)
    expect(hasActiveFilters({ ...NO_FILTERS, paidBy: 'kitty' })).toBe(true)
  })
})

describe('groupByDay', () => {
  it('newest day first, newest entry first within a day, expenses-only day total', () => {
    const early = tx({ transaction_type: 'expense', amount: 100, created_at: '2026-11-18T08:00:00Z' })
    const groups = groupByDay([early, ...all])
    expect(groups.map(g => g.date)).toEqual(['2026-11-18', '2026-11-17', '2026-11-16'])
    expect(groups[0].items.map(t => t.id)).toEqual([lunch.id, early.id])
    expect(groups[1].spent).toBe(20167.08)
    expect(groups[2].spent).toBe(0)
  })
})

describe('resultTotals', () => {
  it('splits expenses and contributions', () => {
    expect(resultTotals(all)).toEqual({ count: 4, expenses: 21147.08, contributions: 2000 })
  })
})

describe('deleteLabel', () => {
  it('never says "undefined"', () => {
    expect(deleteLabel(lunch)).toBe('Delete expense "Lunch" (₹980)?')
    expect(deleteLabel(tx({ transaction_type: 'expense', amount: 200 }))).toBe('Delete this expense (₹200)?')
    expect(deleteLabel(contrib)).toBe("Delete Muneer's contribution (₹2,000)?")
    expect(deleteLabel(tx({ transaction_type: 'contribution', amount: 50 }))).toBe('Delete this group money (₹50)?')
  })
})

describe('dates', () => {
  it('formats day headers without ISO, adding the year only when needed', () => {
    const today = new Date('2026-11-19T12:00:00')
    expect(formatDayHeader('2026-11-18', today)).toMatch(/Wed.*18.*Nov/)
    expect(formatDayHeader('2026-11-18', today)).not.toMatch(/2026/)
    expect(formatDayHeader('2025-12-31', today)).toMatch(/2025/)
    expect(formatLongDate('2026-11-18')).toMatch(/18.*Nov.*2026/)
  })
})
