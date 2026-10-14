import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AppState, KakeiboReflection, Transaction } from '@/types'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import { parseIso } from '@/lib/utils'
import {
  kakeiboStrategy, kakeiboCycle, monthCycle, monthBounds, kindOf, dashboardActions, reviewableRecords,
  previousRecord, currentRecord, planCycleSync, applyPlan, emptyReflection, nextReviewState, cycleMonthName,
} from '../lib/kakeibo'
import { buildMonthOptions, buildCycleOptions, withHistory, MAX_COMPLETED_OPTIONS } from '../lib/cycles'
import { computePillarTotals, type CategoryPillarRow, type TxnPillarRow } from '../lib/pillars'

// ── Fixtures ─────────────────────────────────────────────────────────────────

type Pattern = 'monthly' | 'weekly' | 'variable' | 'business'
const settings = (income_pattern: Pattern, salary_date: number | null = 1) => ({
  id: 's', weekly_budget: 5000, emergency_fund: 0, salary_date, track_credit_cards: false, track_borrowings: true,
  autopilot_enabled: false, income_pattern, primary_income_category_id: null, cycle_start_free_money: null, cycle_snapshot_key: null,
}) as AppState['settings']

function makeState(pattern: Pattern, transactions: Transaction[] = []): AppState {
  return {
    accounts: [], credit_cards: [],
    categories: [{ id: 'c-salary', name: 'Salary', group_name: 'Income' }, { id: 'c-food', name: 'Food', group_name: 'Lifestyle' }],
    groups: [{ id: 'g1', name: 'Income', is_system: true, type: 'income' }, { id: 'g2', name: 'Lifestyle', type: 'discretionary' }],
    settings: settings(pattern),
    forecast_settings: { id: 'f', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'b', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions, goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
  } as AppState
}
let n = 0
const tx = (date: string, type: Transaction['transaction_type'], amount: number, category_id: string | null = null, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, description: 'x', amount, transaction_type: type, category_id, from_account_id: 'a', to_account_id: null, notes: null, created_at: date, transaction_date: date, ...extra }) as Transaction
const month = (start: string, o: Partial<KakeiboReflection> = {}): KakeiboReflection =>
  ({ ...emptyReflection(start, `m-${start}`), cycle_kind: 'month', cycle_end: monthBounds(start).end, ...o })
const salaryRow = (start: string, o: Partial<KakeiboReflection> = {}): KakeiboReflection =>
  ({ ...emptyReflection(start, `s-${start}`), cycle_kind: 'salary', ...o })
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12)
afterEach(() => { vi.useRealTimers() })

// ── 1. All four income patterns ──────────────────────────────────────────────

