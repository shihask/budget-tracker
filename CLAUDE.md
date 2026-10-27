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
| `src/components/SettingsPage.tsx` | Full-screen settings page (swipe-back, same shell as SavingsPage/BorrowingPage) |
| `src/components/QuickAdd.tsx` | FAB + sheet for adding transactions; auto-categorize logic lives here |
| `src/components/CategorySelect.tsx` | Category dropdown, supports `filterGroup` prop |
| `src/lib/gemini.ts` | Client-side AI helpers + `aiUsagePatch` usage mirroring |
| `supabase/functions/ai-categorize/index.ts` | Deno Edge Function — Groq proxy, usage counter |

## How to add a new Settings field — checklist
1. **`src/types/index.ts`** — add field to `Settings` interface
2. **`src/hooks/useSupabaseData.ts`** — add field with default to `EMPTY_STATE.settings` (line ~13)
3. **`src/components/SettingsPage.tsx`** — add prop + toggle/control UI
4. **`src/App.tsx`** — pass `state.settings.<field> ?? <default>` and `onField={v => updateSettings({ <field>: v })}` to `SettingsPage`; pass to any other component that needs it (e.g. `QuickAddSheet`)
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
| `affordability_snapshot_date` | string\|null | null | Internal — written by `AffordabilityChecker`, not user-facing, no SettingsPage UI |
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
| `src/features/events/components/EventTile.tsx` | The one tile the dashboard card and the list page both render; past events take a variant that drops the progress bar and shrinks quick-add to a header `+` |
| `src/features/events/components/EventExpenseSheet.tsx` | Add-an-expense-to-this-event sheet (wraps `QuickAmountSheet`), shared by the dashboard card, list page tiles and the detail page's "+ Add expense" |
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

**Event totals never read `state.transactions` directly.** That is only the latest 200 rows; a
wedding's spend scrolls out of it within weeks and the event reads as its last expense. App builds
`eventLedger = useEventLedger(...)` (loaded window + every event-tagged row and every
reimbursement from `fetchEventLedger`, merged by `mergeEventLedger`, loaded row wins) and passes
it to `EventsCard`, `EventsListPage` → `EventDetailPage` / `exportEventCsv`, and Mint's context.
Any new event total must take `eventLedger` too.

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

### Suggestions — "Mint noticed a life event" (v1.71)
The second discovery path: when untagged spending looks like one occasion ("tea ooty trip",
"lunch ooty trip", "petrol ooty trip"), Mint proposes it with a toast that then waits in the notification bell.
**Nothing is ever auto-linked.** Flow (v1.73): toast/bell → **Review** (`EventSuggestionSheet`:
name, dates, total, the detected expenses) → Create Event → `EventFormSheet` prefilled →
`LinkExpensesSheet` with the rows ticked (`preselectedIds`) → the user taps Link.
A match on an existing live event (by `eventSlug`) skips the form: "Link to Ooty Trip".

**AI starts with the toast; Review never waits (v1.74).** The toast comes from the free local
check. When it appears (Autopilot on, cache miss — `needsAnalysis`), App calls `analyze()` in the
background, so Review normally opens on a cached answer. Opening from the bell (no toast that
time) starts it there instead; the sheet shows the local result immediately and updates in place.
`analyze()` dedupes per signal, so it is still one request per fingerprint — but note it now runs
for every *toasted* suggestion, not only opened ones.

