import { useEffect, useMemo, useRef, useState } from 'react'
import { mergeLoadedWins, narrowsTransactions, type TransactionFilterState } from '@/lib/transactionFilters'
import type { Category, Transaction } from '@/types'

/** Wait for typing to pause before asking the database. */
const SEARCH_DEBOUNCE_MS = 350

export type TransactionSearchStatus =
  | 'local'      // no narrowing filter, or everything is loaded — the window is the truth
  | 'searching'  // the database hasn't answered for these filters yet
  | 'complete'   // every match is in `rows`
  | 'truncated'  // the database stopped at SEARCH_MAX_ROWS
  | 'failed'     // the search failed — `rows` is the loaded window only

export type SearchTransactionsFn = (
  filters: TransactionFilterState,
  groupCategoryIds: string[] | null,
) => Promise<{ rows: Transaction[]; truncated: boolean }>

interface SearchResult {
  from: SearchTransactionsFn
  key: string
  rows: Transaction[]
  truncated: boolean
  failed: boolean
}

/** The rows the Transactions page filters. With a narrowing filter and history
 *  not fully loaded, adds every database candidate to the loaded window — see
 *  searchTransactions. The page still runs filterAndSortTransactions over the
 *  result, so matching rules live in one place.
 *
 *  Re-runs when the loaded rows change too: an edit or delete on a row that was
 *  only in the search result doesn't touch the loaded window, but the mutation
 *  still produces a new transactions array, and the refetch picks it up. That
 *  refresh is silent — the status only says "searching" for NEW filters. */
export function useTransactionSearch(
  loaded: Transaction[],
  categories: Category[],
  filters: TransactionFilterState,
  allLoaded: boolean,
  search: SearchTransactionsFn | undefined,
): { rows: Transaction[]; status: TransactionSearchStatus } {
  const active = !!search && !allLoaded && narrowsTransactions(filters)
  const [result, setResult] = useState<SearchResult | null>(null)
  const seq = useRef(0)

  const { search: term, account, category, group, event, dateFrom, dateTo } = filters
  const groupCategoryIds = useMemo(
    () => (group === 'all' ? null : categories.filter(c => c.group_name === group).map(c => c.id)),
    [categories, group])
  // What the database was asked. Only the server-side inputs — sort and
  // showSystemTxns are applied client-side and don't need a new query.
  const key = JSON.stringify([term.trim(), account, category, groupCategoryIds, event, dateFrom, dateTo])

  useEffect(() => {
    const mine = ++seq.current
    if (!active || !search) return
    const t = setTimeout(() => {
      search({ search: term, account, category, group, event, dateFrom, dateTo, showSystemTxns: true }, groupCategoryIds)
        .then(r => {
          if (mine === seq.current) setResult({ from: search, key, rows: r.rows, truncated: r.truncated, failed: false })
        })
        .catch(err => {
          console.error('Transaction search failed', err)
          if (mine !== seq.current) return
          // A failed silent refresh keeps the good answer it was refreshing.
          setResult(prev => prev && prev.from === search && prev.key === key && !prev.failed
            ? prev
            : { from: search, key, rows: [], truncated: false, failed: true })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
    // `key` covers the filter fields; `loaded` re-runs after an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, search, key, loaded])

  // The fn is per user (useCallback on userId), so a sign-in switch can never
  // show the previous user's rows. A result for other filters still holds real
  // rows — the page's client filter drops any that don't match — so it is kept
  // while the new search runs; it just doesn't count as complete.
  const usable = active && result?.from === search ? result : null
  const rows = useMemo(
    () => (usable ? mergeLoadedWins(loaded, usable.rows) : loaded),
    [loaded, usable])

  const status: TransactionSearchStatus = !active ? 'local'
    : !usable || usable.key !== key ? 'searching'
    : usable.failed ? 'failed'
    : usable.truncated ? 'truncated'
    : 'complete'

  return { rows, status }
}
