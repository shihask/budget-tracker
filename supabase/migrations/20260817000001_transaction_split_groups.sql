-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: transaction_split_groups
-- Date: 2026-08-17
--
-- Split payment: one expense paid from two or more accounts. Each leg is stored
-- as an ordinary single-account expense row; siblings are tied together by
-- split_group_id. Nothing new exists at the data layer, so every balance,
-- budget, forecast and analytics calculation keeps working untouched — the
-- grouping is purely a presentation concern.
--
-- Two invariants these functions exist to protect:
--   1. sum(legs.amount) = the requested total, at creation and at update. The
--      total is never stored — every total the UI shows is derived from the
--      stored legs, so there is no second source of truth to drift from.
--   2. A split group has >= 2 legs. When a group would drop to one leg, the
--      survivor's split_group_id is cleared and it becomes a normal transaction.
--
-- Deviations from the rules in 20260619000003_rpc_functions.sql, both deliberate:
--   * That file's rule 4 has TypeScript pre-compute deltas. Here the server
--     derives them, because for update/delete the rows already exist and the
--     client must not be able to say "reverse this much". These are all expense
--     rows, so the sign convention is fixed and known server-side anyway.
--   * The caller is auth.uid(), never a p_user_id parameter. Still
--     SECURITY INVOKER, so RLS remains the primary guard and these ownership
--     checks are defence-in-depth layered on top of it — do NOT switch these to
--     SECURITY DEFINER, that would remove the backstop.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_group_id uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_split_group
  ON transactions (user_id, split_group_id) WHERE split_group_id IS NOT NULL;


-- ── Helpers ─────────────────────────────────────────────────────────────────

-- The authenticated caller. Identity is never accepted as a parameter.
CREATE OR REPLACE FUNCTION mp_split_caller()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'split: not authenticated';
  END IF;
  RETURN v_user_id;
END;
$$;


-- Every guard, in one place, run BEFORE any balance is touched so the split RPCs
-- read as "check, then mutate" rather than leaning on rollback to undo a
-- half-applied state.
CREATE OR REPLACE FUNCTION mp_split_validate_legs(
  p_user_id     uuid,
  p_amount      numeric,
  p_category_id uuid,
  p_legs        jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count    int;
  v_sum      numeric;
  v_distinct int;
BEGIN
  IF p_legs IS NULL OR jsonb_typeof(p_legs) <> 'array' THEN
    RAISE EXCEPTION 'split: legs must be a JSON array';
  END IF;

  SELECT count(*), coalesce(sum((leg->>'amount')::numeric), 0)
    INTO v_count, v_sum
    FROM jsonb_array_elements(p_legs) AS leg;

  -- Invariant 2
  IF v_count < 2 THEN
    RAISE EXCEPTION 'split: a split needs at least 2 payments (got %)', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_legs) AS leg
     WHERE coalesce((leg->>'amount')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'split: every payment amount must be greater than zero';
  END IF;

  -- Invariant 1
  IF round(v_sum, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'split: payments total % but the expense is %', v_sum, p_amount;
  END IF;

  -- Exactly one funding source per leg (an account OR a credit card, never both).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_legs) AS leg
     WHERE ((leg->>'account_id') IS NULL) = ((leg->>'credit_card_id') IS NULL)
  ) THEN
    RAISE EXCEPTION 'split: each payment needs exactly one account or credit card';
  END IF;

  SELECT count(DISTINCT coalesce(leg->>'account_id', leg->>'credit_card_id'))
    INTO v_distinct
    FROM jsonb_array_elements(p_legs) AS leg;
  IF v_distinct <> v_count THEN
    RAISE EXCEPTION 'split: the same account cannot fund two payments';
  END IF;

  -- Ownership of every id the client supplied.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_legs) AS leg
     WHERE leg->>'account_id' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM accounts a
          WHERE a.id = (leg->>'account_id')::uuid
            AND a.user_id = p_user_id AND a.is_active
       )
  ) THEN
    RAISE EXCEPTION 'split: unknown or inactive account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_legs) AS leg
     WHERE leg->>'credit_card_id' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM credit_cards cc
          WHERE cc.id = (leg->>'credit_card_id')::uuid
            AND cc.user_id = p_user_id AND cc.is_active
       )
  ) THEN
    RAISE EXCEPTION 'split: unknown or inactive credit card';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.id = p_category_id AND c.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'split: unknown category';
  END IF;
END;
$$;


