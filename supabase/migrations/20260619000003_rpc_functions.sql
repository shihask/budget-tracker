-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: rpc_functions
-- Date: 2026-06-19
--
-- Creates 12 atomic Postgres functions that replace multi-step client writes.
-- Each function runs inside a single database transaction — either every write
-- succeeds and commits, or none of them do.
--
-- Design rules enforced here:
--   1. Balance updates use current_balance = current_balance + delta (never
--      SELECT-then-UPDATE — eliminates TOCTOU race conditions entirely).
--   2. DELETE always runs AFTER reversals, never before.
--   3. No application-level rollback — the DB transaction handles it.
--   4. RPCs receive pre-computed values from TypeScript; they do not compute
--      business rules (deltas, descriptions, is_credit, etc.).
--
-- All functions use SECURITY INVOKER so Supabase RLS applies automatically
-- with the calling user's JWT. No manual user_id checks needed inside
-- the functions — the existing RLS policies on each table enforce isolation.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Phase 1: Core transaction CRUD ──────────────────────────────────────────

-- 1. mp_delete_transaction
-- Reverses all balance effects THEN deletes the transaction.
-- This fixes the worst failure mode in the old code (delete-before-reversal).

CREATE OR REPLACE FUNCTION mp_delete_transaction(
  p_transaction_id  uuid,
  p_from_account_id uuid    DEFAULT NULL,
  p_from_delta      numeric DEFAULT NULL,   -- pre-computed reversal delta
  p_to_account_id   uuid    DEFAULT NULL,
  p_to_delta        numeric DEFAULT NULL,   -- pre-computed reversal delta
  p_credit_card_id  uuid    DEFAULT NULL,
  p_cc_delta        numeric DEFAULT NULL    -- pre-computed reversal delta
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_from_account_id IS NOT NULL AND p_from_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_from_delta
    WHERE id = p_from_account_id;
  END IF;

  IF p_to_account_id IS NOT NULL AND p_to_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_to_delta
    WHERE id = p_to_account_id;
  END IF;

  IF p_credit_card_id IS NOT NULL AND p_cc_delta IS NOT NULL THEN
    UPDATE credit_cards SET current_balance = current_balance + p_cc_delta
    WHERE id = p_credit_card_id;
  END IF;

  DELETE FROM transactions WHERE id = p_transaction_id;
END;
$$;


-- 2. mp_execute_transaction
-- Inserts a transaction and atomically applies balance deltas.
-- Covers: addTransaction (expense, income, transfer, commitment)
--         payCreditCardBill (credit_card_payment type)
--         Any future transaction type using the same pattern.
--
-- TypeScript pre-computes all deltas; this function just executes them.

CREATE OR REPLACE FUNCTION mp_execute_transaction(
  p_user_id          uuid,
  p_transaction_date date,
  p_description      text,
  p_amount           numeric,
  p_transaction_type text,
  p_category_id      uuid    DEFAULT NULL,
  p_from_account_id  uuid    DEFAULT NULL,
  p_to_account_id    uuid    DEFAULT NULL,
  p_credit_card_id   uuid    DEFAULT NULL,
  p_notes            text    DEFAULT '',
  p_borrowing_id     uuid    DEFAULT NULL,
  p_savings_id       uuid    DEFAULT NULL,
  p_is_credit        boolean DEFAULT NULL,
  p_from_delta       numeric DEFAULT NULL,   -- signed delta for from_account
  p_to_delta         numeric DEFAULT NULL,   -- signed delta for to_account
  p_cc_delta         numeric DEFAULT NULL    -- signed delta for credit_card
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, credit_card_id, notes,
    borrowing_id, savings_id, is_credit
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_amount,
    p_transaction_type::transaction_type,
    p_category_id, p_from_account_id, p_to_account_id, p_credit_card_id, p_notes,
    p_borrowing_id, p_savings_id, p_is_credit
  )
  RETURNING id INTO v_tx_id;

  IF p_from_account_id IS NOT NULL AND p_from_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_from_delta
    WHERE id = p_from_account_id;
  END IF;

  IF p_to_account_id IS NOT NULL AND p_to_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_to_delta
    WHERE id = p_to_account_id;
  END IF;

  IF p_credit_card_id IS NOT NULL AND p_cc_delta IS NOT NULL THEN
    UPDATE credit_cards SET current_balance = current_balance + p_cc_delta
    WHERE id = p_credit_card_id;
  END IF;

  RETURN (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id);
END;
$$;


-- 3. mp_update_transaction
-- Atomically: reverses old balance effects, updates the transaction row,
-- applies new balance effects, and syncs the linked borrowing record.
-- The old code did this in up to 10 separate DB calls.

CREATE OR REPLACE FUNCTION mp_update_transaction(
  p_transaction_id      uuid,
  p_transaction_date    date,
  p_description         text,
  p_amount              numeric,
  p_transaction_type    text,
  p_category_id         uuid    DEFAULT NULL,
  p_from_account_id     uuid    DEFAULT NULL,
  p_to_account_id       uuid    DEFAULT NULL,
  p_is_credit           boolean DEFAULT NULL,
  -- Old reversal deltas (TypeScript negates the original deltas)
  p_old_from_account_id uuid    DEFAULT NULL,
  p_old_from_delta      numeric DEFAULT NULL,
  p_old_to_account_id   uuid    DEFAULT NULL,
  p_old_to_delta        numeric DEFAULT NULL,
  -- New application deltas
  p_new_from_delta      numeric DEFAULT NULL,
  p_new_to_delta        numeric DEFAULT NULL,
  -- Borrowing sync (null = no sync needed)
  p_borrowing_id        uuid    DEFAULT NULL,
  p_old_amount          numeric DEFAULT NULL,
  p_borrowing_type      text    DEFAULT NULL,  -- 'borrowing' | 'borrowing_repayment'
  -- Credit card balance deltas
  p_old_cc_id           uuid    DEFAULT NULL,
  p_old_cc_delta        numeric DEFAULT NULL,
  p_new_cc_id           uuid    DEFAULT NULL,
  p_new_cc_delta        numeric DEFAULT NULL
)
RETURNS jsonb   -- { transaction, borrowing | null }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new_paid     numeric;
  v_total_amount numeric;
BEGIN
  -- 1. Reverse old balance effects first
  IF p_old_from_account_id IS NOT NULL AND p_old_from_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_old_from_delta
    WHERE id = p_old_from_account_id;
  END IF;

  IF p_old_to_account_id IS NOT NULL AND p_old_to_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_old_to_delta
    WHERE id = p_old_to_account_id;
  END IF;

  IF p_old_cc_id IS NOT NULL AND p_old_cc_delta IS NOT NULL THEN
    UPDATE credit_cards SET current_balance = current_balance + p_old_cc_delta
    WHERE id = p_old_cc_id;
  END IF;

  -- 2. Update the transaction record
  UPDATE transactions SET
    transaction_date = p_transaction_date,
    description      = p_description,
    amount           = p_amount,
    transaction_type = p_transaction_type::transaction_type,
    category_id      = p_category_id,
    from_account_id  = p_from_account_id,
    to_account_id    = p_to_account_id,
    is_credit        = p_is_credit,
    credit_card_id   = p_new_cc_id
  WHERE id = p_transaction_id;

  -- 3. Apply new balance effects
  IF p_from_account_id IS NOT NULL AND p_new_from_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_new_from_delta
    WHERE id = p_from_account_id;
  END IF;

  IF p_to_account_id IS NOT NULL AND p_new_to_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_new_to_delta
    WHERE id = p_to_account_id;
  END IF;

  IF p_new_cc_id IS NOT NULL AND p_new_cc_delta IS NOT NULL THEN
    UPDATE credit_cards SET current_balance = current_balance + p_new_cc_delta
    WHERE id = p_new_cc_id;
  END IF;

  -- 4. Sync borrowing record if amount changed
  IF p_borrowing_id IS NOT NULL AND (p_old_amount IS DISTINCT FROM p_amount) THEN
    IF p_borrowing_type = 'borrowing' THEN
      UPDATE borrowings SET total_amount = p_amount WHERE id = p_borrowing_id;

    ELSIF p_borrowing_type = 'borrowing_repayment' THEN
      -- Recompute paid_amount from ALL repayment transactions server-side.
      -- This avoids the 200-tx client-state limit and guarantees correctness.
      SELECT COALESCE(SUM(t.amount), 0) INTO v_new_paid
      FROM transactions t
      WHERE t.borrowing_id     = p_borrowing_id
        AND t.transaction_type = 'borrowing_repayment'
        AND t.id              != p_transaction_id;    -- exclude the tx being edited

      v_new_paid := v_new_paid + p_amount;

      SELECT total_amount INTO v_total_amount
      FROM borrowings WHERE id = p_borrowing_id;

      UPDATE borrowings
      SET paid_amount = LEAST(v_new_paid, v_total_amount)
      WHERE id = p_borrowing_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transaction', (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = p_transaction_id),
    'borrowing',   CASE WHEN p_borrowing_id IS NOT NULL THEN
                     (SELECT row_to_json(b)::jsonb FROM borrowings b WHERE b.id = p_borrowing_id)
                   ELSE NULL END
  );
