-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_finalize_rpc_needs_review_claim
-- Date: 2026-07-15
--
-- The "review-everything" change (2026-07-15) made useSyncPromotion route
-- every transaction event to needs_review first, then DedupReviewSheet's
-- Merge/Add/Ignore actions call mp_finalize_sync_event a SECOND time to
-- make the actual final decision. But this function's claim guard only
-- ever accepted WHERE status = 'pending' — so that second call always
-- failed to claim (found status already at 'needs_review', 0 rows
-- affected, returned {claimed: false}) and silently did nothing. Caught
-- live: every Merge/Add/Ignore tap in the deployed review sheet returned
-- claimed: false, visible in the Network tab's response body.
--
-- Fix: accept claiming from EITHER 'pending' (the original single-step
-- balance/profile 'skip' path, and any direct decision that bypasses
-- review) OR 'needs_review' (the new two-step path). Still safe against
-- the double-claim race this function's WHERE-clause pattern already
-- protects against: the UPDATE...WHERE + GET DIAGNOSTICS combination is
-- atomic regardless of which status values are eligible — a second
-- concurrent caller only ever sees whichever terminal status the first
-- caller already wrote, never a chance to double-process the same row.
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
  WHERE  id = p_sync_event_id AND status IN ('pending', 'needs_review');

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
