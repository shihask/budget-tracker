import { describe, it, expect } from 'vitest'
import { buildStatements, currentStatementPeriod, clampedDay, localYmd } from './credit-card-cycles'
import type { CreditCard, Transaction, TransactionType } from '@/types'

function card(over: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card1', name: 'Axis', last_four: '4571',
    credit_limit: 100000, cycle_start_day: 26, bill_day: 25, due_day: 5,
    current_balance: 0, is_active: true,
    ...over,
  } as CreditCard
}

let seq = 0
function tx(date: string, amount: number, type: TransactionType = 'expense', over: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${seq++}`, transaction_date: date, description: 'x', amount,
    transaction_type: type, category_id: null, from_account_id: null, to_account_id: null,
    notes: null, created_at: date, credit_card_id: 'card1',
    ...over,
  } as Transaction
}

describe('clampedDay', () => {
  it('clamps day 31 into a 30-day month instead of rolling over', () => {
    // new Date(2026, 3, 31) silently becomes 1 May — the bug this exists to avoid.
    expect(localYmd(clampedDay(2026, 3, 31))).toBe('2026-04-30')
  })

  it('clamps into February, leap and non-leap', () => {
    expect(localYmd(clampedDay(2026, 1, 31))).toBe('2026-02-28')
    expect(localYmd(clampedDay(2024, 1, 30))).toBe('2024-02-29')
  })

  it('leaves an in-range day alone', () => {
    expect(localYmd(clampedDay(2026, 8, 25))).toBe('2026-09-25')
  })
})

describe('localYmd', () => {
  it('formats the LOCAL date, not the UTC one', () => {
    // toISOString() on local midnight renders the previous day east of UTC.
    expect(localYmd(new Date(2026, 8, 25))).toBe('2026-09-25')
    expect(localYmd(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
})

describe('buildStatements', () => {
  const today = new Date(2026, 8, 30) // 30 Sep 2026

  it('sums spend into the cycle that contains it', () => {
    const txns = [
      tx('2026-09-10', 500),   // in the 25 Sep statement
      tx('2026-09-26', 300),   // after it — belongs to the next, unbilled cycle
      tx('2026-08-30', 200),   // in the 25 Aug..25 Sep window? no: 26 Aug–25 Sep, so yes
    ]
    const [latest] = buildStatements(card(), txns, 6, today)
    expect(latest.statementDate).toBe('2026-09-25')
    expect(latest.periodStart).toBe('2026-08-26')
    expect(latest.amount).toBe(700) // 500 + 200; the 26 Sep charge is not billed yet
  })

  it('includes commitment rows, not just expenses', () => {
    const txns = [tx('2026-09-10', 500), tx('2026-09-12', 250, 'commitment')]
    const [latest] = buildStatements(card(), txns, 6, today)
    expect(latest.amount).toBe(750)
  })

  it('gives contiguous, non-overlapping windows so no rupee is lost', () => {
    const txns = Array.from({ length: 6 }, (_, i) => tx(`2026-0${4 + Math.floor(i / 2)}-1${i % 2}`, 100))
    const stmts = buildStatements(card(), txns, 6, today)
    for (let i = 0; i < stmts.length - 1; i++) {
      const older = stmts[i + 1]
      const newer = stmts[i]
      const dayAfterOlder = new Date(older.statementDate + 'T00:00:00')
      dayAfterOlder.setDate(dayAfterOlder.getDate() + 1)
      expect(newer.periodStart).toBe(localYmd(dayAfterOlder))
    }
  })

  it('marks a fully settled statement paid', () => {
    const txns = [tx('2026-09-10', 500), tx('2026-09-28', 500, 'credit_card_payment')]
    const [latest] = buildStatements(card(), txns, 6, today)
    expect(latest.paid).toBe(500)
    expect(latest.remaining).toBe(0)
    expect(latest.status).toBe('paid')
  })

  it('marks a part-settled statement partial with the right remainder', () => {
    const txns = [tx('2026-09-10', 500), tx('2026-09-28', 200, 'credit_card_payment')]
    const [latest] = buildStatements(card(), txns, 6, today)
    expect(latest.paid).toBe(200)
    expect(latest.remaining).toBe(300)
    expect(latest.status).toBe('partial')
  })

  it('is due before the due date and overdue after it', () => {
    const txns = [tx('2026-09-10', 500)]
    // due_day 5 → the 25 Sep statement is due 5 Oct
    expect(buildStatements(card(), txns, 6, new Date(2026, 8, 30))[0].status).toBe('due')
    expect(buildStatements(card(), txns, 6, new Date(2026, 9, 10))[0].dueDate).toBe('2026-10-05')
    expect(buildStatements(card(), txns, 6, new Date(2026, 9, 10))[0].status).toBe('overdue')
  })

  it('allocates a payment to the OLDEST unsettled statement first', () => {
    const txns = [
      tx('2026-08-10', 400),                          // 25 Aug statement
      tx('2026-09-10', 500),                          // 25 Sep statement
      tx('2026-09-28', 400, 'credit_card_payment'),   // settles the older one
    ]
    const stmts = buildStatements(card(), txns, 6, today)
    const aug = stmts.find(s => s.statementDate === '2026-08-25')!
    const sep = stmts.find(s => s.statementDate === '2026-09-25')!
    expect(aug.status).toBe('paid')
    expect(sep.paid).toBe(0)
    expect(sep.status).toBe('due')
  })

  it('never applies a payment to a statement generated after it', () => {
    const txns = [tx('2026-09-10', 500), tx('2026-09-20', 500, 'credit_card_payment')]
    const [latest] = buildStatements(card(), txns, 6, today)
    expect(latest.paid).toBe(0) // paid before the 25 Sep statement existed
  })

  it('does not skip a month when bill_day is 31', () => {
    const c31 = card({ bill_day: 31 })
    const txns = [tx('2026-02-10', 100), tx('2026-03-10', 100), tx('2026-04-10', 100)]
    const dates = buildStatements(c31, txns, 6, new Date(2026, 4, 15)).map(s => s.statementDate)
    expect(dates).toContain('2026-02-28')
    expect(dates).toContain('2026-03-31')
    expect(dates).toContain('2026-04-30')
  })

  it('drops empty statements so a dormant card shows no filler rows', () => {
    expect(buildStatements(card(), [tx('2026-09-10', 500)], 6, today)).toHaveLength(1)
  })

  it('returns nothing for a card with no transactions', () => {
    expect(buildStatements(card(), [], 6, today)).toEqual([])
  })

  it('ignores other cards rows', () => {
    const txns = [tx('2026-09-10', 500, 'expense', { credit_card_id: 'other' })]
    expect(buildStatements(card(), txns, 6, today)).toEqual([])
  })
})

describe('currentStatementPeriod', () => {
  it('describes the last generated statement, matching buildStatements', () => {
    const today = new Date(2026, 8, 30)
    const period = currentStatementPeriod(card(), today)
    const [latest] = buildStatements(card(), [tx('2026-09-10', 500)], 6, today)
    expect(period.statementDate).toBe(latest.statementDate)
    expect(period.periodStart).toBe(latest.periodStart)
    expect(period.dueDate).toBe(latest.dueDate)
  })

  it('steps back a month when the bill day has not arrived yet', () => {
    expect(currentStatementPeriod(card(), new Date(2026, 8, 10)).statementDate).toBe('2026-08-25')
  })
})
