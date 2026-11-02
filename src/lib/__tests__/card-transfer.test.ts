import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cardTransferTotal, validateCardTransfer, availableCredit, unbilledAdvancePrincipal, unbilledCardAdvance,
  feeCategoryPlacement, isCardToBankTransfer, isCardTransferLeg, cardTransferId, cardTransferParts, FEE_CATEGORY_NAME,
} from '@/lib/card-transfer'
import { getCreditCardBilling } from '@/lib/credit-card'
import { buildStatements, getStatementTransactions } from '@/lib/credit-card-cycles'
import { buildCashFlowForecast } from '@/lib/cashflow'
import { txDeltas, applyDeltas } from '@/lib/transaction-deltas'
import { getMovementClass } from '@/lib/money-movement'
import { derive } from '@/lib/data'
import { computeStrategyData } from '@/lib/budget-strategy'
import { computeChallenge } from '@/lib/challenge'
import { buildCfoSnapshot, pickDecision } from '@/lib/cfo-snapshot'
import { thisMonthCardSpend } from '@/lib/credit-card-analytics'
import { TODAY, localIso } from '@/lib/utils'
import type { AppState, Category, CreditCard, DerivedMetrics, Group, NewTransactionInput, Transaction } from '@/types'

// Running example (the spec's acceptance scenario):
//   HDFC 20,000 · Axis outstanding 10,000 (billed on 15 Oct) · on 20 Oct ₹5,000 moved
//   to HDFC with a ₹126.05 fee · today 25 Oct.
// Axis: bill day 15, due day 5 → the 15 Oct statement is due 5 Nov.

const HDFC = 'acc-hdfc'
const AXIS = 'cc-axis'

const CATS: Category[] = [
  { id: 'cat-salary', name: 'Salary', group_name: 'Income' },
  { id: 'cat-food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'cat-fee', name: FEE_CATEGORY_NAME, group_name: 'Obligations' },
]
const GROUPS: Group[] = [
  { id: 'g-income', name: 'Income', is_system: true, type: 'income' },
  { id: 'g-life', name: 'Lifestyle', type: 'discretionary' },
  { id: 'g-util', name: 'Utilities', type: 'essential' },
  { id: 'g-obl', name: 'Obligations', type: 'commitment' },
  { id: 'g-transfer', name: 'Transfer', is_system: true, type: 'transfer' },
]

let seq = 0
function tx(o: Partial<Transaction> & Pick<Transaction, 'transaction_date' | 'transaction_type' | 'amount'>): Transaction {
  return {
    id: o.id ?? `tx-${++seq}`, description: 'test', category_id: null,
    from_account_id: null, to_account_id: null, notes: null, created_at: o.transaction_date,
    ...o,
  } as Transaction
}
// The shapes mp_execute_card_to_bank writes.
const advance = (date: string, amount: number, id = `adv-${++seq}`, card = AXIS) =>
  tx({ id, transaction_date: date, transaction_type: 'transfer', amount, credit_card_id: card, to_account_id: HDFC })
const fee = (date: string, amount: number, transferId: string, card = AXIS) =>
  tx({ transaction_date: date, transaction_type: 'expense', amount, credit_card_id: card, category_id: 'cat-fee', fee_for: transferId })
const purchase = (date: string, amount: number, card = AXIS) =>
  tx({ transaction_date: date, transaction_type: 'expense', amount, credit_card_id: card, category_id: 'cat-food' })
const cardPayment = (date: string, amount: number, card = AXIS) =>
  tx({ transaction_date: date, transaction_type: 'credit_card_payment', amount, credit_card_id: card, from_account_id: HDFC })
const bankTransfer = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'transfer', amount, from_account_id: HDFC, to_account_id: 'acc-cash' })
const bankSpend = (date: string, amount: number) =>
  tx({ transaction_date: date, transaction_type: 'expense', amount, from_account_id: HDFC, category_id: 'cat-food' })

