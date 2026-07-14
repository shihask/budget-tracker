# AA Discovery Spike — issues & observations log

Append anything unexpected as it happens during execution: odd transaction
descriptions, missing identifiers, webhook quirks, rate limits, sandbox
limitations, auth surprises. These small discoveries tend to shape Phase 1's
design more than the original plan does — log them in the moment, not from
memory afterward.

## 2026-07-13

- **KYC is a production-only gate, not sandbox.** Setu Bridge V2 let us create
  an FIU business ("MoneyPlant") and generate TEST API credentials with zero
  PAN/GSTIN — the "Complete the KYC" banner only blocks going live. Earlier
  assumption (from Setu's older support-article search results) that PAN/GST
  is required even for sandbox was wrong, at least for Bridge V2.
- **Auth token response shape doesn't match docs.setu.co.** Docs show a flat
  `{token, expiresIn}` response from `POST /api/v2/auth/token`. Real sandbox
  response nests it: `{status, success, data: {token, expiresIn}}`. Verified
  live — token decodes to `scope: "TEST"`, `clientId` matches ours.
- **`fiu-sandbox.setu.co` was the right base URL all along — the actual bug
  was the token source.** The general Bridge OAuth endpoint
  (`uat.setu.co/api/v2/auth/token`) issues tokens the AA Gateway rejects with
  `401 "Token issuer not allowed"`. The AA Gateway has its own dedicated
  token endpoint, only findable via docs.setu.co's product-specific
  "API reference" → "AA Gateway" → "Get Token" page (not the general Bridge
  docs): `POST https://orgservice-prod.setu.co/v1/users/login`, with a
  required `client: bridge` header and body
  `{clientID, grant_type: "client_credentials", secret}`. Response is flat
  `{access_token, refresh_token}` — no `expiresIn` given, unlike the general
  Bridge token endpoint. Lesson: for Bridge V2, always check the
  product-specific "API reference" page over generic Bridge/OAuth docs —
  each Gateway (AA, UPI, KYC, ...) apparently issues from its own token
  endpoint.
- **Every AA Gateway V2 endpoint is under a `/v2/` prefix** the general
  public docs don't show: `/v2/consents` (not `/consents`), `/v2/sessions`
  (not `/sessions`), `/v2/FI/fetch/{id}` (not `/FI/fetch/{id}`). Consistent
  pattern now — always check the product-specific "API reference" sidebar
  for the exact path before trusting docs.setu.co's general integration
  guide pages.
- **Real `/v2/consents` request body is much larger than the general docs'
  example**: required/expected fields include `purpose` (code/text/category/
  refUri — matches the numbered purpose codes shown in Bridge's product
  config UI, e.g. "102" for spending/budget analysis), `consentTypes` (array,
  not singular), `fiTypes` (array, separate from what's configured at the
  product level — this is the per-request subset), and `redirectUrl` (must
  match what's registered in Bridge's product config). `fetchType` uses
  `"ONETIME"` (no space), not `"One time"` as shown in the Bridge UI dropdown
  label.
- **VUA handle isn't a Setu-specific value — it's a real AA's handle**
  (`@finvu`, `@onemoney` both accepted; `@cams`, `@sahamati`, `@setu-aa`,
  `@setu-fiu` all rejected as "not supported"; `@setu` gave an unrelated 500).
  Neither Bridge's UI nor docs.setu.co document this anywhere findable —
  discovered by brute-force testing candidate handles directly against the
  live API. Also surfaced: `dataLife` must be `{value: 0}` when
  `consentMode` is `VIEW`/`STREAM`/`QUERY` — Setu rejects any nonzero value
  with `"Data life value must be 0 for consent mode"`.
- **Switched tunnel tool from `localtunnel` to `cloudflared` quick tunnels**
  after 3 straight localtunnel drops (dead within minutes each time, no
  error). `cloudflared tunnel --url http://localhost:8787` (installed via
  `winget install Cloudflare.cloudflared`) has been stable since. No account
  needed for quick tunnels. Use this from the start next time, don't bother
  with localtunnel.
- **`localtunnel` (used for the sandbox notification/webhook URL) dropped on
  its own after a few minutes with no error**, even though the local webhook
  listener process stayed alive throughout. Registered tunnel URL silently
  stopped forwarding. Not something we did — it's a property of the tunnel
  tool. Relevant beyond the spike: any Phase 1 design that assumes "the
  notification endpoint is always reachable" needs retry/backoff on Setu's
  side (out of our control) and monitoring on ours, since ad hoc tunnels are
  clearly not durable — a real deployment needs a stable public endpoint
  (e.g. a Supabase Edge Function URL), not a tunnel, precisely because of this.
- **Fair-use rules cap the FI data range to ~13 months.** Hardcoded
  `from: 2025-01-01` eventually exceeded this as time passed during the
  spike — switched both `01-create-consent.mjs` and `03-fetch-data.mjs` to
  compute a rolling 12-month window instead of a fixed date.
- **First successful consent creation** on 2026-07-13 after fixing all of the
  above (real `/v2/consents` path, `@finvu` VUA handle, `dataLife: 0`,
  12-month rolling range). Hosted consent URL host is `fiu-uat.setu.co`, not
  `fiu-sandbox.setu.co` (the API host) — two different hosts for the same
  sandbox environment, worth remembering.
- **Finvu sandbox OTP is `111111`, not `123456`** (which is Setu's unrelated
  Aadhaar/KYC test value). No pre-registration of a mock account/mobile via
  Finvu's `Accounts/add` API was actually needed — that was a wrong lead
  (`api.finvu.in` doesn't even resolve in DNS; likely stale/wrong docs, or a
  private-network-only host). The VUA `9876543210@finvu` worked out of the
  box with OTP `111111`.
- **Redirect URL receives useful query params** after consent
  approval/rejection: `?success=true&id=<consentId>` — confirms the redirect
  page (not just the webhook) could drive UI state if wanted, though the
  webhook remains the reliable source of truth.
- **First successful end-to-end webhook delivery.** Real
  `CONSENT_STATUS_UPDATE` payload:
  `{timestamp, type, error, consentId, data: {detail: {accounts: [{fipId, accType, fiType, maskedAccNumber, linkRefNumber}]}, status: "ACTIVE"}, success, notificationId}`.
  `fipId` was literally the string `"FIP-ID"` — sandbox mock FIPs don't have
  realistic/descriptive names, don't rely on this field for anything
  presentational when writing later docs/tests.
  **No signature/HMAC header on the webhook request** — just standard
  proxy/CDN headers. A production notification endpoint has no built-in way
  to verify a POST actually came from Setu; Phase 1 needs to figure out
  Setu's actual verification mechanism (IP allowlist? shared secret in the
  URL? something else) before trusting webhook payloads for real.