END;
$$;


-- ── Phase 2: Savings & Commitments ──────────────────────────────────────────

-- 4. mp_mark_commitment_paid
-- Creates the commitment transaction, updates the commitment record, and
-- updates the relevant balance — all atomically.
-- Handles both bank (from_account) and credit card paths.

CREATE OR REPLACE FUNCTION mp_mark_commitment_paid(
  p_user_id          uuid,
  p_commitment_id    uuid,
  p_transaction_date date,
  p_description      text,
  p_amount           numeric,
  p_last_paid_date   date,               -- required: must precede any DEFAULT params
  p_new_installment  int,                -- required: must precede any DEFAULT params
  p_category_id      uuid    DEFAULT NULL,
  p_from_account_id  uuid    DEFAULT NULL,   -- bank account (null for CC)
  p_credit_card_id   uuid    DEFAULT NULL,   -- CC (null for bank)
  p_from_delta       numeric DEFAULT NULL,   -- -amount for bank
  p_cc_delta         numeric DEFAULT NULL,   -- +amount for CC
  p_new_remaining    numeric DEFAULT NULL,
  p_new_is_active    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  -- Insert transaction first
  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, credit_card_id, to_account_id, notes
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_amount, 'commitment',
    p_category_id, p_from_account_id, p_credit_card_id, null, ''
  )
  RETURNING id INTO v_tx_id;

  -- Update commitment record (sync from_account_id to the actual payment source)
  UPDATE commitments SET
    last_paid_date      = p_last_paid_date,
    current_installment = p_new_installment,
    remaining           = COALESCE(p_new_remaining, remaining),
    is_active           = COALESCE(p_new_is_active, is_active),
    from_account_id     = COALESCE(p_from_account_id, p_credit_card_id, from_account_id)
  WHERE id = p_commitment_id AND user_id = p_user_id;

  -- Update bank account balance
  IF p_from_account_id IS NOT NULL AND p_from_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_from_delta
    WHERE id = p_from_account_id;
  END IF;

  -- Update credit card outstanding
  IF p_credit_card_id IS NOT NULL AND p_cc_delta IS NOT NULL THEN
    UPDATE credit_cards SET current_balance = current_balance + p_cc_delta
    WHERE id = p_credit_card_id;
  END IF;

  RETURN (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id);
