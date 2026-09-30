export const INCOME_GROUP = 'Income'
export const TRANSFER_GROUP = 'Transfer'
export const BORROWING_GROUP = 'Borrowing'
export const SAVINGS_GROUP = 'Savings'
export const ADJUSTMENT_GROUP = 'Adjustment'

/** Group types that hold day-to-day spending. Everything else — income,
 *  transfers, borrowing, savings, commitments, adjustments — is money moving
 *  for a reason fixed in advance, not behaviour. */
export const BEHAVIORAL_GROUP_TYPES: ReadonlySet<string> = new Set(['discretionary', 'essential'])
