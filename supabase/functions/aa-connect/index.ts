// Browser-invoked. POST creates an AA consent and a sync_connections row for
// the calling user. GET ?connectionId=... is the redirect-return fallback
// from the Phase 1a plan's Failure Recovery section: if the
// CONSENT_STATUS_UPDATE webhook is lost, ConnectBankSheet calls this to check
// status directly with Setu instead of waiting on a webhook that may never
// arrive. Auth shape matches ai-categorize (anon-key client + forwarded
// Authorization header + .auth.getUser()) — every write here runs under the
// user's own JWT, RLS-scoped, no service-role client needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createConsent, getConsent } from '../_shared/setu-client.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const APP_URL = Deno.env.get('APP_URL') || 'https://moneyplant.app'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Defaults match the exact config validated end-to-end against sandbox in
// Phase 0 — see docs/aa-integration-phase0.md. PERIODIC/1-per-DAY, not
// ONETIME: a ONETIME consent is single-use forever (confirmed in Phase 0),
// unusable as the basis for real recurring sync.
const DEFAULT_FI_TYPES = ['DEPOSIT']
const DEFAULT_CONSENT_TYPES: Array<'PROFILE' | 'SUMMARY' | 'TRANSACTIONS'> = ['PROFILE', 'SUMMARY', 'TRANSACTIONS']
const PURPOSE_CODE = '102' // "Customer spending and budget analysis"
const PURPOSE_TEXT = 'Track spending and manage budget in MoneyPlant'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })

    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })

    if (req.method === 'GET') {
      return await reconcileStatus(anonClient, new URL(req.url).searchParams.get('connectionId'))
    }

    const body = await req.json().catch(() => ({}))
    const mobile: string | undefined = body.mobile
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      return new Response(JSON.stringify({ error: 'invalid_mobile', message: 'A 10-digit mobile number is required' }), {
        status: 400,
        headers: cors,
      })
    }

    const to = new Date()
    const from = new Date(to)
    from.setMonth(from.getMonth() - 12)

    const consent = await createConsent({
      vua: `${mobile}@finvu`,
      dataRangeFrom: from.toISOString(),
      dataRangeTo: to.toISOString(),
      fetchType: 'PERIODIC',
      frequency: { unit: 'DAY', value: 1 },
      consentTypes: DEFAULT_CONSENT_TYPES,
      fiTypes: DEFAULT_FI_TYPES,
      purposeCode: PURPOSE_CODE,
      purposeText: PURPOSE_TEXT,
      redirectUrl: `${APP_URL}/aa/redirect`,
    })

    const { data: connection, error: insertError } = await anonClient
      .from('sync_connections')
      .insert({
        user_id: user.id,
        provider: 'aa',
        provider_connection_id: consent.id,
        status: 'pending',
        fetch_type: 'periodic',
        fetch_frequency: '1/DAY',
        provider_metadata: { vua: `${mobile}@finvu`, fiTypes: DEFAULT_FI_TYPES, consentDetail: consent.detail },
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[aa-connect] failed to insert sync_connections row:', insertError)
      return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
    }

    return new Response(
      JSON.stringify({ redirectUrl: consent.url, connectionId: connection.id }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[aa-connect] unhandled exception:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})

// deno-lint-ignore no-explicit-any
async function reconcileStatus(anonClient: any, connectionId: string | null) {
  if (!connectionId) {
    return new Response(JSON.stringify({ error: 'missing_connection_id' }), { status: 400, headers: cors })
  }

  const { data: connection } = await anonClient
    .from('sync_connections')
    .select('id, status, provider_connection_id')
    .eq('id', connectionId)
    .single()

  if (!connection) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: cors })
  }

  // Already past pending (webhook arrived, or a previous reconcile already
  // caught it) — nothing to do, avoid an unnecessary Setu call.
  if (connection.status !== 'pending') {
    return new Response(JSON.stringify({ status: connection.status }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    const consent = await getConsent(connection.provider_connection_id)
    if (consent.status === 'ACTIVE') {
      await anonClient
        .from('sync_connections')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', connectionId)
      return new Response(JSON.stringify({ status: 'active' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ status: connection.status }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    // getConsent is unverified against live sandbox (see setu-client.ts) —
    // fail soft here rather than surface an error for what's just a status
    // check; the scheduler's stuck-connection query is the durable fallback.
    console.error('[aa-connect] reconcile status check failed:', e)
    return new Response(JSON.stringify({ status: connection.status }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
}
