import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** PostgREST caps a response (max-rows); page until a short page comes back. */
const LINK_PAGE = 1000

/** Which of my personal transactions already have a household copy, read from
 *  `household_transaction_links` (RLS: my own links only). Loaded once per mount
 *  — the Transactions page remounts on every open, so a copy deleted on the
 *  household side shows as unshared the next time it opens. `sharedIds` stays
 *  null until the first read finishes (or if it fails): the list then shows no
 *  icon at all rather than a wrong one. */
export function useSharedTransactions({ enabled }: { enabled: boolean }) {
  const [sharedIds, setSharedIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const ids = new Set<string>()
      for (let from = 0; ; from += LINK_PAGE) {
        const { data, error } = await supabase
          .from('household_transaction_links')
          .select('transaction_id')
          .order('transaction_id')
          .range(from, from + LINK_PAGE - 1)
        if (error || cancelled) return
        for (const row of data ?? []) ids.add((row as { transaction_id: string }).transaction_id)
        if (!data || data.length < LINK_PAGE) break
      }
      if (!cancelled) setSharedIds(ids)
    })()
    return () => { cancelled = true }
  }, [enabled])

  /** Shares an existing transaction. Idempotent on the server: a retry after a
   *  lost answer returns the copy already made. Throws the PostgREST error. */
  const share = useCallback(async (transactionId: string, householdCategoryId: string) => {
    const { error } = await supabase.rpc('mp_household_share_recorded_transaction', {
      p_transaction_id: transactionId,
      p_household_category_id: householdCategoryId,
    })
    if (error) throw error
    setSharedIds(prev => new Set(prev ?? []).add(transactionId))
  }, [])

  return { sharedIds: enabled ? sharedIds : null, share }
}
