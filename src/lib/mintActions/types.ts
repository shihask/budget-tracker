import type { TransactionFilterState, TxnSortKey } from '@/lib/transactionFilters'

export interface ExportTransactionsAction {
  type: 'export_transactions'
  periodLabel: string
  filters: TransactionFilterState
  sortKey: TxnSortKey
  estimatedCount: number
}

export type MintAction =
  | ExportTransactionsAction
  // | AddExpenseAction
  // | OpenBillsAction
