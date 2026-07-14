-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_finalize_rpc
-- Date: 2026-07-14
--
-- mp_finalize_sync_event — the idempotency gate for turning a sync_event into
-- something else. In Phase 1a this function does exactly one thing: it
-- atomically flips a sync_events row from 'pending' to 'processed', and only
-- the caller that wins the race gets claimed = true. Nothing in the app calls
-- this yet (see the Phase 1a plan) — it's built and verified in isolation now
-- so Phase 1b isn't blocked writing schema, and can extend this function
-- (adding the real insert/merge-into-transactions logic) via CREATE OR
-- REPLACE without touching this migration.
--
-- Named "finalize", not "promote" — "promotion into a real Transaction" is a
-- Phase 1b concept this function doesn't implement yet; the name shouldn't
-- imply behavior that isn't there.
--
-- SECURITY INVOKER: relies on sync_events' existing RLS policy
-- (auth.uid() = user_id) to scope the UPDATE to the calling user's own rows —
-- no explicit user_id parameter needed, matching mp_delete_transaction's
-- pattern in 20260619000003_rpc_functions.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mp_finalize_sync_event(
  p_sync_event_id uuid,
  p_processor     text DEFAULT 'client'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_claimed int;
BEGIN
  UPDATE sync_events
  SET    status = 'processed', processed_at = now(), processor = p_processor
  WHERE  id = p_sync_event_id AND status = 'pending';

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  RETURN jsonb_build_object('claimed', v_claimed = 1);
END;
$$;