- **`GET /v2/FI/fetch/{id}` (from the general docs) doesn't exist — real path
  is `GET /v2/sessions/{session_id}`.** Same session object created by
  `POST /v2/sessions` is what you re-fetch to poll status; there's no
  separate "FI/fetch" resource. `status: "COMPLETED"` means the response
  already contains the FI data inline (`fips[].accounts[].data`) — no third
  call needed.
- **First successful FI data fetch.** Real shape:
  `{consentId, format, dataRange, fips: [{fipID, accounts: [{linkRefNumber, maskedAccNumber, FIstatus, data: {account: {linkedAccRef, maskedAccNumber, type, profile: {holders: {...}}, summary: {balanceDateTime, branch, currency, currentBalance, ifscCode, status, type, ...}, transactions: {startDate, endDate}}}}]}], id, status}`.
  Profile and Summary data are fully populated with realistic-looking mock
  values (address, DOB, PAN, balance ₹207,349.10, IFSC, branch, etc.).
  **`transactions` has only `{startDate, endDate}` — no actual transaction
  line items**, even though `TRANSACTIONS` was requested in `consentTypes`.
  **Correction, see below: this turned out to be about which specific mock
  account got selected, not a fundamental gap** — a different account (same
  test mobile number, different FI type) came back with full transaction
  data. Don't need Finvu's Test Data Entry API after all.
- **Resync behavior (Step 3), first concrete answer: `ONETIME` consents are
  single-use, full stop.** Creating a second session against the same
  already-fetched consent fails outright — `400 "Consent already used"` —
  not a partial/throttled response. This directly shapes the sync
  architecture: `ONETIME` cannot be the basis for any recurring sync (daily
  refresh, etc.); that requires a `PERIODIC` consent instead (untested so
  far), or re-running the full consent-approval UX every time, which is a
  bad user experience for anything but a single import. Strong signal that
  Phase 1's default should be `PERIODIC` consents, not `ONETIME`, despite
  `ONETIME` being simpler to reason about for this spike.