END;
$$;


-- 5. mp_record_savings_contribution
-- Atomically updates the savings installment counter, debits the account,
-- and creates the contribution transaction.

CREATE OR REPLACE FUNCTION mp_record_savings_contribution(
  p_user_id                uuid,
  p_savings_id             uuid,
  p_account_id             uuid,
  p_amount                 numeric,
  p_transaction_date       date,
  p_description            text,
  p_new_installment        int,           -- required: must precede any DEFAULT params
  p_last_contribution_date date,          -- required: must precede any DEFAULT params
  p_category_id            uuid    DEFAULT NULL,
  p_notes                  text    DEFAULT '',
  p_mark_complete          boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  UPDATE savings SET
    current_installment    = p_new_installment,
    last_contribution_date = p_last_contribution_date,
    is_active              = CASE WHEN p_mark_complete THEN false ELSE is_active END,
    from_account_id        = p_account_id
  WHERE id = p_savings_id AND user_id = p_user_id;

  UPDATE accounts SET current_balance = current_balance - p_amount
  WHERE id = p_account_id;

  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, notes, savings_id
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_amount, 'savings_contribution',
    p_category_id, p_account_id, null, p_notes, p_savings_id
  )
  RETURNING id INTO v_tx_id;

  RETURN (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id);
END;
$$;


