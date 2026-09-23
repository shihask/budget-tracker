import { describe, it, expect, vi, afterEach } from 'vitest'
import { derive } from '../data'
import {
  obligationTier, billRunway, pickDecision, affordVerdict, buildCfoSnapshot, buildMonthStory,
  positionHeadline, inr, type CfoSnapshot, type CfoObligation,
} from '../cfo-snapshot'
import type { AppState, Transaction, Category, Group, Commitment, Savings } from '@/types'

/* ── Pure pieces ─────────────────────────────────────────────────────────── */

const ob = (o: Partial<CfoObligation> & Pick<CfoObligation, 'date' | 'amount' | 'source'>): CfoObligation => ({
  title: o.title ?? `${o.source} item`,
  tier: obligationTier({ source: o.source, is_prized: undefined }),
  ...o,
})

function makeSnap(o: Partial<CfoSnapshot> = {}): CfoSnapshot {
  const obligations = o.obligations ?? []
  const cardTotal = obligations.filter(x => x.tier === 'card').reduce((s, x) => s + x.amount, 0)
  const fixedTotal = obligations.filter(x => x.tier === 'fixed').reduce((s, x) => s + x.amount, 0)
  const flexibleTotal = obligations.filter(x => x.tier === 'flexible').reduce((s, x) => s + x.amount, 0)
  const liquidCash = o.liquidCash ?? 10000
  const emergencyFund = o.emergencyFund ?? 0
  const mandatoryTotal = cardTotal + fixedTotal
  const freeMoney = liquidCash - emergencyFund - mandatoryTotal
  return {
    liquidCash, accounts: [], emergencyFund,
    nextIncomeDate: '2026-10-23', incomeLabel: 'salary',
    obligations, cardTotal, fixedTotal, mandatoryTotal, flexibleTotal,
    freeMoney, fundingGap: Math.max(0, -freeMoney), afterSavings: freeMoney - flexibleTotal,
    runway: billRunway(liquidCash - emergencyFund, obligations.filter(x => x.tier !== 'flexible')),
    postIncomeRisk: null,
    weekly: { budget: 1100, spent: 21296, over: 20196, left: 0, periodLabel: 'this week', topCats: [] },
    cardDebt: 0, confidence: 'exact',
    ...o,
  }
}

describe('obligationTier — the one mandatory/flexible rule', () => {
  it('classifies every forecast source', () => {
    expect(obligationTier({ source: 'card' })).toBe('card')
    expect(obligationTier({ source: 'commitment' })).toBe('fixed')
    expect(obligationTier({ source: 'borrowing' })).toBe('fixed')
    expect(obligationTier({ source: 'saving' })).toBe('flexible')
    expect(obligationTier({ source: 'planned' })).toBe('flexible')
  })
  it('treats a prized chit as a debt', () => {
    expect(obligationTier({ source: 'saving', is_prized: true })).toBe('fixed')
    expect(obligationTier({ source: 'saving', is_prized: false })).toBe('flexible')
  })
})

describe('billRunway', () => {
  it('finds the first uncovered bill and what is missing for it', () => {
    const r = billRunway(2417, [
      ob({ date: '2026-10-08', amount: 39706, source: 'card', title: 'Federal RuPay bill' }),
      ob({ date: '2026-10-04', amount: 37276, source: 'card', title: 'Axis Visa bill' }),
    ])
    expect(r.runsShortOn).toBe('2026-10-04')
    expect(r.obligation?.title).toBe('Axis Visa bill')
    expect(r.missing).toBe(34859)
  })
  it('walks bills in order and reports the later shortfall', () => {
    const r = billRunway(50000, [
      ob({ date: '2026-10-04', amount: 37276, source: 'card' }),
      ob({ date: '2026-10-08', amount: 39706, source: 'card' }),
    ])
    expect(r.runsShortOn).toBe('2026-10-08')
    expect(r.missing).toBe(39706 - (50000 - 37276))
  })
  it('breaks a same-day tie card → borrowing → commitment', () => {
    const r = billRunway(100, [
      ob({ date: '2026-10-04', amount: 500, source: 'commitment' }),
      ob({ date: '2026-10-04', amount: 500, source: 'borrowing', title: 'Repay Munshid' }),
      ob({ date: '2026-10-04', amount: 500, source: 'card' }),
    ])
    expect(r.obligation?.source).toBe('card')
  })
  it('is null when every bill is covered', () => {
    expect(billRunway(100000, [ob({ date: '2026-10-04', amount: 500, source: 'card' })]).runsShortOn).toBeNull()
  })
  it('counts a negative start (emergency fund above cash) as nothing available', () => {
    expect(billRunway(-5000, [ob({ date: '2026-10-04', amount: 500, source: 'card' })]).missing).toBe(500)
  })
})