describe('strategy per income pattern', () => {
  it('Monthly → salary cycle; Weekly, Variable/Daily, Business → calendar month', () => {
    expect(kakeiboStrategy(settings('monthly'))).toBe('salary')
    expect(kakeiboStrategy(settings('weekly'))).toBe('month')
    expect(kakeiboStrategy(settings('variable'))).toBe('month')
    expect(kakeiboStrategy(settings('business'))).toBe('month')
  })

  it.each(['weekly', 'variable', 'business'] as const)('%s: calendar month, available with no salary at all', pattern => {
    vi.useFakeTimers(); vi.setSystemTime(at(2026, 9, 14))
    const state = makeState(pattern)
    const c = kakeiboCycle(state.settings, getCurrentFinancialCycle(state), false, at(2026, 9, 14))
    expect(c).toMatchObject({ kind: 'month', currentDay: 14, totalDays: 31, daysRemaining: 18 })
    expect(c!.cycleStart).toEqual(new Date(2026, 9, 1))
    expect(c!.cycleEnd).toEqual(new Date(2026, 9, 31))
  })

  it('calendar months never read income rows — a mid-month income changes nothing', () => {
    const state = makeState('variable', [tx('2026-10-09', 'income', 900, 'c-salary'), tx('2026-10-12', 'income', 1500, 'c-salary')])
    vi.useFakeTimers(); vi.setSystemTime(at(2026, 9, 14))
    const c = kakeiboCycle(state.settings, getCurrentFinancialCycle(state), false, at(2026, 9, 14))!
    expect(c.cycleStart).toEqual(new Date(2026, 9, 1))
  })

  it('Monthly: unchanged — salary-anchored only, off until a salary is recorded', () => {
    vi.useFakeTimers(); vi.setSystemTime(at(2026, 9, 14))
    const none = makeState('monthly')
    expect(kakeiboCycle(none.settings, getCurrentFinancialCycle(none), false, at(2026, 9, 14))).toBeNull()
    const paid = makeState('monthly', [tx('2026-10-01', 'income', 82000, 'c-salary')])
    const c = kakeiboCycle(paid.settings, getCurrentFinancialCycle(paid), false, at(2026, 9, 14))!
    expect(c.kind).toBe('salary')
    // The engine's own cycle, passed through untouched.
    expect(c.engine).toEqual(getCurrentFinancialCycle(paid))
    expect(c.cycleStart).toEqual(getCurrentFinancialCycle(paid).cycleStart)
    expect(c.currentDay).toBe(getCurrentFinancialCycle(paid).currentDay)
  })

  it('nothing while loading', () => {
    expect(kakeiboCycle(settings('variable'), undefined, true, at(2026, 9, 14))).toBeNull()
  })
})

// ── 2. Calendar boundaries ───────────────────────────────────────────────────