const card = (o: Partial<CreditCard> = {}): CreditCard => ({
  id: AXIS, name: 'Axis Visa CC', last_four: '1234', credit_limit: 50000, cycle_start_day: 16,
  bill_day: 15, due_day: 5, current_balance: 10000, is_active: true, ...o,
})

function makeState(o: { bank?: number; cards?: CreditCard[]; txns?: Transaction[]; settings?: Partial<AppState['settings']>; accounts?: AppState['accounts'] } = {}): AppState {
  return {
    accounts: o.accounts ?? [
      { id: HDFC, name: 'HDFC Savings', type: 'bank', current_balance: o.bank ?? 20000, is_active: true },
      { id: 'acc-cash', name: 'Cash', type: 'cash', current_balance: 0, is_active: true },
    ],
    categories: CATS, groups: GROUPS,
    credit_cards: o.cards ?? [card()],
    settings: {
      id: 's1', weekly_budget: 5000, emergency_fund: 0, salary_date: null,
      track_credit_cards: true, track_borrowings: true, autopilot_enabled: false,
      income_pattern: 'monthly', primary_income_category_id: null,
      cycle_start_free_money: null, cycle_snapshot_key: null,
      ...o.settings,
    },
    forecast_settings: { id: 'fs1', enabled: true, days: 30, commitment_ids: null, savings_ids: null, salary_override: null, forecast_mode: 'planned' },
    budget_strategy_settings: { id: 'bs1', budget_strategy: 'balanced', custom_needs_pct: 50, custom_wants_pct: 30, custom_savings_pct: 20, budget_strategy_base: 'income' },
    commitments: [], borrowings: [], transactions: o.txns ?? [], goals: [], goal_contributions: [],
    user_achievements: [], habits: [], savings: [], planned_expenses: [], events: [], masters: [],
  } as AppState
}

function mockToday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}
const dayOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
afterEach(() => { vi.useRealTimers() })

/** The forecast exactly as derive() builds it (default options). */
function forecastOf(state: AppState, opts?: { includeUnbilledCards?: boolean }) {
  const available = state.accounts.filter(a => a.is_active).reduce((s, a) => s + a.current_balance, 0) - state.settings.emergency_fund
  return buildCashFlowForecast(state, { availableBalance: available } as DerivedMetrics, opts)
}
const advanceEvents = (state: AppState) => forecastOf(state).projections.filter(p => p.event.source === 'card-advance')

