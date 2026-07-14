-- Fix: balance/profile sync_events have no natural external id (unlike
-- transactions, which dedup correctly via txnId), so the per-event unique
-- index never catches a re-delivered webhook for the same session — Postgres
-- treats every NULL as distinct, so it never fires for these rows. Caught
-- live during Phase 1a verification: replaying the same SESSION_STATUS_UPDATE
-- webhook twice produced duplicate balance/profile rows.
--
-- Fix at the session level instead of the event level: track the last
-- dataSessionId actually processed per connection, and skip re-processing
-- entirely if a webhook redelivers the same session. This is the right lever
-- for "same webhook delivered twice" — a genuinely new PERIODIC re-fetch
-- (different session id) SHOULD still produce fresh balance/profile
-- snapshots, that's not a duplicate, just a new data point.

ALTER TABLE sync_connections
  ADD COLUMN IF NOT EXISTS last_processed_session_id text;
