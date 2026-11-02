import type { AppState, CreditCard, Transaction } from '@/types'
import type { CreditCardBilling } from '@/lib/credit-card'

// Credit Card → Bank Transfer — the one shared definition of the operation.
//
// ₹5,000 moved from a card to a bank through a rent / tuition gateway that
// charges ₹126.05 is two rows (see 20261102000001_card_to_bank_transfer.sql):
//   transfer  credit_card_id = card, to_account_id = bank, amount 5,000  → borrowed, never income/spend
//   expense   credit_card_id = card, amount 126.05, fee_for = transfer   → a genuine expense
// The card is charged the sum. Totals are always derived from the rows.

export const FEE_CATEGORY_NAME = 'Bank & Processing Charges'
export const TRANSFER_DESCRIPTION = 'Credit Card to Bank Transfer'

// Integer paise, so a fee like 126.05 never drifts. Local on purpose: the
// household feature's helper is behind a build flag.
const toPaise = (v: number) => Math.round(v * 100)
const fromPaise = (p: number) => p / 100
const hasAtMostTwoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

/** The principal row: a transfer whose source is a credit card. Purchases are
 *  expense/commitment and bill payments credit_card_payment, so neither can match. */
export function isCardToBankTransfer(t: Pick<Transaction, 'transaction_type' | 'credit_card_id'>): boolean {
  return t.transaction_type === 'transfer' && !!t.credit_card_id
}

/** Either leg of the pair — what the locked fields and pair delete key off. */
export function isCardTransferLeg(t: Pick<Transaction, 'transaction_type' | 'credit_card_id' | 'fee_for'>): boolean {
  return isCardToBankTransfer(t) || !!t.fee_for
}

/** The transfer id a leg belongs to: its own id, or the transfer its fee points at. */
export function cardTransferId(t: Pick<Transaction, 'id' | 'transaction_type' | 'credit_card_id' | 'fee_for'>): string | null {
  if (t.fee_for) return t.fee_for
  return isCardToBankTransfer(t) ? t.id : null
}

/** What the card is charged. */
export function cardTransferTotal(amount: number, fee: number): number {
  return fromPaise(toPaise(amount) + toPaise(fee))
}

/** Both legs of the operation from either one. A leg can be outside the loaded
 *  window (the latest 200 rows), so either side may be missing. */
export function cardTransferParts(t: Transaction, txns: Transaction[]): { transfer: Transaction | null; fee: Transaction | null; total: number } | null {
  const transferId = cardTransferId(t)
  if (!transferId) return null
  const transfer = isCardToBankTransfer(t) ? t : txns.find(x => x.id === transferId) ?? null
  const fee = t.fee_for ? t : txns.find(x => x.fee_for === transferId) ?? null
  return { transfer, fee, total: cardTransferTotal(transfer?.amount ?? 0, fee?.amount ?? 0) }
}

/** Credit left on the card, or null when the card has no limit set. */
export function availableCredit(card: Pick<CreditCard, 'credit_limit' | 'current_balance'>): number | null {
  if (!(card.credit_limit > 0)) return null
  return fromPaise(toPaise(card.credit_limit) - toPaise(card.current_balance))
}

export interface CardTransferInput {
  cardId: string
  toAccountId: string
  amount: number | null
  fee: number | null
  date: string
}

export interface CardTransferCheck {
  /** Field → reason. Empty when the transfer can be saved. */
  errors: Partial<Record<'cardId' | 'toAccountId' | 'amount' | 'fee' | 'date', string>>
  total: number
  /** The total charge is more than the card's available credit — allowed, but only after an explicit acknowledgement. */
  overLimit: boolean
  available: number | null
}

/** Client-side mirror of mp_execute_card_to_bank's checks, so the sheet can say
 *  why before it asks the server. The server re-checks everything. */
export function validateCardTransfer(input: CardTransferInput, state: Pick<AppState, 'accounts' | 'credit_cards'>): CardTransferCheck {
  const errors: CardTransferCheck['errors'] = {}
  const card = state.credit_cards.find(c => c.id === input.cardId && c.is_active !== false)
  if (!card) errors.cardId = 'Choose a credit card'
  const account = state.accounts.find(a => a.id === input.toAccountId && a.is_active !== false)
  if (!account) errors.toAccountId = 'Choose the account that received the money'

  const amount = input.amount ?? 0
  if (!(amount > 0)) errors.amount = 'Enter the amount received'
  else if (!hasAtMostTwoDecimals(amount)) errors.amount = 'Use at most two decimal places'

  const fee = input.fee ?? 0
  if (fee < 0) errors.fee = 'The fee cannot be negative'
  else if (!hasAtMostTwoDecimals(fee)) errors.fee = 'Use at most two decimal places'

  if (!input.date) errors.date = 'Choose a date'

  const total = cardTransferTotal(Math.max(0, amount), Math.max(0, fee))
  const available = card ? availableCredit(card) : null
  return { errors, total, available, overLimit: available !== null && total > available }
}

