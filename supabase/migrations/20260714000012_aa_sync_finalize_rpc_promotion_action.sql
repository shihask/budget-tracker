-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_finalize_rpc_promotion_action
-- Date: 2026-07-14
--
-- Extends mp_finalize_sync_event (CREATE OR REPLACE, same signature as
-- 20260714000009 — no new param needed since p_outcome is already passed)
-- to also record the raw outcome into sync_events.promotion_action,
-- alongside the existing collapsed status. See
-- 20260714000011_aa_sync_promotion_action_column.sql for why.
-- ─────────────────────────────────────────────────────────────────────────────

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
         promotion_action = p_outcome,
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
