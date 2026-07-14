-- Fix: the original idx_sync_events_dedup_key was a PARTIAL unique index
-- (WHERE provider_event_id IS NOT NULL). Postgres rejects a plain
-- ON CONFLICT (provider, provider_connection_id, provider_event_id) against
-- a partial index unless the same WHERE predicate is repeated in the
-- conflict target — which Supabase's .upsert({onConflict}) client helper has
-- no way to express. Every real insert from aa-webhook was silently failing
-- with 42P10 "no unique or exclusion constraint matching the ON CONFLICT
-- specification" as a result — caught live during Phase 1a verification.
--
-- Fix: drop the partial predicate. A full (non-partial) unique index on
-- these three columns behaves identically for dedup purposes — Postgres
-- already treats each NULL as distinct from every other NULL in a unique
-- index by default, so rows with provider_event_id IS NULL (balance/profile
-- events) still never collide with each other. The only change is that this
-- is now a valid ON CONFLICT target.

DROP INDEX IF EXISTS idx_sync_events_dedup_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_events_dedup_key
  ON sync_events (provider, provider_connection_id, provider_event_id);