-- 6. mp_add_savings_with_contribution
-- Atomically creates a savings record, debits the account, and creates the
-- contribution transaction. Replaces the faulty application-level rollback
-- in addSavings when debitAccountId is provided.
--
-- Savings data is passed as jsonb to avoid a 20+ parameter signature.

CREATE OR REPLACE FUNCTION mp_add_savings_with_contribution(
  p_user_id      uuid,
  p_savings_data jsonb,
  p_account_id   uuid,
  p_amount       numeric,
  p_transaction_date date,
  p_description  text,
  p_category_id  uuid   DEFAULT NULL,
  p_notes        text   DEFAULT ''
)
RETURNS jsonb   -- { savings: {...}, transaction: {...} }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_savings_id uuid;
  v_tx_id      uuid;
BEGIN
  INSERT INTO savings (
    user_id, name, type, amount, is_recurring, frequency, due_day,
    total_installments, current_installment, total_target, current_value,
    maturity_date, interest_rate, from_account_id, category_id,
    last_contribution_date, notes, is_active, is_prized, prize_month,
    investment_source
  ) VALUES (
    p_user_id,
    p_savings_data->>'name',
    p_savings_data->>'type',
    (p_savings_data->>'amount')::numeric,
    (p_savings_data->>'is_recurring')::boolean,
    p_savings_data->>'frequency',
    (p_savings_data->>'due_day')::int,
    (p_savings_data->>'total_installments')::int,
    COALESCE((p_savings_data->>'current_installment')::int, 0),
    (p_savings_data->>'total_target')::numeric,
    COALESCE((p_savings_data->>'current_value')::numeric, 0),
    (p_savings_data->>'maturity_date')::date,
    (p_savings_data->>'interest_rate')::numeric,
    (p_savings_data->>'from_account_id')::uuid,
    (p_savings_data->>'category_id')::uuid,
    (p_savings_data->>'last_contribution_date')::date,
    p_savings_data->>'notes',
    COALESCE((p_savings_data->>'is_active')::boolean, true),
    COALESCE((p_savings_data->>'is_prized')::boolean, false),
    (p_savings_data->>'prize_month')::int,
    p_savings_data->>'investment_source'
  )
  RETURNING id INTO v_savings_id;

  UPDATE accounts SET current_balance = current_balance - p_amount
  WHERE id = p_account_id;

  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, notes, savings_id
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_amount, 'savings_contribution',
    p_category_id, p_account_id, null, p_notes, v_savings_id
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'savings',     (SELECT row_to_json(s)::jsonb FROM savings s WHERE s.id = v_savings_id),
    'transaction', (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id)
  );
END;
$$;


-- 7. mp_record_savings_payout
-- Creates the savings_withdrawal transaction FIRST, then credits the account
-- and updates savings.current_value. The old code credited the account before
-- creating the record — a payment with no paper trail on failure.

CREATE OR REPLACE FUNCTION mp_record_savings_payout(
  p_user_id           uuid,
  p_savings_id        uuid,
  p_account_id        uuid,
  p_amount            numeric,
  p_new_current_value numeric,
  p_description       text,
  p_notes             text  DEFAULT '',
  p_transaction_date  date  DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, notes, savings_id
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_amount, 'savings_withdrawal',
    null, null, p_account_id, p_notes, p_savings_id
  )
  RETURNING id INTO v_tx_id;

  UPDATE accounts SET current_balance = current_balance + p_amount
  WHERE id = p_account_id;

  UPDATE savings SET current_value = p_new_current_value
  WHERE id = p_savings_id AND user_id = p_user_id;

  RETURN (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id);
