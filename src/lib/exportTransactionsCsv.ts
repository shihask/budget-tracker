import { fetchAllPages } from '@/lib/supabasePagination'
import { toCsv } from '@/lib/csvUtils'
import { catById } from '@/lib/data'
import { filterAndSortTransactions, type TransactionFilterState, type TxnSortKey } from '@/lib/transactionFilters'
import type { Account, Category, CreditCard, Transaction, TransactionType } from '@/types'

export interface ExportLookupData {
  categories: Category[]
  accounts: Account[]
  creditCards: CreditCard[]
}

const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  commitment: 'Commitment',
  borrowing: 'Borrowing',
  borrowing_repayment: 'Borrowing Repayment',
  savings_contribution: 'Savings Contribution',
  savings_withdrawal: 'Savings Withdrawal',
  opening_balance: 'Opening Balance',
  balance_adjustment: 'Balance Adjustment',
  credit_card_payment: 'Credit Card Payment',
  cc_opening_balance: 'CC Opening Balance',
  cc_balance_adjustment: 'CC Balance Adjustment',
}

const EXPORT_COLUMNS = [
  'Date', 'Description', 'Amount', 'Transaction Type', 'Category', 'Group',
  'Account', 'To Account', 'Notes',
]

function nameById<T extends { id: string; name: string }>(items: T[]): Record<string, string> {
  return Object.fromEntries(items.map(item => [item.id, item.name]))
}

function buildFilename(filters: TransactionFilterState): string {
  const today = new Date().toISOString().slice(0, 10)
  if (filters.dateFrom && filters.dateTo) return `MoneyPlant_Transactions_${filters.dateFrom}_to_${filters.dateTo}.csv`
  if (filters.dateFrom) return `MoneyPlant_Transactions_from_${filters.dateFrom}.csv`
  if (filters.dateTo) return `MoneyPlant_Transactions_until_${filters.dateTo}.csv`
  return `MoneyPlant_Transactions_${today}.csv`
}

export async function exportTransactionsCsv(
  userId: string,
  lookup: ExportLookupData,
  filters: TransactionFilterState,
  sortKey: TxnSortKey,
): Promise<number> {
  const allTransactions = await fetchAllPages<Transaction>('transactions', userId, 'transaction_date')
  const rows = filterAndSortTransactions(allTransactions, lookup.categories, filters, sortKey)

  const catMap = catById(lookup.categories)
  const accountNames = nameById(lookup.accounts)
  const creditCardNames = nameById(lookup.creditCards)

  const csvRows = rows.map(t => {
    const cat = catMap[t.category_id ?? '']
    return {
      'Date': t.transaction_date,
      'Description': t.description,
      'Amount': t.amount,
      'Transaction Type': TXN_TYPE_LABELS[t.transaction_type] ?? t.transaction_type,
      'Category': cat?.name ?? '',
      'Group': cat?.group_name ?? '',
      'Account': accountNames[t.from_account_id ?? ''] ?? creditCardNames[t.credit_card_id ?? ''] ?? '',
      'To Account': t.to_account_id ? (accountNames[t.to_account_id] ?? '') : '',
      'Notes': t.notes ?? '',
    }
  })

  const csv = toCsv(csvRows, EXPORT_COLUMNS)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildFilename(filters)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return rows.length
}
