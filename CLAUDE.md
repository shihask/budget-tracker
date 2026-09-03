# MoneyPlant — Claude Code Reference

## Stack
React + TypeScript + Vite · Supabase (Postgres + Edge Functions) · deployed on Vercel  
PWA, mobile-first, single-column layout (max ~720px on desktop)

## Key file map
| File | Purpose |
|------|---------|
| `src/types/index.ts` | All shared interfaces (`Settings`, `Category`, `AppState`, …) |
| `src/hooks/useSupabaseData.ts` | Single data hook — all Supabase reads/writes, `EMPTY_STATE`, `DEFAULT_SETTINGS` |
| `src/App.tsx` | Root component — all state wiring, opens/closes panels, passes props down |
| `src/components/SettingsPanel.tsx` | Slide-in settings drawer |
| `src/components/QuickAdd.tsx` | FAB + sheet for adding transactions; auto-categorize logic lives here |
| `src/components/CategorySelect.tsx` | Category dropdown, supports `filterGroup` prop |
| `src/lib/gemini.ts` | Client-side AI helpers + `aiUsagePatch` usage mirroring |
| `supabase/functions/ai-categorize/index.ts` | Deno Edge Function — Groq proxy, usage counter |

## How to add a new Settings field — checklist
1. **`src/types/index.ts`** — add field to `Settings` interface
2. **`src/hooks/useSupabaseData.ts`** — add field with default to `EMPTY_STATE.settings` (line ~13)
3. **`src/components/SettingsPanel.tsx`** — add prop + toggle/control UI
4. **`src/App.tsx`** — pass `state.settings.<field> ?? <default>` and `onField={v => updateSettings({ <field>: v })}` to `SettingsPanel`; pass to any other component that needs it (e.g. `QuickAddSheet`)
5. **Supabase SQL** — `ALTER TABLE settings ADD COLUMN IF NOT EXISTS <field> <type> DEFAULT <value>;`

## Settings fields (current)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `weekly_budget` | number | 5000 | |
| `emergency_fund` | number | 20000 | |
| `salary_date` | number\|null | null | Day of month |
| `track_credit_cards` | boolean | false | opt-in |
| `track_borrowings` | boolean | true | opt-out |
| `autopilot_enabled` | boolean | false | AI categorization, opt-in |
| `dashboard_sections` | json\|null | null | Section order/visibility |
| `track_savings` | boolean | false | Savings & Investments tracker, opt-in |
| `affordability_snapshot_date` | string\|null | null | Internal — written by `AffordabilityChecker`, not user-facing, no SettingsPanel UI |
| `affordability_snapshot_daily_lifestyle` | number\|null | null | Internal — see above |
| `affordability_snapshot_bills_total` | number\|null | null | Internal — see above |

## Budget Strategy system
Two independent budgeting systems coexist:
1. **Spending Budget** (existing) — Daily/Weekly/Monthly limit on tracked expense categories
2. **Budget Strategy** (new) — Allocate income across Needs/Wants/Savings per a financial framework

### Key files
| File | Purpose |
|------|---------|
| `src/components/BudgetStrategyCard.tsx` | Card shown on dashboard when strategy ≠ none; also exports `getStrategyPcts`, `getCategoryBucket` |
| `src/components/CategoryBucketMapper.tsx` | BottomSheet for mapping "Other" group categories to budget buckets |

### Bucket derivation (`getCategoryBucket`)
- Group type `essential` or `commitment` → **needs**
- Group type `savings` → **savings**
- Group type `discretionary`, name ≠ "Other" → **wants**
- Group name "Other" → uses `category.budget_bucket` from DB (user-defined)
- System groups (income, transfer, borrowing, adjustment) → null (excluded)