END;
$$;


-- 8. mp_revert_savings_payout
-- Finds the most recent savings_withdrawal for a savings record (server-side,
-- no 200-tx client-state limit), reverses the account credit, deletes the
-- transaction, and restores savings.current_value — atomically.

CREATE OR REPLACE FUNCTION mp_revert_savings_payout(
  p_user_id    uuid,
  p_savings_id uuid
)
RETURNS jsonb   -- { deleted_tx_id, restored_value, account_id }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx
  FROM transactions
  WHERE user_id        = p_user_id
    AND savings_id     = p_savings_id
    AND transaction_type = 'savings_withdrawal'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_tx.id IS NULL THEN
    RAISE EXCEPTION 'No savings payout found for savings_id %', p_savings_id;
  END IF;

  IF v_tx.to_account_id IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance - v_tx.amount
    WHERE id = v_tx.to_account_id;
  END IF;

  DELETE FROM transactions WHERE id = v_tx.id;

  UPDATE savings SET current_value = v_tx.amount
  WHERE id = p_savings_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'deleted_tx_id',  v_tx.id,
    'restored_value', v_tx.amount,
    'account_id',     v_tx.to_account_id
  );
END;
$$;


-- ── Phase 3: Borrowings ──────────────────────────────────────────────────────

-- 9. mp_add_borrowing
-- Atomically creates the borrowing record, the linked transaction, and
-- updates the account balance.

CREATE OR REPLACE FUNCTION mp_add_borrowing(
  p_user_id          uuid,
  p_person_name      text,
  p_total_amount     numeric,
  p_paid_amount      numeric,
  p_notes            text,
  p_direction        text,     -- 'lent' | 'borrowed'
  p_transaction_date date,
  p_category_id      uuid,
  p_account_id       uuid,
  p_account_delta    numeric,  -- +amount for borrowed, -amount for lent
  p_is_credit        boolean,
  p_description      text
)
RETURNS jsonb   -- { borrowing: {...}, transaction: {...} }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_borrowing_id uuid;
  v_tx_id        uuid;
BEGIN
  INSERT INTO borrowings (user_id, person_name, total_amount, paid_amount, notes, direction)
  VALUES (p_user_id, p_person_name, p_total_amount, p_paid_amount, p_notes, p_direction)
  RETURNING id INTO v_borrowing_id;

  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, notes, borrowing_id, is_credit
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_total_amount, 'borrowing',
    p_category_id, p_account_id, null, '', v_borrowing_id, p_is_credit
  )
  RETURNING id INTO v_tx_id;

  UPDATE accounts SET current_balance = current_balance + p_account_delta
  WHERE id = p_account_id;

  RETURN jsonb_build_object(
    'borrowing',   (SELECT row_to_json(b)::jsonb FROM borrowings b WHERE b.id = v_borrowing_id),
    'transaction', (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id)
  );
END;
$$;


-- 10. mp_update_borrowing
-- Atomically updates the borrowing record, the linked initial transaction,
-- and adjusts the account balance delta.
-- Finds the linked transaction SERVER-SIDE — no client-state 200-tx limit.

CREATE OR REPLACE FUNCTION mp_update_borrowing(
  p_user_id         uuid,
  p_borrowing_id    uuid,
  p_person_name     text,
  p_total_amount    numeric,
  p_paid_amount     numeric,
  p_notes           text,
  p_direction       text,
  p_account_delta   numeric DEFAULT NULL,  -- null when amount did not change
  p_new_description text    DEFAULT NULL   -- null when name did not change
)
RETURNS jsonb   -- { borrowing: {...}, transaction: {...} | null }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_linked_tx_id      uuid;
  v_linked_account_id uuid;
