import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AppState, Category, Group, KakeiboReflection, LifeEvent, Transaction, TransactionType } from '@/types'
import { parseIso } from '@/lib/utils'
import { computeCycleSummary, eligibleSpendRows, planCycleSync, applyPlan, emptyReflection } from '../lib/kakeibo'
import {
  resolvePillar, seedPillar, computePillarTotals, validatePillarSuggestions, mergeAiPillars, normaliseConfidence,
  insightNumbersAreGrounded, buildInsightFacts, categoriesNeedingAi, PILLARS,
  type CategoryPillarRow, type TxnPillarRow,
} from '../lib/pillars'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CATS: Category[] = [
  { id: 'c-salary', name: 'Salary', group_name: 'Income' },
  { id: 'c-groc', name: 'Groceries', group_name: 'Utilities' },
  { id: 'c-food', name: 'Restaurant', group_name: 'Lifestyle' },
  { id: 'c-course', name: 'Courses', group_name: 'Lifestyle' },
  { id: 'c-misc', name: 'Misc', group_name: 'Other' },
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

function makeState(transactions: Transaction[] = []): AppState {
  return {
    accounts: [{ id: 'a1', name: 'Bank', type: 'bank', current_balance: 100000, is_active: true }],
    categories: CATS, groups: GROUPS, credit_cards: [],
    settings: {
      id: 's', weekly_budget: 5000, emergency_fund: 0, salary_date: 28, track_credit_cards: true, track_borrowings: true,
      autopilot_enabled: false, income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'f', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'b', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions, goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [wedding], masters: [],
  } as AppState
}
const FROM = '2026-09-28', TO = '2026-10-27'
const noCat = new Map<string, CategoryPillarRow>()
const noTxn = new Map<string, TxnPillarRow>()
afterEach(() => { vi.useRealTimers() })

const sumPillars = (p: ReturnType<typeof computePillarTotals>) => PILLARS.reduce((s, k) => s + p.totals[k], 0) + p.needsReview

// ── Precedence ───────────────────────────────────────────────────────────────

describe('resolvePillar — precedence', () => {
  const t = tx({ id: 'row', transaction_date: '2026-10-01', transaction_type: 'expense', amount: 100, category_id: 'c-food' })
  const row = { t, bucket: 'wants' as const, cat: CATS[2] }

  it('seed: Wants → Optional, Needs → Survival, nothing else', () => {
    expect(seedPillar('wants')).toBe('optional')
    expect(seedPillar('needs')).toBe('survival')
    expect(seedPillar('savings')).toBeNull()
    expect(seedPillar(null)).toBeNull()
    expect(resolvePillar(row, noCat, noTxn)).toEqual({ pillar: 'optional', source: 'seed' })
  })
  it('AI category beats the seed', () => {
    const cat = new Map([['c-food', { category_id: 'c-food', pillar: 'culture' as const, source: 'ai' as const }]])
    expect(resolvePillar(row, cat, noTxn)).toEqual({ pillar: 'culture', source: 'ai' })
  })
  it("the user's category choice beats AI (stored as one row — the user's replaces it)", () => {
    const cat = new Map([['c-food', { category_id: 'c-food', pillar: 'survival' as const, source: 'user' as const }]])
    expect(resolvePillar(row, cat, noTxn)).toEqual({ pillar: 'survival', source: 'user' })
  })
  it('a transaction override beats everything', () => {
    const cat = new Map([['c-food', { category_id: 'c-food', pillar: 'survival' as const, source: 'user' as const }]])
    const over = new Map([['row', { transaction_id: 'row', pillar: 'unexpected' as const }]])
    expect(resolvePillar(row, cat, over)).toEqual({ pillar: 'unexpected', source: 'txn' })
  })
  it('no bucket and nothing stored → Needs review (null), never guessed', () => {
    expect(resolvePillar({ t, bucket: null, cat: CATS[4] }, noCat, noTxn)).toEqual({ pillar: null, source: null })
  })
})

// ── Totals & reconciliation ──────────────────────────────────────────────────

describe('computePillarTotals — reconciles with computeCycleSummary.spent', () => {
  it('pillars + Needs review equal Spent; card purchase once; reimbursement netted; transfers/system out', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 27, 12))
    const txns = [
      tx({ transaction_date: '2026-09-28', transaction_type: 'income', amount: 82000, category_id: 'c-salary' }),
      tx({ transaction_date: '2026-10-01', transaction_type: 'opening_balance', amount: 9999 }),
      tx({ transaction_date: '2026-10-02', transaction_type: 'transfer', amount: 5000, to_account_id: 'a2' }),
      tx({ transaction_date: '2026-10-03', transaction_type: 'expense', amount: 3000, category_id: 'c-groc' }),
      tx({ transaction_date: '2026-10-04', transaction_type: 'expense', amount: 4500, category_id: 'c-food', credit_card_id: 'cc', from_account_id: null }),
      tx({ transaction_date: '2026-10-20', transaction_type: 'credit_card_payment', amount: 4500, credit_card_id: 'cc' }),
      tx({ id: 'e1', transaction_date: '2026-10-05', transaction_type: 'expense', amount: 1000, category_id: 'c-food' }),
      tx({ transaction_date: '2026-10-06', transaction_type: 'income', amount: 400, reimbursement_for: 'e1' }),
      tx({ transaction_date: '2026-10-07', transaction_type: 'expense', amount: 2500, category_id: 'c-misc' }),
      tx({ transaction_date: '2026-10-08', transaction_type: 'expense', amount: 15000, category_id: 'c-food', event_id: 'ev' }),
      tx({ transaction_date: '2026-10-09', transaction_type: 'expense', amount: 2000, category_id: 'c-gold' }),
    ]
    const state = makeState(txns)
    const s = computeCycleSummary(txns, state, FROM, TO)
    const p = computePillarTotals(txns, state, FROM, TO, noCat, noTxn)
    expect(p.spent).toBe(s.spent)
    expect(sumPillars(p)).toBe(s.spent)
    expect(p.totals.survival).toBe(3000)
    expect(p.totals.optional).toBe(4500 + 600 + 15000)
    expect(p.needsReview).toBe(2500)
    expect(p.lifeEvents).toBe(15000)
    // Savings-bucket spend (Gold) is never in a pillar — it is question 2.
    expect(p.groups.some(g => g.categoryId === 'c-gold')).toBe(false)
  })

  it('holds exactly for randomised mixed cycles, whatever the stored pillars', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 27, 12))
    let seed = 42
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    const TYPES: TransactionType[] = ['expense', 'expense', 'expense', 'commitment', 'income', 'transfer', 'borrowing_repayment',
      'savings_contribution', 'savings_withdrawal', 'credit_card_payment', 'opening_balance', 'balance_adjustment', 'borrowing']
    for (let round = 0; round < 25; round++) {
      const txns: Transaction[] = []
      for (let i = 0; i < 120; i++) {
        const type = pick(TYPES)
        const day = 26 + Math.floor(rnd() * 34) // spills over both cycle edges
        const date = new Date(2026, 8, day)
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const amount = Math.round(rnd() * 500000) / 100
        txns.push(tx({
          id: `r${round}-${i}`, transaction_date: iso, transaction_type: type, amount,
          category_id: rnd() < 0.15 ? null : pick(CATS).id,
          credit_card_id: rnd() < 0.2 ? 'cc' : null,
          event_id: rnd() < 0.1 ? 'ev' : null,
          is_credit: rnd() < 0.5,
        }))
      }
      // A few reimbursements against random expenses.
      for (const e of txns.filter(t => t.transaction_type === 'expense').slice(0, 4)) {
        txns.push(tx({ transaction_date: e.transaction_date, transaction_type: 'income', amount: Math.round(e.amount * 50) / 100, reimbursement_for: e.id }))
      }
      const state = makeState(txns)
      const cat = new Map<string, CategoryPillarRow>()
      for (const c of CATS) if (rnd() < 0.5) cat.set(c.id, { category_id: c.id, pillar: pick(PILLARS), source: rnd() < 0.5 ? 'ai' : 'user' })
      const over = new Map<string, TxnPillarRow>()
      for (const t of txns) if (rnd() < 0.1) over.set(t.id, { transaction_id: t.id, pillar: pick(PILLARS) })

      const s = computeCycleSummary(txns, state, FROM, TO)
      const p = computePillarTotals(txns, state, FROM, TO, cat, over)
      expect(p.spent).toBeCloseTo(s.spent, 9)
      expect(sumPillars(p)).toBeCloseTo(s.spent, 9)
      expect(eligibleSpendRows(txns, state, FROM, TO).reduce((a, r) => a + r.amount, 0)).toBeCloseTo(s.spent, 9)
    }
  })

  it('counts exceptions and puts Needs-review categories first', () => {
    const txns = [
      tx({ id: 'a', transaction_date: '2026-10-01', transaction_type: 'expense', amount: 500, category_id: 'c-groc' }),
      tx({ id: 'b', transaction_date: '2026-10-02', transaction_type: 'expense', amount: 700, category_id: 'c-groc' }),
      tx({ id: 'c', transaction_date: '2026-10-03', transaction_type: 'expense', amount: 50, category_id: 'c-misc' }),
    ]
    const over = new Map([['b', { transaction_id: 'b', pillar: 'unexpected' as const }]])
    const p = computePillarTotals(txns, makeState(txns), FROM, TO, noCat, over)
    expect(p.groups[0].categoryId).toBe('c-misc')
    const groc = p.groups.find(g => g.categoryId === 'c-groc')!
    expect(groc.exceptions).toBe(1)
    expect(p.totals.unexpected).toBe(700)
    expect(p.totals.survival).toBe(500)
  })
})