/** The running example after the transfer. */
function afterTransfer(extra: Transaction[] = [], bank = 25000, balance = 15126.05) {
  return makeState({ bank, cards: [card({ current_balance: balance })], txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1'), ...extra] })
}

// ── 9.1 Shared calculations ──────────────────────────────────────────────────

describe('cardTransferTotal / validateCardTransfer', () => {
  const st = makeState()
  const ok = { cardId: AXIS, toAccountId: HDFC, amount: 5000, fee: 126.05, date: '2026-10-20' }

  it('₹5,000 + ₹126.05 = ₹5,126.05 exactly', () => {
    expect(cardTransferTotal(5000, 126.05)).toBe(5126.05)
  })
  it('handles a zero fee, decimals that drift in floats, and large amounts', () => {
    expect(cardTransferTotal(5000, 0)).toBe(5000)
    expect(cardTransferTotal(0.1, 0.2)).toBe(0.3)
    expect(cardTransferTotal(999999.99, 0.01)).toBe(1000000)
  })
  it('accepts the running example', () => {
    const r = validateCardTransfer(ok, st)
    expect(r.errors).toEqual({})
    expect(r.total).toBe(5126.05)
    expect(r.overLimit).toBe(false)
  })
  it('rejects zero, negative and three-decimal amounts, and a negative fee', () => {
    expect(validateCardTransfer({ ...ok, amount: 0 }, st).errors.amount).toBeTruthy()
    expect(validateCardTransfer({ ...ok, amount: -5 }, st).errors.amount).toBeTruthy()
    expect(validateCardTransfer({ ...ok, amount: null }, st).errors.amount).toBeTruthy()
    expect(validateCardTransfer({ ...ok, amount: 10.005 }, st).errors.amount).toBeTruthy()
    expect(validateCardTransfer({ ...ok, fee: -1 }, st).errors.fee).toBeTruthy()
  })
  it('rejects an unknown or inactive card and a missing or card destination', () => {
    expect(validateCardTransfer({ ...ok, cardId: 'nope' }, st).errors.cardId).toBeTruthy()
    expect(validateCardTransfer(ok, makeState({ cards: [card({ is_active: false })] })).errors.cardId).toBeTruthy()
    expect(validateCardTransfer({ ...ok, toAccountId: '' }, st).errors.toAccountId).toBeTruthy()
    expect(validateCardTransfer({ ...ok, toAccountId: AXIS }, st).errors.toAccountId).toBeTruthy()
  })
  it('flags a charge over the available credit (allowed only after acknowledgement)', () => {
    const tight = makeState({ cards: [card({ credit_limit: 12000, current_balance: 10000 })] })
    const r = validateCardTransfer(ok, tight)
    expect(r.available).toBe(2000)
    expect(r.overLimit).toBe(true)
    expect(availableCredit(card({ credit_limit: 0 }))).toBeNull()
  })
})

describe('the pair from either leg', () => {
  const t = advance('2026-10-20', 5000, 'T1')
  const f = fee('2026-10-20', 126.05, 'T1')
  it('identifies both legs and nothing else', () => {
    expect(isCardToBankTransfer(t)).toBe(true)
    expect(isCardToBankTransfer(bankTransfer('2026-10-20', 100))).toBe(false)
    expect(isCardToBankTransfer(purchase('2026-10-20', 100))).toBe(false)
    expect(isCardTransferLeg(f)).toBe(true)
    expect(isCardTransferLeg(purchase('2026-10-20', 100))).toBe(false)
    expect(cardTransferId(f)).toBe('T1')
    expect(cardTransferId(t)).toBe('T1')
  })
  it('reassembles the operation and its card charge', () => {
    expect(cardTransferParts(f, [t, f])).toMatchObject({ transfer: t, fee: f, total: 5126.05 })
    expect(cardTransferParts(t, [t])).toMatchObject({ transfer: t, fee: null, total: 5000 })
    expect(cardTransferParts(purchase('2026-10-20', 1), [])).toBeNull()
  })
})

// ── 0.2 Balance signs ────────────────────────────────────────────────────────

describe('balance signs (the acceptance scenario)', () => {
  it('bank +5,000, card +5,126.05, net worth −126.05', () => {
    const st = makeState()
    const ids = new Set([AXIS])
    let next = applyDeltas(st.accounts, st.credit_cards, txDeltas({ transaction_type: 'transfer', amount: 5000, from_account_id: AXIS, to_account_id: HDFC } as NewTransactionInput, ids))
    next = applyDeltas(next.accounts, next.cards, txDeltas({ transaction_type: 'expense', amount: 126.05, from_account_id: AXIS } as NewTransactionInput, ids))
    const bank = next.accounts.find(a => a.id === HDFC)!.current_balance
    const out = next.cards[0].current_balance
    expect(bank).toBe(25000)
    expect(out).toBeCloseTo(15126.05, 2)
    expect((bank - 20000) - (out - 10000)).toBeCloseTo(-126.05, 2)
  })
})

// ── 9.3 Statements ───────────────────────────────────────────────────────────

describe('statement math', () => {
  const TODAY = dayOf('2026-10-25')

  it('both legs are unbilled charges; the old bill stays 10,000 (was 15,000 before transfers counted)', () => {
    const st = afterTransfer()
    const b = getCreditCardBilling(st.credit_cards[0], st.transactions, TODAY)
    expect(b.billedAmount).toBe(10000)
    expect(b.unbilledAmount).toBe(5126.05)
  })

  it('a bank-to-bank transfer never reaches a card statement', () => {
    const st = afterTransfer([bankTransfer('2026-10-21', 3000)])
    const b = getCreditCardBilling(st.credit_cards[0], st.transactions, TODAY)
    expect(b.unbilledAmount).toBe(5126.05)
  })

  it('a transfer dated ON the statement date is billed; the next day is unbilled', () => {
    const onBillDay = makeState({ cards: [card({ current_balance: 15000 })], txns: [advance('2026-10-15', 5000)] })
    expect(getCreditCardBilling(onBillDay.credit_cards[0], onBillDay.transactions, TODAY)).toMatchObject({ billedAmount: 15000, unbilledAmount: 0 })
    const dayAfter = makeState({ cards: [card({ current_balance: 15000 })], txns: [advance('2026-10-16', 5000)] })
    expect(getCreditCardBilling(dayAfter.credit_cards[0], dayAfter.transactions, TODAY)).toMatchObject({ billedAmount: 10000, unbilledAmount: 5000 })
  })

  it('partial payment clears the billed amount first; full payment clears everything', () => {
    const partial = afterTransfer([cardPayment('2026-10-24', 4000)], 21000, 11126.05)
    expect(getCreditCardBilling(partial.credit_cards[0], partial.transactions, TODAY)).toMatchObject({ billedAmount: 6000, unbilledAmount: 5126.05 })
    const full = afterTransfer([cardPayment('2026-10-24', 15126.05)], 9873.95, 0)
    expect(getCreditCardBilling(full.credit_cards[0], full.transactions, TODAY)).toMatchObject({ billedAmount: 0, unbilledAmount: 0 })
  })

  it('the statement that generates includes the principal and the fee exactly once', () => {
    // Nothing owed before: the 16 Oct–15 Nov window holds only the operation.
    const st = makeState({ cards: [card({ current_balance: 5126.05 })], txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1')] })
    const nov = buildStatements(st.credit_cards[0], st.transactions, 2, dayOf('2026-11-20'))
    const latest = nov[0]
    expect(latest.statementDate).toBe('2026-11-15')
    expect(latest.amount).toBe(5126.05)
    expect(getStatementTransactions(latest, st.transactions).map(t => t.amount).sort()).toEqual([126.05, 5000])
    expect(getCreditCardBilling(st.credit_cards[0], st.transactions, dayOf('2026-11-20'))).toMatchObject({ billedAmount: 5126.05, unbilledAmount: 0 })
  })

  it('a bill payment allocates against the statement without double counting', () => {
    const st = makeState({ cards: [card({ current_balance: 0 })], txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1'), cardPayment('2026-11-20', 5126.05)] })
    const latest = buildStatements(st.credit_cards[0], st.transactions, 2, dayOf('2026-11-25'))[0]
    expect(latest).toMatchObject({ amount: 5126.05, paid: 5126.05, remaining: 0, status: 'paid' })
  })

  it('ordinary purchases, card commitments and refunds are unchanged', () => {
    const st = makeState({
      cards: [card({ current_balance: 10000 + 800 + 1200 - 300 })],
      txns: [
        purchase('2026-10-18', 800),
        tx({ transaction_date: '2026-10-19', transaction_type: 'commitment', amount: 1200, credit_card_id: AXIS }),
        tx({ transaction_date: '2026-10-21', transaction_type: 'income', amount: 300, credit_card_id: AXIS, reimbursement_for: 'x' }),
      ],
    })
    // The 300 refund settles the 10,000 bill first, like a payment.
    expect(getCreditCardBilling(st.credit_cards[0], st.transactions, TODAY)).toMatchObject({ billedAmount: 9700, unbilledAmount: 2000 })
  })

  it('card spend analytics stays purchases-only (a cash-out is not spend)', () => {
    mockToday('2026-10-25')
    const st = afterTransfer([purchase('2026-10-22', 700)])
    expect(thisMonthCardSpend(st.transactions, dayOf('2026-10-25'))).toBe(826.05)
  })
})

// ── 0.1 / 9.1 The reserve ────────────────────────────────────────────────────

describe('unbilledCardAdvance — R = min(unbilled principal, unbilled amount)', () => {
  const TODAY = dayOf('2026-10-25')
  const reserveOf = (st: AppState, today = TODAY) => {
    const b = getCreditCardBilling(st.credit_cards[0], st.transactions, today)
    const P = unbilledAdvancePrincipal(st.credit_cards[0], st.transactions, b)
    const R = unbilledCardAdvance(st.credit_cards[0], st.transactions, b)
    return { b, P, R }
  }
  const invariants = ({ b, P, R }: ReturnType<typeof reserveOf>, balance: number) => {
    expect(R).toBeLessThanOrEqual(P)
    expect(R).toBeLessThanOrEqual(b.unbilledAmount + 1e-9)
    expect(R + b.billedAmount).toBeLessThanOrEqual(balance + 1e-9)
  }

  it('reserves the principal, never the fee', () => {
    const r = reserveOf(afterTransfer())
    expect(r).toMatchObject({ P: 5000, R: 5000 })
    invariants(r, 15126.05)
  })

  it('an early payment beyond the bill reduces it — principal last (convention A)', () => {
    // Nothing billed, ₹2,000 paid early: fee first, then principal → 3,126.05 principal left.
    const st = makeState({ bank: 23000, cards: [card({ current_balance: 3126.05 })], txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1'), cardPayment('2026-10-22', 2000)] })
    const r = reserveOf(st)
    expect(r.R).toBe(3126.05)
    invariants(r, 3126.05)
  })

  it('a payment that only clears the old bill leaves the reserve alone', () => {
    const r = reserveOf(afterTransfer([cardPayment('2026-10-24', 4000)], 21000, 11126.05))
    expect(r.R).toBe(5000)
    invariants(r, 11126.05)
  })

  it('full repayment and statement generation both release it', () => {
    expect(reserveOf(afterTransfer([cardPayment('2026-10-24', 15126.05)], 9873.95, 0)).R).toBe(0)
    const st = makeState({ cards: [card({ current_balance: 5126.05 })], txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1')] })
    expect(reserveOf(st, dayOf('2026-11-16')).R).toBe(0)
  })

  it('two advances + purchases + an early payment + a statement: never above principal, never double', () => {
    // Step 1 — 25 Oct: advances 5,000 and 3,000 (fees 100, 60) + purchases 2,000, all unbilled.
    const rows = [
      advance('2026-10-18', 5000, 'A1'), fee('2026-10-18', 100, 'A1'),
      advance('2026-10-22', 3000, 'A2'), fee('2026-10-22', 60, 'A2'),
      purchase('2026-10-23', 2000),
    ]
    const owed = 10000 + 5000 + 100 + 3000 + 60 + 2000           // 20,160
    const s1 = reserveOf(makeState({ cards: [card({ current_balance: owed })], txns: rows }))
    expect(s1).toMatchObject({ P: 8000, R: 8000 })
    invariants(s1, owed)

    // Step 2 — early payment 14,000: 10,000 clears the bill, 4,000 lowers unbilled to 6,160.
    const s2rows = [...rows, cardPayment('2026-10-24', 14000)]
    const s2 = reserveOf(makeState({ cards: [card({ current_balance: owed - 14000 })], txns: s2rows }))
    expect(s2.b).toMatchObject({ billedAmount: 0, unbilledAmount: 6160 })
    expect(s2.R).toBe(6160)                                       // principal last: fees + purchases paid first
    invariants(s2, owed - 14000)

    // Step 3 — the 15 Nov statement bills everything that was unbilled.
    const s3 = reserveOf(makeState({ cards: [card({ current_balance: owed - 14000 })], txns: s2rows }), dayOf('2026-11-16'))
    expect(s3.b).toMatchObject({ billedAmount: 6160, unbilledAmount: 0 })
    expect(s3.R).toBe(0)
    invariants(s3, owed - 14000)
  })
})

// ── 9.4 Forecast → realFreeMoney → Safe Daily Spend / Challenge ──────────────

describe('forecast: borrowed principal never becomes free money', () => {
  it('baseline 10,000 before the transfer; still 10,000 after it', () => {
    mockToday('2026-10-25')
    const before = forecastOf(makeState())                         // 20,000 − bill 10,000
    expect(before.lowestBalance).toBe(10000)
    const after = forecastOf(afterTransfer())                       // 25,000 − 5,000 held − 10,000
    expect(after.lowestBalance).toBe(10000)
    expect(advanceEvents(afterTransfer()).map(p => p.event)).toEqual([
      expect.objectContaining({ date: '2026-10-25', amount: 5000, type: 'expense', card_id: AXIS }),
    ])
  })

  it('spending ₹4,000 of it lowers free money by ₹4,000 — once', () => {
    mockToday('2026-10-25')
    const spent = forecastOf(afterTransfer([bankSpend('2026-10-23', 4000)], 21000))
    const noTransferSameSpend = forecastOf(makeState({ bank: 16000, txns: [bankSpend('2026-10-23', 4000)] }))
    expect(spent.lowestBalance).toBe(6000)
    expect(noTransferSameSpend.lowestBalance).toBe(6000)
  })

  it('the existing billed-bill event is unchanged and never doubles with the reserve', () => {
    mockToday('2026-10-25')
    const cardEvents = forecastOf(afterTransfer()).projections.filter(p => p.event.card_id === AXIS)
    expect(cardEvents.map(p => [p.event.source, p.event.amount, p.event.date])).toEqual([
      ['card-advance', 5000, '2026-10-25'],
      ['card', 10000, '2026-11-05'],
    ])
  })

  it('the Cash Flow page (unbilled on) shows the next bill instead — no reserve on top', () => {
    mockToday('2026-10-25')
    // The next bill (15 Nov statement) is due 5 Dec — inside a 60-day horizon.
    const st = afterTransfer()
    st.forecast_settings = { ...st.forecast_settings, days: 60 }
    const page = forecastOf(st, { includeUnbilledCards: true }).projections.map(p => p.event)
    expect(page.some(e => e.source === 'card-advance')).toBe(false)
    expect(page.find(e => e.title.endsWith('next bill'))?.amount).toBe(5126)
  })

  it('at statement generation the reserve hands over to the bill (fee included, no double)', () => {
    const st = makeState({ bank: 25000, cards: [card({ current_balance: 5126.05 })], txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1')] })
    mockToday('2026-10-25')
    expect(forecastOf(st).lowestBalance).toBe(20000)               // 25,000 − 5,000 held
    mockToday('2026-11-16')
    const billed = forecastOf(st)
    expect(billed.projections.filter(p => p.event.source === 'card-advance')).toEqual([])
    expect(billed.lowestBalance).toBe(25000 - 5126)                // the billed 5,126.05, due 5 Dec
  })

  it('an overdue statement and a fresh advance are both held today', () => {
    mockToday('2026-11-10')
    const events = forecastOf(afterTransfer()).projections.filter(p => p.event.card_id === AXIS).map(p => [p.event.source, p.event.date, p.event.amount])
    expect(events).toEqual([
      ['card', '2026-11-10', 10000],
      ['card-advance', '2026-11-10', 5000],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  })

  it('multiple cards each hold their own advance', () => {
    mockToday('2026-10-25')
    const st = makeState({
      bank: 28000,
      cards: [card({ current_balance: 5000 }), card({ id: 'cc-hdfc', name: 'HDFC CC', current_balance: 3000 })],
      txns: [advance('2026-10-20', 5000, 'X1'), advance('2026-10-21', 3000, 'X2', 'cc-hdfc')],
    })
    expect(advanceEvents(st).map(p => p.event.amount).sort()).toEqual([3000, 5000])
    expect(forecastOf(st).lowestBalance).toBe(20000)
  })

  it('card tracking off or an inactive card: no reserve (same gates as card bills)', () => {
    mockToday('2026-10-25')
    expect(advanceEvents(makeState({ ...{}, bank: 25000, cards: [card({ current_balance: 15126.05 })], txns: afterTransfer().transactions, settings: { track_credit_cards: false } }))).toEqual([])
    expect(advanceEvents(makeState({ bank: 25000, cards: [card({ current_balance: 15126.05, is_active: false })], txns: afterTransfer().transactions }))).toEqual([])
  })

  it('salary before the due date (existing rule, pinned): every post-salary event still subtracts', () => {
    mockToday('2026-11-16')
    // After the statement: 15,126.05 billed due 5 Dec; salary 50,000 on 1 Dec.
    const st = makeState({
      bank: 25000, cards: [card({ current_balance: 15126.05 })],
      txns: [advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1')],
      settings: { salary_date: 1, monthly_salary: 50000 },
    })
    const f = forecastOf(st)
    const kinds = f.projections.map(p => [p.event.source, p.event.date])
    expect(kinds).toContainEqual(['salary', '2026-12-01'])
    expect(kinds).toContainEqual(['card', '2026-12-05'])
    // Income settles first; the bill is covered by salary, so the low point is today.
    expect(f.lowestBalance).toBe(25000)
  })
})

describe('Safe Daily Spend and the Daily Challenge', () => {
  it('the challenge limit is identical before and after receiving the borrowed principal', () => {
    mockToday('2026-10-25')
    const before = makeState()
    const after = afterTransfer()
    const rfmBefore = derive(before).realFreeMoney
    const rfmAfter = derive(after).realFreeMoney
    expect(rfmAfter).toBe(rfmBefore)
    const chBefore = computeChallenge(before, 'medium', rfmBefore)
    const chAfter = computeChallenge(after, 'medium', rfmAfter)
    expect(chAfter.safeDailyLimit).toBe(chBefore.safeDailyLimit)
    expect(chAfter.targets).toEqual(chBefore.targets)
    // The challenge's recovery (yesterday's overspend carried into today) is untouched.
    expect([chAfter.recoveryAmount, chAfter.yesterdayOverspend]).toEqual([chBefore.recoveryAmount, chBefore.yesterdayOverspend])
    expect(derive(after).safeDailySpend).toBe(derive(before).safeDailySpend)
  })

  it('the fee is that day\'s spend; the transfer is not', () => {
    // challenge.ts reads the module-level TODAY (fixed at import), not the fake clock.
    const today = localIso(TODAY)
    const st = makeState({ bank: 25000, cards: [card({ current_balance: 15126.05 })], txns: [advance(today, 5000, 'T1'), fee(today, 126.05, 'T1')] })
    const ch = computeChallenge(st, 'medium', derive(st).realFreeMoney)
    expect(ch.spentToday).toBe(126.05)
  })
})

// ── Mint CFO ─────────────────────────────────────────────────────────────────

describe('Mint CFO', () => {
  it('holds the advance back from free money without listing it as a bill or deciding on it', () => {
    mockToday('2026-10-25')
    const before = buildCfoSnapshot(makeState(), derive(makeState()))
    const st = afterTransfer()
    const s = buildCfoSnapshot(st, derive(st))
    expect(s.cardAdvanceHeld).toBe(5000)
    expect(s.freeMoney).toBe(before.freeMoney)
    expect(s.obligations.some(o => o.source === 'card-advance')).toBe(false)
    expect(s.obligations.map(o => [o.source, o.amount])).toEqual(before.obligations.map(o => [o.source, o.amount]))
    expect(s.runway).toEqual(expect.objectContaining({ runsShortOn: before.runway.runsShortOn }))
    expect(pickDecision(s).title).toBe(pickDecision(before).title)
    expect(s.postIncomeRisk).toBeNull()
  })
})

// ── 9.5 Budget Strategy ──────────────────────────────────────────────────────

describe('Budget Strategy', () => {
  const withSalary = (txns: Transaction[], extra: Partial<AppState['settings']> = {}) =>
    makeState({ bank: 25000, cards: [card({ current_balance: 15126.05 })], txns: [tx({ transaction_date: '2026-09-28', transaction_type: 'income', amount: 50000, category_id: 'cat-salary', from_account_id: HDFC }), ...txns], settings: { salary_date: 28, monthly_salary: 50000, ...extra } })

  it('transfer excluded, fee counted once under Needs, bill payment excluded, income unchanged', () => {
    mockToday('2026-10-25')
    const st = withSalary([advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1'), cardPayment('2026-10-24', 5126.05)])
    const s = computeStrategyData(st, derive(st))!
    expect(s.actuals).toEqual({ needs: 126.05, wants: 0, savings: 0 })
    expect(s.categoryBreakdown.needs).toEqual([{ name: FEE_CATEGORY_NAME, amount: 126.05 }])
    expect(s.income).toBe(50000)
  })

  it('available_funds is unchanged by design (counts balances, as it already counts card debt)', () => {
    mockToday('2026-10-25')
    const base = { budget_strategy_base: 'available_funds' as const }
    const st = withSalary([advance('2026-10-20', 5000, 'T1'), fee('2026-10-20', 126.05, 'T1')])
    st.budget_strategy_settings = { ...st.budget_strategy_settings, ...base }
    expect(computeStrategyData(st, derive(st))!.income).toBe(derive(st).availableBalance)
  })
})

// ── 9.6 Mint movement classes ────────────────────────────────────────────────

describe('money movement', () => {
  it('principal is borrowed cash, the fee is an expense, bank transfers stay internal', () => {
    expect(getMovementClass(advance('2026-10-20', 5000))).toBe('temporary-cash')
    expect(getMovementClass(fee('2026-10-20', 126.05, 'T1'))).toBe('expense')
    expect(getMovementClass(bankTransfer('2026-10-20', 100))).toBe('transfer')
  })
})

// ── Fee category placement ───────────────────────────────────────────────────

describe('feeCategoryPlacement', () => {
  const st = (categories: Category[], groups: Group[]) => ({ categories, groups })
  it('reuses a same-name category wherever the user put it', () => {
    const mine = { id: 'mine', name: 'bank & processing charges', group_name: 'Lifestyle' }
    expect(feeCategoryPlacement(st([mine], GROUPS))).toEqual({ kind: 'existing', categoryId: 'mine' })
  })
  it('creates in Obligations → first commitment group → first essential group → asks', () => {
    expect(feeCategoryPlacement(st([], GROUPS))).toEqual({ kind: 'create', groupName: 'Obligations' })
    expect(feeCategoryPlacement(st([], [{ id: '1', name: 'EMIs', type: 'commitment' }, { id: '2', name: 'Bills', type: 'essential' }]))).toEqual({ kind: 'create', groupName: 'EMIs' })
    expect(feeCategoryPlacement(st([], [{ id: '2', name: 'Bills', type: 'essential' }]))).toEqual({ kind: 'create', groupName: 'Bills' })
    expect(feeCategoryPlacement(st([], [{ id: '3', name: 'Fun', type: 'discretionary' }]))).toEqual({ kind: 'ask' })
  })
})