BEGIN
  UPDATE borrowings SET
    person_name  = p_person_name,
    total_amount = p_total_amount,
    paid_amount  = p_paid_amount,
    notes        = p_notes,
    direction    = p_direction
  WHERE id = p_borrowing_id AND user_id = p_user_id;

  -- Find the initial borrowing transaction (server-side query, no 200-tx limit)
  SELECT id, from_account_id INTO v_linked_tx_id, v_linked_account_id
  FROM transactions
  WHERE borrowing_id    = p_borrowing_id
    AND transaction_type = 'borrowing'
    AND user_id         = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_linked_tx_id IS NOT NULL AND p_new_description IS NOT NULL THEN
    UPDATE transactions SET
      amount      = p_total_amount,
      description = p_new_description
    WHERE id = v_linked_tx_id;

    IF p_account_delta IS NOT NULL AND p_account_delta <> 0 AND v_linked_account_id IS NOT NULL THEN
      UPDATE accounts SET current_balance = current_balance + p_account_delta
      WHERE id = v_linked_account_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'borrowing',   (SELECT row_to_json(b)::jsonb FROM borrowings b WHERE b.id = p_borrowing_id),
    'transaction', CASE WHEN v_linked_tx_id IS NOT NULL AND p_new_description IS NOT NULL THEN
                     (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_linked_tx_id)
                   ELSE NULL END
  );
END;
$$;


-- 11. mp_record_borrowing_payment
-- Creates the repayment transaction first, then updates the account balance,
-- then marks the borrowing as (partially) paid. The old code updated
-- paid_amount before the transaction was created.

CREATE OR REPLACE FUNCTION mp_record_borrowing_payment(
  p_user_id          uuid,
  p_borrowing_id     uuid,
  p_new_paid_amount  numeric,
  p_payment          numeric,
  p_account_id       uuid,
  p_account_delta    numeric,  -- +payment (incoming) or -payment (outgoing)
  p_is_credit        boolean,
  p_category_id      uuid,
  p_description      text,
  p_transaction_date date
)
RETURNS jsonb   -- { transaction: {...}, borrowing: {...} }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, notes, borrowing_id, is_credit
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_payment, 'borrowing_repayment',
    p_category_id, p_account_id, null, '', p_borrowing_id, p_is_credit
  )
  RETURNING id INTO v_tx_id;

  UPDATE accounts SET current_balance = current_balance + p_account_delta
  WHERE id = p_account_id;

  UPDATE borrowings SET paid_amount = p_new_paid_amount
  WHERE id = p_borrowing_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'transaction', (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id),
    'borrowing',   (SELECT row_to_json(b)::jsonb FROM borrowings b WHERE b.id = p_borrowing_id)
  );
END;
$$;


-- 12. mp_delete_borrowing
-- The worst failure mode in the old code: a loop reversed accounts one-by-one
-- and if iteration N failed, N-1 accounts were reversed and ALL transactions
-- were then deleted. This function wraps the entire loop in one transaction.

CREATE OR REPLACE FUNCTION mp_delete_borrowing(
  p_user_id      uuid,
  p_borrowing_id uuid
)
RETURNS jsonb   -- { deleted_tx_ids: uuid[] }
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx          RECORD;
  v_delta       numeric;
  v_deleted_ids uuid[] := '{}';
BEGIN
  FOR v_tx IN (
    SELECT id, from_account_id, amount, is_credit
    FROM transactions
    WHERE borrowing_id = p_borrowing_id AND user_id = p_user_id
  ) LOOP
    IF v_tx.from_account_id IS NOT NULL THEN
      -- is_credit=true means account was credited → reversal = debit (-amount)
      -- is_credit=false means account was debited  → reversal = credit (+amount)
      v_delta := CASE WHEN v_tx.is_credit THEN -v_tx.amount ELSE v_tx.amount END;
      UPDATE accounts SET current_balance = current_balance + v_delta
      WHERE id = v_tx.from_account_id;
    END IF;
    v_deleted_ids := v_deleted_ids || v_tx.id;
  END LOOP;

  DELETE FROM transactions WHERE borrowing_id = p_borrowing_id AND user_id = p_user_id;
  DELETE FROM borrowings   WHERE id           = p_borrowing_id AND user_id = p_user_id;

  RETURN jsonb_build_object('deleted_tx_ids', to_jsonb(v_deleted_ids));
END;
$$;
