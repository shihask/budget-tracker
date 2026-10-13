import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mergeLoadedWins } from '@/lib/transactionFilters'
import type { Transaction } from '@/types'

const PAGE = 1000

/** Every transaction in [from, to] — paged past PostgREST's 1000-row cap; `id`
 *  breaks date ties so pages never overlap. */
async function fetchRange(userId: string, from: string, to: string): Promise<Transaction[]> {
  const rows: Transaction[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data as Transaction[]) ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

export type LedgerStatus = 'idle' | 'loading' | 'ready' | 'error'

/** The rows a Kakeibo review reads: the loaded window plus the cycle's own date
 *  range from the database. `state.transactions` is only the latest 200 rows, so
 *  a finished cycle has usually scrolled out of it. Loaded rows win an id clash
 *  (they carry this session's edits). Runs only while `enabled` — a review or the
 *  Analytics tab is open — never on the dashboard. */
export function useCycleLedger(args: {
  userId: string
  loaded: Transaction[]
  allLoaded: boolean
  from: string | null
  to: string | null
  enabled: boolean
}): { rows: Transaction[]; status: LedgerStatus; retry: () => void } {
  const { userId, loaded, allLoaded, from, to, enabled } = args
  const [fetched, setFetched] = useState<{ key: string; rows: Transaction[] } | null>(null)
  // Stamped with the attempt that failed, so a retry reads as loading again
  // without resetting state inside the effect.
  const [failed, setFailed] = useState<{ key: string; attempt: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)
  const key = from && to ? `${userId}|${from}|${to}` : null
  const needsFetch = enabled && key != null && !allLoaded

  useEffect(() => {
    if (!needsFetch || !from || !to || !key) return
    const mine = ++seq.current
    fetchRange(userId, from, to)
      .then(rows => { if (mine === seq.current) setFetched({ key, rows }) })
      .catch(err => {
        if (mine !== seq.current) return
        console.error('Kakeibo: failed to load cycle transactions', err)
        setFailed({ key, attempt })
      })
  }, [needsFetch, userId, from, to, key, attempt])

  const retry = useCallback(() => setAttempt(a => a + 1), [])

  const have = fetched != null && fetched.key === key
  const rows = useMemo(
    () => (have ? mergeLoadedWins(loaded, fetched!.rows) : loaded),
    [loaded, fetched, have],
  )
  const status: LedgerStatus =
    !enabled || !key ? 'idle'
    : allLoaded || have ? 'ready'
    : failed?.key === key && failed.attempt === attempt ? 'error'
    : 'loading'
  return { rows, status, retry }
}
