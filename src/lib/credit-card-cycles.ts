import type { CreditCard, Transaction, TransactionType } from '@/types'
import { round2 } from '@/lib/utils'

/** Same spend set as credit-card.ts:4 — `commitment` counts, or a recurring bill charged to the
 *  card silently vanishes from its statement. */
const CC_SPEND_TYPES = new Set<TransactionType>(['expense', 'commitment'])

export type StatementStatus = 'paid' | 'partial' | 'due' | 'overdue'

/** One payment's contribution to one statement. `amount` is the portion allocated HERE, not the
 *  payment's face value — a single ₹1000 payment spanning two statements appears in both, as ₹600
 *  and ₹400, so each statement's payments always sum to its `paid`. */
export interface StatementPayment {
  id: string
  date: string
  amount: number
}

export interface Statement {
  cardId: string
  cardName: string
  /** Inclusive first day of the billing window. */
  periodStart: string
  /** The day the statement is generated — the window's last day, inclusive. */
  statementDate: string
  dueDate: string
  /** Gross spend in the window. */
  amount: number
  /** Spend only — expense + commitment. What the purchases list shows. */
  purchases: number
  /** Signed reconciliation entries: cc_balance_adjustment and cc_opening_balance. Split out of the
   *  same loop as `purchases` so the details footer reconciles by construction:
   *  purchases + adjustments === amount (before the clamp below). */
  adjustments: number
  /** Payments allocated to this statement, oldest-first. */
  paid: number
  remaining: number
  /** The allocations that make up `paid`, in the order they were applied. */
  payments: StatementPayment[]
  /** Date of the payment that took this statement to zero. Only set when status === 'paid'. */
  paidOn?: string
  status: StatementStatus
}

/** 'YYYY-MM-DD' from a LOCAL date.
 *
 *  credit-card.ts:33 uses `.toISOString().slice(0,10)`, which converts local midnight to UTC and so
 *  renders a day early for every timezone east of UTC (IST included). Statements are dated things a
 *  user reconciles against a bank statement, so this one formats locally. */
export function localYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** A day-of-month clamped into its month, so bill_day 31 lands on 30 Apr / 28 Feb instead of rolling
 *  into the next month the way `new Date(y, m, 31)` silently does. The form allows 1–31 for both
 *  bill_day and due_day, so this is reachable. Same technique as financial-cycle.ts:263. */
export function clampedDay(year: number, monthIndex: number, day: number): Date {
  const lastOfMonth = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(Math.max(1, day), lastOfMonth))
}

