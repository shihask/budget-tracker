import { describe, it, expect, vi, afterEach } from 'vitest'
import { derive } from '@/lib/data'
import { computeStrategyData } from '@/lib/budget-strategy'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import { mergeLoadedWins } from '@/lib/transactionFilters'
import { parseIso } from '@/lib/utils'
import type { AppState, Category, Group, KakeiboReflection, LifeEvent, Transaction } from '@/types'
import {
  planCycleSync, applyPlan, emptyReflection, isEligible, reviewableRecords, dashboardActions,
  nextReviewState, computeCycleSummary, kakeiboInsight, predecessorOf, cycleLength,
  MAX_REVIEW_CYCLE_DAYS, type CycleSummary,
} from '../lib/kakeibo'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CATS: Category[] = [
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
  { id: 'cat-bonus', name: 'Bonus', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'cat-rent', name: 'Rent', group_name: 'Utilities' },
  { id: 'cat-misc', name: 'Misc', group_name: 'Other' },
  { id: 'cat-gold', name: 'Gold', group_name: 'Savings' },
]
const GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-life', name: 'Lifestyle', type: 'discretionary' },
  { id: 'g-util', name: 'Utilities', type: 'essential' },
  { id: 'g-other', name: 'Other' },
  { id: 'g-sav', name: 'Savings', type: 'savings' },
]

let seq = 0
function tx(o: Partial<Transaction> & Pick<Transaction, 'transaction_date' | 'transaction_type' | 'amount'>): Transaction {
  return {
    id: o.id ?? `tx-${++seq}`,
    description: 'test',
    category_id: null,
    from_account_id: 'acc-1',
    to_account_id: null,
    notes: null,
    created_at: o.transaction_date,
    ...o,
  } as Transaction
}
const salary = (date: string, amount = 50000) => tx({ transaction_date: date, transaction_type: 'income', amount, category_id: 'cat-salary' })
const expense = (date: string, amount: number, category_id: string | null = 'cat-food', extra: Partial<Transaction> = {}) =>
  tx({ transaction_date: date, transaction_type: 'expense', amount, category_id, ...extra })

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: CATS,
    groups: GROUPS,
    credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: 28,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'balanced', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions: [], goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
    ...overrides,
  } as AppState
}

const rec = (cycle_start: string, o: Partial<KakeiboReflection> = {}): KakeiboReflection =>
  ({ ...emptyReflection(cycle_start, `r-${cycle_start}`), ...o })
const cyc = (start: string, currentDay = 1) => ({ cycleStart: parseIso(start), currentDay })

function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}
afterEach(() => { vi.useRealTimers() })

/** Applies plans until none is left; fails if it doesn't converge in one step. */
function settle(records: KakeiboReflection[], start: string): KakeiboReflection[] {
  const plan = planCycleSync(records, cyc(start))
  const after = plan ? applyPlan(records, plan) : records
  expect(planCycleSync(after, cyc(start))).toBeNull()
  return after
}

// ── Eligibility ──────────────────────────────────────────────────────────────

describe('isEligible — monthly, salary-anchored cycles only', () => {
  it('is eligible for a monthly cycle anchored on a recorded salary', () => {
    mockToday('2026-10-30')
    const state = makeState({ transactions: [salary('2026-10-28')] })
    const cycle = getCurrentFinancialCycle(state)
    expect(cycle.source).toBe('transaction')
    expect(isEligible(state, cycle, false)).toBe(true)
  })

  it('is not eligible on the calendar fallback (no salary recorded)', () => {
    mockToday('2026-10-30')
    const state = makeState()
    expect(isEligible(state, getCurrentFinancialCycle(state), false)).toBe(false)
  })

  it.each(['weekly', 'variable', 'business'] as const)('is not eligible for the %s pattern', pattern => {
    mockToday('2026-10-30')
    const state = makeState({ transactions: [salary('2026-10-28')], settings: { ...makeState().settings, income_pattern: pattern } })
    expect(isEligible(state, getCurrentFinancialCycle(state), false)).toBe(false)
  })

  it('is not eligible while loading', () => {
    mockToday('2026-10-30')
    const state = makeState({ transactions: [salary('2026-10-28')] })
    expect(isEligible(state, getCurrentFinancialCycle(state), true)).toBe(false)
  })
})

