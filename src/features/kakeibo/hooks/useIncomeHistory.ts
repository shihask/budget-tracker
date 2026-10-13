import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mergeLoadedWins } from '@/lib/transactionFilters'
import type { Transaction } from '@/types'

const PAGE = 1000

/** Income rows since `from` — what the cycle engine needs to walk back through
 *  past salary cycles beyond the 200-row window. Only while `enabled` (the
 *  Kakeibo tab is open). `complete` is false until the fetch lands (or when it
 *  failed): the caller must not offer engine-derived cycles from partial history. */
export function useIncomeHistory(args: {
  userId: string
  loaded: Transaction[]
  allLoaded: boolean
  from: string
  enabled: boolean
}): { rows: Transaction[]; complete: boolean } {
  const { userId, loaded, allLoaded, from, enabled } = args
  const [fetched, setFetched] = useState<{ key: string; rows: Transaction[] } | null>(null)
  const key = `${userId}|${from}`
  const needsFetch = enabled && !allLoaded

  useEffect(() => {
    if (!needsFetch) return
    let alive = true
    ;(async () => {
      const rows: Transaction[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('transaction_type', 'income')
          .gte('transaction_date', from)
          .order('transaction_date', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const page = (data as Transaction[]) ?? []
        rows.push(...page)
        if (page.length < PAGE) break
      }
      if (alive) setFetched({ key, rows })
    })().catch(err => console.error('Kakeibo: failed to load income history', err))
    return () => { alive = false }
  }, [needsFetch, userId, from, key])

  const have = fetched?.key === key
  const rows = useMemo(() => (have ? mergeLoadedWins(loaded, fetched!.rows) : loaded), [have, loaded, fetched])
  return { rows, complete: allLoaded || have }
}