-- Applies or reverses the balance effect of already-stored expense rows, read
-- from the rows themselves — the client never supplies a delta for a row that
-- exists. p_sign = -1 applies the expense (debit the account, grow the card
-- outstanding); p_sign = +1 reverses it.
CREATE OR REPLACE FUNCTION mp_split_balance(
  p_user_id uuid,
  p_ids     uuid[],
  p_sign    int
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;

  UPDATE accounts a
     SET current_balance = a.current_balance + (p_sign * agg.amount)
    FROM (
      SELECT t.from_account_id AS id, sum(t.amount) AS amount
        FROM transactions t
       WHERE t.id = ANY(p_ids) AND t.user_id = p_user_id
         AND t.from_account_id IS NOT NULL
       GROUP BY 1
    ) agg
   WHERE a.id = agg.id;

  UPDATE credit_cards cc
     SET current_balance = cc.current_balance - (p_sign * agg.amount)
    FROM (
      SELECT t.credit_card_id AS id, sum(t.amount) AS amount
        FROM transactions t
       WHERE t.id = ANY(p_ids) AND t.user_id = p_user_id
         AND t.credit_card_id IS NOT NULL
       GROUP BY 1
    ) agg
   WHERE cc.id = agg.id;
END;
$$;


CREATE OR REPLACE FUNCTION mp_split_rows(p_user_id uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
    FROM transactions t
   WHERE t.id = ANY(p_ids) AND t.user_id = p_user_id;
$$;


-- ── 1. Create ───────────────────────────────────────────────────────────────

-- Creation is the one path where client-proposed amounts are legitimate: the
-- rows do not exist yet, so there is nothing stored to derive them from.
CREATE OR REPLACE FUNCTION mp_execute_split_transaction(
  p_transaction_date date,
  p_description      text,
  p_amount           numeric,
  p_category_id      uuid  DEFAULT NULL,
  p_notes            text  DEFAULT '',
  p_legs             jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := mp_split_caller();
  v_group_id uuid := gen_random_uuid();
  v_ids      uuid[];
BEGIN
  PERFORM mp_split_validate_legs(v_user_id, p_amount, p_category_id, p_legs);

  WITH inserted AS (
    INSERT INTO transactions (
      user_id, transaction_date, description, amount, transaction_type,
      category_id, from_account_id, credit_card_id, notes, split_group_id
    )
    SELECT
      v_user_id, p_transaction_date, p_description,
      (leg->>'amount')::numeric, 'expense'::transaction_type,
      p_category_id,
      (leg->>'account_id')::uuid,
      (leg->>'credit_card_id')::uuid,
      coalesce(p_notes, ''), v_group_id
      FROM jsonb_array_elements(p_legs) AS leg
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM inserted;

  PERFORM mp_split_balance(v_user_id, v_ids, -1);

  RETURN mp_split_rows(v_user_id, v_ids);
END;
$$;


-- ── 2. Update ───────────────────────────────────────────────────────────────

-- Edits the group as one transaction. A split leg must never be edited on its
-- own: changing Axis 20,000 -> 25,000 in isolation would leave a 35,000 group
-- against a 30,000 header, breaking invariant 1 with no path to catch it.
CREATE OR REPLACE FUNCTION mp_update_split_group(
  p_split_group_id   uuid,
  p_transaction_date date,
  p_description      text,
  p_amount           numeric,
  p_category_id      uuid  DEFAULT NULL,
  p_notes            text  DEFAULT '',
  p_legs             jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := mp_split_caller();
  v_existing uuid[];
  v_supplied uuid[];
  v_final    uuid[];
BEGIN
  -- 1. Lock the group.
  PERFORM 1 FROM transactions t
    WHERE t.split_group_id = p_split_group_id AND t.user_id = v_user_id
    FOR UPDATE;

  SELECT array_agg(t.id) INTO v_existing
    FROM transactions t
   WHERE t.split_group_id = p_split_group_id AND t.user_id = v_user_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'split: group not found';
  END IF;

  -- 2. Validate the proposed final set before touching a single balance.
  PERFORM mp_split_validate_legs(v_user_id, p_amount, p_category_id, p_legs);

  SELECT array_agg((leg->>'id')::uuid) INTO v_supplied
    FROM jsonb_array_elements(p_legs) AS leg
   WHERE leg->>'id' IS NOT NULL;

  -- v_existing is scoped to (this user, this group), so this one check rejects
  -- both another user's row and another group's row.
  IF v_supplied IS NOT NULL AND NOT (v_supplied <@ v_existing) THEN
    RAISE EXCEPTION 'split: a payment id does not belong to this split';
  END IF;

  -- 3. Reverse the stored rows' effects, derived from the rows.
  PERFORM mp_split_balance(v_user_id, v_existing, 1);

  -- 4. Drop removed legs, update retained ones, insert new ones. Retained legs
  --    keep their id, and with it any attached receipt.
  DELETE FROM transactions t
   WHERE t.id = ANY(v_existing)
     AND (v_supplied IS NULL OR NOT (t.id = ANY(v_supplied)));

  UPDATE transactions t SET
    transaction_date = p_transaction_date,
    description      = p_description,
    amount           = (leg->>'amount')::numeric,
    category_id      = p_category_id,
    from_account_id  = (leg->>'account_id')::uuid,
    credit_card_id   = (leg->>'credit_card_id')::uuid,
    notes            = coalesce(p_notes, '')
    FROM jsonb_array_elements(p_legs) AS leg
   WHERE leg->>'id' IS NOT NULL
     AND t.id = (leg->>'id')::uuid
     AND t.user_id = v_user_id;

  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, credit_card_id, notes, split_group_id
  )
  SELECT
    v_user_id, p_transaction_date, p_description,
    (leg->>'amount')::numeric, 'expense'::transaction_type,
    p_category_id,
    (leg->>'account_id')::uuid,
    (leg->>'credit_card_id')::uuid,
    coalesce(p_notes, ''), p_split_group_id
    FROM jsonb_array_elements(p_legs) AS leg
   WHERE leg->>'id' IS NULL;

  -- 5. Apply the new set's effects, again read from the stored rows.
  SELECT array_agg(t.id) INTO v_final
    FROM transactions t
   WHERE t.split_group_id = p_split_group_id AND t.user_id = v_user_id;

  PERFORM mp_split_balance(v_user_id, v_final, -1);

  RETURN mp_split_rows(v_user_id, v_final);
END;
$$;


-- ── 3. Delete whole group ───────────────────────────────────────────────────

-- Takes no leg payload at all: the rows exist, so the reversal is derived from
-- them rather than dictated by the caller.
CREATE OR REPLACE FUNCTION mp_delete_split_group(p_split_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := mp_split_caller();
  v_ids     uuid[];
  v_rows    jsonb;
BEGIN
  PERFORM 1 FROM transactions t
    WHERE t.split_group_id = p_split_group_id AND t.user_id = v_user_id
    FOR UPDATE;

  SELECT array_agg(t.id) INTO v_ids
    FROM transactions t
   WHERE t.split_group_id = p_split_group_id AND t.user_id = v_user_id;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'split: group not found';
  END IF;

  -- Returned so the client can update local state and clean up receipt files.
  v_rows := mp_split_rows(v_user_id, v_ids);

  PERFORM mp_split_balance(v_user_id, v_ids, 1);
  DELETE FROM transactions WHERE id = ANY(v_ids);

  RETURN v_rows;
END;
$$;


-- ── 4. Delete one leg ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mp_delete_split_leg(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid := mp_split_caller();
  v_group_id      uuid;
  v_receipt_path  text;
  v_receipt_at    timestamptz;
  v_survivor      uuid;
  v_remaining     uuid[];
BEGIN
  SELECT t.split_group_id, t.receipt_path, t.receipt_uploaded_at
    INTO v_group_id, v_receipt_path, v_receipt_at
    FROM transactions t
   WHERE t.id = p_transaction_id AND t.user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'split: payment not found';
  END IF;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'split: payment is not part of a split';
  END IF;

  PERFORM 1 FROM transactions t
    WHERE t.split_group_id = v_group_id AND t.user_id = v_user_id
    FOR UPDATE;

  PERFORM mp_split_balance(v_user_id, ARRAY[p_transaction_id], 1);
  DELETE FROM transactions WHERE id = p_transaction_id;

  SELECT array_agg(t.id) INTO v_remaining
    FROM transactions t
   WHERE t.split_group_id = v_group_id AND t.user_id = v_user_id;

  IF v_remaining IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Hand the receipt to a survivor rather than orphaning it. The stored path
  -- still contains the deleted leg's id, which is cosmetic — every read and
  -- delete uses the stored receipt_path value rather than recomputing it.
  IF v_receipt_path IS NOT NULL THEN
    SELECT t.id INTO v_survivor
      FROM transactions t
     WHERE t.id = ANY(v_remaining) AND t.receipt_path IS NULL
     ORDER BY t.created_at
     LIMIT 1;

    IF v_survivor IS NOT NULL THEN
      UPDATE transactions
         SET receipt_path = v_receipt_path, receipt_uploaded_at = v_receipt_at
       WHERE id = v_survivor;
    END IF;
  END IF;

  -- Invariant 2: a one-leg group is a contradiction, so the survivor goes back
  -- to being an ordinary transaction and renders through the untouched path.
  IF array_length(v_remaining, 1) = 1 THEN
    UPDATE transactions SET split_group_id = NULL WHERE id = ANY(v_remaining);
  END IF;

  RETURN mp_split_rows(v_user_id, v_remaining);
END;
$$;