### Table: `budget_strategy_settings` (separate from `settings`)
| Column | Type | Default |
|--------|------|---------|
| `budget_strategy` | text | `'none'` |
| `custom_needs_pct` | integer | `50` |
| `custom_wants_pct` | integer | `30` |
| `custom_savings_pct` | integer | `20` |
| `budget_strategy_base` | text | `'income'` |

### SQL migrations needed
```sql
CREATE TABLE IF NOT EXISTS budget_strategy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  budget_strategy text DEFAULT 'none',
  custom_needs_pct integer DEFAULT 50,
  custom_wants_pct integer DEFAULT 30,
  custom_savings_pct integer DEFAULT 20,
  budget_strategy_base text DEFAULT 'income'
);
ALTER TABLE budget_strategy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budget strategy" ON budget_strategy_settings FOR ALL USING (auth.uid() = user_id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS budget_bucket text DEFAULT NULL;
```

## Affordability Checker / Cash Flow Forecast — shared engine
`AffordabilityChecker.tsx`'s "Safe Purchase Amount" is driven by the same forecast engine as the Cash Flow Forecast feature — it does **not** maintain its own reservation math.

| File | Purpose |
|------|---------|
| `src/lib/cashflow.ts` | `buildCashFlowForecast` — day-by-day balance simulation from known events only (commitments, savings, credit card bills, borrowings, planned expenses, pattern-aware income). `simulatePurchase` clones-and-reruns for a hypothetical purchase. |
| `src/features/forecast/lib/lifestyleForecast.ts` | `buildLifestyleForecast` — wraps the above and adds `calculateDailySpendEstimate`: a confidence-weighted blend of trimmed-mean historical spend + Budget-Strategy-derived daily allowance, injected as synthetic per-day events (`event.source === 'lifestyle'`). `simulateLifestylePurchase` is the purchase-simulation sibling. |

`calculateDailySpendEstimate(state, d, opts?)` — `opts.manualDailyAmount` (Affordability Checker passes `settings.weekly_budget / 7` when `budget_mode === 'manual'`) makes Manual mode fully authoritative, skipping the blend entirely. In Auto mode with zero signal (no history, no Budget Strategy), it falls back to the same manual/onboarding figure rather than reserving nothing.

When filtering `forecast.projections` for itemized UI (timeline lists, driver summaries), always exclude `event.source === 'lifestyle'` — those are synthetic per-day entries, not real named bills, and there's one for every day in the forecast horizon.

