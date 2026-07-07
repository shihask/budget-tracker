import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  generateBudgetNotifications,
  generateCashHealthNotifications,
  generateBillNotifications,
  generateGoalNotifications,
  generateIncomeNotifications,
  getAppNotifications,
  isSnoozed,
  applyPositiveGuarantee,
} from '../notification-engine'
import type { Reminder } from '@/components/RemindersBar'
import { derive } from '../data'
import type { AppState, Transaction, Category, Group, Goal, AppNotification } from '@/types'

const SALARY_CAT_ID = 'cat-salary'

const BASE_CATEGORIES: Category[] = [
  { id: SALARY_CAT_ID, name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'cat-shopping', name: 'Shopping', group_name: 'Lifestyle' },
]

const BASE_GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
]

function makeTx(overrides: Partial<Transaction> & { transaction_date: string }): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    description: 'test',
    amount: 100,
    transaction_type: 'expense',
    category_id: 'cat-food',
    from_account_id: 'acc-1',
    to_account_id: null,
    notes: null,
    created_at: overrides.transaction_date,
    ...overrides,
  }
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: BASE_CATEGORIES,
    groups: BASE_GROUPS,
    credit_cards: [],
    settings: {
      id: 's1',
      weekly_budget: 5000,
      emergency_fund: 0,
      salary_date: 28,
      track_credit_cards: false,
      track_borrowings: true,
      autopilot_enabled: false,
      income_pattern: 'monthly',
      primary_income_category_id: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [],
    borrowings: [],
    transactions: [],
    goals: [],
    goal_contributions: [],
    savings: [],
    planned_expenses: [],
    ...overrides,
  }
}

function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const fakeNow = new Date(y, m - 1, d, 12, 0, 0)
  vi.useFakeTimers()
  vi.setSystemTime(fakeNow)
}

afterEach(() => {
  vi.useRealTimers()
})

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Emergency Fund',
    goal_type: 'savings',
    goal_amount: 10000,
    current_saved: 0,
    monthly_target: 1000,
    target_date: '2027-01-01',
    created_at: '2026-01-01T00:00:00.000Z',
    is_active: true,
    ...overrides,
  }
}

// ─── generateBudgetNotifications: pace ──────────────────────────────────────

describe('generateBudgetNotifications — weekly pace', () => {
  it('fires an overshoot warning when spending is well ahead of weekly pace', () => {
    // Thursday: 4/7 days elapsed (~57%). Spend 80% of budget by Thursday -> well ahead of pace,
    // but still under the 90% period-threshold rule so only the pace rule fires.
    mockToday('2026-01-08') // a Thursday
    const state = makeState({
      transactions: [
        makeTx({ transaction_date: '2026-01-05', amount: 1500 }),
        makeTx({ transaction_date: '2026-01-06', amount: 2500 }),
      ],
    })
    const d = derive(state)
    const notifications = generateBudgetNotifications(state, d)
    const pace = notifications.find(n => n.id.startsWith('budget_pace_'))
    expect(pace).toBeDefined()
    expect(pace!.priority).toBe('high')
    expect(pace!.projectedAmount).toBeGreaterThan(0)
  })

  it('does not fire the pace warning when spending is on track', () => {
    mockToday('2026-01-08')
    const state = makeState({
      transactions: [makeTx({ transaction_date: '2026-01-06', amount: 100 })],
    })
    const d = derive(state)
    const notifications = generateBudgetNotifications(state, d)
    expect(notifications.find(n => n.id.startsWith('budget_pace_'))).toBeUndefined()
  })
})

describe('generateBudgetNotifications — period threshold', () => {
  it('fires a non-dismissible Critical notification once spend crosses 100% of budget', () => {
    mockToday('2026-01-05')
    const state = makeState({
      transactions: [makeTx({ transaction_date: '2026-01-05', amount: 6000 })],
    })
    // derive()'s weeklySpent/weeklyPct are computed against the module-level TODAY
    // constant in utils.ts (evaluated once at import time), which vi.setSystemTime()
    // does not retroactively change — a pre-existing characteristic of data.ts,
    // unrelated to this notification work. Override the two fields this rule reads
    // directly so the test exercises the rule's logic rather than that quirk.
    const d = { ...derive(state), weeklySpent: 6000, weeklyBudget: 5000 }
    const notifications = generateBudgetNotifications(state, d)
    const exceeded = notifications.find(n => n.id.startsWith('budget_period_alert_'))
    expect(exceeded).toBeDefined()
    expect(exceeded!.priority).toBe('critical')
    expect(exceeded!.dismissible).toBe(false)
  })
})

