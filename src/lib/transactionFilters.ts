import { catById } from '@/lib/data'
import { txTime } from '@/lib/utils'
import type { Category, Transaction } from '@/types'

export type TxnSortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export interface TransactionFilterState {
  search: string
  account: string   // 'all' | account id | credit card id
  category: string  // 'all' | category id
  group: string     // 'all' | group name
  event: string     // 'all' | event id | 'none' (untagged)
  dateFrom: string
  dateTo: string
  showSystemTxns: boolean
}

export const DEFAULT_TXN_FILTERS: TransactionFilterState = {
  search: '', account: 'all', category: 'all', group: 'all', event: 'all', dateFrom: '', dateTo: '', showSystemTxns: false,
}

// Oldest first: date, then the time the user chose (else when it was recorded),
// then insert order so same-minute entries stay stable.
const chronological = (a: Transaction, b: Transaction): number =>
  a.transaction_date.localeCompare(b.transaction_date)
  || txTime(a).localeCompare(txTime(b))
  || a.created_at.localeCompare(b.created_at)

const SORT_COMPARATORS: Record<TxnSortKey, (a: Transaction, b: Transaction) => number> = {
  date_desc: (a, b) => chronological(b, a),
  date_asc: chronological,
  amount_desc: (a, b) => b.amount - a.amount,
  amount_asc: (a, b) => a.amount - b.amount,
}

export function filterAndSortTransactions(
  transactions: Transaction[],
  categories: Category[],
  filters: TransactionFilterState,
  sortKey: TxnSortKey,
): Transaction[] {
  const catMap = catById(categories)
  let txns = [...transactions]
  if (!filters.showSystemTxns) txns = txns.filter(t => t.transaction_type !== 'opening_balance' && t.transaction_type !== 'balance_adjustment' && t.transaction_type !== 'cc_opening_balance' && t.transaction_type !== 'cc_balance_adjustment')
  if (filters.search.trim()) txns = txns.filter(t => t.description.toLowerCase().includes(filters.search.toLowerCase()))
  if (filters.account !== 'all') txns = txns.filter(t => t.from_account_id === filters.account || t.credit_card_id === filters.account)
  if (filters.category !== 'all') txns = txns.filter(t => t.category_id === filters.category)
  if (filters.group !== 'all') txns = txns.filter(t => catMap[t.category_id!]?.group_name === filters.group)
  if (filters.event !== 'all') txns = filters.event === 'none'
    ? txns.filter(t => !t.event_id)
    : txns.filter(t => t.event_id === filters.event)
  if (filters.dateFrom) txns = txns.filter(t => t.transaction_date >= filters.dateFrom)
  if (filters.dateTo) txns = txns.filter(t => t.transaction_date <= filters.dateTo)
  txns.sort(SORT_COMPARATORS[sortKey])
  return txns
}