// ── Cycle sync ───────────────────────────────────────────────────────────────

describe('planCycleSync', () => {
  it('first sight: inserts the current cycle, nothing to close', () => {
    expect(planCycleSync([], cyc('2026-09-28'))).toEqual({ insert: { cycle_start: '2026-09-28' } })
  })

  it('payday rollover: inserts the new cycle and closes the previous the day before', () => {
    const plan = planCycleSync([rec('2026-09-28')], cyc('2026-10-28'))
    expect(plan).toEqual({
      insert: { cycle_start: '2026-10-28' },
      setEnd: { cycle_start: '2026-09-28', expected_end: null, cycle_end: '2026-10-27' },
    })
  })

  it('is idempotent — re-planning the applied result is a no-op', () => {
    settle([rec('2026-09-28')], '2026-10-28')
  })

  it('two tabs: a plan made from the old read carries an expectation the second apply will fail (stale)', () => {
    const before = [rec('2026-09-28')]
    const planA = planCycleSync(before, cyc('2026-10-28'))!
    const planB = planCycleSync(before, cyc('2026-10-28'))!
    const afterA = applyPlan(before, planA)
    // The RPC compares setEnd.expected_end with the stored cycle_end; after A they differ → 'stale'.
    expect(planB.setEnd!.expected_end).toBeNull()
    expect(afterA.find(r => r.cycle_start === '2026-09-28')!.cycle_end).toBe('2026-10-27')
    // And re-planning from the fresh read is a no-op — no duplicate row.
    expect(planCycleSync(afterA, cyc('2026-10-28'))).toBeNull()
    expect(afterA.filter(r => r.cycle_start === '2026-10-28')).toHaveLength(1)
  })

  it('salary deleted: reopens the previous cycle and hides (never deletes) the newer record', () => {
    const records = [rec('2026-09-28', { cycle_end: '2026-10-27' }), rec('2026-10-28', { savings_goal: 8000, goal_decided_at: 'x' })]
    const plan = planCycleSync(records, cyc('2026-09-28'))
    expect(plan).toEqual({ reopen: { cycle_start: '2026-09-28', expected_end: '2026-10-27' } })
    const after = applyPlan(records, plan!)
    expect(after).toHaveLength(2)
    expect(reviewableRecords(after, cyc('2026-09-28'))).toEqual([]) // Sep is current again — no review
  })

  it('salary re-added: closes the previous cycle again; the hidden record returns with its goal intact', () => {
    const reopened = [rec('2026-09-28'), rec('2026-10-28', { savings_goal: 8000, goal_decided_at: 'x' })]
    const plan = planCycleSync(reopened, cyc('2026-10-28'))
    expect(plan).toEqual({ setEnd: { cycle_start: '2026-09-28', expected_end: null, cycle_end: '2026-10-27' } })
    const after = settle(reopened, '2026-10-28')
    expect(after.find(r => r.cycle_start === '2026-10-28')!.savings_goal).toBe(8000)
  })

  // Regression: re-keying must move the predecessor's end with it, in the same plan.
  it('backdated salary (30 Oct → 26 Oct): re-keys the cycle AND moves the predecessor end to 25 Oct', () => {
    const records = [rec('2026-09-28', { cycle_end: '2026-10-29' }), rec('2026-10-30', { savings_goal: 5000, goal_decided_at: 'x' })]
    const plan = planCycleSync(records, cyc('2026-10-26'))
    expect(plan).toEqual({
      rekey: { from: '2026-10-30', to: '2026-10-26' },
      setEnd: { cycle_start: '2026-09-28', expected_end: '2026-10-29', cycle_end: '2026-10-25' },
    })
    const after = settle(records, '2026-10-26')
    expect(after.map(r => [r.cycle_start, r.cycle_end])).toEqual([['2026-09-28', '2026-10-25'], ['2026-10-26', null]])
    expect(after.find(r => r.cycle_start === '2026-10-26')!.savings_goal).toBe(5000)
  })

  it('post-dated salary (30 Oct → 2 Nov): same cycle re-keyed — never a 3-day reviewable cycle', () => {
    const records = [rec('2026-09-28', { cycle_end: '2026-10-29' }), rec('2026-10-30')]
    const after = settle(records, '2026-11-02')
    expect(after.map(r => [r.cycle_start, r.cycle_end])).toEqual([['2026-09-28', '2026-11-01'], ['2026-11-02', null]])
  })

  it('cycle moved back past a known record with no record of its own: ambiguous, so no write', () => {
    expect(planCycleSync([rec('2026-10-28')], cyc('2026-09-28'))).toBeNull()
  })

  it('months unobserved: the long span is closed but never offered for review', () => {
    const after = settle([rec('2026-06-28')], '2026-10-28')
    const june = after.find(r => r.cycle_start === '2026-06-28')!
    expect(cycleLength(june)! > MAX_REVIEW_CYCLE_DAYS).toBe(true)
    expect(reviewableRecords(after, cyc('2026-10-28'))).toEqual([])
  })
})

