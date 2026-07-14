-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_promotion_schema
-- Date: 2026-07-14
--
-- Phase 1b schema prep — additive only, nothing calls any of this yet.
-- review_reason/review_context are MoneyPlant's own scoring output (matched
-- fields, score, suggested category), kept deliberately separate from
-- provider_metadata (vendor-sourced data) rather than mixed into it.
--
-- transaction_type is a real Postgres enum (verified via information_schema,
-- not assumed) — the dedup candidate query below casts against it directly.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sync_events
  ADD COLUMN IF NOT EXISTS review_reason  text,
  ADD COLUMN IF NOT EXISTS review_context jsonb;

-- Widen the status lifecycle with 'needs_review' — a sync_event whose dedup
-- score fell in the medium-confidence band, awaiting a user decision via
-- DedupReviewSheet. Verified the real constraint name (sync_events_status_check)
-- via pg_constraint rather than assuming it, per the lesson from the
-- partial-unique-index/ON CONFLICT bug fixed in 20260714000005.
ALTER TABLE sync_events
  DROP CONSTRAINT sync_events_status_check;
ALTER TABLE sync_events
  ADD CONSTRAINT sync_events_status_check
  CHECK (status IN ('pending', 'processed', 'merged', 'skipped', 'error', 'needs_review'));

-- Dedup candidate pool query (see mp_finalize_sync_event / the promotion
-- pipeline) filters on exactly these three columns plus sync_event_id IS NULL
-- — this index makes that cheap even as transaction history grows.
CREATE INDEX IF NOT EXISTS idx_transactions_dedup_candidates
  ON transactions(from_account_id, amount, transaction_date)
  WHERE sync_event_id IS NULL;
