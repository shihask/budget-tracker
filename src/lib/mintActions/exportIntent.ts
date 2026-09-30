import type { AppState, DerivedMetrics } from '@/types'
import { DEFAULT_TXN_FILTERS, filterAndSortTransactions } from '@/lib/transactionFilters'
import type { TxnSortKey } from '@/lib/transactionFilters'
import { parsePeriod } from './period'
import type { ExportTransactionsAction } from './types'

export function classifyExportIntent(
  text: string,
  state: AppState,
  d: DerivedMetrics,
  now: Date = new Date(),
): ExportTransactionsAction | null {
  if (!/\b(export|download|csv|get me)\b/i.test(text)) return null

  const q = text.toLowerCase()
  const cycleStart = d.financialCycle?.cycleStart ?? null

  // No period named → the salary cycle, else this month.
  const period = parsePeriod(q, cycleStart, now)
    ?? parsePeriod(cycleStart ? 'this cycle' : 'this month', cycleStart, now)!
  const { dateFrom, dateTo } = period
  let periodLabel = period.label

  // Strip period/intent keywords before category matching so "salary cycle"
  // doesn't accidentally match the "Salary" income category.
  const catQ = q
    .replace(period.matched, ' ')
    .replace(/\b(salary cycle|this cycle|current cycle)\b/g, ' ')
    .replace(/\b(export|download|csv|get me|all|transactions?)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()

  // Longest-match category to avoid partial name collisions
  const matchedCat = state.categories
    .filter(cat => catQ.includes(cat.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  const category = matchedCat?.id ?? 'all'
  if (matchedCat) periodLabel = `${matchedCat.name} — ${periodLabel}`

  const filters = { ...DEFAULT_TXN_FILTERS, dateFrom, dateTo, category }
  const sortKey: TxnSortKey = 'date_desc'

  const estimatedCount = filterAndSortTransactions(
    state.transactions,
    state.categories,
    filters,
    sortKey,
  ).length

  return { type: 'export_transactions', periodLabel, filters, sortKey, estimatedCount }
}
