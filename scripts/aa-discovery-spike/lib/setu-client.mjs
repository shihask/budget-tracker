// Shared HTTP client for the AA Discovery Spike scripts. Every call is timed
// and appended to api-log.md so latency and rate-limit behavior are captured
// without extra effort during the manual walkthrough.

import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_LOG_PATH = path.join(__dirname, '..', 'api-log.md')

const REQUIRED_ENV = ['SETU_BASE_URL', 'SETU_CLIENT_ID', 'SETU_CLIENT_SECRET']

export function assertEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k])
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} — copy .env.aa.example to .env.aa and fill in your Setu Bridge sandbox credentials`)
    process.exit(1)
  }
}

let cachedToken = null
let cachedTokenExpiresAt = 0

// Verified live against sandbox on 2026-07-13 via docs.setu.co's AA Gateway
// "Get Token" reference — the general Bridge OAuth endpoint
// (uat.setu.co/api/v2/auth/token) issues tokens the AA Gateway itself
// rejects with 401 "Token issuer not allowed". This one, paired with the AA
// Gateway's own API reference, is the one that actually works against
// fiu-sandbox.setu.co. Response is flat {access_token, refresh_token}, no
// expiresIn — cache conservatively (55 min) since none was given.
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken
  const { SETU_CLIENT_ID, SETU_CLIENT_SECRET } = process.env
  const res = await timedFetch('POST', 'https://orgservice-prod.setu.co/v1/users/login', {
    headers: { 'Content-Type': 'application/json', client: 'bridge' },
    body: JSON.stringify({ clientID: SETU_CLIENT_ID, grant_type: 'client_credentials', secret: SETU_CLIENT_SECRET }),
  })
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`)
  }
  const { access_token } = await res.json()
  cachedToken = access_token
  cachedTokenExpiresAt = Date.now() + 55 * 60 * 1000
  return cachedToken
}

export async function setuRequest(method, urlPath, body) {
  assertEnv()
  const token = await getAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  // TODO(spike): confirm whether Bridge V2 still needs x-product-instance-id
  // once the Account Aggregator Data product is set up, or whether the
  // FIU-scoped client credentials make it redundant.
  if (process.env.SETU_PRODUCT_INSTANCE_ID) {
    headers['x-product-instance-id'] = process.env.SETU_PRODUCT_INSTANCE_ID
  }
  const res = await timedFetch(method, `${process.env.SETU_BASE_URL}${urlPath}`, {
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`Setu ${method} ${urlPath} failed: ${res.status} ${JSON.stringify(json)}`)
  }
  return json
}

async function timedFetch(method, url, init) {
  const start = Date.now()
  const res = await fetch(url, { method, ...init })
  await logCall({ method, url, status: res.status, durationMs: Date.now() - start, headers: res.headers })
  return res
}

async function logCall({ method, url, status, durationMs, headers }) {
  const rateLimitHeaders = Object.fromEntries(
    ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after']
      .map(h => [h, headers.get(h)])
      .filter(([, v]) => v != null)
  )
  const lines = [
    `- ${new Date().toISOString()} — ${method} ${url}`,
    `  status: ${status}, duration: ${durationMs}ms`,
    Object.keys(rateLimitHeaders).length ? `  rate-limit headers: ${JSON.stringify(rateLimitHeaders)}` : null,
  ].filter(Boolean)
  await appendFile(API_LOG_PATH, lines.join('\n') + '\n')
}
