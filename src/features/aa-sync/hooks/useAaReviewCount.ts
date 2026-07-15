import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Backs the dashboard's "N bank transactions to review" banner. Mirrors
// useAaSyncData's shape, but no realtime subscription — sync_events isn't in
// the Supabase realtime publication (confirmed live), so this can only ever
// be as fresh as its last fetch, same as DedupReviewSheet's own refetch-on-
// open behavior. Callers refetch explicitly (on mount, and after the review
// sheet closes) rather than expecting a live-updating badge.
export function useAaReviewCount(userId: string) {
  const [count, setCount] = useState(0)

  const refetch = useCallback(async () => {
    const { count: c } = await supabase
      .from('sync_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'needs_review')
    setCount(c ?? 0)
  }, [userId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { count, refetch }
}
