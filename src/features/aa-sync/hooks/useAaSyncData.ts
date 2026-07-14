import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { SyncConnection, ConnectionHealth } from '../types'

export interface SyncConnectionWithHealth extends SyncConnection {
  health: ConnectionHealth
}

// Maps raw SyncConnection fields to a single derived health value — kept in
// one place so a dashboard badge, a settings row, and a future notification
// don't each re-derive this independently from status/retry_count.
export function deriveConnectionHealth(c: Pick<SyncConnection, 'status' | 'retry_count'>): ConnectionHealth {
  switch (c.status) {
    case 'error':
      return 'failed'
    case 'expired':
      return 'expired'
    case 'revoked':
      return 'revoked'
    case 'synced':
      return c.retry_count > 0 ? 'degraded' : 'healthy'
    default:
      // pending / active / syncing — not yet at a steady state to grade
      return c.retry_count > 0 ? 'degraded' : 'healthy'
  }
}

// Read-only connection status for Phase 1a — no promotion loop. Mirrors
// src/features/shared-projects/hooks/useProjectsSummary.ts: own state, own
// realtime subscription reacting to server-side writes (the webhook/scheduler
// Edge Functions), not folded into useSupabaseData's AppState.
export function useAaSyncData(userId: string) {
  const [connections, setConnections] = useState<SyncConnectionWithHealth[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    fetchConnections()

    const channel = supabase
      .channel(`aa-sync-connections-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sync_connections', filter: `user_id=eq.${userId}` },
        () => { if (mountedRef.current) fetchConnections() }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [userId])

  async function fetchConnections() {
    setLoading(true)
    const { data } = await supabase
      .from('sync_connections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (mountedRef.current) {
      setConnections((data ?? []).map(c => ({ ...c, health: deriveConnectionHealth(c) })))
      setLoading(false)
    }
  }

  return { connections, loading, refetch: fetchConnections }
}
