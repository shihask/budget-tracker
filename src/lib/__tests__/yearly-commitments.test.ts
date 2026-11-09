import { describe, it, expect, vi, afterEach } from 'vitest'
import { getNextRecurringDueDate, paidForChoices, isPaidForCycle, coveredDue, itemDuesAround } from '@/lib/recurring'
import { getRemainingObligations } from '@/lib/obligations'
import { buildCashFlowForecast } from '@/lib/cashflow'
import { buildReminders } from '@/components/RemindersBar'
import { localIso } from '@/lib/utils'
import type { AppState, Commitment, DerivedMetrics } from '@/types'

// Yearly commitments: due on due_date's month/day every year (due_day stays null).
// Running example: bike insurance ₹12,000, renewal 8 Nov; salary on the 28th.

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const isos = (ds: Date[]) => ds.map(localIso)

const insurance = (o: Partial<Commitment> = {}): Commitment => ({
  id: 'cm-ins', name: 'Bike insurance', amount: 12000, remaining: 12000, category_id: null,
  is_recurring: true, frequency: 'yearly', due_day: null, due_date: '2026-11-08',
  from_account_id: null, is_active: true, last_paid_date: null, paid_through: null,
  total_installments: null, current_installment: 0, ...o,
})
const rent = (): Commitment => ({ ...insurance(), id: 'cm-rent', name: 'Rent', amount: 9000, remaining: 9000, frequency: 'monthly', due_day: 2, due_date: null })

function makeState(commitments: Commitment[]): AppState {
  return {
    accounts: [{ id: 'acc', name: 'Bank', type: 'bank', current_balance: 50000, is_active: true }],
    categories: [], groups: [], credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: 28,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments, borrowings: [], transactions: [], goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
  } as AppState
}

function mockToday(y: number, m: number, d: number) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}
afterEach(() => { vi.useRealTimers() })

describe('yearly schedule (recurring.ts)', () => {
  it('repeats due_date\'s month/day every year; 29 Feb falls on 28 Feb in other years', () => {
    expect(isos(itemDuesAround(insurance(), D(2026, 3, 1), 0, 2))).toEqual(['2026-11-08', '2027-11-08', '2028-11-08'])
    const leap = insurance({ due_date: '2024-02-29' })
    expect(isos(itemDuesAround(leap, D(2027, 1, 1), 0, 1))).toEqual(['2027-02-28', '2028-02-29'])
  })

  it('next due: this year\'s until it passes or is paid, then next year\'s', () => {
    expect(localIso(getNextRecurringDueDate(insurance(), D(2026, 11, 6))!)).toBe('2026-11-08')
    expect(localIso(getNextRecurringDueDate(insurance(), D(2026, 11, 10))!)).toBe('2027-11-08')
    expect(localIso(getNextRecurringDueDate(insurance({ paid_through: '2026-11-08' }), D(2026, 11, 6))!)).toBe('2027-11-08')
    // legacy row (no paid_through): paid in the due's calendar year covers it
    expect(localIso(getNextRecurringDueDate(insurance({ last_paid_date: '2026-11-05' }), D(2026, 11, 6))!)).toBe('2027-11-08')
  })

  it('without a due date there is no schedule', () => {
    const undated = insurance({ due_date: null })
    expect(getNextRecurringDueDate(undated, D(2026, 11, 6))).toBeNull()
    expect(paidForChoices(undated, null, D(2026, 11, 6), D(2026, 10, 28))).toBeNull()
    expect(itemDuesAround(undated, D(2026, 11, 6), 0, 2)).toEqual([])
  })

  it('Mark Paid offers this renewal first, and paying it closes the cycle', () => {
    const choice = paidForChoices(insurance(), null, D(2026, 11, 6), D(2026, 10, 28))!
    expect(localIso(choice.defaultDue)).toBe('2026-11-08')
    const paid = insurance({ paid_through: '2026-11-08', last_paid_date: '2026-11-06' })
    expect(isPaidForCycle(paid, paid.last_paid_date, D(2026, 11, 6), D(2026, 11, 27))).toBe(true)
    expect(localIso(coveredDue(paid, paid.last_paid_date)!)).toBe('2026-11-08')
  })

  it('a monthly schedule is unchanged', () => {
    expect(localIso(getNextRecurringDueDate({ frequency: 'monthly', due_day: 10 }, D(2026, 11, 6))!)).toBe('2026-11-10')
  })
})

describe('Bills & Obligations (getRemainingObligations)', () => {
  const commitmentsIn = (state: AppState) => getRemainingObligations(state).commitmentItems.map(i => i.name)

  it('counts the yearly bill only in the cycle its renewal falls in', () => {
    mockToday(2026, 11, 6)                    // cycle 28 Oct – 27 Nov, renewal 8 Nov
    expect(commitmentsIn(makeState([insurance(), rent()]))).toEqual(['Bike insurance', 'Rent'])
    mockToday(2027, 1, 6)                     // cycle 28 Dec – 27 Jan: no renewal
    expect(commitmentsIn(makeState([insurance(), rent()]))).toEqual(['Rent'])
  })

  it('not once paid, and not without a due date', () => {
    mockToday(2026, 11, 6)
    expect(commitmentsIn(makeState([insurance({ paid_through: '2026-11-08', last_paid_date: '2026-11-06' })]))).toEqual([])
    expect(commitmentsIn(makeState([insurance({ due_date: null })]))).toEqual([])
  })
})

describe('Cash Flow Forecast', () => {
  const forecastOf = (state: AppState) => buildCashFlowForecast(state, { availableBalance: 50000 } as DerivedMetrics)
  const insuranceEvents = (state: AppState) => forecastOf(state).projections
    .filter(p => p.event.title === 'Bike insurance').map(p => [p.event.date, p.event.amount])

  it('places the renewal on its date, once', () => {
    mockToday(2026, 11, 6)
    expect(insuranceEvents(makeState([insurance()]))).toEqual([['2026-11-08', 12000]])
  })

  it('skips a paid renewal, an undated bill, and a renewal past the horizon', () => {
    mockToday(2026, 11, 6)
    expect(insuranceEvents(makeState([insurance({ paid_through: '2026-11-08' })]))).toEqual([])
    expect(insuranceEvents(makeState([insurance({ due_date: null })]))).toEqual([])
    expect(insuranceEvents(makeState([insurance({ due_date: '2026-03-15' })]))).toEqual([])
  })
})

describe('reminders (in-app bar and notification bell)', () => {
  it('shows a yearly bill within 5 days of its renewal', () => {
    mockToday(2026, 11, 6)
    const [r, ...rest] = buildReminders(makeState([insurance()]))
    expect(rest).toEqual([])
    expect(r).toMatchObject({ type: 'commitment_due', title: 'Bike insurance due soon', subtitle: '₹12,000 · 8 Nov every year', daysLeft: 2, urgent: true })
  })

  it('nothing further out, nothing once paid', () => {
    mockToday(2026, 10, 20)
    expect(buildReminders(makeState([insurance()]))).toEqual([])
    mockToday(2026, 11, 6)
    expect(buildReminders(makeState([insurance({ paid_through: '2026-11-08' })]))).toEqual([])
  })
})
