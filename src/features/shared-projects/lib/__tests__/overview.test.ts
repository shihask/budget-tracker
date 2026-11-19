import { describe, it, expect } from 'vitest'
import { calcProjectSummary } from '../calculations'
import { kittyBreakdown, budgetStatus, targetProgress, initials } from '../overview'
import type { Project, ProjectMember, ProjectTransaction } from '../../types'

const project = (target = 0): Project => ({
  id: 'p', owner_user_id: 'u', name: 'Trip', description: null, notes: null,
  target_amount: target, currency: 'INR', status: 'active', share_code: null,
  is_public: false, shared_at: null, share_views: 0, created_at: '', updated_at: '',
})
const member = (id: string): ProjectMember => ({
  id, project_id: 'p', name: id, email: null, share_ratio: 1, display_order: 0, is_active: true, created_at: '',
})
let n = 0
const members = ['a', 'b', 'c'].map(member)
// Like loaded data: the member object is attached whenever member_id points at a member.
const tx = (type: 'contribution' | 'expense', amount: number, member_id: string | null): ProjectTransaction => ({
  id: `t${n++}`, project_id: 'p', member_id, transaction_type: type, amount,
  description: null, category: null, notes: null, transaction_date: '2026-11-18', display_order: 0, created_at: '',
  member: members.find(m => m.id === member_id),
})

function run(txns: ProjectTransaction[], target = 0) {
  const summary = calcProjectSummary(project(target), members, txns)
  return { summary, k: kittyBreakdown(summary, txns) }
}

describe('kittyBreakdown', () => {
  it('kitty with money left', () => {
    const { k } = run([tx('contribution', 3000, 'a'), tx('expense', 1000, null)])
    expect(k.state).toBe('remaining')
    expect(k.fundRemaining).toBe(2000)
    expect(k.paidPersonally).toBe(0)
  })

  it('kitty fully used, within paise tolerance', () => {
    const { k } = run([tx('contribution', 100.1, 'a'), tx('contribution', 0.2, 'b'), tx('expense', 100.3, null)])
    expect(k.state).toBe('used')
  })

  it('kitty overspent', () => {
    const { k } = run([tx('contribution', 1000, 'a'), tx('expense', 1500, null)])
    expect(k.state).toBe('overspent')
    expect(k.fundRemaining).toBe(-500)
  })

  it('no kitty: members paid directly', () => {
    const { k } = run([tx('expense', 800, 'a')])
    expect(k.state).toBe('none')
    expect(k.paidPersonally).toBe(800)
  })

  it('sources are member contributions only, and total them', () => {
    const { k, summary } = run([tx('contribution', 2000, 'a'), tx('contribution', 1700, 'b')])
    expect(k.sources).toEqual([{ key: 'members', label: 'Member contributions', amount: 3700 }])
    expect(k.kittyFunds).toBe(summary.totalContributions)
  })

  it('group money (no member) is its own source; kitty funds still total everything', () => {
    const { k, summary } = run([tx('contribution', 9700, 'a'), tx('contribution', 2000, null), tx('expense', 11700, null)])
    expect(k.sources).toEqual([
      { key: 'members', label: 'Member contributions', amount: 9700 },
      { key: 'group', label: 'Group money (outside the group)', amount: 2000 },
    ])
    expect(k.kittyFunds).toBe(11700)
    expect(k.kittyFunds).toBe(summary.totalContributions)
    expect(k.state).toBe('used')
  })

  it('mixed trip: the parts reconcile with the existing summary', () => {
    const txns = [
      tx('contribution', 2000, 'a'), tx('contribution', 2000, 'b'), tx('contribution', 1700, 'c'),
      tx('expense', 4800.55, null), tx('expense', 899.45, null),
      tx('expense', 6000, 'c'), tx('expense', 1200.08, 'a'),
    ]
    const { k, summary } = run(txns)
    expect(k.fundSpent + k.paidPersonally).toBeCloseTo(summary.totalExpenses, 2)
    expect(k.fundRemaining - k.paidPersonally).toBeCloseTo(summary.remainingBudget, 2)
    expect(k.state).toBe('used')
  })
})

describe('budgetStatus', () => {
  it('keeps the 80 / 100 thresholds', () => {
    expect(budgetStatus(79.9)).toBe('ok')
    expect(budgetStatus(80)).toBe('near')
    expect(budgetStatus(99.9)).toBe('near')
    expect(budgetStatus(100)).toBe('over')
  })
})

describe('targetProgress', () => {
  it('null without a target', () => {
    const { summary } = run([])
    expect(targetProgress(summary, 0)).toBeNull()
  })
  it('is uncapped so over-target shows', () => {
    const { summary } = run([tx('expense', 1500, 'a')], 1000)
    const t = targetProgress(summary, 1000)!
    expect(t.pct).toBe(150)
    expect(t.left).toBe(-500)
  })
})

describe('initials', () => {
  it('handles one and many words', () => {
    expect(initials('Shihas')).toBe('SH')
    expect(initials('Muneer K P')).toBe('MP')
    expect(initials('  ')).toBe('?')
  })
})
