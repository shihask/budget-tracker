import type { LifeEvent, Transaction } from '@/types'
import { forSpendAnalytics, spendAmount } from '@/lib/reimbursements'

/** Event ids whose spend is kept out of budget/pacing/forecast maths.
 *
 *  Built once per `derive()` and passed down, rather than each call site
 *  re-scanning `state.events` per transaction. */
export const ringFencedEventIds = (events: LifeEvent[] | undefined): Set<string> =>
  new Set((events ?? []).filter(e => e.excluded_from_budget).map(e => e.id))

/** False for spend tagged to a ring-fenced life event — a wedding shouldn't read
 *  as lifestyle drift.
 *
 *  This governs analytics only: weekly pacing, the lifestyle forecast, spending
 *  streaks and budget-strategy adherence. Balances, cash flow and net worth read
 *  raw transactions and deliberately never consult it — the money really did leave
 *  the account. */
export const countsTowardBudget = (t: Transaction, ringFenced: Set<string>): boolean =>
  !(t.event_id && ringFenced.has(t.event_id))

/** Expenses tagged to one event, newest first. The event total is always derived
 *  this way — never stored — so linking, unlinking and deleting an event are all
 *  correct on the next render with no recompute step. */
export const eventTransactions = (transactions: Transaction[], eventId: string): Transaction[] =>
  transactions
    .filter(t => t.event_id === eventId && t.transaction_type === 'expense')
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))

/** Net of anything reimbursed against those expenses — if a relative paid back
 *  half the catering, the wedding did not cost you the full amount. Same reason
 *  every other spend total nets: `amount` is what left the account, `spendAmount`
 *  is what it cost. */
export const eventSpent = (transactions: Transaction[], eventId: string): number =>
  forSpendAnalytics(transactions)
    .filter(t => t.event_id === eventId && t.transaction_type === 'expense')
    .reduce((s, t) => s + spendAmount(t), 0)
