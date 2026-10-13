import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AppState, Category, Group, LifeEvent, Transaction } from '@/types'
import { computeCycleSummary } from '../lib/kakeibo'

/** Byte-identical guard for computeCycleSummary. The inline snapshot below was
 *  recorded BEFORE `eligibleSpendRows` was extracted for the pillars (v2); it
 *  must never change unless the spending definition is deliberately changed. */

const CATS: Category[] = [
  { id: 'c-salary', name: 'Salary', group_name: 'Income' },
  { id: 'c-free', name: 'Freelance', group_name: 'Income' },
  { id: 'c-groc', name: 'Groceries', group_name: 'Utilities' },
  { id: 'c-food', name: 'Restaurant', group_name: 'Lifestyle' },
  { id: 'c-course', name: 'Courses', group_name: 'Lifestyle' },
  { id: 'c-misc', name: 'Misc', group_name: 'Other' },
  { id: 'c-mapped', name: 'Gifts', group_name: 'Other', budget_bucket: 'wants' },
  { id: 'c-gold', name: 'Gold', group_name: 'Savings' },
  { id: 'c-emi', name: 'Car EMI', group_name: 'Obligations' },
]
const GROUPS: Group[] = [
  { id: 'g1', name: 'Income', is_system: true, type: 'income' },
  { id: 'g2', name: 'Utilities', type: 'essential' },
  { id: 'g3', name: 'Lifestyle', type: 'discretionary' },
  { id: 'g4', name: 'Other' },
  { id: 'g5', name: 'Savings', type: 'savings' },
  { id: 'g6', name: 'Obligations', type: 'commitment' },
]
const wedding: LifeEvent = {
  id: 'ev', name: 'Wedding', icon: 'ring', target_amount: null, start_date: null, end_date: null,
  excluded_from_budget: true, default_category_id: null, default_account_id: null, status: 'active',
}

let n = 0
const tx = (o: Partial<Transaction> & Pick<Transaction, 'transaction_date' | 'transaction_type' | 'amount'>): Transaction =>
  ({ id: o.id ?? `t${++n}`, description: 'x', category_id: null, from_account_id: 'a1', to_account_id: null, notes: null, created_at: o.transaction_date, ...o }) as Transaction

export const MIXED_FIXTURE: Transaction[] = [
  tx({ transaction_date: '2026-09-28', transaction_type: 'income', amount: 82000, category_id: 'c-salary' }),
  tx({ transaction_date: '2026-10-02', transaction_type: 'income', amount: 6000, category_id: 'c-free' }),
  tx({ transaction_date: '2026-10-01', transaction_type: 'opening_balance', amount: 50000 }),
  tx({ transaction_date: '2026-10-01', transaction_type: 'balance_adjustment', amount: 120 }),
  tx({ transaction_date: '2026-10-03', transaction_type: 'transfer', amount: 9000, to_account_id: 'a2' }),
  tx({ transaction_date: '2026-10-04', transaction_type: 'expense', amount: 3000, category_id: 'c-groc' }),
  tx({ transaction_date: '2026-10-05', transaction_type: 'expense', amount: 800, category_id: 'c-food' }),
  tx({ transaction_date: '2026-10-06', transaction_type: 'expense', amount: 1200, category_id: 'c-course' }),
  tx({ transaction_date: '2026-10-07', transaction_type: 'expense', amount: 2500, category_id: 'c-misc' }),
  tx({ transaction_date: '2026-10-08', transaction_type: 'expense', amount: 999.5, category_id: 'c-mapped' }),
  tx({ transaction_date: '2026-10-09', transaction_type: 'expense', amount: 4500, category_id: 'c-food', credit_card_id: 'cc', from_account_id: null }),
  tx({ transaction_date: '2026-10-20', transaction_type: 'credit_card_payment', amount: 4500, credit_card_id: 'cc' }),
  tx({ id: 'reimb-target', transaction_date: '2026-10-10', transaction_type: 'expense', amount: 1000, category_id: 'c-food' }),
  tx({ transaction_date: '2026-10-11', transaction_type: 'income', amount: 400, reimbursement_for: 'reimb-target' }),
  tx({ transaction_date: '2026-10-12', transaction_type: 'expense', amount: 15000, category_id: 'c-food', event_id: 'ev' }),
  tx({ transaction_date: '2026-10-13', transaction_type: 'expense', amount: 2000, category_id: 'c-gold' }),
  tx({ transaction_date: '2026-10-14', transaction_type: 'savings_contribution', amount: 5000 }),
  tx({ transaction_date: '2026-10-15', transaction_type: 'savings_withdrawal', amount: 700 }),
  tx({ transaction_date: '2026-10-16', transaction_type: 'commitment', amount: 7000, category_id: 'c-emi' }),
  tx({ transaction_date: '2026-10-17', transaction_type: 'borrowing_repayment', amount: 1500, category_id: 'c-misc', is_credit: false }),
  tx({ transaction_date: '2026-10-18', transaction_type: 'borrowing_repayment', amount: 2200, category_id: 'c-misc', is_credit: true }),
  tx({ transaction_date: '2026-10-19', transaction_type: 'borrowing', amount: 10000, category_id: 'c-misc' }),
  tx({ transaction_date: '2026-10-21', transaction_type: 'expense', amount: 250, category_id: null }),
  tx({ transaction_date: '2026-09-27', transaction_type: 'expense', amount: 777, category_id: 'c-food' }),
  tx({ transaction_date: '2026-10-28', transaction_type: 'expense', amount: 888, category_id: 'c-food' }),
]

export function mixedState(): AppState {
  return {
    accounts: [{ id: 'a1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: CATS, groups: GROUPS, credit_cards: [],
    settings: {
      id: 's', weekly_budget: 5000, emergency_fund: 0, salary_date: 28, track_credit_cards: true, track_borrowings: true,
      autopilot_enabled: false, income_pattern: 'monthly', primary_income_category_id: 'c-salary',
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'f', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'b', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions: MIXED_FIXTURE, goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [wedding], masters: [],
  } as AppState
}

afterEach(() => { vi.useRealTimers() })

describe('computeCycleSummary — byte-identical guard', () => {
  it('matches the pre-v2 snapshot over a large mixed fixture', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 27, 12))
    const s = computeCycleSummary(MIXED_FIXTURE, mixedState(), '2026-09-28', '2026-10-27')
    expect(JSON.stringify(s)).toMatchInlineSnapshot(`"{"from":"2026-09-28","to":"2026-10-27","incomePrimary":82000,"incomeOther":6000,"income":88000,"spent":37349.5,"needs":11500,"wants":8099.5,"events":15000,"unclassified":2750,"savedNet":6300,"topCategories":[{"name":"Car EMI","amount":7000},{"name":"Restaurant","amount":5900},{"name":"Misc","amount":4000}],"rowCount":19}"`)
  })
})