- **`PERIODIC` consent requires `frequency`, and 1/HOUR is rejected by
  fair-use rules** (`"must be less than or equal to 0 per HOUR"`) for purpose
  code 102 — 1/DAY worked. Fair-use limits aren't just about the data range;
  they also cap fetch frequency per purpose code, and the cap isn't
  documented anywhere findable (discovered by trial and error same as the
  data-range cap).
- **`api.finvu.in` (Finvu's documented Test Data Entry API host, confirmed in
  three separate doc sources including their own GitHub raw markdown) does
  not resolve in DNS** — checked against two independent public resolvers
  (Google 8.8.8.8, Cloudflare 1.1.1.1), both `NXDOMAIN`. `aa.finvu.in` does
  resolve and serves an Apache instance, but neither `/Accounts/add` nor
  `/ConnectHub/V1/Accounts/add` exist there (`404`, real server response, not
  a network failure). **Unresolved**: getting real transaction line items
  into the mock account likely requires contacting Finvu support
  (`support@cookiejar.co.in`) for the current correct host, since the
  publicly documented one is dead. Not something further guessing will fix.
- **Third webhook type found**: `SESSION_STATUS_UPDATE` (distinct from
  `CONSENT_STATUS_UPDATE`), fired when a data-fetch session completes:
  `{type, success, timestamp, dataSessionId, notificationId, data: {fips: [{accounts: [{linkRefNumber, FIStatus, description}], fipID}], status, format}, consentId, error}`.
  Means Phase 1 doesn't need to poll `/v2/sessions/{id}` at all — create the
  session, wait for this webhook, then do one GET to retrieve the actual
  data. Also: `description` field contained a leaked Java artifact —
  `"fiRequestConsentLinkage.getDescription()"` — instead of an actual
  description string. A real sandbox rough edge, not something to design
  around, but don't be surprised if other fields have similar debug leakage.
- **`PERIODIC` consent resync confirmed working, throttled to configured
  frequency.** After a successful session against a `PERIODIC` (1/DAY)
  consent, an immediate second session attempt fails with
  `400 "Consent already used for the frequency"` — a *different* error from
  `ONETIME`'s permanent `"Consent already used"`. Confirms `PERIODIC` is the
  real mechanism for recurring sync: same consent, repeated sessions,
  rate-limited to the configured cadence (not further tested: whether a
  session succeeds again once the frequency window elapses — would need to
  wait out a full day for 1/DAY, out of scope here, but the mechanism is
  clear enough to design Phase 1 around).
- **Mock FIP display name is "Pirimid FinTech"** in the hosted consent UI —
  different from the `"FIP-ID"` placeholder string the actual API returns
  (`fipID` field). Don't assume the API's FIP identifier is
  human-presentable; real FIP names/branding come from elsewhere (presumably
  a FIP registry Setu/Finvu maintain), not these payloads. Also notable: the
  sandbox reports "95 bank accounts linked" to our one test mobile number —
  accumulated mock accounts from every consent/account-selection made
  against that number across this whole spike, not a deliberate seed set.
- **Resolved: real transaction line items DO exist in sandbox mock
  data** — just not in the specific Savings/DEPOSIT account we happened to
  test first. Requesting `fiTypes: ["RECURRING_DEPOSIT"]` against the same
  test mobile number surfaced a *different* mock account (different holder,
  "MR.KIRANKUMAR GODISELA" vs. the earlier "John Doe") that came back with
  23 fully-populated transaction records — no Finvu Test Data Entry API
  needed at all, contrary to the earlier note above. Real transaction shape:
  `{amount, balance, mode, narration, reference, txnId, type, valueDate}`
  (e.g. `mode: "OTHERS"`, `type: "OPENING"`, `narration: "TOWARDS RD"`).
  Data is obviously synthetic/repetitive (identical `valueDate` on every
  entry, alternating balance 5000/10000, every `type` is `"OPENING"`) — fine
  for validating field names/shapes, not for anything volume- or
  pattern-sensitive (like testing dedup or categorization heuristics for
  real). **Lesson for Phase 1 testing: try multiple mock accounts/FI types
  before concluding data is missing — it may just be that account.**