// ── Dashboard actions ────────────────────────────────────────────────────────

/** [cycle, today] for "day N of the cycle starting `start`" (day 1 = payday). */
const on = (start: string, day: number): [{ cycleStart: Date }, Date] => {
  const s = parseIso(start)
  return [{ cycleStart: s }, new Date(s.getFullYear(), s.getMonth(), s.getDate() + day - 1, 12)]
}

describe('dashboardActions — review and goal are independent', () => {
  const payday = [rec('2026-09-28', { cycle_end: '2026-10-27' }), rec('2026-10-28')]

  it('on payday both the review and the goal rows show', () => {
    const a = dashboardActions(payday, ...on('2026-10-28', 1))
    expect(a.review?.cycle_start).toBe('2026-09-28')
    expect(a.goal?.cycle_start).toBe('2026-10-28')
  })

  it('resolving the review leaves the goal, and vice versa', () => {
    const reviewed = [rec('2026-09-28', { cycle_end: '2026-10-27', review_status: 'completed' }), rec('2026-10-28')]
    expect(dashboardActions(reviewed, ...on('2026-10-28', 1)).goal).not.toBeNull()
    const goalSet = [rec('2026-09-28', { cycle_end: '2026-10-27' }), rec('2026-10-28', { goal_decided_at: 'x' })]
    expect(dashboardActions(goalSet, ...on('2026-10-28', 1)).review).not.toBeNull()
  })

  it('goal row leaves after day 7, review row after day 10', () => {
    expect(dashboardActions(payday, ...on('2026-10-28', 7)).goal).not.toBeNull()
    expect(dashboardActions(payday, ...on('2026-10-28', 8)).goal).toBeNull()
    expect(dashboardActions(payday, ...on('2026-10-28', 10)).review).not.toBeNull()
    expect(dashboardActions(payday, ...on('2026-10-28', 11)).review).toBeNull()
  })

  it('the last lesson shows only when nothing else is asked, until acknowledged', () => {
    const done = [
      rec('2026-09-28', { cycle_end: '2026-10-27', review_status: 'completed', reflection_note: 'Cook more' }),
      rec('2026-10-28', { goal_decided_at: 'x' }),
    ]
    expect(dashboardActions(done, ...on('2026-10-28', 3)).lesson?.reflection_note).toBe('Cook more')
    done[0].lesson_acknowledged_at = 'y'
    expect(dashboardActions(done, ...on('2026-10-28', 3)).lesson).toBeNull()
  })

  it('a review saved WITHOUT a note never produces a lesson row (blank or whitespace)', () => {
    for (const note of [null, '', '   ']) {
      const done = [
        rec('2026-09-28', { cycle_end: '2026-10-27', review_status: 'completed', reflection_note: note }),
        rec('2026-10-28', { goal_decided_at: 'x' }),
      ]
      expect(dashboardActions(done, ...on('2026-10-28', 2))).toEqual({ review: null, goal: null, lesson: null })
    }
    // And saving an empty note stores null, so there is nothing to show later either.
    expect(nextReviewState(rec('a'), { kind: 'save', note: '   ' }, 'now').reflection_note).toBeNull()
  })

  it('"Not now" hides only the reminder — the review stays pending, the goal row stays', () => {
    const dismissed = [rec('2026-09-28', { cycle_end: '2026-10-27', review_reminder_dismissed_at: 'x' }), rec('2026-10-28')]
    const a = dashboardActions(dismissed, ...on('2026-10-28', 1))
    expect(a.review).toBeNull()
    expect(a.goal).not.toBeNull()
    expect(dismissed[0].review_status).toBeNull() // still pending → Analytics keeps offering it
  })

  it('"Skip for now" on the goal records no goal amount', () => {
    // setGoal(r, null) writes { savings_goal: null, goal_decided_at }: decided, no goal.
    const skipped = [rec('2026-09-28', { cycle_end: '2026-10-27', review_status: 'completed' }), rec('2026-10-28', { goal_decided_at: 'x', savings_goal: null })]
    expect(dashboardActions(skipped, ...on('2026-10-28', 1)).goal).toBeNull()
    expect(skipped[1].savings_goal).toBeNull()
  })
})