// ─── generateCashHealthNotifications ────────────────────────────────────────

describe('generateCashHealthNotifications', () => {
  it('fires Critical exactly when realFreeMoney <= 0 (cashHealth shortfall)', () => {
    mockToday('2026-01-05')
    const state = makeState({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100, is_active: true }],
      settings: { ...makeState().settings, emergency_fund: 500 },
    })
    const d = derive(state)
    expect(d.cashHealth?.status).toBe('shortfall')
    const notifications = generateCashHealthNotifications(state, d)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].priority).toBe('critical')
    expect(notifications[0].dismissible).toBe(false)
  })

  it('never emits both a shortfall and a healthy/positive notification together', () => {
    mockToday('2026-01-05')
    const state = makeState()
    const d = derive(state)
    expect(d.cashHealth?.status).toBe('healthy')
    const notifications = generateCashHealthNotifications(state, d)
    expect(notifications.every(n => n.priority !== 'critical')).toBe(true)
  })
})

// ─── generateBillNotifications ──────────────────────────────────────────────

describe('generateBillNotifications', () => {
  it('maps a due-today reminder to a Critical, non-dismissible notification', () => {
    mockToday('2026-01-05')
    const state = makeState()
    const d = derive(state)
    const reminders: Reminder[] = [{
      id: 'cm-x-2026-01', type: 'commitment_due', title: 'Rent due soon',
      subtitle: '₹10,000 · 5th every month', daysLeft: 0, urgent: true, warning: true,
    }]
    const notifications = generateBillNotifications(state, d, reminders)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].priority).toBe('critical')
    expect(notifications[0].dismissible).toBe(false)
    expect(notifications[0].id).toBe('cm-x-2026-01')
  })

  it('maps an urgent (<=3 day) reminder to High and a merely-warning reminder to Medium', () => {
    mockToday('2026-01-05')
    const state = makeState()
    const d = derive(state)
    const reminders: Reminder[] = [
      { id: 'cc-due-1', type: 'credit_card_due', title: 'Card due', subtitle: 'Billed: ₹1,000', daysLeft: 2, urgent: true, warning: true },
      { id: 'cc-due-2', type: 'credit_card_due', title: 'Card due', subtitle: 'Billed: ₹1,000', daysLeft: 6, urgent: false, warning: true },
    ]
    const notifications = generateBillNotifications(state, d, reminders)
    expect(notifications.find(n => n.id === 'cc-due-1')!.priority).toBe('high')
    expect(notifications.find(n => n.id === 'cc-due-2')!.priority).toBe('medium')
  })
})

// ─── generateGoalNotifications ───────────────────────────────────────────────

describe('generateGoalNotifications', () => {
  it('fires "reached" exactly at >=100% and not before', () => {
    mockToday('2026-01-05')
    const state = makeState()
    const d = derive(state)

    const almost = generateGoalNotifications(makeState({ goals: [makeGoal({ current_saved: 9999 })] }), d)
    expect(almost.find(n => n.id === 'goal_goal-1_reached')).toBeUndefined()

    const reached = generateGoalNotifications(makeState({ goals: [makeGoal({ current_saved: 10000 })] }), d)
    expect(reached.find(n => n.id === 'goal_goal-1_reached')).toBeDefined()
    void state
  })

  it('never fires "behind pace" for a completed goal (structurally exclusive per goal)', () => {
    mockToday('2026-01-05')
    const state = makeState({ goals: [makeGoal({ current_saved: 10000 })] })
    const d = derive(state)
    const notifications = generateGoalNotifications(state, d)
    expect(notifications.some(n => n.id.startsWith('goal_goal-1_behind_'))).toBe(false)
  })
})

// ─── generateIncomeNotifications — suppression ─────────────────────────────