describe('pickDecision', () => {
  it('says what is needed when the earliest bill is not covered', () => {
    const d = pickDecision(makeSnap({
      liquidCash: 2417,
      obligations: [ob({ date: '2026-10-04', amount: 37276, source: 'card', title: 'Axis Visa bill' })],
    }))
    expect(d.kind).toBe('need')
    expect(d.title).toBe(`You need ${inr(34859)} before 4 Oct to pay your Axis Visa bill.`)
    expect(d.reason).toMatch(/interest/)
  })
  it('says pay when covered', () => {
    const d = pickDecision(makeSnap({
      liquidCash: 100000,
      obligations: [ob({ date: '2026-10-04', amount: 37276, source: 'card', title: 'Axis Visa bill' })],
    }))
    expect(d.kind).toBe('pay')
    expect(d.title).toBe(`Pay your Axis Visa bill of ${inr(37276)} before 4 Oct.`)
  })
  it('never picks a flexible saving as the bill to pay', () => {
    const d = pickDecision(makeSnap({
      liquidCash: 100000,
      obligations: [
        ob({ date: '2026-10-01', amount: 2500, source: 'saving', title: 'SIP' }),
        ob({ date: '2026-10-10', amount: 12000, source: 'commitment', title: 'Home Loan EMI' }),
      ],
    }))
    expect(d.obligation?.title).toBe('Home Loan EMI')
    expect(d.title).toBe(`Pay Home Loan EMI ${inr(12000)} before 10 Oct.`)
  })
  it('suggests pausing savings when only flexible items overflow', () => {
    const d = pickDecision(makeSnap({
      liquidCash: 3000,
      obligations: [
        ob({ date: '2026-10-01', amount: 2500, source: 'saving', title: 'SIP' }),
        ob({ date: '2026-10-05', amount: 5000, source: 'saving', title: 'Gold scheme' }),
      ],
    }))
    expect(d.kind).toBe('pause-savings')
    expect(d.reason).toContain('Gold scheme')
  })
  it('is clear when nothing is due', () => {
    expect(pickDecision(makeSnap({ liquidCash: 30000 })).kind).toBe('clear')
  })
  it('names the person for a repayment', () => {
    const d = pickDecision(makeSnap({
      liquidCash: 100,
      obligations: [ob({ date: '2026-10-04', amount: 5076, source: 'borrowing', title: 'Repay Munshid' })],
    }))
    expect(d.title).toBe(`You need ${inr(4976)} before 4 Oct to repay Munshid.`)
  })
})

describe('Free money excludes flexible savings', () => {
  it('keeps savings out of free money but in after-savings', () => {
    const s = makeSnap({
      liquidCash: 54482, emergencyFund: 20000,
      obligations: [
        ob({ date: '2026-10-04', amount: 75276, source: 'card' }),
        ob({ date: '2026-10-10', amount: 2500, source: 'saving' }),
      ],
    })
    expect(s.freeMoney).toBe(54482 - 20000 - 75276)
    expect(s.afterSavings).toBe(s.freeMoney - 2500)
    expect(positionHeadline(s)).toBe(`You're short by ${inr(40794)} before your salary.`)
  })
})

describe('affordVerdict — buffer scales with free money', () => {
  it('uses the ₹2,000 floor for small free money', () => {
    const v = affordVerdict(makeSnap({ liquidCash: 8000 }), 7000)
    expect(v.buffer).toBe(2000)
    expect(v.verdict).toBe('tight')
  })
  it('uses 10% of free money for large free money', () => {
    const v = affordVerdict(makeSnap({ liquidCash: 150000 }), 8000)
    expect(v.buffer).toBe(15000)
    expect(v.after).toBe(142000)
    expect(v.verdict).toBe('yes')
  })
  it('is no when it breaks free money', () => {
    const v = affordVerdict(makeSnap({ liquidCash: 2417, obligations: [ob({ date: '2026-10-04', amount: 76982, source: 'card' })] }), 8000)
    expect(v.buffer).toBe(2000)
    expect(v.verdict).toBe('no')
  })
  it('is tight when it only works by skipping savings', () => {
    const v = affordVerdict(makeSnap({ liquidCash: 100000, obligations: [ob({ date: '2026-10-04', amount: 60000, source: 'saving' })] }), 50000)
    expect(v.pausesSavings).toBe(true)
    expect(v.verdict).toBe('tight')
  })
})

describe('inr', () => {
  it('uses Indian grouping and a real minus', () => {
    expect(inr(134440)).toBe('₹1,34,440')
    expect(inr(-57018)).toBe('−₹57,018')
  })
})

/* ── Integration with the forecast engine ────────────────────────────────── */

const SALARY_CAT = 'cat-salary'
const CATS: Category[] = [
  { id: SALARY_CAT, name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'cat-edu', name: 'Education', group_name: 'Commitment' },
]
const GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-lifestyle', name: 'Lifestyle', type: 'discretionary' },
]