/** Card-to-bank principal on this card that is not billed yet: transfers dated
 *  after the last statement — the same `> lastBillDate` split getCreditCardBilling uses. */
export function unbilledAdvancePrincipal(card: Pick<CreditCard, 'id'>, txns: Transaction[], billing: Pick<CreditCardBilling, 'lastBillDate'>): number {
  let paise = 0
  for (const t of txns) {
    if (t.credit_card_id !== card.id || !isCardToBankTransfer(t)) continue
    if (t.transaction_date <= billing.lastBillDate) continue
    paise += toPaise(t.amount)
  }
  return fromPaise(paise)
}

/**
 * The borrowed cash Safe Daily Spend must hold back for this card — the ONE
 * definition (the forecast's 'card-advance' event reads it).
 *
 *   R = min(unbilled advance principal, unbilled amount)
 *
 * Payment allocation is "principal last": a payment clears billed statements
 * first (getCreditCardBilling's existing rule), then unbilled fees and
 * purchases, then advance principal. Under that convention R is exactly the
 * remaining unbilled principal — never fee debt, never purchase debt.
 *
 * Invariants: R ≤ unbilled principal, R ≤ unbilledAmount, so
 * R + billedAmount ≤ current_balance — the same debt is never counted twice.
 * Once the statement generates, the principal is billed, R drops to 0 and the
 * existing billed-bill event carries it.
 */
export function unbilledCardAdvance(card: Pick<CreditCard, 'id'>, txns: Transaction[], billing: Pick<CreditCardBilling, 'lastBillDate' | 'unbilledAmount'>): number {
  const principal = toPaise(unbilledAdvancePrincipal(card, txns, billing))
  const unbilled = Math.max(0, toPaise(billing.unbilledAmount))
  return fromPaise(Math.min(principal, unbilled))
}

/** What the sheet hands the data hook. Both ids are generated ONCE when the sheet
 *  opens and reused on every retry — the server's idempotency key. */
export interface CardTransferSave {
  transferId: string
  feeId: string
  cardId: string
  toAccountId: string
  amount: number
  fee: number
  /** Set only when the sheet had to ask (feeCategoryPlacement → 'ask'). */
  feeCategoryId: string | null
  date: string
  time: string | null
  description: string
}

/** Same wording as the database trigger, so every surface says the same thing. */
export const CARD_TRANSFER_LOCKED_MESSAGE =
  'This is part of a credit card to bank transfer. Delete the transfer and record it again to change its amount, accounts or date.'

/** The save was sent but no answer came back — it may or may not have committed.
 *  The sheet stays open; retrying with the same ids is safe (no duplicate). */
export class CardTransferNotConfirmedError extends Error {
  constructor(offline: boolean) {
    super(offline
      ? "You're offline. A card to bank transfer needs a connection — try again when you're back online."
      : "We couldn't confirm the transfer was saved. Check your connection and tap Confirm again — it won't be recorded twice.")
    this.name = 'CardTransferNotConfirmedError'
  }
}

export type FeeCategoryPlacement =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'create'; groupName: string }
  | { kind: 'ask' }

/**
 * Where the processing fee is categorised. Reuses a same-name category wherever
 * the user put it (its group and bucket are theirs). Otherwise it is created in
 * Obligations → the first commitment-type group → the first essential-type group
 * (all read as Needs). With none of those, the sheet asks — a group is never
 * created.
 */
export function feeCategoryPlacement(state: Pick<AppState, 'categories' | 'groups'>): FeeCategoryPlacement {
  const existing = state.categories.find(c => c.name.toLowerCase() === FEE_CATEGORY_NAME.toLowerCase())
  if (existing) return { kind: 'existing', categoryId: existing.id }
  const group =
    state.groups.find(g => g.name === 'Obligations') ??
    state.groups.find(g => g.type === 'commitment') ??
    state.groups.find(g => g.type === 'essential')
  return group ? { kind: 'create', groupName: group.name } : { kind: 'ask' }
}
