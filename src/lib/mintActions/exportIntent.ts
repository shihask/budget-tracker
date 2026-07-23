import type { AppState, DerivedMetrics } from '@/types'
import { DEFAULT_TXN_FILTERS, filterAndSortTransactions } from '@/lib/transactionFilters'
import type { TxnSortKey } from '@/lib/transactionFilters'
import type { ExportTransactionsAction } from './types'

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

export function classifyExportIntent(
  text: string,
  state: AppState,
  d: DerivedMetrics,
): ExportTransactionsAction | null {
  if (!/\b(export|download|csv|get me)\b/i.test(text)) return null

  const q = text.toLowerCase()
  const now = new Date()

  let dateFrom = ''
  let dateTo = ''
  let periodLabel = ''

  const namedMonth = MONTHS.findIndex(m => q.includes(m))

  if (/salary cycle|this cycle|current cycle/.test(q) && d.financialCycle?.cycleStart) {
    dateFrom = d.financialCycle.cycleStart.toISOString().slice(0, 10)
    dateTo = now.toISOString().slice(0, 10)
    const startFmt = d.financialCycle.cycleStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    periodLabel = `Salary Cycle (${startFmt} – Today)`

  } else if (/last month/.test(q)) {
    const yr = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const mo = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    dateFrom = new Date(yr, mo, 1).toISOString().slice(0, 10)
    dateTo = new Date(yr, mo + 1, 0).toISOString().slice(0, 10)
    periodLabel = new Date(yr, mo, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  } else if (/this month|current month/.test(q)) {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    dateTo = now.toISOString().slice(0, 10)
    periodLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  } else if (/this week|current week/.test(q)) {
    const day = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    mon.setHours(0, 0, 0, 0)
    dateFrom = mon.toISOString().slice(0, 10)
    dateTo = now.toISOString().slice(0, 10)
    periodLabel = `This Week (${mon.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – Today)`

  } else if (namedMonth >= 0) {
    const yr = namedMonth > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
    dateFrom = new Date(yr, namedMonth, 1).toISOString().slice(0, 10)
    dateTo = new Date(yr, namedMonth + 1, 0).toISOString().slice(0, 10)
    periodLabel = new Date(yr, namedMonth, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  } else {
    if (d.financialCycle?.cycleStart) {
      dateFrom = d.financialCycle.cycleStart.toISOString().slice(0, 10)
      dateTo = now.toISOString().slice(0, 10)
      const startFmt = d.financialCycle.cycleStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      periodLabel = `Salary Cycle (${startFmt} – Today)`
    } else {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      dateTo = now.toISOString().slice(0, 10)
      periodLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    }
  }

  // Strip period/intent keywords before category matching so "salary cycle"
  // doesn't accidentally match the "Salary" income category.
  const catQ = q
    .replace(/\b(salary cycle|this cycle|current cycle|last month|this month|current month|this week|current week)\b/g, ' ')
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g, ' ')
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