describe('dashboardActions — salary recorded late', () => {
  // Salary dated 1 Nov but entered on 9 Nov: the app first saw the new cycle on 9 Nov.
  const late = [
    rec('2026-10-01', { cycle_end: '2026-10-31' }),
    rec('2026-11-01', { created_at: new Date(2026, 10, 9, 18).toISOString() }),
  ]
  it('windows count from the day the app saw the new cycle, not the salary date', () => {
    expect(dashboardActions(late, ...on('2026-11-01', 9)).review?.cycle_start).toBe('2026-10-01')
    expect(dashboardActions(late, ...on('2026-11-01', 9)).goal?.cycle_start).toBe('2026-11-01')
    expect(dashboardActions(late, ...on('2026-11-01', 15)).goal).not.toBeNull()   // 9 Nov + 6
    expect(dashboardActions(late, ...on('2026-11-01', 16)).goal).toBeNull()
    expect(dashboardActions(late, ...on('2026-11-01', 18)).review).not.toBeNull() // 9 Nov + 9
    expect(dashboardActions(late, ...on('2026-11-01', 19)).review).toBeNull()
  })
  it("Kakeibo's very first row (no previous cycle) still counts from the cycle start", () => {
    const first = [rec('2026-11-01', { created_at: new Date(2026, 10, 15, 9).toISOString() })]
    expect(dashboardActions(first, ...on('2026-11-01', 15)).goal).toBeNull()
  })
  it('late recording creates no duplicate rows and keeps October reviewable', () => {
    const before = [rec('2026-10-01')]
    const plan = planCycleSync(before, { cycleStart: parseIso('2026-11-01') })!
    const after = applyPlan(before, plan)
    expect(after.filter(r => r.cycle_start === '2026-11-01')).toHaveLength(1)
    expect(after.find(r => r.cycle_start === '2026-10-01')!.cycle_end).toBe('2026-10-31')
    expect(planCycleSync(after, { cycleStart: parseIso('2026-11-01') })).toBeNull()
  })
})

