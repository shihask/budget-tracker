import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mergeLoadedWins } from '@/lib/transactionFilters'
import type { Transaction } from '@/types'

const PAGE = 1000
/** Stepping back several months in a row costs one query, not one per tap. */
const FETCH_DEBOUNCE_MS = 250

/** Every transaction dated on/after `from` (and before `before`, when given) —
 *  paged past PostgREST's 1000-row cap; `id` breaks date ties so pages never overlap. */
async function fetchRange(userId: string, from: string, before: string | null): Promise<Transaction[]> {
  const rows: Transaction[] = []
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', from)
    if (before) q = q.lt('transaction_date', before)
    const { data, error } = await q
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data as Transaction[]) ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** The rows Analytics reads: the loaded window plus every row from `from` to now.
 *  `state.transactions` is only the latest 200 rows, so last month's charts were
 *  empty until the user scrolled Transactions to the bottom.
 *
 *  Always fetched up to today (not just the viewed month): Journey's opening and
 *  closing balances replay every row after the month back from the live balance.
 *  Coverage only grows backward — stepping to an older month fetches just the gap.
 *  Loaded rows win an id clash (they carry this session's edits). Lives in
 *  AnalyticsPage, so each open starts fresh. */
export function useAnalyticsLedger(args: {
  userId: string
  loaded: Transaction[]
  allLoaded: boolean
  from: string
}): { transactions: Transaction[]; loading: boolean } {
  const { userId, loaded, allLoaded, from } = args
  const [covered, setCovered] = useState<{ userId: string; from: string; rows: Transaction[] } | null>(null)
  const [failedFrom, setFailedFrom] = useState<string | null>(null)
  const seq = useRef(0)
  const mine = covered?.userId === userId ? covered : null
  const coveredFrom = mine?.from ?? null
  const needsFetch = !allLoaded && (coveredFrom == null || from < coveredFrom)

  useEffect(() => {
    if (!needsFetch) return
    const id = ++seq.current
    const t = setTimeout(() => {
      fetchRange(userId, from, coveredFrom)
        .then(rows => {
          if (id !== seq.current) return
          setCovered(prev => {
            const base = prev?.userId === userId && prev.from === coveredFrom ? prev.rows : []
            return { userId, from, rows: [...base, ...rows] }
          })
        })
        .catch(err => {
          if (id !== seq.current) return
          console.error('Analytics: failed to load older transactions', err)
          setFailedFrom(from)
        })
    }, FETCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [needsFetch, userId, from, coveredFrom])

  const transactions = useMemo(
    () => (!allLoaded && mine ? mergeLoadedWins(loaded, mine.rows) : loaded),
    [loaded, allLoaded, mine],
  )
  return { transactions, loading: needsFetch && failedFrom !== from }
}