`public/mint-thinking-loop.svg` (Mint's breathing leaf) means exactly "AI is running right now":
in the toast label (held ≥ 0.8 s, `SUGGESTION_MIN_LEAF_MS`, so a fast answer doesn't flicker)
and in the Review header while AI is still going. Otherwise the static `mint-ai-logo.svg`. Never
a blocking loader, never decoration. The toast's identity is `toastId` (the signal key), which
stays stable when the AI answer renames the suggestion — keying it on `txIds` restarts the toast.

**Surfaces (v1.72):** a toast (`EventSuggestionToast`) slides down from the top once per
suggestion, only on a clear dashboard (App's `overlayOpen`), stays 12 s (paused while touched),
then shrinks into the header bell (`[data-notification-bell]`) — where the suggestion waits as a
NotificationsSheet item and adds 1 to the badge. There is no dashboard card (removed in v1.72.1 — it was easy to scroll past and duplicated the bell). "Seen" is
`mp_event_suggest_toast_seen_<uid>`, same tx-id majority rule as dismissal, stamped when the toast
*finishes* so a reload mid-toast replays it.

| File | Purpose |
|---|---|
| `src/lib/event-suggestions.ts` | Pure detection: pool, tokenizer, phrase clusters, novelty, merchant rejection, burst, `validateAiResult`, `isSuppressed`. Constants documented at the top |
| `src/features/events/hooks/useEventSuggestion.ts` | Novelty-history fetch, AI call, cache, dismissals |
| `src/features/events/components/EventSuggestionToast.tsx` | The top toast that flies into the bell; its button is **Review** |
| `src/features/events/components/EventSuggestionSheet.tsx` | Review: Mint thinking (AI running) → result or "Looks like everyday spending" |
| `src/components/UndoSnackbar.tsx` | "Suggestion dismissed · Undo" |

**30 days discovers the event; 7 days decides whether it surfaces (v1.80).** `SUGGESTION_WINDOW_DAYS`
is cluster assembly — trips span two weekends, weddings spread over weeks, people log late.
`SUGGESTION_FRESHNESS_DAYS = 7` is a **surfacing** gate: a candidate reaches local output, an AI
signal, a toast or the bell only while its newest matched row is `>= shiftIso(today, -7)`. Calendar
dates, never timestamps (today 09-18 → 09-11 fresh, 09-10 stale, in every timezone). Never shrink
the 30 to "fix" staleness — that turns 30-day detection into 7-day detection, which the
"assembles a cluster from the full 30 days" test exists to catch.

Order matters: the cheap gate runs **first**, so a stale candidate never pays for a merchant check,
a novelty check, a 90-day median or an AI call.
```
pool → findPhraseClusters → isFresh → merchant → novelty ─┬→ AI signal: ≥2 rows, ≤21d span
                                                          └→ local: ≥3 rows, ≥2 categories, ≥₹500, not a category name
pool → findBurstCandidate (≥3 rows/5d, ≥₹500) → isFresh → baselineDailySpend → ≥3× median → burst
```
**Autopilot off** → local suggestion only. **Autopilot on** → the same, plus a **burst** offered as
generic "Mint found related expenses" (`burstSuggestion`, `generic: true`) for AI to name. Toast
wording: phrase → "Mint noticed a possible life event"; burst → "Mint found related expenses" —
never "hospital"/"wedding" before AI has actually read the expenses.

The AI phrase signal deliberately does **not** require ≥2 categories (a one-category occasion is
real: "Hotel Kodai Trip" + "Taxi Kodai Trip" are both Travel). What protects the quota is that a
bare signal surfaces nothing, and App only calls `analyze()` for something it shows — if AI is ever
triggered from a signal alone, the category guard must come back.

Lifecycle: fresh + not dismissed → toast (once) → bell → newest row passes 7 days → hidden → a new
matching row → eligible again. **Stale ≠ dismissed:** going stale only hides it, and the tx-id
majority rule still suppresses a re-freshened cluster (dismissed A B C D vs. new A B C D E is 4/5).

Gotchas:
- **Novelty is token-based on both sides, never `ILIKE`** — "goa" must not match "goal". When the
  200 loaded rows don't reach 90 days back, the hook fetches that range — but only when
  `needsHistory(pool, today)` says a **fresh** candidate still needs it (a fresh phrase cluster for
  novelty, or a fresh burst candidate for the baseline — separate questions, one shared query,
  since it already selects description *and* amount). No fresh candidate ⇒ no network request.
- Only dates **strictly before** the cluster's own start count against novelty; a row inside or
  after it carrying the same phrase doesn't make the phrase old.
- The burst baseline is measured before the **candidate's** first day, not before today: a window
  that included the burst itself would make a heavy week look ordinary.
- The burst baseline is `null` (no burst) when history doesn't reach 90 days: an unknown day is
  not a zero-spend day, or every new user's ordinary week reads as a burst.
- The phrase signal dropped its ≥2-categories rule in v1.80 (it existed so a new user's chai —
  no history ⇒ novel — couldn't re-ask AI daily). Safe only because a bare signal surfaces
  nothing and App calls `analyze()` only for what it shows. See the note above before changing
  where AI is triggered.
- The AI cache (`mp_event_suggest_<uid>`) is keyed on the **signal rows'** fingerprint
  (`id:date:tokens`), not the whole pool, so an unrelated coffee doesn't re-ask. "Not an event"
  is cached too; an AI failure is not. **AI never vetoes** — on "no", failure or an invalid
  answer the local suggestion still shows. `validateAiResult` accepts confidence as 85, "85" or
  0.85: small models write all three, and a strict integer check hid real suggestions (v1.72.2).
- Merchant rule C (shared first word) only rejects when that word is written as a shop somewhere
  in the cluster ("Lulu Hypermarket", "Hotel Maharaja") — "Ooty entry fee / Ooty boating" is a trip.
- Dismissal (`mp_event_suggest_dismissed_<uid>`) is by tx id with a majority rule, not by name —
  AI may rename the same trip.

## Expense Reimbursement — linked recovery
When someone pays you back, the money is **not income** — it reduces the expense it repays.
`transactions.reimbursement_for` is a nullable self-FK on an ordinary `income` row, so the
money still credits the account (balances, cash flow, net worth untouched) while analytics
read it as a correction to the original spend.

No new transaction type: `delta()` must keep crediting the account, so only the analytics
reading changes — which is exactly what a nullable grouping key expresses. Same shape as
`event_id` / `savings_id` / `borrowing_id`. Totals are always **derived**, never stored.

| File | Purpose |
|---|---|
| `src/lib/reimbursements.ts` | The one shared module — `forSpendAnalytics`, `spendAmount`, `reimbursedTotals`, `remainingReimbursable`, `reimbursementSummary`, `reimbursementsFor`, and the two anchor resolvers |
| `src/components/LinkReimbursementSheet.tsx` | Single-select expense picker; unbounded + searchable, splits collapsed to one row |
| `supabase/migrations/20260905000001_expense_reimbursements.sql` | Column, index and three triggers |

### The two halves have very different blast radii
| Half | Sites | How |
|---|---|---|
| Exclude from income | ~12, enumerable | `!isReimbursement(t)` at each |
| Net off the expense | ~40 `reduce` sites | `forSpendAnalytics` at the entry point, then `spendAmount(t)` in place of `t.amount` |

`forSpendAnalytics(state.transactions)` drops reimbursement rows and annotates reimbursed
expenses with `net_amount` / `gross_amount` / `reimbursed_amount`. **`amount` is never
rewritten** — exports, the AI context, drill-downs and any future audit log must keep seeing
the real database value. Read the net through `spendAmount(t)`, which falls through to
`t.amount` on a raw row and so is greppable when auditing coverage.

**Deliberately raw** — the money really did move, in both directions: `account-balance.ts`,
`cashflow.ts`, `services/index.ts`, `WealthSummaryCard`, `TransactionsPage` row rendering and
`totalFiltered`, and CSV export (two separate rows at their true amounts, so the export still
reconciles against a bank statement). Inside `derive()` this is the easiest thing to break:
`getCurrentBalance(state)` and `buildCashFlowForecast(state, …)` keep receiving the **raw**
state; only the sum loops read the normalized list.

### Netting is expense-dated
An August expense refunded in September shows **August** as ₹8. The refund corrects the
original spend — that is what makes a category total honest. The September arrival is not
hidden: balances and the forecast read raw, so +₹400 still lands on Sep 2, and `journeyData`'s
replay gains a `recovered` event kind so September's story isn't silent.

### Split expenses reimburse as a **group**
A ₹408 gift paid ₹300 Axis + ₹108 Cash is two legs with no parent row; excluding split legs
would make it unreimbursable. The link is stored on the group's **anchor leg** (earliest
`created_at`, tie-broken by id) and remaining is measured against the group total. The anchor
rule is internal to `reimbursements.ts` — callers go through `resolveReimbursementTarget` /
`resolveReimbursedExpense`, so a future split refactor can move the anchor without
invalidating stored links. Recovery is distributed across legs proportionally, so a
per-account breakdown still balances.

### Gotchas
- **`AND id <> NEW.id` in `mp_validate_reimbursement` is load-bearing.** Without it, editing an
  existing reimbursement from ₹250 to ₹300 is checked against its own stale ₹250 and falsely
  "exceeds remaining". The client mirrors the same self-exclusion.
- The link is written as a **follow-up update** (like `event_id`) because `mp_execute_transaction`
  owns the atomic balance deltas. Unlike the event tag, a failure here is **not** swallowed — an
  unlinked reimbursement is silently miscounted as income, the exact bug this fixes — so QuickAdd
  holds the sheet open and reports it.
- `updateTransaction` treats an **absent** `reimbursement_for` as "leave unchanged"; only an
  explicit `null` unlinks. Same tri-state rule as `event_id`.
- FK is `ON DELETE SET NULL`, never CASCADE. Deleting a reimbursed expense warns first, then the
  received money survives as ordinary income.
- `trg_transactions_reanchor_reimbursements` (BEFORE DELETE) re-points a link to a surviving leg
  when the anchor leg of a split is deleted — it fires ahead of the FK's SET NULL.
- Triggers raise `SQLSTATE 'PT422'` with user-facing messages; both QuickAdd and the edit sheet
  surface `err.message` verbatim.
- A reimbursement can land on a **credit card** (a merchant refund to the card it was paid
  with) — the only income a card accepts. Card deltas go through `cardDelta(type, amount)` in
  `transaction-deltas.ts` on create, edit and delete (income → outstanding falls). Statement
  math applies it to the **billed** amount first, like a payment (that's what banks do):
  `getCreditCardBilling.refundedSinceBill`, and `allocateCredits` in `credit-card-cycles.ts`
  (`StatementPayment.kind: 'refund'`). Only the leftover the bill didn't need nets off the
  window it posted in. Never a purchase.
- A reimbursement carries **no category** — it belongs to no income category, and giving it one
  would put it in income category charts.
- `financial-cycle.ts`'s `isPrimaryIncomeTransaction` now excludes linked rows; this supersedes
  the older name-based `cat.name !== 'refund'` heuristic for anything actually linked.
- The two Edge Functions (`push-evening-recap`, `ai-categorize`) re-implement this math
  server-side and each carry their own copy of the netting.

## Recurring payments — which due a payment is for (`paid_through`)
A payment date doesn't say which installment it pays: due 27th, paid 30 Sep is late for 27 Sep
*or* early for 27 Oct, and someone paid on the 29th pays next month's dues on payday. So Record
Contribution / Mark Paid ask "Paying for" (chips), and `savings.paid_through` /
`commitments.paid_through` store the latest due date paid. **Every due ≤ `paid_through` is paid;
nothing after is.** `NULL` = recorded before v1.79 → the old calendar-period rule on
`last_contribution_date` / `last_paid_date`. No backfill, by design.

All in `src/lib/recurring.ts` — don't re-derive "paid this month" anywhere else:
- `isDueCovered(item, lastPaid, due)` — the one rule. Used by the forecast (both loops) and reminders.
- `isPaidForCycle` — hides Record/Mark Paid. Monthly looks to the **salary cycle end**, weekly to the week end.
- `paidForChoices` — picker options + default: earliest unpaid due; with no known `paid_through`, a
  due before the cycle began is assumed paid from last cycle's money (payday → this cycle's due).
- Callers that don't ask (RemindersBar) pass `paidFor` undefined → the hook applies the same default.
- Edit sheets must **never** send `last_paid_date` / `last_contribution_date` / `paid_date` /
  `paid_through` — before v1.79 they sent `null` and silently un-paid the item.
- The two push Edge Functions carry their own copy of the rule (string compare on ISO dates).

## Mint CFO answers (v1.75)
Eight core money questions get a **deterministic card** instead of free-form prose. Code owns
every number and the decision; the AI only adds a ≤ 3-sentence insight underneath.

| File | Purpose |
|---|---|
| `src/lib/cfo-snapshot.ts` | `buildCfoSnapshot`, `obligationTier`, `billRunway`, `pickDecision`, `affordVerdict`, `buildMonthStory`, `equationFacts` |
| `src/lib/cfo-intent.ts` | `classifyCfoIntent` — status, gap, liquid, balances, upcoming, free, weekly, afford, changed. Advice/plan/"why"/story questions return `null` and keep the free-form path |
| `src/lib/cfo-history.ts` | "What changed" — per-device localStorage `mp_cfo_snapshots_<uid>` |
| `src/components/mint/CfoCard.tsx` | The card (+ `cfoCardText.ts` for `CfoCardData` / `cfoHeadline`) |

### Mint's equation is not `d.realFreeMoney`
```
Free Money    = Liquid − Emergency − Mandatory bills due before next income
Funding Gap   = max(0, −Free Money)
After savings = Free Money − Flexible savings due before next income
```
`d.realFreeMoney` (forecast low point) still drives the dashboard, challenge, safe-daily and
notifications — **unchanged, by decision**. Mint used to send it as a bare `FreeMoney:₹-109123`,
which the model read as "spending ₹1,09,123 a week". Mint now reads the forecast only for its
dated events, plus `postIncomeRisk` (the low point falls after income and below after-savings).
Before income the two agree; `afterSavings` equals the forecast balance on the eve of income.

- **`obligationTier` is the only home of the mandatory/flexible rule.** card → card; commitment,
  borrowing, **prized** chit → fixed; saving (SIP/gold/RD/unprized chit) and planned → flexible.
  Flexible items never enter Free Money, the bill runway or the decision.
- **Bill runway** walks mandatory bills in due order from `liquid − emergency`; it deliberately
  ignores day-to-day spend, and the UI always says so ("Bill runway", never "Cash runway").
- **Today's Decision** is never AI: earliest due mandatory bill, ties card → borrowing →
  commitment → prized chit. The insight prompt receives it and must support, not replace, it.
- **This month's story** states facts, never causes — code can't know a loan *funded* a fee.
- Affordability cushion = `max(₹2,000, 10% of free money)`.
- "What changed": baseline = newest check ≥ 6 h old; a burst of checks within 6 h collapses into
  one, so quick repeats can't evict yesterday's baseline. Per device in v1, and labelled so.
- Local-only intents (liquid, balances, changed, afford-without-amount) make **no AI request**.
  Insight intents send `[CFO-INSIGHT:<kind>]` + compact facts; the Edge Function switches to
  "CFO INSIGHT MODE" on that marker. Keep the marker string in sync on both sides.
- No budget % above 100 anywhere Mint speaks: `budgetStatus()` says "₹X over".
- **Scope:** the chat system prompt opens with a SCOPE rule — personal finance and MoneyPlant
  only; anything else gets one fixed decline line. It is prompt-only (no client keyword filter,
  which would block real money questions), and it is shared by all six `mode: 'chat'` features.

## Mint find — locating a specific transaction (v1.78)
"When did I pay the plumber?", "find swiggy in August", "find 450" are answered by **code, with
no AI request**: parse → search → rank → `FindResultCard`. The AI never sees the rows; a later AI
turn gets only `findSummary`'s one line. Edit/delete ("change fuel 500 to 300", "delete tea 20")
locate their row with the same finder, and ask "which one?" when several tie at the top.

| File | Purpose |
|---|---|
| `src/lib/mint-find.ts` | `classifyFindIntent`, `parseFindQuery`, `rankFindMatches`, `executeFind`, count contract |
| `src/lib/mintActions/period.ts` | `parsePeriod` — shared with export; **local** dates (`localIso`), never `toISOString()` |
| `src/components/mint/FindResultCard.tsx` | The card; tap a row → edit, "View all" → Transactions prefilled (`initialFilters`) |

- **One definition of a filter.** Date/account/category/amount/system rows live only in
  `filterAndSortTransactions`; `rankFindMatches` does text + ranking only. Don't add a
  structured check to it.
- **One database word.** `filters.search` is the longest non-stopword token (`FIND_STOPWORDS`
  holds generic money words too — `%payment%` would drag in the ledger). Other words are searched
  only when no row contains every word (`WIDEN_MAX_TOKENS`); that's provable, since such a row
  would contain the first word.
- **Amount** is money-equal to the paisa via `amountBounds` — the same `[lo, hi)` on the client
  filter and in `searchTransactions`. It's a real `TransactionFilterState` field.
- **Count contract:** `complete` = exact, `truncated` = lower bound ("5,000+"), `local` =
  offline/failed, loaded window only. "View all N" names N only for one strict word.
- A category name also reads as a word ("find tea" when tea is logged under Food): the
  `alternate` query runs when the category reading finds nothing.

## Transactions page search — beyond the loaded window
`state.transactions` is only the latest 200 rows (more on scroll). With any narrowing filter
(`narrowsTransactions`) and history not fully loaded, `useTransactionSearch` calls
`searchTransactions` (useSupabaseData), which asks the DB for a **superset** of matches (ILIKE on
description, account/category/group/event/date), capped at `SEARCH_MAX_ROWS`. The page then runs
the same `filterAndSortTransactions` over loaded ∪ fetched (`mergeLoadedWins`, loaded row wins),
so `transactionFilters.ts` stays the one definition of a match — the SQL may be looser, never
stricter. The header says "searching all…" / "first 5,000 matches" / "latest N only" (failed);
load-more hides once the DB has answered. Export is separate — it fetches everything itself.

## Email a statement to yourself
Export Transactions sheet → **Email to me**. `buildTransactionsCsv` (`src/lib/exportTransactionsCsv.ts`)
builds the CSV for both download and email, so `filterAndSortTransactions` stays the one filter
definition. `emailTransactionsCsv` posts it to `send-statement-email`, which mails it via Brevo's
API from `noreply@moneyplant.online`.
- **The recipient is never taken from the request:** it is always the caller's own *confirmed*
  `user.email` (`no_email` otherwise — phone sign-ups add one in Profile). That is what keeps it from
  being an open relay; don't add a "send to" field without rethinking abuse.
- 10 sends/user/UTC day (`statement_email_sends`, service-role only, RLS on with no policies), 5 MB CSV cap.
- Secret `BREVO_API_KEY` — a Brevo **API** key, not the SMTP key Supabase Auth uses.

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
- `event-detect` (`MODEL_TEXT_SMALL`) — Life Event suggestion; runs only when the user opens Review on a cache miss (cached per signal fingerprint), so it runs rarely. Output is untrusted: `validateAiResult` maps indices back to the rows sent.
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

## Offline transaction entry — queue, review, Save all
Offline, the user can add an **expense, income or transfer** from an existing account/card with
an existing category, date, time, life event and person/merchant tag. It is stored on the device,
shown at once ("Waiting to sync", balances moved), and reaches the server **only when the user
taps Save all** in `OfflineReviewSheet`. Reconnecting never uploads or opens anything by itself.
Split, receipt, reimbursement, new category/master and AI parsing need the server: hidden
offline, or — if already set — Save is blocked with a reason, never silently dropped.

| File | Purpose |
|---|---|
| `src/lib/offline-queue.ts` | The queue (`mp_offline_queue_<uid>`), `isNetworkError`, `reconcileQueue`, `applyQueuedDeltas`, error wording |
| `src/lib/execute-transaction.ts` | The **one** save path — live saves and Save all replays both go through it |
| `src/lib/transaction-deltas.ts` | `delta` / `txDeltas` / `applyDeltas` — the one balance model (live save, overlay, replay) |
| `supabase/migrations/20260929000001_idempotent_execute_transaction.sql` | `p_id` on `mp_execute_transaction` |

**Invariant: each queued transaction's balance delta is displayed exactly once** — whether or
not the server committed it before the connection died.
- **The queue is the source of truth.** `Transaction.pending_sync` is a derived display flag;
  never stored, sent, or read for a sync decision.
- `syncState`: `offline` = never sent (delta locally owned); `uncertain` = sent, no answer — the
  server **may** have it. Only an online lookup by id decides; a cached list is never proof.
- **Client UUID = final server id.** Generated once in `addTransaction`, sent as `p_id` on every
  attempt. `mp_execute_transaction` does `ON CONFLICT (id) DO NOTHING`; an existing row returns
  with **no** delta, a different user's id or different balance fields is `PT409`. Only the
  balance fields are compared — description/category/date may have been edited elsewhere since.
- **Reconcile, then overlay.** Every snapshot (`load`, `refreshBalancesAfterSplit`,
  `refetchAccountsAndRecentTransactions`) goes through `reconcileStoredQueue` then
  `overlaySnapshot`, which re-derives the overlay from the fresh snapshot. Never layer it onto
  already-adjusted state; a new snapshot site that skips this double-counts or drops entries.
- The tag update (event/master/time) runs on **every** attempt with tags, including a retry that
  found the row — that's what finishes a save that committed but died before tagging.
- Queued items always carry `transaction_time` (entry time), or NULL would read as the sync time.
- Always read-modify-write the queue via `updateQueue` (storage, not memory): another tab may
  have saved items since.
- An `uncertain` item can't be discarded offline — it may be on the server.
- `src/sw.ts` caches Supabase GETs for 7 days so an offline open still has accounts to pick.

## Push notifications — tap opens the relevant screen
Each `push-*` Edge Function sends `url: '/?open=<screen>'`; the keys live in `src/lib/open-screen.ts`
(`OPEN_SCREENS`) and must stay in sync with the functions. App closed → the service worker opens
that URL; app already running → `sw.ts` posts `OPEN_SCREEN_MESSAGE` to it and focuses it (no reload).
App reads either into `pendingScreen`, waits for `!loading`, then opens the screen and strips `?open=`.

| Push | `open=` |
|---|---|
| daily-reminder | `quick-add` |
| evening-recap | `reflection` (today) |
| commitment-reminder | `commitments` |
| morning-alerts | one alert → `credit-cards` / `commitments` / `analytics-trend` / `analytics-category`; several → `notifications` |
| budget-alert | `analytics-trend` |
| financial-coach | pace → `analytics-trend`, spike → `analytics-category`, progress → `analytics-weeks` |
| weekly-summary | `analytics-weeks` |

An unknown key (an older/newer push) is ignored — the dashboard shows. `AnalyticsPage` is keyed on
`analyticsKey`, bumped per push tap, so the tab applies even when Analytics is already open.

## Sign-in — email or mobile; code to register, password to log in
One "Email or mobile number" box on both tabs. A 6-digit code proves ownership **once**, at sign-up;
after that the password signs in — checking email for a code on every login was too much friction.
Google stays separate.

| Tab / link | Flow |
|---|---|
| Sign Up | identifier → code (`shouldCreateUser: true`) → `CompleteProfilePage`: name + password → dashboard |
| Sign In | identifier + password → `signInWithPassword({ email \| phone })` |
| "Sign in with a code" | code (`shouldCreateUser: false`) → in. Fallback, and how an abandoned sign-up gets back to the name/password step |
| "Forgot password?" | code → `ResetPasswordPage` (new password) → dashboard |

The tabs exist because one box can't know whether an identifier is registered without an
"is this registered?" lookup, which would let anyone probe who uses MoneyPlant. Sign Up on an existing
account just signs in by code — harmless. Fallback codes never create accounts (a mistyped number
must not register).

| File | Purpose |
|---|---|
| `src/components/AuthPage.tsx` | `parseIdentifier`, tabs + code step (`CodePurpose`), `PasswordInput`, `CompleteProfilePage`, `ResetPasswordPage` |
| `supabase/functions/send-sms-otp/index.ts` | Supabase **Send SMS hook** → 2Factor.in (`verify_jwt = false`, Standard Webhooks signature) |

- `parseIdentifier`: `@` → email (lowercased); otherwise `9876543210`, `98765 43210`, `09876543210`,
  `+91 98765-43210` → `+919876543210`. **India-only** — international means a phone-number library,
  not more regexes. The hook also rejects non-+91.
- **Post-code screens are App-level**: `verifyOtp` sets the session and App swaps AuthPage out at
  once. App renders `CompleteProfilePage` while `user_metadata.full_name` is missing (`updateUser`
  → `USER_UPDATED` → listener re-sets the session), and `ResetPasswordPage` while `resettingByCode`.
  AuthPage raises `onPasswordResetPending(true)` **before** `verifyOtp` — the session lands while
  verifyOtp is still awaiting, so raising it after would flash the dashboard — and lowers it on failure.
- `ResetPasswordPage` also still serves legacy emailed reset links (App's recovery-hash handling);
  remove that path once old links have expired. No UI sends reset links any more.
- Hook failure contract: 200 **only** after 2Factor says `Status: "Success"`; anything else is a
  non-2xx `{ error }` so the app never advances to the code screen. 4 s provider timeout (hook limit
  5 s), no retries. **Never log the provider URL** — it carries the API key, phone and OTP, and
  Deno's network errors embed it; log only status, `err.name`, scrubbed text, last 4 digits.
- Secrets: `SEND_SMS_HOOK_SECRET` (`v1,whsec_…`), `TWOFACTOR_API_KEY`, optional `TWOFACTOR_TEMPLATE`
  (defaults to `MoneyPlantOTP`). Request: `GET /API/V1/{key}/SMS/+91XXXXXXXXXX/{otp}/{template}`.
  **Always send the template** — without an approved one 2Factor delivers the OTP as a voice call.
- Dashboard: Email OTP length **must be 6** (`OTP_LENGTH`). The 60 s resend timer is UX only —
  Auth rate limits are the real control. Turnstile (`captchaToken` in `signInWithOtp` and
  `signInWithPassword`) before phone sign-up goes public.
- The code step shows the identifier in full (unmasked, on purpose) so a typo is visible.
- **Profile** (pencil next to the name in the header menu → `ProfileSheet`): edit `full_name`, and
  `SignInMethodsSection` adds the *missing* email or mobile — `updateUser({ email | phone })` → code
  to the new address → `verifyOtp` type `email_change` / `phone_change`. Add-only: changing an
  existing email needs Supabase's two-inbox confirmation. Same password works with either.
  `parseIdentifier` & co. live in `src/lib/auth-identifier.ts`, shared with AuthPage. Taken
  addresses fail with "already used by another MoneyPlant account" — accounts are never merged.
- **TODO — identity linking**: Google `x@gmail.com` and phone `+91…` are separate accounts today;
  linking Google + email + phone (+ Apple) to one account is a future feature.

## Guest mode — try before signing up
"Try MoneyPlant Free" opens a Supabase **anonymous session**: a real user (own uid, same RLS) with
no email, phone or name. Saving the account links an email/mobile to the **same uid**, so no row
ever moves. Behind the build flag `VITE_GUEST_MODE=true` (`GUEST_MODE_ENABLED`); off, the CTA
opens sign-up and the page promises nothing about "no sign-up". With the flag on but Supabase's
anonymous sign-ins off, the button falls back to sign-up (`anonymous_provider_disabled`).

| From | Action | Then |
|---|---|---|
| Landing | `signInAnonymously()` | `GuestQuickStart` (one account) → Quick Add on an expense |
| Guest | `GuestSaveSheet`: `updateUser({email\|phone})` → code → `verifyOtp(email_change\|phone_change)` → `refreshSession()` | `CompleteProfilePage` (no name yet) → resumed onboarding |
| Guest | Sign out | confirm first: leaving loses access to the entries |

| File | Purpose |
|---|---|
| `src/lib/guest.ts` | `isGuest(user)` — the **one** client test (never "no email" / "no name"); flag; localStorage keys |
| `src/components/GuestQuickStart.tsx` | A guest's whole onboarding: Cash / Bank / UPI wallet + optional balance |
| `src/components/GuestSaveSheet.tsx` | Save the account; refuses a taken address (never merged), offers "sign in instead" |
| `src/hooks/useAddSignInMethod.ts` | The one add-email/mobile flow, shared with Profile → Sign-in methods |
| `supabase/migrations/20261016000002_guest_mode.sql` | `mp_is_guest()`, restrictive policies, activity, purge + cron |

- **App gate:** `!isGuest(user) && !full_name` → `CompleteProfilePage`. Guests skip it; a saved guest has
  no name, so lands on it — that reuses the name + password + `account_created` step unchanged.
- **Onboarding:** guests never see `OnboardingFlow`. `mp_guest_setup_pending_<uid>` (set by
  GuestQuickStart) makes it run after saving with `resumeAfterGuest` (no Splash, no Accounts), and
  stops the accounts-exist auto-dismiss from marking onboarding done meanwhile.
- **Server is the boundary, hiding is courtesy.** Guests are refused by `refuseGuest`
  (`_shared/guest.ts`, 403 `guest_not_allowed`) in `ai-categorize` (every mode), `send-invite-email`,
  `aa-connect`; and by restrictive INSERT policies on `import_batches`, `sync_connections`,
  `account_connections`, `projects`, `project_collaborators` and `storage.objects` in the three
  buckets. New paid / outward-facing feature ⇒ add it to one of those lists. Restrictive policies are
  `TO authenticated`, INSERT only, `NOT mp_is_guest()` — a no-op for registered users (claim missing
  or false reads as not-guest).
- **Purge:** `mp_purge_stale_guests` (pg_cron `purge-stale-guests`, 04:00 UTC) deletes guests idle
  30 days. Idle = `mp_guest_last_active_at`: auth activity (user row, sessions, refresh tokens) plus
  the newest timestamp in every guest-writable table that has one (settings, categories,
  commitments, borrowings … have none — the session refresh covers them). Candidates are locked
  `FOR UPDATE SKIP LOCKED` and re-checked before DELETE, so a guest being saved is skipped. CASCADE
  removes their rows; guests can't upload, so there are no files. A new guest-writable table with
  timestamps belongs in `mp_guest_last_active_at`.
- **Funnel:** `guest_started` → `guest_first_expense` → `guest_saved` → `guest_saved_return`
  (later local day, per device). `first_expense` stays registered-only; `account_created` counts
  both paths. `?internal=1` stops counting on that device. Admin totals exclude guests (`guestCount`).
- Tests: `supabase/tests/guest_mode.sql` (rolled back, non-prod only) and
  `scripts/test-guest-purge-race.mjs` (two connections, localhost only).

## Sign-up funnel — anonymous step counts
`trackStep(step)` (`src/lib/funnel.ts`) inserts one row into `funnel_events` per step per page
load: `landing_view → signup_opened / signin_opened / google_clicked → signup_code_sent
(or code_send_failed) → signup_code_verified → account_created → first_expense`, plus `signin_success`.
- `source` is the link's `utm_campaign`, read at load and kept in **sessionStorage**
  (`mp_funnel_source`) so it survives Google sign-in's redirect in the same tab. Instagram links
  use `ig_bio` / `ig_story_<topic>` (see marketing/instagram/content-plan.md).
- `first_expense` = a new account's first saved **expense** (not any row: onboarding writes
  `opening_balance` rows by itself). `createActivationWatcher` fires only after a load has been
  seen to finish with 0 expenses; App also limits it to accounts < `FIRST_EXPENSE_WINDOW_DAYS`
  old and a per-device flag `mp_first_expense_tracked_<uid>`, so a failed-then-retried load or an
  old account can't fake activation. The step's CHECK lives in `20261009000001_funnel_first_expense.sql`.
Each row holds only the step, `utm_campaign` (read once at load), platform and in-app browser —
**never** a user id, email, phone or IP. That's the privacy line (no Pixel, no tracking cookies);
don't add identifying columns. Insert-only RLS for anon/authenticated; read via the `funnel_daily`
view in the SQL editor. PROD only, fire-and-forget. Google sign-ups skip `account_created` (they
never see the name/password step).
Vercel Analytics is mounted at the root in `main.tsx` — inside `AppContent` it only ever counted
signed-in users, which hid every ad visitor until v1.86.2.

## Auth emails — branded templates
Sent by Supabase Auth through Brevo SMTP from `noreply@moneyplant.online` (domain DKIM-authenticated
in Brevo via Cloudflare DNS). The HTML lives in `supabase/templates/`, generated by
`node scripts/build-email-templates.mjs` from one shared layout — edit the script, never the
`.html`. Hosted Supabase doesn't read these files: each is pasted into Dashboard → Authentication
→ Emails, with the subject the script prints.
- Use only the variables Supabase documents for that template (`ConfirmationURL`, `Token`, `Email`,
  `NewEmail`). One the template doesn't provide fails the send, so the security notices use none.
- **Confirm signup** (new/unconfirmed user) and **Magic Link** (existing user) are the sign-in
  code emails: `{{ .Token }}` only, **no button or link** — a link would mix magic-link sign-in back
  into the OTP flow.
- Button is `#0A7A56`, not the app's `#16C98A` — white text on the bright green is too low-contrast.

## In-app browsers (Instagram & co.)
Links from social posts open in the app's own WebView, where Google blocks OAuth
(`403 disallowed_useragent`) and nothing can be installed. `src/lib/browser-env.ts`
(`inAppBrowserName`, plus the shared `isStandalone` / `getDevice`) detects it by **named UA
tokens only** — never Android's generic `; wv)`, since a false positive hides Google sign-in
from someone who could use it. When detected:
- AuthPage: the Google button is replaced inline by `OpenInBrowserNotice` (email sign-up still
  works). **No banner on arrival** — v1.84.0 had one and ad visitors met "leave" before the product
- PWAPrompt: banner says "Open", its sheet shows `OpenInBrowserActions` instead of install steps
- OnboardingFlow: skips the install step (PWAPrompt covers it)

Android escapes with an `intent://…#Intent;scheme=https;end` link (no `package=`, so the
user's default browser); iOS has no programmatic escape, so it gets the ⋯ → Open in external
browser step and a copy-link fallback.

## Boot shell — first paint before the bundle
The bundle is one ~700 KB (gz) file; on a budget phone over 4G it took 3–6 s before #root painted
anything, and ad traffic left during that blank screen (62 Meta clicks, ~9 counted visits).
`index.html` now paints `#mp-boot` straight from the HTML: a static copy of the landing hero for a
first-time visitor, else the same plain spinner App shows while the session loads.
- The choice is made by an inline script **before first paint**: hero only on `/`, not standalone,
  no `sb-*-auth-token` in localStorage, no auth hash. Any doubt → spinner. A signed-in user must
  never see a flash of "Create account".
- It overlays #root rather than living in it (React would swap it for the spinner first, giving
  hero → spinner → hero). App removes it via `dismissBootShell()` once session resolves (or a reset
  link is open); `SentryFallback` removes it too, so it can never hide an error.
- It has no working buttons — nothing can act on a tap before the app is up — just "Loading…",
  which offers a reload after 15 s.
- **Keep it in sync with the real hero** (`LandingScreen` in AuthPage + `.mp-hero*` in index.css):
  same copy, same layout, headline at normal weight (the CSS reset's, not 800). A mismatch shows
  as a jump at handoff.

## SEO and link previews
Everything is in `index.html`'s `<head>` plus three static files in `public/` (Vercel serves real
files before the SPA rewrite — before v1.90 both `/robots.txt` and `/sitemap.xml` returned the app HTML).
- One indexable URL: `<link rel="canonical" href="https://moneyplant.online/">`, so `?utm_campaign=…`
  links and SPA paths don't count as separate pages. `sitemap.xml` lists only `/`.
- `robots.txt` disallows `/project/` — shared-project pages are public by link only.
- Link previews (WhatsApp, Instagram DMs): `og:image` / `twitter:image` must be **absolute** URLs to
  `public/og-image.png` (1200×630, source `marketing/web/og-image.html`, render with
  `node marketing/web/render-og.mjs`). Keep it under ~600 KB or WhatsApp drops it.
- Title targets how people search ("expense tracker", "budget app", "India"); keep it ≤ 60 chars and
  the description ≤ 155. The boot shell's hero (above) is the crawlable text Google sees first.

## Kakeibo — Monthly Money Reflection (v1) + Analysis Workspace (v2)
A **ritual, not a budgeting formula**:
- set a savings goal on payday;
- review the finished cycle;
- write one thing to do differently;
- see it again next payday.

v2 adds an on-demand workspace in Analytics → Kakeibo: pick a cycle → Generate → the four questions with the **four pillars** (Survival / Optional / Culture / Unexpected).

There is no new `BudgetStrategyType`, no Culture *bucket* (pillars are a separate layer), and no push. The dashboard card is the in-app reminder; its Review button opens the workspace on that cycle (`initialTab` + `initialCycleStart`).

Kakeibo is fully isolated:
- its own table (`kakeibo_reflections`);
- its own queries (`useKakeibo`, not `useSupabaseData`);
- its own `Sentry.ErrorBoundary` (`KakeiboBoundary`).

On any failure it renders nothing, and Dashboard and Analytics are unaffected.

| File | Purpose |
|---|---|
| `src/features/kakeibo/lib/kakeibo.ts` | Pure: `isEligible`, `planCycleSync`, `dashboardActions`, `nextReviewState`, `computeCycleSummary`, `kakeiboInsight` |
| `src/features/kakeibo/hooks/useKakeibo.ts` | Records, sync (plan → RPC → re-read, at most 2 tries), column-scoped mutations |
| `src/features/kakeibo/hooks/useCycleLedger.ts` | A past cycle's rows from the DB (out of the 200-row window), merged with `mergeLoadedWins` |
| `supabase/migrations/20261013000002_kakeibo.sql` | Table, RLS (no DELETE policy), `mp_kakeibo_apply_sync` |
| `supabase/migrations/20261014000002_kakeibo_cycle_kind.sql` | `cycle_kind`, month CHECK, per-kind uniqueness, salary RPCs scoped to salary, `mp_kakeibo_ensure_month`. Checks in `supabase/tests/kakeibo_cycle_kind.sql` (includes a rollback rehearsal) |
| `supabase/tests/kakeibo_sync.sql` | Manual RLS / isolation / atomicity checks. **Non-production DB only**; runs in a transaction that rolls back |

- **Two cycle strategies (v1.94, `kakeiboStrategy`), stored per row as `cycle_kind`:**

  | Income pattern | Strategy | Cycle |
  |---|---|---|
  | Monthly | `salary` | The engine's recorded-salary cycle, only when `cycle.source === 'transaction'`; no salary yet → off |
  | Weekly, Variable/Daily, Business | `month` | Local calendar month, 1st to last day (`monthCycle`); never inferred from income rows |

  - Month rows are created by `mp_kakeibo_ensure_month` (idempotent; the server computes the end; a CHECK enforces whole months). Uniqueness is `(user_id, cycle_kind, cycle_start)`.
  - The salary RPCs (`mp_kakeibo_apply_sync`, `mp_kakeibo_record_past_cycle`) only ever see `cycle_kind = 'salary'`.
  - Month reminder windows always start on the 1st (no late-recording adjustment). A review prompt needs last month's row, so Kakeibo never asks a brand-new user to review a month it didn't see. The workspace still offers the last 6 calendar months.
  - **Changing income pattern never re-dates or re-labels a row.** Only rows of the active kind drive sync and reminders. Other-kind rows that hold a goal, note or review stay in the selector as history ("· salary cycle" / "· calendar month"). An open salary row left by a switch stays open and untouched.
  - Selector options are keyed `${kind}:${start}`, because a salary cycle and a month can both start on the 1st.
- **The client is the only cycle authority.**
  - `planCycleSync` is the one definition of the rules. A start that moves ≤ 15 days (the monthly cluster window) is the same cycle **re-keyed**, and its predecessor's `cycle_end` moves with it in the same plan.
  - The SQL holds no rules. `mp_kakeibo_apply_sync` (security invoker, per-user advisory lock) applies the plan's guarded writes. If any expectation fails it returns `'stale'` with nothing written, and it raises (full rollback) if closed cycles would overlap.
- Records starting after the current cycle (a deleted salary) are **hidden, never deleted**; re-adding the salary brings them back with the goal and note intact.
- Cycles longer than `MAX_REVIEW_CYCLE_DAYS` (unobserved paydays) are never offered for review.
- **Status never returns to null.** All changes go through `nextReviewState`: editing a reflection keeps it completed, keeps the first `reviewed_at`, and can't re-arm the reminder. Mutations write only the changed columns.
- **Metrics:**
  - `computeCycleSummary` mirrors `computeStrategyData`'s spending-type rule. It doesn't call it because that function has no end bound. A **parity test** pins Needs/Wants to it, so change both together.
  - Savings = contributions + savings-bucket spend − withdrawals.
  - There is no closing balance (no historical source) and no budget comparison (the periods differ).
- **Future push** reads `cycle_end` / `review_status`, so the server needs no cycle math. It can only follow a rollover the client has already saved.
- **Dashboard reminder windows** (`dashboardActions`):
  - Day 1 is payday: the goal row shows on days 1–7 and the review row on days 1–10.
  - If the salary was recorded late, day 1 is the day the app first saw the new cycle (the current row's `created_at`). Kakeibo's very first row always counts from the cycle start.
- **Two different "skips":**
  - Dashboard **"Not now"** sets `review_reminder_dismissed_at`. It hides the reminder only; the review stays pending in Analytics.
  - The workspace's **"Skip this review"** sets `review_status = 'skipped'`.
  - The goal's "Skip for now" stores `goal_decided_at` with a null `savings_goal`: no goal is created.
- The lesson row needs a non-blank `reflection_note`. Empty notes are saved as null.
- **Notification bell (v1.95, `bellItems`).** A Kakeibo slot in `NotificationsSheet` (`kakeiboSlot` / `kakeiboCount`, the same pattern as the Life Event suggestion) adds to the badge.
  - **Review item:** has **no day limit and ignores "Not now"**. It leaves only when the review is completed or skipped.
  - **Goal item:** follows the dashboard's 7-day window.
  - Ids are `kakeibo:<type>:<kind>:<cycle_start>`, so an item can't appear twice.
  - Tapping opens Analytics → Kakeibo on that cycle, or with the goal sheet open.
  - Nothing is added to `notification-engine.ts`, and there is no push. Push waits for completion data, which can be read from `review_status` / `reviewed_at` on `kakeibo_reflections`.
- `planCycleSync` re-closes the predecessor **only when adjacent**: it is open, it ends inside the new cycle, or it was adjacent to the re-keyed row. A past cycle recorded later from history must never be stretched.

### v2 — the four pillars
| File | Purpose |
|---|---|
| `src/features/kakeibo/lib/pillars.ts` | `resolvePillar`, `computePillarTotals`, `categoriesNeedingAi`, `validatePillarSuggestions`, `buildInsightFacts`, `insightNumbersAreGrounded` |
| `src/features/kakeibo/lib/cycles.ts` | `buildCycleOptions` — the cycle selector |
| `src/features/kakeibo/hooks/useKakeiboPillars.ts`, `useIncomeHistory.ts` | Pillar tables; income rows for the engine's backward walk |
| `src/features/kakeibo/components/KakeiboWorkspace.tsx`, `PillarReview.tsx` | Workspace and report; per-category / per-expense pickers |
| `supabase/migrations/20261013000003_kakeibo_pillars.sql` | `kakeibo_category_pillars`, `kakeibo_txn_pillars`, `mp_kakeibo_save_ai_pillars`, `mp_kakeibo_record_past_cycle` |
| `supabase/tests/kakeibo_pillars.sql` | Rolled-back RLS / ownership / AI-precedence / cascade checks |

- **Pillars never touch** transactions, categories, `budget_bucket` or Budget Strategy. Their only storage is the two pillar tables.
- **Precedence**, first match wins:
  1. transaction override (user);
  2. category pillar (`source = 'user'`);
  3. category pillar (`source = 'ai'`);
  4. seed: Needs → Survival, Wants → Optional;
  5. **Needs review**, never guessed.
- **AI can't overwrite the user.** The `ON CONFLICT … WHERE source = 'ai'` upsert in `mp_kakeibo_save_ai_pillars` enforces it. Ownership of the referenced category or transaction is enforced in RLS `WITH CHECK`, not only via `user_id`.
- **Reconciliation:** `eligibleSpendRows` / `classifyCycleRows` are the one spending-row definition. `computeCycleSummary` folds them, and its output is pinned byte-for-byte by `summary-snapshot.test.ts`. The pillars read the same rows, so pillars + Needs review === `spent` exactly (randomised test).
- **AI only with Autopilot on** (`kakeibo-classify`, `kakeibo-insight` in `ai-categorize`):
  - It classifies **categories**, and only ones with no stored pillar, so a category is sent about once, ever.
  - The insight gets precomputed facts only, and is dropped if `insightNumbersAreGrounded` finds any number that isn't a fact.
  - At most one insight request per Generate; it's cached per facts fingerprint (`mp_kakeibo_insight_<uid>`).
  - With Autopilot off, or if AI fails, the deterministic `kakeiboInsight` line still shows.
- **Cycle selector:**
  - Records win. Older cycles come from the engine (`getPreviousFinancialCycle`, read-only) over the fetched income history.
  - An engine cycle is offered only if it is salary-anchored, 16–46 days long, doesn't overlap a record or another offered cycle, and has **no other salary within 15 days before its anchor**. A split or late salary is excluded, never guessed.
  - Notes on older cycles go through `mp_kakeibo_record_past_cycle`, which returns `'conflict'` on any overlap.

## Household — shared finances for two users
A separate shared ledger (income, expenses, monthly budgets) for two MoneyPlant users. It never reads or
writes personal `transactions` / `accounts` / `categories` / `settings`, and is deliberately **not** built
on Shared Projects (no tokened invites, free-text members, live-only SQL functions). Behind the build flag
`VITE_HOUSEHOLD=true` (`HOUSEHOLD_ENABLED`); off, none of the feature's code is in the bundle and the
NavMenu row is hidden. **Turn it on only after the migration is applied** (`supabase/preflight/README.md`).

| File | Purpose |
|---|---|
| `supabase/migrations/20261027000001_household.sql` | Tables, RLS, grants, RPCs, triggers. **Not applied to prod yet** |
| `supabase/preflight/README.md` | Dependencies, apply order, account-deletion behaviour, **archive recovery runbook** |
| `supabase/preflight/household_preflight.sql` / `household_rollback.sql` | Read-only prod check / destructive rollback |
| `supabase/preflight/household_dryrun.sql` | Migration + suite in one transaction ending in ROLLBACK. **Generated** by `scripts/build-household-dryrun.mjs` — re-run it after editing either source |
| `supabase/tests/household.sql`, `scripts/test-household-accept-race.mjs` | Security suite (non-prod) / race tests (localhost) |
| `src/features/household/hooks/useHousehold.ts` | The feature's own queries (never `useSupabaseData`), RPC wrappers, optimistic edit check |
| `src/features/household/lib/budget.ts` | `summarize` / `budgetLine` — the one definition of a household total (calendar month, paise, expenses only) |
| `src/features/household/lib/invite.ts` | Link format, pending-token storage (mirrored by the inline script at the top of `index.html`) |
| `src/features/household/components/HouseholdPage.tsx` | The page: Overview / Transactions / Budgets / Members tabs, all sheets |

- **Months are calendar months**, never a member's salary cycle (two people's cycles rarely match).
  Budgets count expense rows only; income never reduces them; over budget reads "₹X over", never >100%.
- **Invite token privacy.** Links are `/#household_invite=<token>` — a fragment, so no server, Referer or
  preview crawler sees it. The first `<script>` in `index.html` moves it to sessionStorage
  (`mp_household_invite`, 24 h TTL) and strips the URL before analytics/Sentry/Supabase load. It's cleared on
  accept, invalid preview, dismiss and sign-out. Never log it — errors are reported by `code` only.
- App opens Household by itself when a pending token exists, once loading, onboarding and the guest
  quick start are out of the way. Guests get "Save your account to join"; the token waits for them.
- The page renders inside `HouseholdBoundary`, whose fallback is a **closable** page (rendering nothing would
  leave App's scrim up with no way out).

- One access gate: `mp_is_active_household_member(household_id)` = an active member of an active household.
  Leave, removal, account deletion and archive all cut access there.
- `households` / `household_members` / `household_invites` change only through `mp_household_*` RPCs.
  Clients can't select `household_members.user_id` or `household_invites.token_hash` — always list columns,
  never `select('*')` on those two; your own member id comes from `mp_household_current()`.
- Cross-household references are impossible by composite FK (`household_id` is part of every key).
- Invite tokens: only sha256 stored; raw token returned once; single-use; 7 days; one pending per household.
- `household_members.user_id` is the only `auth.users` reference (`ON DELETE SET NULL`); every household FK
  is RESTRICT and nothing deletes members or households — account deletion can't cascade into shared history.

## Git conventions
- Commit directly to `main` — no feature branches
- Never `git push` unless the user explicitly says so in that message

## React patterns used
- `stateRef` / `catsRef` — `useRef` mirroring state so callbacks/effects read current value without stale closures
- All data mutations go through `useSupabaseData` callbacks (`addCategory`, `updateSettings`, …)
- `filterGroup` prop on `CategorySelect` — pass `'Income'` to show only income categories
- Income group dedup runs on load (React StrictMode fires load twice)
