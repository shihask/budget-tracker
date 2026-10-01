import type { NewTransactionInput, TransactionType } from '@/types'

/** Signed effect of a transaction on its source account. */
export const delta = (type: TransactionType, amount: number) => {
  switch (type) {
    case 'income':
    case 'opening_balance':
      return amount    // credits the account
    default:
      return -amount   // debits the account (expense, commitment, balance_adjustment-debit, etc.)
  }
}

/** Signed effect of a transaction on a credit card's outstanding. A card carries
 *  debt, so this mirrors `delta`: spending raises what is owed, and money arriving
 *  on the card (a merchant refund, recorded as a reimbursement) lowers it. Create,
 *  edit and delete all go through this — never a bare amount. */
export const cardDelta = (type: TransactionType, amount: number) => -delta(type, amount)

/** Which rows a new transaction moves, and by how much. This is the ONE model
 *  shared by the live save (mp_execute_transaction's p_*_delta args, the local
 *  optimistic update) and the offline queue's overlay — never a second copy.
 *
 *  `from_account_id` may hold a credit card id (the mixed account/card
 *  dropdown); it is resolved into the right column here. */
export interface TxDeltas {
  fromAccountId: string | null
  fromDelta: number | null
  toAccountId: string | null
  toDelta: number | null
  creditCardId: string | null
  ccDelta: number | null
}

export function txDeltas(form: NewTransactionInput, creditCardIds: ReadonlySet<string>): TxDeltas {
  const isCreditCard = !!form.from_account_id && creditCardIds.has(form.from_account_id)
  const toAccountId  = form.transaction_type === 'transfer' ? (form.to_account_id ?? null) : null

  const fromAccountId = isCreditCard ? null : (form.from_account_id ?? null)
  const creditCardId  = isCreditCard ? form.from_account_id : null
  return {
    fromAccountId,
    fromDelta:    fromAccountId ? delta(form.transaction_type, form.amount) : null,
    toAccountId,
    toDelta:      toAccountId ? form.amount : null,
    creditCardId,
    ccDelta:      creditCardId ? cardDelta(form.transaction_type, form.amount) : null,
  }
}

/** Applies (sign = 1) or reverses (sign = -1) a transaction's deltas on the
 *  in-memory account and card lists. Returns the same array when untouched. */
export function applyDeltas<A extends { id: string; current_balance: number }, C extends { id: string; current_balance: number }>(
  accounts: A[], cards: C[], d: TxDeltas, sign: 1 | -1 = 1,
): { accounts: A[]; cards: C[] } {
  const nextAccounts = (d.fromDelta !== null || d.toDelta !== null)
    ? accounts.map(a => {
        let bal = a.current_balance
        if (a.id === d.fromAccountId && d.fromDelta !== null) bal += sign * d.fromDelta
        if (a.id === d.toAccountId   && d.toDelta   !== null) bal += sign * d.toDelta
        return bal !== a.current_balance ? { ...a, current_balance: bal } : a
      })
    : accounts
  const nextCards = (d.creditCardId && d.ccDelta !== null)
    ? cards.map(c => c.id === d.creditCardId ? { ...c, current_balance: c.current_balance + sign * (d.ccDelta ?? 0) } : c)
    : cards
  return { accounts: nextAccounts, cards: nextCards }
}