describe('dashboardActions — day boundaries from the real cycle engine', () => {
  // Salary on 1 Nov (salary_date 1): payday is day 1.
  const at = (y: number, m: number, d: number) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(y, m, d, 12))
    const state = makeState({ transactions: [salary('2026-10-01'), salary('2026-11-01')], settings: { ...makeState().settings, salary_date: 1 } })
    const cycle = getCurrentFinancialCycle(state)
    const records = [rec('2026-10-01', { cycle_end: '2026-10-31' }), rec('2026-11-01')]
    return { cycle, a: dashboardActions(records, cycle, new Date()) }
  }
  it('payday is day 1 for both the engine and the reminder windows', () => {
    const { cycle, a } = at(2026, 10, 1)
    expect(cycle.currentDay).toBe(1)
    expect(a.review).not.toBeNull()
    expect(a.goal).not.toBeNull()
  })
  it('goal: shown through 7 Nov, gone on 8 Nov', () => {
    expect(at(2026, 10, 7).a.goal).not.toBeNull()
    expect(at(2026, 10, 7).cycle.currentDay).toBe(7)
    expect(at(2026, 10, 8).a.goal).toBeNull()
  })
  it('review: shown through 10 Nov, gone on 11 Nov', () => {
    expect(at(2026, 10, 10).a.review).not.toBeNull()
    expect(at(2026, 10, 11).a.review).toBeNull()
  })
})

// ── Review lifecycle ─────────────────────────────────────────────────────────

describe('nextReviewState', () => {
  const now = '2026-11-01T10:00:00Z'

  it('saving a pending review completes it with the trimmed note', () => {
    expect(nextReviewState(rec('a'), { kind: 'save', note: '  Cook more  ' }, now))
      .toEqual({ review_status: 'completed', reflection_note: 'Cook more', reviewed_at: now })
  })

  it('skipping a pending review marks it skipped', () => {
    expect(nextReviewState(rec('a'), { kind: 'skip' }, now)).toEqual({ review_status: 'skipped', reviewed_at: now })
  })

  it('editing a completed reflection changes only the note — status and first completion kept, reminder not re-armed', () => {
    const done = rec('a', { review_status: 'completed', reflection_note: 'old', reviewed_at: 'first' })
    const patch = nextReviewState(done, { kind: 'save', note: 'new' }, now)
    expect(patch).toEqual({ reflection_note: 'new' })
    expect(patch).not.toHaveProperty('review_status')
  })

  it('clearing the note of a completed reflection keeps it completed', () => {
    const done = rec('a', { review_status: 'completed', reflection_note: 'old', reviewed_at: 'first' })
    expect(nextReviewState(done, { kind: 'save', note: '   ' }, now)).toEqual({ reflection_note: null })
  })

  it('writing a note on a skipped review completes it; an empty save leaves it skipped', () => {
    const skipped = rec('a', { review_status: 'skipped', reviewed_at: 'first' })
    expect(nextReviewState(skipped, { kind: 'save', note: 'x' }, now)).toEqual({ review_status: 'completed', reflection_note: 'x', reviewed_at: now })
    expect(nextReviewState(skipped, { kind: 'save', note: '' }, now)).toEqual({})
  })

  it('skip never downgrades a completed review', () => {
    expect(nextReviewState(rec('a', { review_status: 'completed' }), { kind: 'skip' }, now)).toEqual({})
  })

  it('acknowledging the lesson never touches the note or status', () => {
    const done = rec('a', { review_status: 'completed', reflection_note: 'keep me' })
    expect(nextReviewState(done, { kind: 'acknowledge' }, now)).toEqual({ lesson_acknowledged_at: now })
  })

  it('no action ever returns review_status null', () => {
    const states: KakeiboReflection[] = [rec('a'), rec('b', { review_status: 'skipped' }), rec('c', { review_status: 'completed' })]
    for (const r of states) for (const a of [{ kind: 'save', note: '' }, { kind: 'save', note: 'x' }, { kind: 'skip' }, { kind: 'acknowledge' }] as const) {
      const p = nextReviewState(r, a, now)
      if ('review_status' in p) expect(p.review_status).not.toBeNull()
    }
  })
})

// ── Cycle summary ────────────────────────────────────────────────────────────

