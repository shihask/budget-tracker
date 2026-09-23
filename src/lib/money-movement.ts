import type { Transaction } from '@/types'

// Movement class classifier — maps raw transaction_type + is_credit to a semantic role.
// Shared by Mint's MoneyMovement context and the CFO "This month's story", so both
// read a borrowing or a refund the same way. Add new transaction types here
// (e.g. 'cashback', 'emi') as the platform grows.
export type MovementClass = 'recurring-income' | 'temporary-cash' | 'one-time-source' | 'recoverable-realized' | 'lent-out' | 'debt-payment' | 'savings-contributed' | 'savings-withdrawn' | 'expense' | 'transfer' | 'other'

export function getMovementClass(t: Transaction): MovementClass {
  // Money back for an expense already recorded — not earnings. 'recoverable-realized'
  // is exactly this shape (something you were owed, now received), and it keeps Mint
  // from describing a refund as income.
  if (t.reimbursement_for)                                                      return 'recoverable-realized'
  if (t.transaction_type === 'income')                                          return 'recurring-income'
  if (t.transaction_type === 'borrowing'           &&  t.is_credit)            return 'temporary-cash'
  if (t.transaction_type === 'borrowing'           && !t.is_credit)            return 'lent-out'
  if (t.transaction_type === 'borrowing_repayment' &&  t.is_credit)            return 'recoverable-realized'
  if (t.transaction_type === 'borrowing_repayment' && !t.is_credit)            return 'debt-payment'
  if (t.transaction_type === 'savings_withdrawal')                              return 'one-time-source'
  if (t.transaction_type === 'savings_contribution')                            return 'savings-contributed'
  if (t.transaction_type === 'transfer')                                        return 'transfer'
  if (t.transaction_type === 'expense' || t.transaction_type === 'commitment') return 'expense'
  return 'other'
}
