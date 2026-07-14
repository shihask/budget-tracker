-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_finalize_rpc_v2
-- Date: 2026-07-14
--
-- Extends mp_finalize_sync_event (CREATE OR REPLACE, per the Phase 1a
-- migration's own comment — nothing calls the old signature yet) with real
-- promotion logic: insert a new transaction, merge into an existing one, or
-- mark for review/skip. Claim + promote happen in one PL/pgSQL body — one
-- transaction, so a mid-way failure leaves the row still 'pending' and
-- retryable, never claimed-but-unpromoted (the status lifecycle has no path
-- back to 'pending', so this matters).
--
-- Status mapping: 'skip'->'skipped', 'needs_review'->'needs_review',
-- 'insert'->'merged', 'merge_into'->'merged'. Insert and merge collapse to
-- the same terminal 'merged' value on purpose — both mean "this event now
-- corresponds to exactly one transactions row." 'processed' (Phase 1a's
-- claim-only value) becomes unreachable in steady state now that claim and
-- decide happen together in the same call — deliberate, not a bug.
--
-- account_delta is pre-computed in TypeScript (reusing the existing delta()
-- helper from useSupabaseData.ts) and passed in, matching mp_execute_
-- transaction's division of labor — this function never computes business
-- rules, only executes pre-computed values.
--
-- Merging relies on transactions.sync_event_id's existing unique partial
-- index as a safety net: merging into an already-claimed transaction raises
-- and rolls back the whole call, so the sync_event stays 'pending', safely
-- retryable, rather than silently double-claiming a transaction.
-- ─────────────────────────────────────────────────────────────────────────────

-- Postgres treats a different argument list as a distinct overload, not a
-- replacement — CREATE OR REPLACE alone would leave Phase 1a's 2-param
-- version lingering as dead code alongside this one. Drop it explicitly.
DROP FUNCTION IF EXISTS mp_finalize_sync_event(uuid, text);

CREATE OR REPLACE FUNCTION mp_finalize_sync_event(
  p_sync_event_id        uuid,
  p_outcome              text,
  p_processor            text  DEFAULT 'client',
  p_transaction          jsonb DEFAULT NULL,
  p_merge_transaction_id uuid  DEFAULT NULL,
  p_review_reason        text  DEFAULT NULL,
  p_review_context       jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_claimed        int;
  v_new_status     text;
  v_transaction_id uuid;
BEGIN
  v_new_status := CASE p_outcome
    WHEN 'skip'         THEN 'skipped'
    WHEN 'needs_review' THEN 'needs_review'
    WHEN 'insert'        THEN 'merged'
    WHEN 'merge_into'    THEN 'merged'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RAISE EXCEPTION 'mp_finalize_sync_event: unrecognized outcome %', p_outcome;
  END IF;

  UPDATE sync_events
  SET    status = v_new_status,
         processed_at = now(),
         processor = p_processor,
         review_reason = p_review_reason,
         review_context = p_review_context
  WHERE  id = p_sync_event_id AND status = 'pending';

  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed = 0 THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  IF p_outcome = 'insert' THEN
    INSERT INTO transactions (
      user_id, transaction_date, description, amount, transaction_type,
      category_id, from_account_id, notes, sync_event_id
    ) VALUES (
      auth.uid(),
      (p_transaction->>'transaction_date')::date,
      p_transaction->>'description',
      (p_transaction->>'amount')::numeric,
      (p_transaction->>'transaction_type')::transaction_type,
      NULLIF(p_transaction->>'category_id', '')::uuid,
      (p_transaction->>'account_id')::uuid,
      '',
      p_sync_event_id
    )
    RETURNING id INTO v_transaction_id;

    UPDATE accounts
    SET    current_balance = current_balance + (p_transaction->>'account_delta')::numeric
    WHERE  id = (p_transaction->>'account_id')::uuid;

  ELSIF p_outcome = 'merge_into' THEN
    -- The unique partial index on sync_event_id only stops two DIFFERENT
    -- rows sharing a value — it does NOT stop this UPDATE from silently
    -- overwriting an existing link on the SAME row (caught live: a second
    -- merge into an already-claimed transaction succeeded instead of
    -- failing). The explicit "AND sync_event_id IS NULL" guard is what
    -- actually makes this safe: 0 rows affected means someone already
    -- claimed it, so raise and let the whole call (including the sync_event
    -- claim above) roll back, leaving the row 'pending' and retryable.
    UPDATE transactions
    SET    sync_event_id = p_sync_event_id
    WHERE  id = p_merge_transaction_id AND sync_event_id IS NULL
    RETURNING id INTO v_transaction_id;

    IF v_transaction_id IS NULL THEN
      RAISE EXCEPTION 'mp_finalize_sync_event: transaction % is already linked to a different sync_event', p_merge_transaction_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('claimed', true, 'status', v_new_status, 'transaction_id', v_transaction_id);
END;
$$;
