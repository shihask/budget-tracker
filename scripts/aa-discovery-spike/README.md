# AA Discovery Spike (Phase 0)

Throwaway, exploratory scripts — **not part of the shipped MoneyPlant app**.
Purpose: validate Setu's Account Aggregator sandbox API end-to-end
(consent → webhook → fetch) and produce the findings that feed
`docs/aa-integration-phase0.md`.

See the approved Phase 0 plan (`.claude/plans/i-found-a-new-adaptive-rainbow.md`
on the machine that generated it) for full scope, exit criteria, and why each
step exists.

## Setup
1. Sign up for [Setu Bridge](https://bridge.setu.co), create an FIU app under
   the "Data" product, and get sandbox credentials (client ID/secret, product
   instance ID). This step can't be automated — it requires business/email
   verification.
2. From the project root, copy `.env.aa.example` → `.env.aa` (git-ignored) and
   fill in the values — same convention as `.env.reels`/`.env.reels.example`.
   Must be at the project root, not in this directory: the npm scripts run
   `dotenv -e .env.aa` relative to the repo root.
3. Start a tunnel so Setu's sandbox can reach your local webhook listener:
   `cloudflared tunnel --url http://localhost:8787` (install via
   `winget install Cloudflare.cloudflared` — no account needed for quick
   tunnels). Copy the `https://*.trycloudflare.com` URL it prints.
   `localtunnel`/ngrok also work in principle, but `localtunnel` proved
   unreliable during Phase 0 execution — see `issues.md`.
4. Register that tunnel URL as the notification endpoint in your Setu Bridge
   FIU app config.

## Running the spike
```bash
# terminal 1 — leave running, catches consent + FI-data-ready webhooks
npm run aa:webhook

# terminal 2 — creates a consent request, prints the hosted consent URL
npm run aa:consent
# open the printed URL, approve as the sandbox test user

# once the webhook confirms the consent is ACTIVE, grab the consentId it logged:
npm run aa:fetch -- <consentId>
```

Raw payloads land in `samples/` (git-ignored — keep sandbox payloads out of
version control even though they're mock data). Every HTTP call made by these
scripts is appended to `api-log.md`. Log anything unexpected in `issues.md` as
you go, in the moment — see the Phase 0 plan for why that matters more than it
sounds like it should.

## Endpoints (transcribed from Setu's public docs — unverified against a live
sandbox run, confirm/correct here once actually executed)
- `POST /consents` — create a consent request, returns a hosted consent URL
- `POST /sessions` — create a data session against an `ACTIVE` consent
- `GET /FI/fetch/{sessionId}` — poll/fetch the decrypted FI data
- Sandbox base URL: `https://fiu-sandbox.setu.co`
- Auth: `Authorization: Bearer <token>` + `x-product-instance-id` header — the
  token endpoint itself (`getAccessToken` in `lib/setu-client.mjs`) is a
  best-guess client-credentials flow and is the first thing to verify/fix
  once real credentials exist.

Expect to adjust field names, the auth flow, and polling behavior once this
runs against a real sandbox account — that's the point of the spike.
