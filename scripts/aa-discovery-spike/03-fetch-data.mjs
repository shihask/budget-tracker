// Step 1d + Step 3 of the AA Discovery Spike — once a consent is ACTIVE (per
// the CONSENT_STATUS_UPDATE webhook), create a data session and poll until FI
// data is ready. Re-running this against the same consentId is how Step 3
// (resync behavior: full history vs. incremental, identifier stability)
// gets answered — diff the saved samples across runs.
//
// Endpoint paths verified live against docs.setu.co's product-specific "FI
// data fetch V2 APIs" reference on 2026-07-13 — /v2/sessions and
// /v2/FI/fetch/{sessionId}, not the unversioned paths from the general docs
// (same pattern as /v2/consents).
//
// Usage: npm run aa:fetch -- <consentId>

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setuRequest } from './lib/setu-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = path.join(__dirname, 'samples')

const consentId = process.argv[2]
if (!consentId) {
  console.error('Usage: npm run aa:fetch -- <consentId>')
  process.exit(1)
}

async function main() {
  await mkdir(SAMPLES_DIR, { recursive: true })

  // Session dataRange must be a subset of the consent's own dataRange, which
  // was fixed at consent-creation time (some time ago by now — approving
  // consent isn't instant). Rather than try to replicate the exact 12-month
  // window, use a narrow, obviously-safe range (last 30 days, ending
  // yesterday) that's guaranteed to fall inside any consent created recently.
  const to = new Date()
  to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - 30)

  const session = await setuRequest('POST', '/v2/sessions', {
    consentId,
    format: 'json',
    dataRange: { from: from.toISOString(), to: to.toISOString() },
  })
  console.log('Data session created:', session.id, '— status:', session.status)
  await save(`session-${session.id}.json`, session)

  console.log('Polling /v2/sessions/{id} until COMPLETED or PARTIAL (Ctrl+C to stop early)...')
  let result
  do {
    await new Promise(r => setTimeout(r, 3000))
    result = await setuRequest('GET', `/v2/sessions/${session.id}`)
    console.log('  status:', result.status)
  } while (result.status === 'PENDING')

  const filename = `fi-data-${session.id}-${Date.now()}.json`
  await save(filename, result)
  console.log(`Saved FI data to samples/${filename}`)
}

async function save(filename, data) {
  await writeFile(path.join(SAMPLES_DIR, filename), JSON.stringify(data, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
