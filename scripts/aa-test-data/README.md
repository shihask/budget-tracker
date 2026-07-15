# AA sync test fixtures

Deterministic regression suite for the AA promotion pipeline (`src/features/aa-sync/lib/dedup.ts`, `src/features/aa-sync/hooks/useSyncPromotion.ts`) — built because Setu's sandbox can't be reliably seeded with real CREDIT/DEBIT transaction data (see `fixtures/insert/refund-credit.json`'s description and the Phase 1b plan for why). Every fixture inserts a real `sync_events` row shaped exactly like what a live AA webhook would have written (`_shared/aa-normalize.ts`'s output), so the pipeline being tested never knows the difference between a fixture and a real sync.

## Layout

```
fixtures/
  insert/       — should promote as a new transaction (no existing match)
  merge/        — should merge into an existing manual transaction
  review/       — medium-confidence match, should land in needs_review
  edge-cases/   — protects specific constants/behaviors from silent regressions
```

Each fixture is one JSON file with three parts:
- `scenario.existing_transaction` — a manual transaction to seed first, or `null`
- `scenario.{provider_event_id, raw_payload, provider_metadata}` — the incoming AA event
- `expectation` — what should happen: `promotion_action`, and optionally `category_group` / `merged_into_description` (only asserted where deterministic — see comments in individual fixtures)

Fixtures are treated as immutable once committed. Changing a scenario later gets a new file (`tea-debit-002.json`), not an edit — keeps the regression history intact.

## Running the suite

1. **Find a connection id** — needs to already have a linked account (an `account_connections` row):
   ```
   npx --yes supabase db query --linked "SELECT id, provider_connection_id, status FROM sync_connections WHERE status NOT IN ('revoked','expired');"
   ```

2. **Dry run first** (always — this is also what happens if you forget `--confirm`):
   ```
   node scripts/aa-test-data/insert-fixtures.mjs --connection-id <id>
   ```
   Lists exactly what would be inserted. Nothing is written yet.

3. **Actually insert**, then run the printed `supabase db query --linked --file ...` command:
   ```
   node scripts/aa-test-data/insert-fixtures.mjs --connection-id <id> --confirm
   ```

4. **Let the pipeline process them** — open the app with "Track AA Sync" on. `useSyncPromotion`'s realtime subscription picks up the new `pending` rows automatically (or wait for its on-mount drain).

5. **Verify**:
   ```
   node scripts/aa-test-data/verify-fixtures.mjs
   ```
   Prints a PASS/FAIL table and exits non-zero if anything failed.

## Cleanup

Fixture rows are identifiable by `provider_event_id LIKE 'fixture-%'`. To remove everything a run created:

```sql
-- Reverse balance effects the same way mp_delete_synced_transactions does,
-- for any fixture that actually got inserted (not merged):
-- (adjust manually per fixture's expectation.promotion_action if some show
-- unexpected results you want to inspect before deleting)

DELETE FROM transactions WHERE sync_event_id IN (
  SELECT id FROM sync_events WHERE provider_event_id LIKE 'fixture-%'
);
-- ^ only safe if every affected transaction was actually created by a
-- fixture (promotion_action='insert'); a merge fixture links to a
-- *pre-existing* transaction, which this would also delete — check
-- promotion_action first, or delete the specific fixture ids you ran.

DELETE FROM sync_events WHERE provider_event_id LIKE 'fixture-%';
```
Re-check account balances afterward if any `insert` fixtures ran — deleting their transactions directly (rather than via `mp_delete_synced_transactions`) does not reverse the balance delta automatically.
