# AA Integration — Phase 0 Discovery Spike

Findings from a live sandbox spike against Setu's AA Gateway (TSP) + Finvu (AA), run 2026-07-13/14. Every claim below was verified against the real sandbox API, not just docs — where docs and reality disagreed, reality won and the doc gap is called out. Full raw evidence lives in `scripts/aa-discovery-spike/` (`issues.md` for the blow-by-blow log, `samples/` for raw JSON, `api-log.md` for HTTP call history).

## 1. API Discovery

**Provider stack**: Setu as TSP (handles FIU registration, no PAN/GSTIN needed for sandbox — only for going live), Finvu as the AA (chosen because it's what the VUA handle resolved to; `@setu` itself errored, `@cams`/`@sahamati`/`@setu-aa` were rejected as unsupported handles).

**Auth — two different token endpoints exist, only one works for AA calls**:
- General Bridge OAuth (`POST https://uat.setu.co/api/v2/auth/token`) — issues tokens the AA Gateway rejects with `401 "Token issuer not allowed"`.
- AA-Gateway-specific (`POST https://orgservice-prod.setu.co/v1/users/login`, header `client: bridge`, body `{clientID, grant_type: "client_credentials", secret}`) — this is the one that works. Response is flat `{access_token, refresh_token}`, no `expiresIn`.

**Base URL**: `https://fiu-sandbox.setu.co` was correct all along — the earlier 401 was a wrong-token-source problem, not a wrong-host problem. Every endpoint lives under a `/v2/` prefix not shown in the general public docs:
- `POST /v2/consents` — create consent
- `POST /v2/sessions` — create a data-fetch session against an ACTIVE consent
- `GET /v2/sessions/{id}` — poll AND retrieve the actual FI data (no separate "FI/fetch" resource — `status: "COMPLETED"` means the data is already inline)

All calls need `x-product-instance-id` (the Bridge product ID, e.g. `60bf2a1f-aa5a-48a9-8f3d-118238d2d0d3` for "MoneyPlant - Account Aggregator Data").

**Consent creation body** (real required/working fields):
```json
{
  "vua": "9876543210@finvu",
  "dataRange": { "from": "...", "to": "..." },
  "consentDuration": { "unit": "MONTH", "value": 12 },
  "dataLife": { "unit": "MONTH", "value": 0 },
  "fetchType": "ONETIME",
  "consentMode": "VIEW",
  "consentTypes": ["PROFILE", "SUMMARY", "TRANSACTIONS"],
  "fiTypes": ["DEPOSIT"],
  "purpose": { "code": "102", "text": "...", "category": { "type": "Personal Finance" }, "refUri": "..." },
  "redirectUrl": "https://..."
}
```
Response: `{id, url, status: "PENDING", detail: {...}, ...}` — `url` is the hosted consent screen (host `fiu-uat.setu.co`, different from the API host).

**Fair-use rules enforced server-side, undocumented, discovered by trial and error**:
- `dataLife` must be `0` when `consentMode` is `VIEW`/`STREAM`/`QUERY`.
- `dataRange` capped to roughly 13 months.
- `PERIODIC` fetch frequency is capped per purpose code — `1/HOUR` was rejected for code 102 ("must be ≤ 0 per HOUR"), `1/DAY` worked.

**VUA handles**: not Setu-specific — must be a real AA's handle. `@finvu` and `@onemoney` both accepted; `@cams`, `@sahamati`, `@setu-aa`, `@setu-fiu` all rejected as "not supported"; `@setu` gave an unrelated 500. No pre-registered test numbers exist — any mobile number works, and the sandbox auto-generates mock accounts against it ad hoc (95 accumulated on our one test number by the end of this spike).

**Finvu's sandbox OTP is `111111`**, not Setu's documented `123456` (that's for an unrelated Aadhaar/KYC product).

**Consent approval redirects the browser** to `redirectUrl` with `?success=true&id=<consentId>` — a real, useable signal, though the webhook remains authoritative.

**Webhooks**: two types observed, both delivered reliably, neither signed —
- `CONSENT_STATUS_UPDATE`: `{timestamp, type, error, consentId, data: {detail: {accounts: [{fipId, accType, fiType, maskedAccNumber, linkRefNumber}]}, status}, success, notificationId}`
- `SESSION_STATUS_UPDATE`: `{type, success, timestamp, dataSessionId, notificationId, data: {fips: [{accounts: [{linkRefNumber, FIStatus, description}], fipID}], status, format}, consentId, error}`

No signature/HMAC header on either — **production needs its own verification mechanism**, not yet identified (see Unknowns).

**Resync behavior**:
- `ONETIME` consents are single-use forever — a second session attempt fails outright: `400 "Consent already used"`.
- `PERIODIC` consents are reusable, throttled to the configured frequency — an immediate second session gives a *different* error: `400 "Consent already used for the frequency"`. This confirms `PERIODIC` is the real basis for recurring sync (not tested: success after the frequency window actually elapses).

**Sandbox rough edges**:
- API's `fipId`/`fipID` field is always the literal placeholder string `"FIP-ID"` — the hosted consent UI shows a real-looking name ("Pirimid FinTech") that isn't in the API response anywhere. Don't rely on the API for a display-worthy bank name.
- One webhook field (`description`) leaked a Java debug artifact: `"fiRequestConsentLinkage.getDescription()"`.
- Whether a mock account has real transaction line items or not is **per-account, not per-FI-type** — our first Savings/DEPOSIT account had none, a Recurring Deposit account tested later had 23 fully-populated transactions. Don't conclude "sandbox has no transaction data" from one account.

## 2. Data Mapping

**ReBIT → Financial Event → `Transaction`** (raw payload → staging row → promoted row — see Architecture Decisions for why the staging tier exists).

Real observed shapes:

**Profile** (`data.account.profile.holders.holder[]`): `{address, ckycCompliance, dob, email, landline, mobile, name, nominee, pan}`

**Summary — deposit/savings**: `{balanceDateTime, branch, currency, currentBalance, currentODLimit, drawingLimit, exchgeRate, facility, ifscCode, micrCode, openingDate, status, type}`

**Summary — recurring deposit** (different shape per FI type, not a shared schema): `{accountType, branch, compoundingFrequency, currentValue, description, ifsc, interestComputation, interestOnMaturity, interestPayout, interestPeriodicPayoutAmount, interestRate, maturityAmount, maturityDate, openingDate, principalAmount, recurringAmount, recurringDepositDay, tenureDays, tenureMonths, tenureYears}`

**Transactions** (`data.account.transactions.transaction[]`, when present): `{amount, balance, mode, narration, reference, txnId, type, valueDate}`

**Account mapping rules**:
- `linkRefNumber` (webhook) / `linkedAccRef` (session data) — the per-account identifier within a consent. Stability across reconnects/new consents for the *same* underlying bank account is untested (would need revoking and re-approving against the same account, out of scope here).
- `maskedAccNumber` — masked account number, safe to store, not useful as a unique key alone (format varies: `XXXXXXXX0b03` vs `XXXXXXXXXXXXXXXX0b03` — inconsistent masking length observed even within this spike).
- FIP name is not obtainable from the API (`fipID` is always `"FIP-ID"`) — need a separate FIP registry/lookup for display purposes, not covered by this spike.

**Balance mapping rules**: `currentBalance` (deposit) or `currentValue` (recurring deposit) → account balance, keyed off `summary.type`/`accountType` since the field name itself differs per FI type.

**Transaction mapping** (per entry in `transaction[]`, against the real `Transaction` interface in `src/types/index.ts`):
- `amount` → `Transaction.amount`
- `valueDate` → `Transaction.transaction_date` (date-only, no time component — see Unknowns re: timezone handling)
- `narration` → `Transaction.description` — feeds the *same* auto-categorize pipeline MoneyPlant already has (`findCategoryMatches(description, categories)` / `guessCategory(description, categories)` / `categorizeWithAI(description, ...)`, all confirmed to take a plain description string, so `narration` slots in directly, no new categorization path needed)
- `txnId` → `provider_event_id` (dedup key)
- `type` (e.g. `"OPENING"`) / `mode` (e.g. `"OTHERS"`) — ReBIT-standard enums, not self-evidently mappable to MoneyPlant's `category_id`; needs its own small translation table, not fuzzy-matched like `narration`
- `reference` → not user-facing, belongs in `provider_metadata`
- **`Transaction.from_account_id`/`to_account_id` are foreign keys to MoneyPlant's own `Account` table** (`{id, name, type, current_balance, is_active}`) — a synced transaction needs a real `Account.id` before it can be inserted. Resolved via the hybrid auto-create/suggest-link strategy above (see Architecture Decisions).

## 3. Architecture Decisions

**Financial Event** (conceptual model) / **`sync_events`** (the staging table implementing it) — holds raw fetched data before promotion into `Transaction`, justified by: (a) AA fetches cost money per pull, so reprocessing after a mapping-bug fix shouldn't require re-fetching, and (b) dedup/categorization logic needs to run against a stable, inspectable raw record.

Proposed `sync_events` columns (provider-agnostic naming, per earlier research — validated against real data, no changes needed):
- `provider` (text) — **decided**: an ingestion-*category* value (`"aa"`, `"csv"`, `"pdf"`, `"sms"`, `"manual"`, ...), not a vendor name. Vendor identity (Setu as TSP, Finvu as the specific AA that handled a given consent) lives in `provider_metadata` (or dedicated `tsp`/`aa_provider` sub-fields) instead. This decouples the core schema from any specific vendor relationship — adding Anumati or CAMS later, even swapping TSPs entirely, never requires a new `provider` value or a schema migration, just different `provider_metadata` contents.
- `provider_connection_id` = `consentId`
- `provider_account_id` = `linkRefNumber` / `linkedAccRef`
- `provider_event_id` = `txnId` (nullable — balance/profile syncs have no transaction id)
- `event_type` (`transaction` | `balance` | `profile`)
- `raw_payload` (jsonb — the full session response or per-transaction slice)
- `status` (`pending` | `processed` | `error`)
- `fetched_at`
- `provider_metadata` (jsonb) — everything not promoted: `fipID`, `ifscCode`/`ifsc`, `branch`, `mode`, `type`, `reference`, raw account-type strings

**Provider abstraction interface** (shape, not code, for Phase 1):
- `connect(userId)` → redirect URL (AA: consent creation; future CSV: upload UI)
- `onNotification(payload)` → verify + update `sync_events`/consent status (AA: webhook handler)
- `fetch(connectionId)` → raw payload(s) (AA: create session + poll/GET; CSV: parse uploaded file)
- `normalize(rawPayload)` → `FinancialEvent[]` (provider-specific parsing into the common shape) — note this operates on a **batch** (one `/v2/sessions/{id}` response can contain many transactions), not a per-transaction stream.

**Sync lifecycle / state machine** (per connection):
`PENDING` (consent created) → `ACTIVE` (approved) → `SYNCING` (session in flight) → `SYNCED` (session completed, `sync_events` populated) → repeats `SYNCING`↔`SYNCED` for `PERIODIC` → `EXPIRED`/`REVOKED` (consent lifecycle ends). `ONETIME` consents reach `SYNCED` once and then are permanently exhausted — no path back to `SYNCING`.

**Dedup strategy** (high-level scoring, not full implementation): score candidate matches between a new Financial Event and existing manual transactions on same amount (exact), same/similar date (±1–2 day window — bank posting dates lag), and narration/description similarity. High-confidence matches auto-merge (keep the manual entry's category, attach provider linkage); lower-confidence matches surface for user review. Full algorithm design is Phase 1 scope, not this spike.

**Account linking — decided**: hybrid strategy, not a strict auto-create-only or user-mapped-only rule. On first connecting a bank account: if no likely-matching existing `Account` is found, auto-create one (lowest friction for new users). If a likely match *is* found (fuzzy match on bank name + masked account number + account type against existing manual `Account` rows), surface it as a suggested link, but let the user opt to create a separate `Account` instead if they intentionally want one. Protects existing users from duplicate accounts corrupting balances/forecasts, without forcing a mapping step on everyone.

## 4. Unknowns

- **Production KYC**: not attempted (this spike stayed in sandbox/TEST scope throughout) — exact PAN/GSTIN requirements and turnaround time for going live are unconfirmed firsthand.
- **Real pricing**: still not published anywhere self-serve; unchanged from the original research phase.
- **Real bank (FIP) coverage and behavior**: sandbox only exposes mock FIPs ("Pirimid FinTech" and others, all placeholder). How MoneyPlant's actual target banks behave in production is untested.
- **Webhook verification**: no signature/HMAC observed in sandbox. Unconfirmed whether production sends one, or what the correct verification mechanism is (IP allowlist? shared secret?) — needed before trusting webhook payloads for real money-related state changes.
- **Merchant/narration quality at scale**: sandbox `narration` values are synthetic and repetitive ("TOWARDS RD" on every entry) — not representative of real bank statement text quality, which is known to vary a lot per bank. Auto-categorization signal quality against real data is unknown.
- **Transaction identifier stability over time**: `txnId` looks stable within one fetch; whether the *same* real-world transaction gets the same `txnId` across repeated `PERIODIC` fetches over weeks/months is untested (would require waiting out real fetch cycles).
- **Timestamp/timezone consistency**: `valueDate` is date-only with no timezone; `balanceDateTime` is a full ISO datetime with `+05:30` offset. Inconsistent granularity across fields within the same payload — needs explicit, deliberate handling, not an assumption of uniformity.
- **Pending/reversed transactions**: not observed in any sample (data is synthetic/trivial) — real-world handling of transaction status changes is unconfirmed.
- **Account identifier stability across reconnects**: not tested — would require revoking and re-approving consent for the same real account and diffing `linkRefNumber`.

## 5. Phase 1 Assumptions

**Confirmed**:
- Sandbox FIU business + TEST API keys need no PAN/GSTIN — only production go-live does.
- AA Gateway auth is a separate token issuer from general Bridge OAuth (different host, different response shape).
- All AA Gateway v2 endpoints live under `/v2/` on `fiu-sandbox.setu.co` (sandbox) — production equivalent (`fiu.setu.co`) unverified but presumably mirrors this.
- Hosted consent screen picks up FIU branding (name/logo) configured in Bridge.
- `PERIODIC` consents support real recurring resync, rate-limited to configured frequency; `ONETIME` consents are single-use forever.
- Both webhook types fire reliably in sandbox — no polling required for consent status or fetch completion.
- Real transaction-level data is obtainable in sandbox (account-dependent, not a fundamental gap).

**Invalidated** (wrong assumptions from the pre-spike research phase):
- `fiu-sandbox.setu.co` being the wrong host — it wasn't; the real bug was the token issuer.
- `123456` as a universal Setu sandbox OTP — Finvu's is `111111`.
- Needing Finvu's Test Data Entry API for transaction data — not needed; a different mock account already had it.
- PAN/GST required even for sandbox (from the original research phase's support-doc search) — false for Bridge V2's FIU business creation and TEST key generation.

**New** (decisions only possible after seeing real API behavior):
- `provider` is an ingestion-category value (`"aa"`, `"csv"`, ...), not a vendor name — vendor identity (Setu/Finvu) lives in `provider_metadata` instead. Decided after this spike, see Architecture Decisions.
- Account linking uses a hybrid strategy: auto-create by default, suggest-and-let-user-override when a likely match exists. Decided after this spike, see Architecture Decisions.
- `normalize()` must operate on a batch response, not a per-transaction webhook stream — one `GET /v2/sessions/{id}` can return many transactions at once.
- Redirect-URL query params (`?success=true&id=...`) are a usable secondary signal for client-side UX, though the webhook stays authoritative for actually updating sync state.

---

## Phase 0 exit criteria — status

- [x] Sandbox consent flow completed end-to-end as a user (3 times: `DEPOSIT`/`ONETIME`, `DEPOSIT`/`PERIODIC`, `RECURRING_DEPOSIT`/`ONETIME`)
- [x] Webhook callbacks received and logged (`CONSENT_STATUS_UPDATE`, `SESSION_STATUS_UPDATE`)
- [x] Sample transaction, balance, and account payloads captured and saved (`scripts/aa-discovery-spike/samples/`)
- [x] Financial Event / `sync_events` schema drafted and reviewed with you — both open questions resolved: `provider` is an ingestion-category value with vendor identity pushed into `provider_metadata`; account linking uses a hybrid auto-create/suggest-link strategy. Schema is final pending Phase 1 implementation review.
- [x] No architectural unknowns block Phase 1 — production KYC, real pricing, webhook signature verification, and real-bank data quality remain real gaps, but they're implementation/production-readiness items, not schema-blocking questions. The two schema-blocking questions the post-Phase-0 checkpoint surfaced are now resolved.

## Post-Phase-0 checkpoint (against existing MoneyPlant architecture)

Per the plan's checkpoint step — reviewed this doc's schema decisions against `src/types/index.ts`, `src/lib/cashflow.ts`, and `QuickAdd.tsx` before treating anything above as final:

- **`Transaction`'s real fields are `description` and `transaction_date`**, not the looser "merchant"/"date" used in early drafts of this doc — corrected above. `findCategoryMatches`/`guessCategory`/`categorizeWithAI` all confirmed to accept a plain description string, so `narration` maps in with no new categorization path needed.
- **`Transaction.from_account_id`/`to_account_id` are real foreign keys to MoneyPlant's own `Account` table.** This means the account-linking question isn't a soft UX preference to defer — Phase 1 literally cannot insert a `Transaction` row from a sync without first deciding how a `linkRefNumber` becomes an `Account.id` (auto-create vs. user maps it to an existing manual account). Elevated from "Unknown" to a hard Phase 1 blocker by this check.
- **Naming collision avoided, confirmed by this check**: `CashFlowEvent.source` (`src/lib/cashflow.ts:18`) is already a closed union (`'salary' | 'commitment' | 'saving' | 'card' | 'borrowing' | 'planned' | 'lifestyle'`) describing *why a forecast event exists* — an unrelated concept to "where this transaction's data came from." The `sync_events`/`Transaction` provider field proposed above is correctly named `provider`, not `source` — reusing `source` would have silently collided with this existing, unrelated meaning throughout the forecast engine.
- No conflicts found with `Category`/`Settings` or the Budget Strategy system — those operate on `category_id`/`budget_bucket` downstream of whatever ingestion path produces a `Transaction` row, so they're unaffected by provider/sync mechanics either way.

## Raw evidence

- `scripts/aa-discovery-spike/issues.md` — full chronological log of every wrong assumption, fix, and discovery
- `scripts/aa-discovery-spike/samples/` — raw consent, webhook, and FI-data JSON payloads
- `scripts/aa-discovery-spike/api-log.md` — HTTP call history (timing, status codes)
- `scripts/aa-discovery-spike/01-create-consent.mjs`, `03-fetch-data.mjs` — working, corrected scripts reflecting everything above
