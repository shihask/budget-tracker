// Setu AA Gateway client — ported from the validated Phase 0 spike
// (scripts/aa-discovery-spike/lib/setu-client.mjs). Every endpoint/quirk here
// was verified live against the sandbox on 2026-07-13/14; see
// docs/aa-integration-phase0.md and scripts/aa-discovery-spike/issues.md for
// the full record of what the public docs got wrong.
//
// First shared module in supabase/functions/ — no _shared/ convention existed
// in this repo before Phase 1a.

const SETU_CLIENT_ID = Deno.env.get('SETU_CLIENT_ID')!
const SETU_CLIENT_SECRET = Deno.env.get('SETU_CLIENT_SECRET')!
const SETU_BASE_URL = Deno.env.get('SETU_BASE_URL') ?? 'https://fiu-sandbox.setu.co'
const SETU_PRODUCT_INSTANCE_ID = Deno.env.get('SETU_PRODUCT_INSTANCE_ID')!

let cachedToken: string | null = null
let cachedTokenExpiresAt = 0

// The AA Gateway's own token endpoint — NOT the general Bridge OAuth endpoint
// (uat.setu.co/api/v2/auth/token), which issues tokens the AA Gateway itself
// rejects with 401 "Token issuer not allowed". Response is flat
// {access_token, refresh_token}, no expiresIn — cache conservatively.
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken

  const res = await fetch('https://orgservice-prod.setu.co/v1/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', client: 'bridge' },
    body: JSON.stringify({ clientID: SETU_CLIENT_ID, grant_type: 'client_credentials', secret: SETU_CLIENT_SECRET }),
  })
  if (!res.ok) {
    throw new Error(`Setu token request failed: ${res.status} ${await res.text()}`)
  }
  const { access_token } = await res.json()
  cachedToken = access_token
  cachedTokenExpiresAt = Date.now() + 55 * 60 * 1000
  return cachedToken
}

async function setuRequest<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${SETU_BASE_URL}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-product-instance-id': SETU_PRODUCT_INSTANCE_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`Setu ${method} ${urlPath} failed: ${res.status} ${JSON.stringify(json)}`)
  }
  return json as T
}

export interface CreateConsentParams {
  vua: string
  dataRangeFrom: string // ISO datetime
  dataRangeTo: string // ISO datetime
  fetchType: 'ONETIME' | 'PERIODIC'
  frequency?: { unit: 'HOUR' | 'DAY' | 'MONTH'; value: number } // required when fetchType is PERIODIC
  consentTypes: Array<'PROFILE' | 'SUMMARY' | 'TRANSACTIONS'>
  fiTypes: string[] // e.g. ['DEPOSIT'], ['RECURRING_DEPOSIT']
  purposeCode: string
  purposeText: string
  redirectUrl: string
}

export interface SetuConsentResponse {
  id: string
  url: string
  status: string
  detail: Record<string, unknown>
}

// Verified body shape — /v2/consents, not the unversioned /consents from the
// general docs. dataLife must be {value: 0} for consentMode VIEW (fair-use
// rule, undocumented, found by trial and error in Phase 0).
export function createConsent(params: CreateConsentParams): Promise<SetuConsentResponse> {
  return setuRequest('POST', '/v2/consents', {
    vua: params.vua,
    dataRange: { from: params.dataRangeFrom, to: params.dataRangeTo },
    consentDuration: { unit: 'MONTH', value: 12 },
    dataLife: { unit: 'MONTH', value: 0 },
    fetchType: params.fetchType,
    ...(params.frequency ? { frequency: params.frequency } : {}),
    consentMode: 'VIEW',
    consentTypes: params.consentTypes,
    fiTypes: params.fiTypes,
    purpose: {
      code: params.purposeCode,
      text: params.purposeText,
      category: { type: 'Personal Finance' },
      refUri: `https://api.rebit.org.in/aa/purpose/${params.purposeCode}.xml`,
    },
    redirectUrl: params.redirectUrl,
  })
}

export interface SetuSessionResponse {
  id: string
  consentId: string
  status: 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
  format: string
  fips?: Array<{
    fipID: string
    accounts: Array<{
      linkRefNumber: string
      maskedAccNumber: string
      FIstatus: string
      data?: { account: Record<string, unknown> }
    }>
  }>
}

// POST /v2/sessions — creates a data-fetch session against an ACTIVE consent.
export function createSession(consentId: string, dataRangeFrom: string, dataRangeTo: string): Promise<SetuSessionResponse> {
  return setuRequest('POST', '/v2/sessions', {
    consentId,
    format: 'json',
    dataRange: { from: dataRangeFrom, to: dataRangeTo },
  })
}

// GET /v2/sessions/{id} — polls AND retrieves the actual FI data in one call.
// There is no separate "/FI/fetch" endpoint despite what the general docs
// imply; status: 'COMPLETED' means the response already contains the data.
export function getSessionData(sessionId: string): Promise<SetuSessionResponse> {
  return setuRequest('GET', `/v2/sessions/${sessionId}`)
}

// GET /v2/consents/{id} — used only for the redirect-return fallback (see
// Failure Recovery in the Phase 1a plan): if the CONSENT_STATUS_UPDATE
// webhook is lost, check status directly instead of waiting on it forever.
// UNVERIFIED against live sandbox — Phase 0 confirmed POST /v2/consents,
// POST /v2/sessions, and GET /v2/sessions/{id} by running them for real, but
// never exercised this one. Following the same /v2/ prefix + response-shape
// pattern as the verified endpoints; treat the exact field names here as a
// best guess until the first real call confirms or corrects them.
export function getConsent(consentId: string): Promise<SetuConsentResponse> {
  return setuRequest('GET', `/v2/consents/${consentId}`)
}