describe('generateIncomeNotifications', () => {
  it('never fires "salary expected" on the same day salary was received', () => {
    mockToday('2026-01-28')
    const state = makeState({
      settings: { ...makeState().settings, salary_date: 28 },
      transactions: [makeTx({ transaction_date: '2026-01-28', transaction_type: 'income', amount: 50000, category_id: SALARY_CAT_ID })],
    })
    const d = derive(state)
    const notifications = generateIncomeNotifications(state, d)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].id).toBe('income_salary_received_2026-01-28')
    expect(notifications.some(n => n.id.startsWith('income_salary_expected_'))).toBe(false)
  })
})

// ─── Snooze filter ───────────────────────────────────────────────────────────

describe('isSnoozed', () => {
  it('hides an id until its stored timestamp passes', () => {
    const now = Date.now()
    const map = { 'some-id': now + 100000 }
    expect(isSnoozed('some-id', map)).toBe(true)
    expect(isSnoozed('some-id', { 'some-id': now - 1000 })).toBe(false)
    expect(isSnoozed('unrelated-id', map)).toBe(false)
  })
})

// ─── applyPositiveGuarantee (pipeline stage, tested directly) ──────────────

function makeNotif(overrides: Partial<AppNotification> & Pick<AppNotification, 'id' | 'priority'>): AppNotification {
  return {
    domain: 'budget', tone: 'warning', title: 't', message: 'm',
    createdAt: '2026-01-01', dismissible: true,
    ...overrides,
  }
}

describe('applyPositiveGuarantee', () => {
  it('does not force a positive slot when a Critical notification would otherwise be pushed out', () => {
    // 8 non-positive items (fills DEFAULT_LIMIT) + 1 critical + 1 positive that would
    // otherwise be cut off by the top-N limit.
    const sorted = [
      makeNotif({ id: 'crit', priority: 'critical' }),
      ...Array.from({ length: 8 }, (_, i) => makeNotif({ id: `high-${i}`, priority: 'high' })),
      makeNotif({ id: 'pos', priority: 'positive' }),
    ]
    const result = applyPositiveGuarantee(sorted)
    // unchanged — critical present, so the guarantee must not kick in
    expect(result.slice(0, 8).some(n => n.priority === 'positive')).toBe(false)
  })

  it('guarantees one positive slot in the visible set when only warnings (no Critical) are present', () => {
    const sorted = [
      ...Array.from({ length: 8 }, (_, i) => makeNotif({ id: `high-${i}`, priority: 'high' })),
      makeNotif({ id: 'pos', priority: 'positive' }),
    ]
    const result = applyPositiveGuarantee(sorted)
    expect(result.slice(0, 8).some(n => n.id === 'pos')).toBe(true)
  })

  it('leaves the list untouched when there is nothing to guarantee against (no warnings present)', () => {
    const sorted = [makeNotif({ id: 'pos', priority: 'positive' })]
    expect(applyPositiveGuarantee(sorted)).toEqual(sorted)
  })
})

// ─── getAppNotifications pipeline — snooze end-to-end ──────────────────────

describe('getAppNotifications — snooze end-to-end', () => {
  it('a Critical notification stays visible even if snoozed; a non-critical one is hidden', () => {
    mockToday('2026-01-05')
    const state = makeState({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100, is_active: true }],
      settings: { ...makeState().settings, emergency_fund: 500 },
    })
    const d = derive(state)
    const withoutSnooze = getAppNotifications(state, d, [], {})
    const criticalId = withoutSnooze.find(n => n.priority === 'critical')!.id

    const withSnooze = getAppNotifications(state, d, [], { [criticalId]: Date.now() + 999999 })
    expect(withSnooze.some(n => n.id === criticalId)).toBe(true)

    const reminders: Reminder[] = [{ id: 'cm-y-2026-01', type: 'commitment_due', title: 'Rent due', subtitle: '₹1,000', daysLeft: 6, urgent: false, warning: true }]
    const withoutBillSnooze = getAppNotifications(state, d, reminders, {})
    expect(withoutBillSnooze.some(n => n.id === 'cm-y-2026-01')).toBe(true)
    const withBillSnooze = getAppNotifications(state, d, reminders, { 'cm-y-2026-01': Date.now() + 999999 })
    expect(withBillSnooze.some(n => n.id === 'cm-y-2026-01')).toBe(false)
  })
})