// ── AI ───────────────────────────────────────────────────────────────────────

describe('AI suggestions', () => {
  it('validatePillarSuggestions drops bad indices, unknown pillars, low confidence and duplicates', () => {
    const ids = ['cat-a', 'cat-b', 'cat-c']
    expect(validatePillarSuggestions([
      { i: 0, pillar: 'culture', confidence: 85 },
      { i: 1, pillar: 'optional', confidence: '90' },
      { i: 2, pillar: 'survival', confidence: 0.75 },
      { i: 2, pillar: 'optional', confidence: 99 },      // duplicate → first wins
      { i: 3, pillar: 'survival', confidence: 99 },      // out of range
      { i: 0.5, pillar: 'survival', confidence: 99 },    // not an integer
      { i: 1, pillar: 'luxury', confidence: 99 },        // unknown pillar
    ], ids)).toEqual([
      { category_id: 'cat-a', pillar: 'culture' },
      { category_id: 'cat-b', pillar: 'optional' },
      { category_id: 'cat-c', pillar: 'survival' },
    ])
    expect(validatePillarSuggestions([{ i: 0, pillar: 'culture', confidence: 40 }], ids)).toEqual([])
    expect(validatePillarSuggestions('nonsense', ids)).toEqual([])
    expect(normaliseConfidence('0.85')).toBeCloseTo(85)
  })

  it('AI never overwrites a user choice (client mirror of the SQL upsert)', () => {
    const cur = new Map<string, CategoryPillarRow>([
      ['u', { category_id: 'u', pillar: 'survival', source: 'user' }],
      ['a', { category_id: 'a', pillar: 'optional', source: 'ai' }],
    ])
    const next = mergeAiPillars(cur, [
      { category_id: 'u', pillar: 'culture' }, { category_id: 'a', pillar: 'culture' }, { category_id: 'new', pillar: 'unexpected' },
    ])
    expect(next.get('u')).toEqual({ category_id: 'u', pillar: 'survival', source: 'user' })
    expect(next.get('a')?.pillar).toBe('culture')
    expect(next.get('new')).toEqual({ category_id: 'new', pillar: 'unexpected', source: 'ai' })
  })

  it('only unclassified categories are sent, with i equal to the array index; uncategorised spend never is', () => {
    const txns = [
      expenseOf('c-food', 100, 'Swiggy dinner'), expenseOf('c-course', 1200, 'Udemy course'),
      expenseOf('c-groc', 300, 'Milk'), expenseOf(null, 50, 'Tip'),
    ]
    const state = makeState(txns)
    const stored = new Map([['c-groc', { category_id: 'c-groc', pillar: 'survival' as const, source: 'user' as const }]])
    const p = computePillarTotals(txns, state, FROM, TO, stored, noTxn)
    const { request, ids } = categoriesNeedingAi(p, state, stored)
    expect(ids.sort()).toEqual(['c-course', 'c-food'])
    request.forEach((r, i) => expect(r.i).toBe(i))
    expect(request.every(r => r.samples.length <= 3 && r.samples.every(s => s.length <= 60))).toBe(true)
  })
})

