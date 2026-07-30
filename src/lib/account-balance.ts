// Account Balance Engine — general-purpose, not Journey-specific. Journey is the first
// consumer (Opening/Closing Balance in the calendar-month Timeline), but the same two
// month-scoped wrappers below are meant to be reused by future Monthly Reports, PDF
// export, AI Insights, and net-worth/account-history screens.
import type { AppState, Transaction, TransactionType } from '@/types'
import { localIso, round2, addDays } from '@/lib/utils'

/** Live sum of currently-active accounts' balances (excludes credit cards, tracked
 *  separately as a liability bucket) — the same scope data.ts's derive() uses for
 *  actualBalance. */
export function getCurrentBalance(state: AppState): number {
  return state.accounts.filter(a => a.is_active).reduce((s, a) => s + a.current_balance, 0)
}

// Mirrors the forward-apply sign rules in src/hooks/useSupabaseData.ts (its `delta()`
// helper for the generic income/opening_balance/other split, and the is_credit-based
// sign used for borrowing/borrowing_repayment in addBorrowing/recordBorrowingPayment) —
// verified against deleteTransaction's reversal branches, which must exactly undo
// whatever the forward path applied. Duplicated here (not imported) to keep this file's
// only dependency direction: lib code never imports from hooks.
function forwardDeltaOnActiveAccounts(t: Transaction, activeIds: Set<string>): number {
  let net = 0
  const isBorrowingTx = t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment'
  if (t.from_account_id && activeIds.has(t.from_account_id)) {
    if (isBorrowingTx) {
      net += t.is_credit ? t.amount : -t.amount
    } else {
      const creditTypes: TransactionType[] = ['income', 'opening_balance']
      net += creditTypes.includes(t.transaction_type) ? t.amount : -t.amount
    }
  }
  if (t.to_account_id && activeIds.has(t.to_account_id)) {
    net += t.amount   // transfer / savings_withdrawal / balance_adjustment credit side
  }
  return net
}

/**
 * Reconstructs the sum of currently-active accounts' balances as of the END of `asOfDate`
 * (everything dated on/before asOfDate included, everything after excluded), by walking
 * backward from the live balance and undoing every later transaction's effect — the same
 * backward-reversal technique as getCreditCardBilling() in credit-card.ts.
 *
 * ASSUMPTION (documented, not fixed here): this only produces a correct historical figure
 * if current_balance was reached exclusively through logged, reversible transactions.
 * updateAccount() in useSupabaseData.ts can overwrite current_balance directly without
 * logging a transaction (unlike adjustBalance(), which does) — if that path was ever
 * used, reconstructions from before that edit will be off by the unlogged delta.
 * Pre-existing data-integrity gap, out of scope to fix here.
 */
export function getBalanceAtDate(state: AppState, asOfDate: Date): number {
  const activeIds = new Set(state.accounts.filter(a => a.is_active).map(a => a.id))
  const cutoffIso = localIso(asOfDate)
  let reversal = 0
  for (const t of state.transactions) {
    if (t.transaction_date > cutoffIso) reversal += forwardDeltaOnActiveAccounts(t, activeIds)
  }
  return round2(getCurrentBalance(state) - reversal)
}

/** Balance at the start of the given calendar month (end of the day before). */
export function getOpeningBalanceForMonth(state: AppState, year: number, month: number): number {
  return getBalanceAtDate(state, addDays(new Date(year, month, 1), -1))
}

/** Balance at the end of the given calendar month — the live balance if that month is
 *  still in progress, otherwise reconstructed as of its last day. */
export function getClosingBalanceForMonth(
  state: AppState, year: number, month: number, today: Date = new Date(),
): number {
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  return isCurrentMonth
    ? getCurrentBalance(state)
    : getBalanceAtDate(state, addDays(new Date(year, month + 1, 1), -1))
}
