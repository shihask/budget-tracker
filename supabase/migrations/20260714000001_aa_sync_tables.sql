-- ═══════════════════════════════════════════════════════════════════════════
-- AA Sync Phase 1a — foundation tables (sync_connections, sync_events,
-- account_connections) + transactions.sync_event_id linkage column.
--
-- This migration only creates staging infrastructure. Nothing here writes
-- into `transactions`/`accounts` yet — see docs/aa-integration-phase0.md and
-- the Phase 1a plan. Two invariants this schema exists to protect (recorded
-- here as a comment so they survive independently of any planning doc):
--   1. raw_payload on sync_events is immutable once inserted — no code path
--      ever updates it after the initial insert.
--   2. No external provider may write directly into `transactions` — every
--      external source creates sync_events first; only the (future) finalize
--      pipeline may materialize those into real transactions.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sync_connections ────────────────────────────────────────────────────
-- One row per external data connection (e.g. one AA consent). Tracks the
-- connection-level lifecycle:
--   pending -> active -> syncing -> synced <-> syncing (PERIODIC loop)
--                                 \-> expired / revoked / error
CREATE TABLE IF NOT EXISTS sync_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider                text NOT NULL CHECK (provider IN ('aa', 'csv', 'pdf')),
  provider_connection_id  text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'syncing', 'synced', 'expired', 'revoked', 'error')),
  fetch_type              text CHECK (fetch_type IN ('onetime', 'periodic')),
  fetch_frequency         text,
  consent_expires_at      timestamptz,
  last_synced_at          timestamptz,
  next_sync_after         timestamptz,
  retry_count             integer NOT NULL DEFAULT 0,
  last_attempted_at       timestamptz,
  last_error              text,
  provider_metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_connection_id)
);

ALTER TABLE sync_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_connections_owner" ON sync_connections
  FOR ALL USING (auth.uid() = user_id);

-- ── sync_events ─────────────────────────────────────────────────────────
-- One row per raw synced item (transaction/balance/profile), immutable once
-- inserted. status lifecycle (allowed transitions only):
--   pending -> processed -> merged   (terminal)
--   pending -> skipped              (terminal)
--   pending -> error                (terminal in Phase 1a — no retry path yet)
-- No code path ever transitions a row back to `pending`.
CREATE TABLE IF NOT EXISTS sync_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id           uuid REFERENCES sync_connections(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('aa', 'csv', 'pdf')),
  provider_connection_id  text NOT NULL,
  provider_account_id     text,
  provider_event_id       text,
  event_type              text NOT NULL CHECK (event_type IN ('transaction', 'balance', 'profile')),
  raw_payload             jsonb NOT NULL,
  provider_metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processed', 'merged', 'skipped', 'error')),
  fetched_at              timestamptz NOT NULL DEFAULT now(),
  processed_at            timestamptz,
  processor               text,
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_events_owner" ON sync_events
  FOR ALL USING (auth.uid() = user_id);

-- Free first-pass dedup: a PERIODIC re-fetch returning an already-seen
-- transaction collides here via ON CONFLICT DO NOTHING, no scoring needed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_events_dedup_key
  ON sync_events (provider, provider_connection_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- ── account_connections ─────────────────────────────────────────────────
-- Maps a MoneyPlant account to an external provider's account. Kept as its
-- own table rather than columns on `accounts` — a single account could
-- plausibly be linked via more than one provider over its lifetime (a
-- reconnect through a different AA, or a future CSV import backfilling the
-- same account), and this keeps `accounts` itself provider-agnostic. Phase 1a
-- creates this table; nothing writes to it yet (account-linking is Phase 1b).
CREATE TABLE IF NOT EXISTS account_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_id              uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  provider                text NOT NULL CHECK (provider IN ('aa', 'csv', 'pdf')),
  provider_connection_id  text NOT NULL,
  provider_account_id     text NOT NULL,
  provider_metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_connection_id, provider_account_id)
);

ALTER TABLE account_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_connections_owner" ON account_connections
  FOR ALL USING (auth.uid() = user_id);

-- ── transactions.sync_event_id ──────────────────────────────────────────
-- Links a real transaction back to the sync_event it was promoted from. Not
-- written by Phase 1a — exists so Phase 1b's finalize pipeline has somewhere
-- to record it. Follows the exact savings_id precedent in
-- 20260619000002_transaction_columns_and_backfill.sql.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sync_event_id uuid REFERENCES sync_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_sync_event_id
  ON transactions(sync_event_id)
  WHERE sync_event_id IS NOT NULL;

-- ── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sync_connections_user      ON sync_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_connections_due
  ON sync_connections(next_sync_after) WHERE status = 'synced' AND fetch_type = 'periodic';
CREATE INDEX IF NOT EXISTS idx_sync_connections_stuck
  ON sync_connections(last_attempted_at) WHERE status IN ('active', 'syncing');
CREATE INDEX IF NOT EXISTS idx_sync_events_user           ON sync_events(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_connection      ON sync_events(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_pending
  ON sync_events(user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_account_connections_account ON account_connections(account_id);
