// Cron-triggered (see the accompanying migration for the pg_cron/pg_net
// schedule). Same trust shape as push-send: invoked with the service_role
// key as bearer token, which IS a validly-signed Supabase JWT, so this
// function needs no verify_jwt override in config.toml — only aa-webhook
// does, since its caller (Setu) has no Supabase JWT at all.
//
// Two responsibilities per the Phase 1a plan's Failure Recovery section:
//   (a) due PERIODIC connections — normal scheduled re-fetch
//   (b) stuck in-flight connections — the webhook catch-all, with
//       documented exponential backoff (1min -> 5min -> 30min, error after
//       5 attempts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createSession } from '../_shared/setu-client.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STUCK_TIMEOUT_MINUTES = 10
const MAX_RETRIES = 5
const BACKOFF_MINUTES = [1, 5, 30] // retry_count 0, 1, 2+ (2+ stays at 30)

function backoffElapsed(lastAttemptedAt: string, retryCount: number): boolean {
  const minutes = BACKOFF_MINUTES[Math.min(retryCount, BACKOFF_MINUTES.length - 1)]
  return Date.now() - new Date(lastAttemptedAt).getTime() >= minutes * 60 * 1000
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const now = new Date().toISOString()

    // (a) due PERIODIC connections
    const { data: due } = await db
      .from('sync_connections')
      .select('id, provider_connection_id')
      .eq('status', 'synced')
      .eq('fetch_type', 'periodic')
      .lte('next_sync_after', now)

    let dueTriggered = 0
    for (const conn of due ?? []) {
      await triggerFetch(db, conn.id, conn.provider_connection_id)
      dueTriggered++
    }

    // (b) stuck in-flight connections
    const stuckCutoff = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString()
    const { data: stuck } = await db
      .from('sync_connections')
      .select('id, provider_connection_id, retry_count, last_attempted_at')
      .in('status', ['active', 'syncing'])
      .lt('last_attempted_at', stuckCutoff)

    let stuckRetried = 0
    let stuckFailed = 0
    for (const conn of stuck ?? []) {
      if (conn.retry_count >= MAX_RETRIES) {
        await db
          .from('sync_connections')
          .update({ status: 'error', last_error: 'Max retries exceeded — no SESSION_STATUS_UPDATE received', updated_at: now })
          .eq('id', conn.id)
        stuckFailed++
        continue
      }
      if (!backoffElapsed(conn.last_attempted_at, conn.retry_count)) continue // not due for retry yet

      await triggerFetch(db, conn.id, conn.provider_connection_id, conn.retry_count + 1)
      stuckRetried++
    }

    return new Response(
      JSON.stringify({ dueTriggered, stuckRetried, stuckFailed }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[aa-sync-scheduler] unhandled exception:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})

// deno-lint-ignore no-explicit-any
async function triggerFetch(db: any, connectionId: string, consentId: string, nextRetryCount?: number) {
  // Same date-drift fix as aa-webhook's triggerSession — see that file's
  // comment and scripts/aa-discovery-spike/issues.md for why the buffer
  // is needed.
  const to = new Date()
  to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - 30)

  const now = new Date().toISOString()
  try {
    await createSession(consentId, from.toISOString(), to.toISOString())
    await db
      .from('sync_connections')
      .update({
        status: 'syncing',
        last_attempted_at: now,
        ...(nextRetryCount != null ? { retry_count: nextRetryCount } : {}),
        updated_at: now,
      })
      .eq('id', connectionId)
  } catch (e) {
    console.error(`[aa-sync-scheduler] failed to trigger session for connection ${connectionId}:`, e)
    await db
      .from('sync_connections')
      .update({
        last_attempted_at: now,
        last_error: String(e),
        ...(nextRetryCount != null ? { retry_count: nextRetryCount } : {}),
        updated_at: now,
      })
      .eq('id', connectionId)
  }
}
