import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildCashFlowForecast, FORECAST_PAGE_OPTIONS } from '@/lib/cashflow'
import type { AppState, Commitment, CreditCard, DerivedMetrics, Transaction } from '@/types'
import { balanceAtEndOf, forecastOnDate, forecastHorizonEnd } from './forecastOnDate'

// Today 5 Nov 2026 · ₹10,000 in the bank · a ₹2,000 repayment due on the 1st
// (1 Dec is inside the 30-day horizon, 1 Jan is not) · a card with an unbilled
// ₹3,000 purchase, which only the Cash Flow Forecast page projects.

const TODAY = '2026-11-05'
afterEach(() => { vi.useRealTimers() })
function mockToday() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
}

const repayment: Commitment = {
  id: 'c1', name: 'Loan repayment', amount: 2000, remaining: 20000, category_id: null,
  is_recurring: true, frequency: 'monthly', due_day: 1, from_account_id: null, is_active: true,
  last_paid_date: null, paid_through: '2026-11-01', total_installments: null, current_installment: null, due_date: null,
}
const card: CreditCard = {
  id: 'cc1', name: 'Axis Visa CC', last_four: '1234', credit_limit: 50000, cycle_start_day: 16,
  bill_day: 15, due_day: 5, current_balance: 3000, is_active: true,
} as CreditCard
const purchase = {
  id: 't1', transaction_date: '2026-10-25', transaction_type: 'expense', amount: 3000, credit_card_id: 'cc1',
  description: 'Shoes', category_id: null, from_account_id: null, to_account_id: null, notes: null, created_at: '2026-10-25',
} as Transaction

function makeState(o: { days?: number; withCard?: boolean } = {}): AppState {
  return {
    accounts: [{ id: 'a1', name: 'HDFC', type: 'bank', current_balance: 10000, is_active: true }],
    categories: [], groups: [],
    credit_cards: o.withCard ? [card] : [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: null,
      track_credit_cards: true, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: o.days ?? 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [repayment], borrowings: [], transactions: o.withCard ? [purchase] : [], goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
  } as unknown as AppState
}
const d = { availableBalance: 10000, emergencyFund: 0 } as DerivedMetrics

describe('forecastOnDate', () => {
  it('reads the balance at the end of the day asked, bills on that day included', () => {
    mockToday()
    const state = makeState()
    expect(forecastOnDate(state, d, '2026-11-30', TODAY).balance).toBe(10000)
    const dec1 = forecastOnDate(state, d, '2026-12-01', TODAY)
    expect(dec1.status).toBe('ok')
    expect(dec1.balance).toBe(8000)
    expect(dec1.events).toEqual([{ date: '2026-12-01', title: 'Loan repayment', amount: 2000, type: 'expense' }])
    expect(forecastOnDate(state, d, '2026-12-05', TODAY).balance).toBe(8000)
  })

  it('uses the Cash Flow Forecast page\'s options, so unbilled card spend counts', () => {
    mockToday()
    const state = makeState({ withCard: true })
    const page = buildCashFlowForecast(state, d, FORECAST_PAGE_OPTIONS)
    const dflt = buildCashFlowForecast(state, d)
    const date = forecastHorizonEnd(state, TODAY)
    expect(balanceAtEndOf(page, date)).not.toBe(balanceAtEndOf(dflt, date))
    expect(forecastOnDate(state, d, date, TODAY).balance).toBe(balanceAtEndOf(page, date))
  })

  it('never extrapolates past the horizon', () => {
    mockToday()
    const r = forecastOnDate(makeState(), d, '2027-01-05', TODAY)
    expect(r.status).toBe('beyond')
    expect(r.asOf).toBe('2026-12-05')
    expect(r.balance).toBe(8000)
  })

  it('a longer horizon reaches further', () => {
    mockToday()
    const r = forecastOnDate(makeState({ days: 60 }), d, '2027-01-02', TODAY)
    expect(r.status).toBe('ok')
    expect(r.balance).toBe(6000)
  })

  it('a past date has nothing to forecast', () => {
    mockToday()
    const r = forecastOnDate(makeState(), d, '2026-11-01', TODAY)
    expect(r.status).toBe('past')
    expect(r.events).toEqual([])
  })
})
