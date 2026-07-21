import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Mirrors useAaReviewCount's shape, scoped to statement-import batches
// (status 'review' or 'extracting' — a batch mid-extraction still counts as
// "needs your attention eventually") so it doesn't conflate with the
// AA-sync review count shown elsewhere.
export function useStatementReviewCount(userId: string) {
  const [count, setCount] = useState(0)

  const refetch = useCallback(async () => {
    const { count: c } = await supabase
      .from('import_batches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['review', 'extracting', 'cancelled'])
    setCount(c ?? 0)
  }, [userId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { count, refetch }
}