function expenseOf(category_id: string | null, amount: number, description: string) {
  return tx({ transaction_date: '2026-10-05', transaction_type: 'expense', amount, category_id, description })
}

describe('insightNumbersAreGrounded', () => {
  const facts = { income_received: 82000, total_spent: 7500, optional_spent: 800, optional_share_of_spending_pct: 11, savings_goal: 5000, top_categories: 'Restaurant 5900' }
  it('accepts figures that are facts (with Indian grouping, rounding, k)', () => {
    expect(insightNumbersAreGrounded('You spent ₹7,500 this cycle, and Optional was only 11% of it.', facts)).toBe(true)
    expect(insightNumbersAreGrounded('Restaurant came to ₹5,900; your ₹5k goal is within reach.', facts)).toBe(true)
  })
  it('rejects an invented amount or percentage', () => {
    expect(insightNumbersAreGrounded('You could save ₹2,300 by cooking at home.', facts)).toBe(false)
    expect(insightNumbersAreGrounded('Optional was 35% of spending.', facts)).toBe(false)
  })
  it('ignores small counting words', () => {
    expect(insightNumbersAreGrounded('Try 2 no-spend days a week.', facts)).toBe(true)
  })
  it('the built facts let every stated share and change be grounded', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 27, 12))
    const txns = [expenseOf('c-food', 800, 'x'), expenseOf('c-groc', 3000, 'y')]
    const state = makeState(txns)
    const p = computePillarTotals(txns, state, FROM, TO, noCat, noTxn)
    const f = buildInsightFacts({ summary: computeCycleSummary(txns, state, FROM, TO), pillars: p, goal: 5000, inProgress: false, prevPillars: null })
    expect(f.optional_share_of_spending_pct).toBe(21)
    expect(insightNumbersAreGrounded('Optional was 21% of your ₹3,800 spending.', f)).toBe(true)
  })
})

