// Step 1c of the AA Discovery Spike — local HTTP listener for Setu's
// CONSENT_STATUS_UPDATE and SESSION_STATUS_UPDATE webhook notifications.
//
// Setu needs a public URL to POST to, so run this behind a tunnel (e.g.
// `ngrok http 8787`) and register the tunnel's HTTPS URL as the notification
// endpoint in the Setu Bridge FIU app config before running 01-create-consent.mjs.
//
// TODO(spike): confirm whether the sandbox expects a specific path (vs. root
// "/"), and whether it signs requests (HMAC header, shared secret) — Setu's
// docs didn't say. Note the answer in docs/aa-integration-phase0.md either way.
//
// Usage: npm run aa:webhook

import http from 'node:http'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = path.join(__dirname, 'samples')
const PORT = process.env.AA_WEBHOOK_PORT || 8787

await mkdir(SAMPLES_DIR, { recursive: true })

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404)
    res.end()
    return
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const rawBody = Buffer.concat(chunks).toString('utf8')
  const receivedAt = new Date().toISOString()

  let parsed
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    parsed = { raw: rawBody }
  }

  console.log(`[${receivedAt}] webhook received — type: ${parsed.type ?? 'unknown'}`)

  const filename = `webhook-${parsed.type ?? 'unknown'}-${Date.now()}.json`
  await writeFile(
    path.join(SAMPLES_DIR, filename),
    JSON.stringify({ receivedAt, headers: req.headers, body: parsed }, null, 2)
  )

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ received: true }))
})

server.listen(PORT, () => {
  console.log(`Webhook listener on http://localhost:${PORT}`)
  console.log(`Point a tunnel (e.g. \`ngrok http ${PORT}\`) at this and register the HTTPS URL in Setu Bridge before creating a consent.`)
})
