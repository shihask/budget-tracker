import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Backs a small "this account is bank-synced" badge on AccountsSection —
// just the set of account_connections.account_id for this user, nothing
// per-connection. Mirrors useAaReviewCount's shape (no realtime — same
// reasoning: sync_events isn't in the Supabase realtime publication, and
// account_connections isn't either).
export function useAaLinkedAccounts(userId: string) {
  const [linkedAccountIds, setLinkedAccountIds] = useState<Set<string>>(new Set())

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('account_connections')
      .select('account_id')
      .eq('user_id', userId)
    setLinkedAccountIds(new Set((data ?? []).map(r => r.account_id)))
  }, [userId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { linkedAccountIds, refetch }
}