// ── v1 sync guard for recorded past cycles ───────────────────────────────────

describe('planCycleSync — never stretches a recorded past cycle', () => {
  const rec = (start: string, o: Partial<KakeiboReflection> = {}) => ({ ...emptyReflection(start, `r-${start}`), ...o })
  it('a non-adjacent past cycle recorded from history is left alone on rollover', () => {
    // Jun 28–Jul 27 recorded later for a note; Sep 28 is the live open cycle.
    const records = [rec('2026-06-28', { cycle_end: '2026-07-27' }), rec('2026-09-28')]
    const plan = planCycleSync(records, { cycleStart: parseIso('2026-10-28') })
    expect(plan).toEqual({
      insert: { cycle_start: '2026-10-28' },
      setEnd: { cycle_start: '2026-09-28', expected_end: null, cycle_end: '2026-10-27' },
    })
    const after = applyPlan(records, plan!)
    expect(after.find(r => r.cycle_start === '2026-06-28')!.cycle_end).toBe('2026-07-27')
  })
  it('with only a past record before the current one, the current cycle is created and the past one untouched', () => {
    const records = [rec('2026-06-28', { cycle_end: '2026-07-27' }), rec('2026-09-28')]
    expect(planCycleSync(records, { cycleStart: parseIso('2026-09-28') })).toBeNull()
  })
})