describe('calendar-month boundaries', () => {
  it('leap year February is 29 days; non-leap is 28', () => {
    expect(monthCycle(at(2028, 1, 10))).toMatchObject({ totalDays: 29 })
    expect(monthBounds('2028-02-01')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(monthCycle(at(2027, 1, 10))).toMatchObject({ totalDays: 28 })
    expect(monthBounds('2027-02-01')).toEqual({ start: '2027-02-01', end: '2027-02-28' })
  })
  it('year transition: on 1 Jan the previous month is December of last year', () => {
    const c = monthCycle(at(2027, 0, 1))
    const records = [month('2026-12-01'), month('2027-01-01')]
    expect(previousRecord(records, c)?.cycle_start).toBe('2026-12-01')
    expect(currentRecord(records, c)?.cycle_start).toBe('2027-01-01')
    expect(cycleMonthName(records[0])).toBe('December')
  })
  it('31-day, 30-day months and the last day of the month', () => {
    expect(monthCycle(at(2026, 9, 31))).toMatchObject({ currentDay: 31, daysRemaining: 1 })
    expect(monthBounds('2026-11-01').end).toBe('2026-11-30')
  })
  it('options: current month (to today) + 6 completed months across the year boundary', () => {
    const o = buildMonthOptions({ records: [], today: at(2027, 1, 5) })
    expect(o[0]).toMatchObject({ kind: 'month', start: '2027-02-01', end: '2027-02-05', status: 'current' })
    expect(o.slice(1).map(x => [x.start, x.end])).toEqual([
      ['2027-01-01', '2027-01-31'], ['2026-12-01', '2026-12-31'], ['2026-11-01', '2026-11-30'],
      ['2026-10-01', '2026-10-31'], ['2026-09-01', '2026-09-30'], ['2026-08-01', '2026-08-31'],
    ])
    expect(o.filter(x => x.status === 'completed')).toHaveLength(MAX_COMPLETED_OPTIONS)
    expect(new Set(o.map(x => x.key)).size).toBe(o.length)
  })
})

// ── 4. Provisional vs completed ──────────────────────────────────────────────

describe('current month is provisional; completed months are reviewable', () => {
  it('the current month is never reviewable; last month is once the 1st arrives', () => {
    const records = [month('2026-10-01'), month('2026-11-01')]
    expect(reviewableRecords(records, monthCycle(at(2026, 9, 31))).map(r => r.cycle_start)).toEqual([])
    expect(reviewableRecords(records, monthCycle(at(2026, 10, 1))).map(r => r.cycle_start)).toEqual(['2026-10-01'])
  })
  it('a completed month without a row is still offered (saving a note creates the row)', () => {
    const o = buildMonthOptions({ records: [month('2026-11-01')], today: at(2026, 10, 3) })
    const oct = o.find(x => x.start === '2026-10-01')!
    expect(oct).toMatchObject({ status: 'completed', record: null, origin: 'calendar' })
  })
})

// ── 5. Reminders for calendar months ─────────────────────────────────────────

describe('dashboard reminders — calendar months', () => {
  const nov = monthCycle(at(2026, 10, 1))
  const rows = [month('2026-10-01'), month('2026-11-01')]
  const act = (d: number, r = rows) => dashboardActions(r, monthCycle(at(2026, 10, d)), at(2026, 10, d), 'month')

  it('1 Nov: review of October and the November goal show together', () => {
    const a = act(1)
    expect(a.review?.cycle_start).toBe('2026-10-01')
    expect(a.goal?.cycle_start).toBe('2026-11-01')
  })
  it('goal through 7 Nov, review through 10 Nov — windows from the 1st', () => {
    expect(act(7).goal).not.toBeNull(); expect(act(8).goal).toBeNull()
    expect(act(10).review).not.toBeNull(); expect(act(11).review).toBeNull()
  })
  it('a row created late does NOT stretch a calendar-month window (unlike a late salary)', () => {
    const late = [month('2026-10-01'), month('2026-11-01', { created_at: new Date(2026, 10, 9, 10).toISOString() })]
    expect(act(9, late).goal).toBeNull()
    expect(act(11, late).review).toBeNull()
  })
  it('no review prompt for a month Kakeibo never saw (first-time user)', () => {
    expect(act(1, [month('2026-11-01')]).review).toBeNull()
    expect(act(1, [month('2026-11-01')]).goal).not.toBeNull()
  })
  it('"Not now" hides the reminder only; skip and acknowledge behave as for salary cycles', () => {
    const dismissed = [month('2026-10-01', { review_reminder_dismissed_at: 'x' }), month('2026-11-01')]
    expect(act(2, dismissed).review).toBeNull()
    expect(dismissed[0].review_status).toBeNull()
    const skipped = [month('2026-10-01', { review_status: 'skipped' }), month('2026-11-01', { goal_decided_at: 'x' })]
    expect(act(2, skipped)).toEqual({ review: null, goal: null, lesson: null })
    const noted = [month('2026-10-01', { review_status: 'completed', reflection_note: 'Cook more' }), month('2026-11-01', { goal_decided_at: 'x' })]
    expect(act(2, noted).lesson?.reflection_note).toBe('Cook more')
    noted[0].lesson_acknowledged_at = 'y'
    expect(act(2, noted).lesson).toBeNull()
  })
  it('the previous month is found by date, not by guessing', () => {
    expect(previousRecord(rows, nov)?.cycle_start).toBe('2026-10-01')
  })
})

// ── 3. Salary behaviour unchanged ────────────────────────────────────────────

describe('salary strategy unchanged by the month strategy', () => {
  it('late, split and backdated salary still plan exactly as before (salary rows only)', () => {
    const before = [salaryRow('2026-09-28', { cycle_end: '2026-10-29' }), salaryRow('2026-10-30')]
    expect(planCycleSync(before, { cycleStart: parseIso('2026-10-26') })).toEqual({
      rekey: { from: '2026-10-30', to: '2026-10-26' },
      setEnd: { cycle_start: '2026-09-28', expected_end: '2026-10-29', cycle_end: '2026-10-25' },
    })
    const after = applyPlan(before, planCycleSync(before, { cycleStart: parseIso('2026-11-01') })!)
    expect(after.filter(r => r.cycle_start === '2026-11-01')).toHaveLength(1)
  })
  it('rows from before the column existed read as salary', () => {
    expect(kindOf({ cycle_kind: undefined })).toBe('salary')
  })
})

// ── 6. Income-pattern changes ────────────────────────────────────────────────

describe('income-pattern changes preserve history', () => {
  const history = [
    salaryRow('2026-08-28', { cycle_end: '2026-09-27', review_status: 'completed', reflection_note: 'Cook more' }),
    salaryRow('2026-09-28', { savings_goal: 5000, goal_decided_at: 'x' }), // open when the pattern changed
    salaryRow('2026-07-28', { cycle_end: '2026-08-27' }),                   // nothing saved
  ]
  it('Monthly → Variable: saved salary reviews stay in the selector, dates and labels untouched', () => {
    const withContent = history.filter(r => r.cycle_end != null && (r.reflection_note || r.review_status || r.savings_goal != null))
    const o = withHistory(buildMonthOptions({ records: [], today: at(2026, 10, 3) }), withContent)
    const kept = o.find(x => x.origin === 'history')!
    expect(kept).toMatchObject({ kind: 'salary', start: '2026-08-28', end: '2026-09-27', key: 'salary:2026-08-28' })
    expect(kept.record?.reflection_note).toBe('Cook more')
    // A month and a salary cycle starting the same day are distinct options.
    const both = withHistory(buildMonthOptions({ records: [], today: at(2026, 10, 3) }),
      [salaryRow('2026-10-01', { cycle_end: '2026-10-31', review_status: 'completed' })])
    expect(both.filter(x => x.start === '2026-10-01').map(x => x.key).sort()).toEqual(['month:2026-10-01', 'salary:2026-10-01'])
  })
  it('the open salary row is never re-dated by the month strategy (no month plan touches salary rows)', () => {
    const open = history[1]
    expect(open.cycle_end).toBeNull()
    expect(open.savings_goal).toBe(5000)
  })
  it('Variable → Monthly: month rows stay as history; salary sync sees only salary rows', () => {
    vi.useFakeTimers(); vi.setSystemTime(at(2026, 10, 3))
    const state = makeState('monthly', [tx('2026-11-01', 'income', 82000, 'c-salary')])
    const engine = getCurrentFinancialCycle(state)
    const salaryRows: KakeiboReflection[] = []                      // only salary rows are passed to planCycleSync
    expect(planCycleSync(salaryRows, engine)).toEqual({ insert: { cycle_start: '2026-11-01' } })
    const opts = withHistory(
      buildCycleOptions({ state, incomeTxns: state.transactions, current: engine, records: salaryRows, today: at(2026, 10, 3), historyComplete: true }),
      [month('2026-10-01', { review_status: 'completed', reflection_note: 'Less takeaway' })],
    )
    expect(opts.find(x => x.origin === 'history')).toMatchObject({ kind: 'month', start: '2026-10-01', end: '2026-10-31' })
  })
})

// ── 7. Overrides & notes survive regeneration ────────────────────────────────

describe('regenerating a calendar month keeps pillar choices and the note', () => {
  it('same rows + same stored choices → same totals; the note is not an input', () => {
    const txns = [tx('2026-10-03', 'expense', 500, 'c-food'), tx('2026-10-04', 'expense', 900, 'c-food', { id: 'repair' })]
    const state = makeState('variable', txns)
    const cat = new Map<string, CategoryPillarRow>([['c-food', { category_id: 'c-food', pillar: 'optional', source: 'user' }]])
    const over = new Map<string, TxnPillarRow>([['repair', { transaction_id: 'repair', pillar: 'unexpected' }]])
    const a = computePillarTotals(txns, state, '2026-10-01', '2026-10-31', cat, over)
    const b = computePillarTotals(txns, state, '2026-10-01', '2026-10-31', cat, over)
    expect(a.totals).toEqual(b.totals)
    expect(a.totals).toMatchObject({ optional: 500, unexpected: 900 })
    const r = month('2026-10-01', { review_status: 'completed', reflection_note: 'Keep me' })
    expect(nextReviewState(r, { kind: 'save', note: 'Keep me' }, 'now')).toEqual({})
  })
})