`d.weeklyBudget` / `d.safeWeeklySpend` (Dashboard's `HeroWeekly.tsx` pacing card) are a **separate, deliberately independent** concept — "spend at this rate and hit zero by payday" — not reused here; using it for purchase-safety reservation is circular (see git history on the Affordability fix for why).

## Life Events — one-off event tagging
A wedding/trip/house-build is **a tag on real transactions**, not a separate ledger and not a
category. `transactions.event_id` is a nullable grouping key (same shape as `savings_id` /
`borrowing_id`), so the money still leaves the real account and still hits cash flow — it just
gets its own total and stays out of the running averages.

Deliberately *not* built on Shared Projects: `project_transactions` never reaches
`transactions`, balances or the forecast, which is wrong for money you actually spent.
Deliberately *not* a category either: the event is orthogonal — a wedding expense is still Food
or Clothing and needs both labels.

| File | Purpose |
|------|---------|
| `src/lib/events.ts` | `ringFencedEventIds` / `countsTowardBudget` — the one shared exclusion predicate; `eventSpent` / `eventTransactions` |
| `src/features/events/lib/eventIcons.tsx` | `EVENT_ICONS` map + `EventIcon`. `events.icon` stores a **key string** (`'ring'`), never a glyph — no emoji anywhere in the UI |
| `src/features/events/components/` | `EventsCard` (dashboard), `EventsListPage` (the feature's home), `EventDetailPage` (a full **page**, nested in the list), `EventFormSheet` (2-step create), `LinkExpensesSheet` (retroactive bulk-link) |
| `src/components/QuickAmountSheet.tsx` | The one-tap amount+account+category+description capture, shared by the event card and QuickAdd's long-press chip |
| `src/features/events/components/EventTile.tsx` | The one tile the dashboard card and the list page both render; past events take a variant that drops the progress bar |
| `src/components/CreateMenuSheet.tsx` | NavMenu → Create new — the feature's discovery surface |


### Data-driven, never settings-driven (v1.58)
There is **no `track_events` flag** — it was removed because a toggle that can hide a feature the
user already has data in is only a way to lose track of it, and it made the feature undiscoverable
(off by default, surfaced once on page 6 of 7 of a signup carousel that pre-v1.57 users never see).

| Surface | Shown when |
|---|---|
| NavMenu → **Create new** → Life Event | **always** — this is the discovery path, do not gate it |
| NavMenu → Life Events | `state.events.length > 0` |
| Dashboard card | at least one **active** event (not merely `length > 0` — the card can only show active ones, and a card that is all call-to-action is the nag this replaced) |
| Transaction event chip | any expense, even with zero events |

The FAB deliberately still opens Quick Add directly. A chooser in front of it would tax the most
common action in the app forever; Create lives in NavMenu instead.

`EventsListPage` owns `EventDetailPage` beneath it (the `ProjectsListPage` → `ProjectDetailPage`
shape), so the back stack is Dashboard → List → Detail however you entered. The dashboard tile
passes `initialEventId` to keep its one-tap open. Detail takes **no** `onSwipeProgress`: swiping it
away reveals the opaque list page, not the dashboard, so dimming App's scrim would be wrong.
### The exclusion — the part that's easy to break
`excluded_from_budget` (default **true**) keeps tagged spend out of exactly four analytics
readers, and out of nothing else. Balances, cash flow, net worth and history read raw
transactions and must never consult it.

| File | Site |
|---|---|
| `src/lib/data.ts` | `makeScopeFilter` — **both** branches, incl. the default Lifestyle-only one |
| `src/lib/budget-strategy.ts` | `computeStrategyData` |
| `src/features/forecast/lib/lifestyleForecast.ts` | `isBehavioralSpending` (optional 4th arg) |
| `src/lib/challenge.ts` | filtered once at `computeChallenge`'s entry, not at its six spend reads |

Totals are always **derived** by summing tagged rows, so toggling exclusion takes effect on the
next render — no backfill, no recompute.

### Gotchas
- `updateTransaction` treats an **absent** `event_id` as "leave unchanged"; only an explicit
  `null` clears it. Callers that don't know about events (AI chat editor, quick-category popup)
  would otherwise silently untag a wedding expense.
- `addTransaction` tags in a **follow-up update**, not through `mp_execute_transaction` — that
  RPC owns the atomic balance deltas and shouldn't grow a column that doesn't affect them.
- FK is `ON DELETE SET NULL`, never CASCADE: deleting an event must never delete real spending.
- `event_linked_at` is stamped by **trigger** (two of them — `OLD` isn't available in an INSERT
  trigger's `WHEN`), because four paths write `event_id` including the implicit `SET NULL`.
- A partial unique index on `(user_id, lower(name)) WHERE status != 'archived'` makes duplicate
  live names a `23505`; `addEvent`/`updateEvent` translate it into a readable message.
- `LinkExpensesSheet` skips split legs — same reasoning as the daily-challenge exclusion toast.

## Auto-categorize in QuickAdd (four-tier)
0. **History match** (`findHistoricalCategory`) — same description used before (exact, case-insensitive) → same category as the most recent matching transaction
1. **Name match** (`findCategoryMatches`) — word-overlap against category names  
2. **Keyword fallback** (`guessCategory`) — hardcoded `KEYWORD_CATS` table  
3. **AI** (`parseExpenseWithAI`) — Groq via Edge Function, min 4 chars + 1200 ms debounce, only when `autopilotEnabled === true`. (`categorizeWithAI` is dead code — see AI usage metering below.)

Uses `catsRef` (not `cats` state) inside the effect to avoid re-triggering when a new category is added.

## AI Edge Function
- File: `supabase/functions/ai-categorize/index.ts`
- Models: `MODEL_TEXT_LARGE` (`openai/gpt-oss-120b`, chat), `MODEL_TEXT_SMALL` (`openai/gpt-oss-20b`), `MODEL_VISION` (`qwen/qwen3.6-27b`, Preview tier). All reasoning models — `reasoning_effort: 'low'` and generous `max_tokens`, or they spend the budget thinking and return an empty string.
- Response format: exact category name **or** `NEW: <name> | <group>`

### AI usage metering
Two limits, neither shown to the user — the card says only `Mint AI · 23% used today`.

| Limit | Purpose | Where |
|---|---|---|
| `mp_daily_ai_request_limit()` = 100/day | Abuse cap, **always enforced** | reserved atomically by `mp_try_start_ai_request` |
| `mp_daily_ai_token_budget()` = 10,000/day | Cost budget, **measured only in v1** | `ENFORCE_TOKEN_LIMIT = false` until calibrated |

- **The displayed percentage is always token-derived**, in both phases. Never derive it from request count.
- `mp_ai_usage_today()` is authoritative. `settings.ai_usage_pct` / `ai_usage_enforcing` are display caches that go stale across midnight — apply the `isToday` guard before reading.
- `usageDate` is stamped once per request and reused for every write, so a stream crossing midnight can't corrupt the new day (`mp_bump_ai_usage` drops late flushes).
- `ai_call_log` records every upstream call with `feature` (allowlisted) and the model that *actually* answered — six features share `mode: 'chat'`, so `feature` is what makes calibration possible. 30-day retention via pg_cron.
- `categorizeWithAI` in `src/lib/gemini.ts` is **dead code** — exported, never imported. QuickAdd's autopilot uses `parseExpenseWithAI`.

## Statement import — storage protection
Five independent controls; none replaces another. The AI quota bounds **compute**, the rest bound **bytes**.

| Control | Bounds | Where |
|---|---|---|
| AI usage metering | Groq spend | tokens vs `mp_daily_ai_token_budget()`; 100 req/day abuse cap |
| 8 import batches/user/UTC day | Batch creation rate | `trg_import_batches_daily_limit`, advisory-locked per user; raises `PT429` |
| 10 MB per object + PDF/WebP/JPEG allowlist | Individual upload size | `storage.buckets` on `statement-imports` |
| Purge on completion | Normal storage lifecycle | `completeImportBatch` — status flip **first**, then purge |
| 7-day inactivity sweep | Abandoned imports | `import-cleanup` Edge Function + pg_cron; claims via `status='purging'` |

Gotchas worth knowing before touching this:
- The daily cap is keyed on `created_at`; the stale sweep is keyed on `updated_at` (activity), maintained by `trg_import_batches_touch_updated_at`. Do not swap them — `created_at` never changes, so an actively-resumed batch would look abandoned.
- `'purging'` is absent from the resume query's status list, which is *how* the sweep avoids deleting files under an active resume. Any new reader of `import_batches` must keep excluding it.
- `allowed_mime_types` is checked against the client's declared `Content-Type`. It is a contract control, not a security boundary — `file_size_limit` is the real bound.
- The sweep must never touch a `completed` batch, at any age.

## Git conventions
- Commit directly to `main` — no feature branches
- Never `git push` unless the user explicitly says so in that message

## React patterns used
- `stateRef` / `catsRef` — `useRef` mirroring state so callbacks/effects read current value without stale closures
- All data mutations go through `useSupabaseData` callbacks (`addCategory`, `updateSettings`, …)
- `filterGroup` prop on `CategorySelect` — pass `'Income'` to show only income categories
- Income group dedup runs on load (React StrictMode fires load twice)
