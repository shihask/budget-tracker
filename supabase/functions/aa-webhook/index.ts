// Receives Setu/Finvu webhook notifications (CONSENT_STATUS_UPDATE,
// SESSION_STATUS_UPDATE). Third auth shape in this repo: no Supabase JWT at
// all — the caller is Setu, not a logged-in browser — so this needs
// verify_jwt = false in supabase/config.toml (first one in this repo) and
// its own verification instead of .auth.getUser().
//
// Phase 0 confirmed sandbox sends no signature/HMAC on these webhooks, so
// verification here is deliberately layered, not a single mechanism:
//   1. A shared-secret query token on the registered webhook URL — a
//      stopgap, NOT cryptographic proof of authenticity.
//   2. Defense in depth, independent of (1): reject any payload whose
//      consentId/dataSessionId doesn't match an existing sync_connections
//      row. This alone blocks random internet noise even if the token leaks.
// Production webhook signing remains unresolved — flagged here exactly as
// Phase 0 flagged it, not solved by this function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createSession, getSessionData } from '../_shared/setu-client.ts'
import { normalizeAaSession } from '../_shared/aa-normalize.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_TOKEN = Deno.env.get('AA_WEBHOOK_TOKEN')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Setu's consent status values -> our sync_connections.status enum.
function mapConsentStatus(setuStatus: string): { status: string; isError: boolean } {
  switch (setuStatus) {
    case 'ACTIVE': return { status: 'active', isError: false }
    case 'REVOKED': return { status: 'revoked', isError: false }
    case 'EXPIRED': return { status: 'expired', isError: false }
    case 'REJECTED': return { status: 'revoked', isError: false } // user declined at the consent screen
    default: return { status: 'error', isError: true } // e.g. PAUSED — unhandled, surface as error rather than guess
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const token = new URL(req.url).searchParams.get('token')
    if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const body = await req.json()
    const { type, consentId } = body as { type?: string; consentId?: string }

    if (!consentId) {
      return new Response(JSON.stringify({ error: 'missing_consent_id' }), { status: 400, headers: cors })
    }

    const { data: connection } = await db
      .from('sync_connections')
      .select('id, user_id, status, fetch_type, retry_count, last_processed_session_id')
      .eq('provider', 'aa')
      .eq('provider_connection_id', consentId)
      .single()

    // Defense in depth: no matching connection means this payload isn't
    // referencing anything we created, regardless of the token.
    if (!connection) {
      return new Response(JSON.stringify({ error: 'unknown_connection' }), { status: 404, headers: cors })
    }

    if (type === 'CONSENT_STATUS_UPDATE') {
      await handleConsentStatusUpdate(db, connection, body)
    } else if (type === 'SESSION_STATUS_UPDATE') {
      await handleSessionStatusUpdate(db, connection, body)
    }
    // Unknown notification types: 200 anyway — acknowledging receipt matters
    // more than understanding every type Setu might ever send.

    return new Response(JSON.stringify({ received: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[aa-webhook] unhandled exception:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})

// deno-lint-ignore no-explicit-any
async function handleConsentStatusUpdate(db: any, connection: { id: string; user_id: string }, body: any) {
  const setuStatus = body?.data?.status as string | undefined
  const { status, isError } = mapConsentStatus(setuStatus ?? '')

  await db
    .from('sync_connections')
    .update({
      status,
      provider_metadata: body?.data?.detail ?? {},
      ...(isError ? { last_error: `Unhandled consent status: ${setuStatus}` } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)

  // Consent just went ACTIVE — trigger the first fetch immediately rather
  // than waiting for the scheduler's next run.
  if (status === 'active') {
    await triggerSession(db, connection.id, connection.user_id, body.consentId)
  }
}

// deno-lint-ignore no-explicit-any
async function triggerSession(db: any, connectionId: string, _userId: string, consentId: string) {
  // "to" must fall at/before the consent's own dataRange.to, fixed at
  // consent-creation time — any gap before the webhook fires (not instant)
  // means "now" can drift past it. Same bug and same fix as Phase 0's spike
  // scripts (see scripts/aa-discovery-spike/issues.md) — buffer by a day.
  const to = new Date()
  to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - 30) // narrow, safe window — well within any consent's dataRange

  try {
    await createSession(consentId, from.toISOString(), to.toISOString())
    await db
      .from('sync_connections')
      .update({ status: 'syncing', last_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', connectionId)
  } catch (e) {
    console.error('[aa-webhook] failed to trigger session:', e)
    await db
      .from('sync_connections')
      .update({ last_error: String(e), last_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', connectionId)
  }
}

// deno-lint-ignore no-explicit-any
async function handleSessionStatusUpdate(db: any, connection: any, body: any) {
  const sessionStatus = body?.data?.status as string | undefined
  const dataSessionId = body?.dataSessionId as string | undefined
  if (!dataSessionId) return

  if (sessionStatus === 'PENDING') return // not done yet — wait for the next notification or the scheduler

  // Session-level idempotency: a redelivered webhook for a session we've
  // already fully processed is a no-op. This is what actually protects
  // balance/profile events (which have no per-event external id to dedup
  // on, unlike transactions) — see 20260714000006's migration comment.
  if (connection.last_processed_session_id === dataSessionId) return

  if (sessionStatus === 'FAILED') {
    await db
      .from('sync_connections')
      .update({
        status: 'error',
        retry_count: (connection.retry_count ?? 0) + 1,
        last_error: 'Setu reported SESSION_STATUS_UPDATE: FAILED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
    return
  }

  // COMPLETED or PARTIAL — fetch what's available.
  try {
    const session = await getSessionData(dataSessionId)
    const events = normalizeAaSession(session)

    if (events.length > 0) {
      const rows = events.map(e => ({
        user_id: connection.user_id,
        connection_id: connection.id,
        provider: 'aa',
        provider_connection_id: body.consentId,
        provider_account_id: e.accountId,
        provider_event_id: e.externalId,
        event_type: e.eventType,
        raw_payload: e.raw,
        provider_metadata: e.metadata,
      }))

      const { error: insertError } = await db
        .from('sync_events')
        .upsert(rows, { onConflict: 'provider,provider_connection_id,provider_event_id', ignoreDuplicates: true })

      if (insertError) console.error('[aa-webhook] sync_events insert error:', insertError)
    }

    const nextSyncAfter = connection.fetch_type === 'periodic'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 1/DAY — the only frequency aa-connect currently issues
      : null

    await db
      .from('sync_connections')
      .update({
        status: 'synced',
        last_synced_at: new Date().toISOString(),
        last_processed_session_id: dataSessionId,
        next_sync_after: nextSyncAfter,
        retry_count: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
  } catch (e) {
    console.error('[aa-webhook] failed to fetch/normalize session data:', e)
    await db
      .from('sync_connections')
      .update({
        status: 'error',
        retry_count: (connection.retry_count ?? 0) + 1,
        last_error: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
  }
}