describe('computeCycleSummary', () => {
  const FROM = '2026-09-28', TO = '2026-10-27'

  it('excludes opening balances, adjustments and transfers', () => {
    const state = makeState()
    const s = computeCycleSummary([
      tx({ transaction_date: '2026-10-01', transaction_type: 'opening_balance', amount: 90000 }),
      tx({ transaction_date: '2026-10-01', transaction_type: 'balance_adjustment', amount: 500 }),
      tx({ transaction_date: '2026-10-02', transaction_type: 'transfer', amount: 7000, to_account_id: 'acc-2' }),
      expense('2026-10-03', 300),
    ], state, FROM, TO)
    expect(s.spent).toBe(300)
    expect(s.income).toBe(0)
  })

  it('counts a card purchase once and never its bill payment', () => {
    const state = makeState()
    const s = computeCycleSummary([
      expense('2026-10-05', 2000, 'cat-food', { credit_card_id: 'cc-1', from_account_id: null }),
      tx({ transaction_date: '2026-10-20', transaction_type: 'credit_card_payment', amount: 2000, credit_card_id: 'cc-1' }),
    ], state, FROM, TO)
    expect(s.spent).toBe(2000)
    expect(s.wants).toBe(2000)
  })

  it('nets a reimbursement off its expense and never counts it as income', () => {
    mockToday('2026-10-27')
    const state = makeState()
    const s = computeCycleSummary([
      salary('2026-09-28'),
      expense('2026-10-05', 1000, 'cat-food', { id: 'e1' }),
      tx({ transaction_date: '2026-10-09', transaction_type: 'income', amount: 400, reimbursement_for: 'e1' }),
    ], state, FROM, TO)
    expect(s.spent).toBe(600)
    expect(s.incomePrimary).toBe(50000)
    expect(s.incomeOther).toBe(0)
  })

  it('splits primary and other income', () => {
    mockToday('2026-10-27')
    const s = computeCycleSummary([
      salary('2026-09-28'),
      tx({ transaction_date: '2026-10-10', transaction_type: 'income', amount: 3000, category_id: 'cat-bonus' }),
    ], makeState({ settings: { ...makeState().settings, primary_income_category_id: 'cat-salary' } }), FROM, TO)
    expect(s.incomePrimary).toBe(50000)
    expect(s.incomeOther).toBe(3000)
  })

  it('splits ring-fenced life events out of Needs/Wants, and the parts sum to Spent', () => {
    const wedding: LifeEvent = {
      id: 'ev', name: 'Wedding', icon: 'ring', target_amount: null, start_date: null, end_date: null,
      excluded_from_budget: true, default_category_id: null, default_account_id: null, status: 'active',
    }
    const s = computeCycleSummary([
      expense('2026-10-01', 1500, 'cat-rent'),
      expense('2026-10-02', 700, 'cat-food'),
      expense('2026-10-03', 9000, 'cat-food', { event_id: 'ev' }),
      expense('2026-10-04', 250, 'cat-misc'),
      expense('2026-10-05', 100, null),
    ], makeState({ events: [wedding] }), FROM, TO)
    expect(s).toMatchObject({ needs: 1500, wants: 700, events: 9000, unclassified: 350 })
    expect(s.needs + s.wants + s.events + s.unclassified).toBe(s.spent)
  })

  it('savings = contributions + savings-bucket spend − withdrawals', () => {
    const s = computeCycleSummary([
      tx({ transaction_date: '2026-10-05', transaction_type: 'savings_contribution', amount: 5000 }),
      expense('2026-10-06', 2000, 'cat-gold'),
      tx({ transaction_date: '2026-10-20', transaction_type: 'savings_withdrawal', amount: 1000 }),
    ], makeState(), FROM, TO)
    expect(s.savedNet).toBe(6000)
    expect(s.spent).toBe(0)
  })

  it('ignores rows outside the range and reports an empty cycle', () => {
    const s = computeCycleSummary([expense('2026-09-27', 500), expense('2026-10-28', 500)], makeState(), FROM, TO)
    expect(s.rowCount).toBe(0)
    expect(kakeiboInsight(s, 5000, null)).toBeNull()
  })

  it('reads rows beyond the 200-row window once fetched; the loaded (edited) row wins', () => {
    const loaded = [expense('2026-10-20', 300, 'cat-food', { id: 'same' })]
    const fetched = [expense('2026-10-20', 999, 'cat-food', { id: 'same' }), expense('2026-09-30', 1200, 'cat-rent', { id: 'old' })]
    const s = computeCycleSummary(mergeLoadedWins(loaded, fetched), makeState(), FROM, TO)
    expect(s.wants).toBe(300)
    expect(s.needs).toBe(1200)
  })

  it('a transaction edit changes the summary — the stored note is not an input', () => {
    const r = rec(FROM, { cycle_end: TO, review_status: 'completed', reflection_note: 'Cook more' })
    const a = computeCycleSummary([expense('2026-10-02', 700)], makeState(), r.cycle_start, r.cycle_end!)
    const b = computeCycleSummary([expense('2026-10-02', 900)], makeState(), r.cycle_start, r.cycle_end!)
    expect([a.wants, b.wants]).toEqual([700, 900])
    expect(r.reflection_note).toBe('Cook more')
  })
})

