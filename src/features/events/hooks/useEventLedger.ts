import { useEffect, useMemo, useRef, useState } from 'react'
import { mergeEventLedger } from '@/lib/events'
import type { LifeEvent, Transaction } from '@/types'

/** Refetch this long after the last change, so a burst of edits (Link 12
 *  expenses, a split save) costs one query rather than one per row. */
const REFETCH_DEBOUNCE_MS = 600

/** The transaction list every event total reads — the loaded window plus every
 *  event-tagged row from the database. See `mergeEventLedger` for why.
 *
 *  Refetches whenever the loaded transactions or the events change, because a
 *  tag can be added, removed or re-pointed on a row that isn't in the window
 *  (the event detail page opens old rows for editing). Until the first fetch
 *  lands — or if it fails — this is just the loaded window, i.e. exactly what
 *  every event total showed before. No events, no query. */
export function useEventLedger(
  transactions: Transaction[],
  events: LifeEvent[],
  fetchEventLedger: () => Promise<Transaction[]>,
): Transaction[] {
  // Stamped with the fetcher that produced it: that function is per-user
  // (useCallback on userId), so a sign-in switch can never show the previous
  // user's rows while the new fetch is in flight.
  const [fetched, setFetched] = useState<{ from: typeof fetchEventLedger; rows: Transaction[] } | null>(null)
  const seq = useRef(0)
  const hasEvents = events.length > 0

  useEffect(() => {
    if (!hasEvents) return
    const mine = ++seq.current
    const t = setTimeout(() => {
      fetchEventLedger()
        // A slower earlier fetch must not overwrite a newer one.
        .then(rows => { if (mine === seq.current) setFetched({ from: fetchEventLedger, rows }) })
        .catch(err => console.error('Failed to load event history', err))
    }, REFETCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [transactions, events, hasEvents, fetchEventLedger])

  return useMemo(
    () => (hasEvents && fetched?.from === fetchEventLedger
      ? mergeEventLedger(transactions, fetched.rows)
      : transactions),
    [transactions, fetched, hasEvents, fetchEventLedger],
  )
}