function tx(o: Partial<Transaction> & { transaction_date: string }): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`, description: 'x', amount: 1000,
    transaction_type: 'expense', category_id: 'cat-food', from_account_id: 'acc-1',
    to_account_id: null, notes: null, created_at: o.transaction_date, ...o,
  }
}

function commitment(o: Partial<Commitment>): Commitment {
  return {
    id: `c-${Math.random()}`, name: 'Home Loan EMI', amount: 12000, remaining: 12000, category_id: null,
    is_recurring: true, frequency: 'monthly', due_day: 10, from_account_id: null, is_active: true,
    last_paid_date: null, total_installments: null, current_installment: null, due_date: null, ...o,
  }
}

function saving(o: Partial<Savings>): Savings {
  return {
    id: `s-${Math.random()}`, name: 'SIP', type: 'sip', amount: 2500, is_recurring: true, frequency: 'monthly',
    due_day: 5, total_installments: null, current_installment: 1, total_target: null, current_value: 0,
    maturity_date: null, interest_rate: null, from_account_id: null, category_id: null,
    last_contribution_date: null, paid_date: null, notes: null, is_active: true, is_prized: false, prize_month: null, ...o,
  }
}

function makeState(o: Partial<AppState> = {}): AppState {
  return {
    accounts: [
      { id: 'acc-1', name: 'Axis Bank', type: 'bank', current_balance: 30000, is_active: true },
      { id: 'acc-2', name: 'Cash', type: 'cash', current_balance: 2000, is_active: true },
    ],
    categories: CATS, groups: GROUPS, credit_cards: [],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 5000, salary_date: 23,
      track_credit_cards: false, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'none', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [],
    transactions: [tx({ transaction_date: '2026-09-23', amount: 50000, transaction_type: 'income', category_id: SALARY_CAT })],
    goals: [], goal_contributions: [], user_achievements: [], habits: [], savings: [],
    planned_expenses: [], events: [], masters: [],
    ...o,
  }
}

function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}

afterEach(() => { vi.useRealTimers() })

describe('buildCfoSnapshot', () => {
  it('builds the equation from pre-income bills, splitting mandatory and flexible', () => {
    mockToday('2026-09-24')
    const state = makeState({
      commitments: [commitment({ name: 'Home Loan EMI', amount: 12000, due_day: 10 })],
      savings: [saving({ name: 'SIP', amount: 2500, due_day: 5 })],
    })
    const s = buildCfoSnapshot(state, derive(state))
    expect(s.liquidCash).toBe(32000)
    expect(s.emergencyFund).toBe(5000)
    expect(s.nextIncomeDate).toBe('2026-10-23')
    expect(s.fixedTotal).toBe(12000)
    expect(s.flexibleTotal).toBe(2500)
    expect(s.freeMoney).toBe(32000 - 5000 - 12000)
    expect(s.afterSavings).toBe(s.freeMoney - 2500)
    expect(s.accounts.map(a => a.name)).toEqual(['Axis Bank', 'Cash'])
    expect(s.confidence).toBe('exact')
  })

  it('leaves bills on or after the income date out of the equation', () => {
    mockToday('2026-09-24')
    const state = makeState({ commitments: [commitment({ name: 'Rent', amount: 9000, due_day: 23 })] })
    const s = buildCfoSnapshot(state, derive(state))
    expect(s.obligations.find(o => o.title === 'Rent')).toBeUndefined()
    expect(s.mandatoryTotal).toBe(0)
  })

  it('flags risk only when bills after income go deeper than the pre-income position', () => {
    mockToday('2026-09-24')
    const state = makeState({
      commitments: [commitment({ name: 'Car EMI', amount: 90000, remaining: 90000, is_recurring: false, due_day: null, due_date: '2026-10-24' })],
    })
    const s = buildCfoSnapshot(state, derive(state))
    expect(s.fundingGap).toBe(0)
    expect(s.postIncomeRisk?.date).toBe('2026-10-24')
    expect(s.postIncomeRisk!.balance).toBeLessThan(0)
  })

  it('is estimated when no income date is known', () => {
    mockToday('2026-09-24')
    const state = makeState({ transactions: [] , settings: { ...makeState().settings, salary_date: null } })
    expect(buildCfoSnapshot(state, derive(state)).confidence).toBe('estimated')
  })
})

describe('buildMonthStory', () => {
  it('states facts only, and is omitted below two facts', () => {
    mockToday('2026-09-24')
    const quiet = makeState()
    const dq = derive(quiet)
    const sq = buildCfoSnapshot(quiet, dq)
    expect(buildMonthStory(quiet, dq, pickDecision(sq))).toEqual([])

    const busy = makeState({
      transactions: [
        ...makeState().transactions,
        tx({ transaction_date: '2026-09-23', amount: 15000, transaction_type: 'borrowing', is_credit: true, category_id: null }),
        tx({ transaction_date: '2026-09-24', amount: 25000, category_id: 'cat-edu' }),
      ],
      commitments: [commitment({ name: 'Home Loan EMI', amount: 12000, due_day: 10 })],
    })
    const d = derive(busy)
    const story = buildMonthStory(busy, d, pickDecision(buildCfoSnapshot(busy, d)))
    expect(story).toEqual([
      `You borrowed ${inr(15000)} this cycle.`,
      `Your biggest outgoing was ${inr(25000)} for Education.`,
      'Your earliest pressure is Home Loan EMI due on 10 Oct.',
    ])
    for (const line of story) expect(line).not.toMatch(/\b(because|to fund|funded|so that|caused|due to)\b/)
  })
})
