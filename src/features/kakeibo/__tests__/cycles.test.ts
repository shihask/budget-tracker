import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AppState, Category, Group, KakeiboReflection, Transaction } from '@/types'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import { emptyReflection } from '../lib/kakeibo'
import { buildCycleOptions, MAX_COMPLETED_OPTIONS, type CycleOption } from '../lib/cycles'

/** Cycle options run against the REAL cycle engine (no hand-written boundaries). */

const CATS: Category[] = [
  { id: 'c-salary', name: 'Salary', group_name: 'Income' },
  { id: 'c-food', name: 'Food', group_name: 'Lifestyle' },
]
const GROUPS: Group[] = [
  { id: 'g1', name: 'Income', is_system: true, type: 'income' },
  { id: 'g2', name: 'Lifestyle', type: 'discretionary' },
]
let n = 0
const salary = (date: string): Transaction =>
  ({ id: `s${++n}`, description: 'Salary', amount: 82000, transaction_type: 'income', category_id: 'c-salary', from_account_id: 'a1', to_account_id: null, notes: null, created_at: date, transaction_date: date }) as Transaction

function makeState(transactions: Transaction[]): AppState {
  return {
    accounts: [], categories: CATS, groups: GROUPS, credit_cards: [],
    settings: {
      id: 's', weekly_budget: 5000, emergency_fund: 0, salary_date: 28, track_credit_cards: false, track_borrowings: true,
      autopilot_enabled: false, income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'f', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'b', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions, goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
  } as AppState
}
const rec = (start: string, o: Partial<KakeiboReflection> = {}) => ({ ...emptyReflection(start, `r-${start}`), ...o })

const TODAY = new Date(2026, 9, 15, 12) // 15 Oct 2026
afterEach(() => { vi.useRealTimers() })

function options(salaries: string[], records: KakeiboReflection[] = [], historyComplete = true): CycleOption[] {
  vi.useFakeTimers(); vi.setSystemTime(TODAY)
  const txns = salaries.map(salary)
  const state = makeState(txns)
  const current = getCurrentFinancialCycle(state)
  return buildCycleOptions({ state, incomeTxns: txns, current, records, today: TODAY, historyComplete })
}
const completed = (o: CycleOption[]) => o.filter(x => x.status === 'completed').map(x => [x.start, x.end, x.origin])

describe('buildCycleOptions', () => {
  it('current cycle first (provisional, to today), then completed cycles from the engine, newest first, max 6', () => {
    const o = options(['2026-03-28', '2026-04-28', '2026-05-28', '2026-06-28', '2026-07-28', '2026-08-28', '2026-09-28'])
    expect(o[0]).toMatchObject({ start: '2026-09-28', end: '2026-10-15', status: 'current' })
    expect(completed(o)).toEqual([
      ['2026-08-28', '2026-09-27', 'engine'],
      ['2026-07-28', '2026-08-27', 'engine'],
      ['2026-06-28', '2026-07-27', 'engine'],
      ['2026-05-28', '2026-06-27', 'engine'],
      ['2026-04-28', '2026-05-27', 'engine'],
      ['2026-03-28', '2026-04-27', 'engine'],
    ])
    expect(completed(o)).toHaveLength(MAX_COMPLETED_OPTIONS)
  })

  it('stops where salary history stops — calendar-fallback cycles are never offered', () => {
    const o = options(['2026-08-28', '2026-09-28'])
    expect(completed(o)).toEqual([['2026-08-28', '2026-09-27', 'engine']])
  })

  it('a recorded cycle wins over the overlapping engine cycle (backdated salary)', () => {
    // Kakeibo saw Aug 26 – Sep 27 live; the engine would now say Aug 28 – Sep 27.
    const o = options(['2026-07-28', '2026-08-28', '2026-09-28'], [rec('2026-08-26', { cycle_end: '2026-09-27' }), rec('2026-09-28')])
    const c = completed(o)
    expect(c[0]).toEqual(['2026-08-26', '2026-09-27', 'record'])
    expect(c.some(([s]) => s === '2026-08-28')).toBe(false)
    // The engine's Jul 28 – Aug 27 overlaps the record by two days → excluded, never trimmed.
    expect(c.some(([s]) => s === '2026-07-28')).toBe(false)
    for (const x of o.filter(y => y.status === 'completed' && y.origin === 'engine')) {
      expect(x.end < '2026-08-26' || x.start > '2026-09-27').toBe(true)
    }
  })

  it('split salary (two credits 3 days apart): the ambiguous cycle is excluded, not guessed', () => {
    const o = options(['2026-06-28', '2026-07-28', '2026-07-31', '2026-08-28', '2026-09-28'])
    const starts = completed(o).map(([s]) => s)
    expect(starts).toContain('2026-08-28')
    expect(starts).not.toContain('2026-07-31')
    expect(starts).not.toContain('2026-07-28') // its 3-day stub is too short to be a cycle
    // No two offered cycles overlap.
    const c = o.filter(x => x.status === 'completed')
    for (const a of c) for (const b of c) if (a !== b) expect(a.start <= b.end && b.start <= a.end).toBe(false)
  })

  it('late salary (Aug pay credited on 3 Sep): offered once, with the engine\'s boundaries', () => {
    const o = options(['2026-06-28', '2026-07-28', '2026-09-03', '2026-09-28'])
    const c = completed(o)
    expect(c.filter(([s]) => s === '2026-09-03')).toEqual([['2026-09-03', '2026-09-27', 'engine']])
    expect(c.find(([s]) => s === '2026-07-28')).toEqual(['2026-07-28', '2026-09-02', 'engine'])
  })

  it('history still loading → only recorded cycles are offered', () => {
    const o = options(['2026-07-28', '2026-08-28', '2026-09-28'], [rec('2026-08-28', { cycle_end: '2026-09-27' }), rec('2026-09-28')], false)
    expect(completed(o)).toEqual([['2026-08-28', '2026-09-27', 'record']])
  })

  it('never offers anything overlapping an open (current or hidden) record', () => {
    const o = options(['2026-07-28', '2026-08-28', '2026-09-28'], [rec('2026-09-28'), rec('2026-10-28')])
    for (const x of o.filter(y => y.status === 'completed')) expect(x.end < '2026-09-28').toBe(true)
  })
})
