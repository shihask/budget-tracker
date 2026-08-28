import { describe, it, expect } from 'vitest'
import { derive } from '@/lib/data'
import { iso, TODAY } from '@/lib/utils'
import type { AppState, Category, Group, LifeEvent, Transaction, WeeklyBudgetScope } from '@/types'

/** The behaviour a wedding depends on: spend tagged to a ring-fenced event must
 *  not move weekly pacing, through EITHER branch of makeScopeFilter — the default
 *  Lifestyle-only branch and the explicit-scope branch. The default branch is the
 *  easy one to miss, because it short-circuits before the scope closure runs. */

const CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
]
const GROUPS: Group[] = [
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
]

const wedding = (excluded: boolean): LifeEvent => ({
  id: 'ev-wedding', name: "Brother's Wedding", icon: 'ring',
  target_amount: 200000, start_date: null, end_date: null,
  excluded_from_budget: excluded,
  default_category_id: null, default_account_id: null,
  status: 'active',
})

const expense = (id: string, amount: number, event_id?: string): Transaction => ({
  id,
  transaction_date: iso(TODAY),
  description: id,
  amount,
  transaction_type: 'expense',
  category_id: 'cat-food',
  from_account_id: 'acc-1',
  to_account_id: null,
  notes: null,
  created_at: iso(TODAY),
  ...(event_id ? { event_id } : {}),
})

function makeState(events: LifeEvent[], scope: WeeklyBudgetScope | null): AppState {
  return {
    accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: CATEGORIES,
    groups: GROUPS,
    credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: null,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      budget_period: 'monthly', monthly_start_date: 1, budget_mode: 'manual',
      income_pattern: 'monthly', monthly_salary: 50000,
      weekly_budget_scope: scope,
    },
    forecast_settings: { id: 'f1', enabled: false, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'b1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [],
    transactions: [expense('ordinary', 1000), expense('stage-decoration', 35000, 'ev-wedding')],
    goals: [], goal_contributions: [], user_achievements: [], habits: [],
    savings: [], planned_expenses: [],
    events,
  }
}

describe('weekly pacing vs ring-fenced life events', () => {
  it('default scope (Lifestyle only) excludes ring-fenced event spend', () => {
    expect(derive(makeState([wedding(true)], null)).weeklySpent).toBe(1000)
  })

  it('default scope counts event spend once the user opts in', () => {
    expect(derive(makeState([wedding(false)], null)).weeklySpent).toBe(36000)
  })

  it('explicit group scope excludes ring-fenced event spend', () => {
    const scope: WeeklyBudgetScope = { groups: ['Lifestyle'], categoryIds: [], transactionIds: [] }
    expect(derive(makeState([wedding(true)], scope)).weeklySpent).toBe(1000)
  })

  it('an explicitly scoped transaction id still loses to the ring fence', () => {
    // transactionIds is an opt-in override, but a ring-fenced event outranks it —
    // otherwise "track separately" would silently not hold.
    const scope: WeeklyBudgetScope = { groups: [], categoryIds: [], transactionIds: ['stage-decoration'] }
    expect(derive(makeState([wedding(true)], scope)).weeklySpent).toBe(0)
  })

  it('counts everything when there are no events at all', () => {
    expect(derive(makeState([], null)).weeklySpent).toBe(36000)
  })
})