function addDaysLocal(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** The due date for a statement generated on `stmt`: the next due_day strictly after it. */
function dueDateFor(stmt: Date, dueDay: number): Date {
  const same = clampedDay(stmt.getFullYear(), stmt.getMonth(), dueDay)
  if (same > stmt) return same
  return clampedDay(stmt.getFullYear(), stmt.getMonth() + 1, dueDay)
}

/** Spend and reconciliation totals for one card's rows in an inclusive date window. Split rather than
 *  one running total, so the details footer can show Purchases + Adjustments = Total without
 *  recomputing anything. Shared by past statements and the open unbilled cycle. */
function sumWindow(mine: Transaction[], start: string, end: string): { purchases: number; adjustments: number } {
  let purchases = 0
  let adjustments = 0
  for (const t of mine) {
    if (t.transaction_date < start || t.transaction_date > end) continue
    if (CC_SPEND_TYPES.has(t.transaction_type)) {
      purchases += t.amount
    } else if (t.transaction_type === 'cc_opening_balance') {
      adjustments += t.amount
    } else if (t.transaction_type === 'cc_balance_adjustment') {
      adjustments += t.is_credit ? t.amount : -t.amount
    }
  }
  return { purchases, adjustments }
}

/**
 * Past statements for one card, newest first.
 *
 * This is a FORWARD sum over each billing window. It deliberately does not call
 * `getCreditCardBilling`, which reconstructs backwards from today's `current_balance` and therefore
 * cannot be replayed for a past date.
 *
 * Windows are contiguous and half-open — `(previous statement date, this statement date]` — so every
 * transaction lands in exactly one statement. `card.cycle_start_day` is intentionally not used to
 * define the window: when it disagrees with `bill_day + 1` (nothing validates that it doesn't) it
 * would open gaps or overlaps, and money disappearing from a statement is worse than a field going
 * unread. It stays a display value, as it was before.
 */
export function buildStatements(
  card: CreditCard,
  txns: Transaction[],
  months = 6,
  today: Date = new Date(),
): Statement[] {
  // A dormant card should show no filler rows.
  return buildStatementWindows(card, txns, months, today).filter(s => s.amount > 0 || s.paid > 0)
}

/** How many cycles the per-card archive keeps. Bounds the fetch and the chip row, so one mistyped
 *  decades-old transaction date can't produce hundreds of empty months. */
export const STATEMENT_ARCHIVE_CYCLES = 36

/**
 * Every statement for one card, newest first, from the cycle holding its earliest transaction up to
 * the last generated one — empty cycles INCLUDED, the way a bank app lists every month since the card
 * was opened. Capped at `STATEMENT_ARCHIVE_CYCLES`.
 *
 * Pass the card's full history (at least `STATEMENT_ARCHIVE_CYCLES + 1` months) so the oldest window
 * is whole and payment allocation sees every earlier statement. A card with no transactions yields
 * just the current cycle, so there is always something to select.
 */
export function buildCardCycles(card: CreditCard, txns: Transaction[], today: Date = new Date()): Statement[] {
  const mine = txns.filter(t => t.credit_card_id === card.id)
  const lastBill = currentStatementPeriod(card, today).statementDate
  const earliest = mine.reduce<string | null>(
    (min, t) => (min === null || t.transaction_date < min ? t.transaction_date : min), null,
  )

  // Walk back from the last statement while the earliest row still sits in an older window. A window
  // is (previous statement, this statement], so the row is older exactly when it is <= the previous date.
  let months = 1
  if (earliest !== null) {
    const [y, m, d] = lastBill.split('-').map(Number)
    let cursor = new Date(y, m - 1, d)
    while (months < STATEMENT_ARCHIVE_CYCLES) {
      const prev = clampedDay(cursor.getFullYear(), cursor.getMonth() - 1, card.bill_day)
      if (earliest > localYmd(prev)) break
      months++
      cursor = prev
    }
  }
  return buildStatementWindows(card, mine, months, today)
}

/** `months` statement windows ending at the last generated statement, newest first, unfiltered. */
function buildStatementWindows(
  card: CreditCard,
  txns: Transaction[],
  months: number,
  today: Date,
): Statement[] {
  const mine = txns.filter(t => t.credit_card_id === card.id)

  // Statement dates: the most recent bill_day on or before today, then back `months` cycles.
  const dates: Date[] = []
  let cursor = clampedDay(today.getFullYear(), today.getMonth(), card.bill_day)
  if (cursor > today) cursor = clampedDay(today.getFullYear(), today.getMonth() - 1, card.bill_day)
  for (let i = 0; i < months; i++) {
    dates.push(cursor)
    cursor = clampedDay(cursor.getFullYear(), cursor.getMonth() - 1, card.bill_day)
  }
  dates.reverse() // oldest first — allocation depends on it

  const todayStr = localYmd(today)

  const statements: Statement[] = dates.map((stmtDate, i) => {
    // The window opens the day after the previous statement. For the oldest one there is no previous
    // statement in range, so it opens one cycle back — anything older is outside the fetch window.
    const prev = i > 0 ? dates[i - 1] : clampedDay(stmtDate.getFullYear(), stmtDate.getMonth() - 1, card.bill_day)
    const startDate = addDaysLocal(prev, 1)
    const periodStart = localYmd(startDate)
    const statementDate = localYmd(stmtDate)

    const { purchases, adjustments } = sumWindow(mine, periodStart, statementDate)

    return {
      cardId: card.id,
      cardName: card.name,
      periodStart,
      statementDate,
      dueDate: localYmd(dueDateFor(stmtDate, card.due_day)),
      amount: Math.max(0, round2(purchases + adjustments)),
      purchases: round2(purchases),
      adjustments: round2(adjustments),
      paid: 0,
      remaining: 0,
      payments: [],
      status: 'due' as StatementStatus,
    }
  })

  // ── Payment allocation, oldest-first ───────────────────────────────────────
  // A credit_card_payment row carries no link to the statement it settles (useSupabaseData.ts:2069
  // writes only transaction_date), so attribution is inferred: a payment settles the oldest statement
  // still owing that was generated before the payment was made. This is the same assumption
  // getCreditCardBilling already makes at credit-card.ts:43-45, so the two agree on the current cycle.
  const payments = mine
    .filter(t => t.transaction_type === 'credit_card_payment')
    .map(t => ({ id: t.id, date: t.transaction_date, left: t.amount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  for (const s of statements) {
    let owing = s.amount
    if (owing <= 0) continue
    for (const p of payments) {
      if (p.left <= 0 || owing <= 0) continue
      if (p.date <= s.statementDate) continue
      const take = Math.min(p.left, owing)
      p.left = round2(p.left - take)
      owing = round2(owing - take)
      s.paid = round2(s.paid + take)
      // The allocated portion, not p's face value — one payment can span several statements.
      s.payments.push({ id: p.id, date: p.date, amount: take })
      if (owing <= 0.01) s.paidOn = p.date
    }
    s.remaining = Math.max(0, round2(owing))
  }

  for (const s of statements) {
    if (s.remaining <= 0.01) s.status = 'paid'
    else if (s.paid > 0) s.status = 'partial'
    else if (todayStr > s.dueDate) s.status = 'overdue'
    else s.status = 'due'
    // A zero-amount statement is 'paid' without any payment having closed it.
    if (s.status !== 'paid') s.paidOn = undefined
  }

  return statements.reverse()
}

/**
 * The purchases that made up a statement — expense and commitment only, newest first.
 *
 * Reconciliation rows (cc_balance_adjustment, cc_opening_balance) are deliberately excluded: they are
 * summed into `statement.adjustments` and shown as a single footer line, so a manual balance
 * correction never appears in the user's purchase history. These rows therefore sum exactly to
 * `statement.purchases`, which is what lets the details footer reconcile.
 *
 * Bounds match buildStatements exactly — inclusive at both ends.
 */
export function getStatementTransactions(
  statement: Pick<Statement, 'cardId' | 'periodStart' | 'statementDate'>,
  txns: Transaction[],
): Transaction[] {
  return txns
    .filter(t =>
      t.credit_card_id === statement.cardId &&
      CC_SPEND_TYPES.has(t.transaction_type) &&
      t.transaction_date >= statement.periodStart &&
      t.transaction_date <= statement.statementDate,
    )
    .sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date) ||
      (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    )
}

/** Every card's statements, merged newest-first — what the Statements tab renders. */
export function buildAllStatements(
  cards: CreditCard[],
  txns: Transaction[],
  months = 6,
  today: Date = new Date(),
): Statement[] {
  return cards
    .flatMap(card => buildStatements(card, txns, months, today))
    .sort((a, b) => b.statementDate.localeCompare(a.statementDate) || a.cardName.localeCompare(b.cardName))
}

/** The window of the most recently generated statement — the one `getCreditCardBilling.billedAmount`
 *  refers to. The Cards tab's Current Statement preview reads its dates from here rather than
 *  recomputing them, so the preview and the Statements tab can't disagree about where a cycle begins.
 *
 *  Note this is the LAST BILLED cycle, not the open unbilled one; unbilled spend is shown separately
 *  by the tile and is what `billing.unbilledAmount` covers. */
export function currentStatementPeriod(
  card: CreditCard,
  today: Date = new Date(),
): { periodStart: string; statementDate: string; dueDate: string } {
  let lastBill = clampedDay(today.getFullYear(), today.getMonth(), card.bill_day)
  if (lastBill > today) lastBill = clampedDay(today.getFullYear(), today.getMonth() - 1, card.bill_day)
  const prev = clampedDay(lastBill.getFullYear(), lastBill.getMonth() - 1, card.bill_day)
  return {
    periodStart: localYmd(addDaysLocal(prev, 1)),
    statementDate: localYmd(lastBill),
    dueDate: localYmd(dueDateFor(lastBill, card.due_day)),
  }
}

/** The open cycle — spend since the last statement that the next one will bill. Deliberately not a
 *  `Statement`: it has no payments, status or remaining, because nothing is owed on it yet, and
 *  typing it as one would let a Pay button read a meaningless `remaining`. */
export interface UnbilledCycle {
  cardId: string
  /** Day after the last generated statement. */
  periodStart: string
  /** The upcoming statement date — the window's inclusive end, same convention as `Statement`. */
  statementDate: string
  dueDate: string
  amount: number
  purchases: number
  adjustments: number
}

/** The window directly after `currentStatementPeriod`, so the unbilled cycle and the last statement
 *  are contiguous and no row lands in both or neither. Summed with the same `sumWindow` as
 *  `buildStatements`, so `getStatementTransactions` over it reconciles to `purchases`. */
export function buildUnbilledCycle(
  card: CreditCard,
  txns: Transaction[],
  today: Date = new Date(),
): UnbilledCycle {
  const last = currentStatementPeriod(card, today)
  const [y, m, d] = last.statementDate.split('-').map(Number)
  const lastBill = new Date(y, m - 1, d)
  const nextBill = clampedDay(lastBill.getFullYear(), lastBill.getMonth() + 1, card.bill_day)
  const periodStart = localYmd(addDaysLocal(lastBill, 1))
  const statementDate = localYmd(nextBill)
  const mine = txns.filter(t => t.credit_card_id === card.id)
  const { purchases, adjustments } = sumWindow(mine, periodStart, statementDate)
  return {
    cardId: card.id,
    periodStart,
    statementDate,
    dueDate: localYmd(dueDateFor(nextBill, card.due_day)),
    amount: Math.max(0, round2(purchases + adjustments)),
    purchases: round2(purchases),
    adjustments: round2(adjustments),
  }
}
