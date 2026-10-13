import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/supabasePagination'
import { toCsv } from '@/lib/csvUtils'
import { catById } from '@/lib/data'
import { filterAndSortTransactions, type TransactionFilterState, type TxnSortKey } from '@/lib/transactionFilters'
import type { Account, Category, CreditCard, LifeEvent, Transaction, TransactionType } from '@/types'

export interface ExportLookupData {
  categories: Category[]
  accounts: Account[]
  creditCards: CreditCard[]
  events: LifeEvent[]
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
  // Split payments stay one row per leg; rows sharing a Split Group are one expense.
  // A dedicated column keeps that machine-readable instead of mangling Description.
  'Account', 'To Account', 'Split Group', 'Life Event', 'Notes',
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

export interface TransactionsCsv {
  csv: string
  filename: string
  count: number
}

/** Fetches every transaction and builds the CSV — shared by download and email. */
export async function buildTransactionsCsv(
  userId: string,
  lookup: ExportLookupData,
  filters: TransactionFilterState,
  sortKey: TxnSortKey,
): Promise<TransactionsCsv> {
  const allTransactions = await fetchAllPages<Transaction>('transactions', userId, 'transaction_date')
  const rows = filterAndSortTransactions(allTransactions, lookup.categories, filters, sortKey)

  const catMap = catById(lookup.categories)
  const accountNames = nameById(lookup.accounts)
  const creditCardNames = nameById(lookup.creditCards)
  const eventNames = nameById(lookup.events)

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
      'Split Group': t.split_group_id ?? '',
      'Life Event': eventNames[t.event_id ?? ''] ?? '',
      'Notes': t.notes ?? '',
    }
  })

  return { csv: toCsv(csvRows, EXPORT_COLUMNS), filename: buildFilename(filters), count: rows.length }
}

export async function exportTransactionsCsv(
  userId: string,
  lookup: ExportLookupData,
  filters: TransactionFilterState,
  sortKey: TxnSortKey,
): Promise<number> {
  const { csv, filename, count } = await buildTransactionsCsv(userId, lookup, filters, sortKey)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return count
}

const EMAIL_ERROR_MESSAGES: Record<string, string> = {
  no_email: 'Add an email address in your Profile to receive statements.',
  daily_limit: "You've reached today's limit for emailed statements. Try again tomorrow, or download instead.",
  too_large: 'This statement is too large to email. Narrow the dates, or download instead.',
  email_not_configured: "Emailing statements isn't available right now. Download instead.",
}

/**
 * Builds the same CSV as the download and mails it to the user's own
 * confirmed email — send-statement-email decides the recipient, never the
 * client. Resolves with the row count; throws an Error with a user-facing message.
 */
export async function emailTransactionsCsv(
  userId: string,
  lookup: ExportLookupData,
  filters: TransactionFilterState,
  sortKey: TxnSortKey,
  summary: string,
): Promise<number> {
  const { csv, filename, count } = await buildTransactionsCsv(userId, lookup, filters, sortKey)
  const { error } = await supabase.functions.invoke('send-statement-email', {
    body: { csv, filename, count, summary },
  })
  if (error) {
    let code = ''
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* not JSON */ }
    throw new Error(EMAIL_ERROR_MESSAGES[code] ?? "Couldn't send the email. Please try again.")
  }
  return count
}