describe('parity with Budget Strategy', () => {
  it("Kakeibo's Needs/Wants equal computeStrategyData's for the current cycle", () => {
    mockToday('2026-10-20')
    const state = makeState({
      transactions: [
        salary('2026-09-28'),
        expense('2026-10-01', 1500, 'cat-rent'),
        expense('2026-10-02', 700, 'cat-food'),
        expense('2026-10-03', 450, 'cat-food', { credit_card_id: 'cc-1', from_account_id: null }),
        tx({ transaction_date: '2026-10-04', transaction_type: 'commitment', amount: 2200, category_id: 'cat-rent' }),
        tx({ transaction_date: '2026-10-06', transaction_type: 'borrowing_repayment', amount: 900, category_id: 'cat-misc', is_credit: false }),
        tx({ transaction_date: '2026-10-07', transaction_type: 'credit_card_payment', amount: 450, credit_card_id: 'cc-1' }),
      ],
    })
    const d = derive(state)
    const strategy = computeStrategyData(state, d)!
    const s = computeCycleSummary(state.transactions, state, '2026-09-28', '2026-10-20')
    expect(s.needs).toBe(strategy.actuals.needs)
    expect(s.wants).toBe(strategy.actuals.wants)
  })
})

// ── Insight ──────────────────────────────────────────────────────────────────

describe('kakeiboInsight', () => {
  const base: CycleSummary = {
    from: 'a', to: 'b', incomePrimary: 50000, incomeOther: 0, income: 50000, spent: 20000,
    needs: 12000, wants: 8000, events: 0, unclassified: 0, savedNet: 6000, topCategories: [], rowCount: 10,
  }

  it('goal met', () => {
    expect(kakeiboInsight(base, 5000, null)).toBe('You moved ₹6,000 to savings — your full goal.')
  })
  it('goal not met', () => {
    expect(kakeiboInsight(base, 10000, null)).toBe('₹4,000 short of your ₹10,000 savings goal (60% reached).')
  })
  it('no goal: Wants change of ≥ 10% vs a contiguous previous cycle', () => {
    expect(kakeiboInsight(base, null, { ...base, wants: 10000 })).toBe('Wants spending was ₹2,000 lower than last cycle.')
  })
  it('no goal: small Wants change falls through to total spending', () => {
    expect(kakeiboInsight(base, null, { ...base, wants: 8200, spent: 19000 })).toBe('Total spending was ₹1,000 higher than last cycle.')
  })
  it('a goal of 0 never produces a percentage', () => {
    expect(kakeiboInsight(base, 0, null)).toBe('Not enough earlier data to compare yet.')
  })
  it('no previous cycle → says so rather than inventing a comparison', () => {
    expect(kakeiboInsight(base, null, null)).toBe('Not enough earlier data to compare yet.')
  })
  it('compares only with the contiguous predecessor', () => {
    const records = [rec('2026-08-28', { cycle_end: '2026-09-20' }), rec('2026-09-28', { cycle_end: '2026-10-27' })]
    expect(predecessorOf(records, records[1])).toBeNull()
    const contiguous = [rec('2026-08-28', { cycle_end: '2026-09-27' }), records[1]]
    expect(predecessorOf(contiguous, records[1])?.cycle_start).toBe('2026-08-28')
  })
})
