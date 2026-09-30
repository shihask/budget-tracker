-- Offline transaction entry: make mp_execute_transaction idempotent.
--
-- The client now generates a transaction's id (crypto.randomUUID) once, when the
-- user saves it, and passes it as p_id on every attempt. That id becomes the
-- final row id, so a retry after a lost response — the server committed but the
-- phone never heard back — finds the row instead of inserting a second one and
-- moving the balance twice.
--
-- Contract:
--   p_id NULL                      → exactly the old behaviour (fresh id, deltas applied)
--   p_id new                       → inserted with that id, deltas applied once
--   p_id exists, same user, same
--     balance-determining fields   → idempotent success: existing row returned, NO deltas
--   p_id exists for another user,
--     or balance fields differ     → PT409
--
-- Only the balance-determining fields are compared. Description, category, date
-- and tags can legitimately be edited on another device after the first attempt
-- committed; comparing them would turn a genuine retry into a false conflict.
-- The fields compared are exactly the ones that decide which balances move and
-- by how much — the thing idempotency exists to protect.

-- Drop every overload rather than one exact signature: adding a parameter with
-- CREATE OR REPLACE would create an overload PostgREST can't disambiguate, and
-- dropping by exact signature would silently miss a live definition that has
-- drifted from 20260619000003.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'mp_execute_transaction' AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END;
$$;

CREATE FUNCTION mp_execute_transaction(
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
  p_cc_delta         numeric DEFAULT NULL,   -- signed delta for credit_card
  p_id               uuid    DEFAULT NULL    -- client idempotency key = final row id
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tx_id    uuid;
  v_existing transactions%ROWTYPE;
BEGIN
  INSERT INTO transactions (
    id,
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, to_account_id, credit_card_id, notes,
    borrowing_id, savings_id, is_credit
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()),
    p_user_id, p_transaction_date, p_description, p_amount,
    p_transaction_type::transaction_type,
    p_category_id, p_from_account_id, p_to_account_id, p_credit_card_id, p_notes,
    p_borrowing_id, p_savings_id, p_is_credit
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    -- RETURNING yields nothing on DO NOTHING, so read the existing row.
    -- (Only reachable with a non-NULL p_id: gen_random_uuid() never collides.)
    SELECT * INTO v_existing
    FROM transactions
    WHERE id = p_id AND user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction id already in use'
        USING ERRCODE = 'PT409';
    END IF;

    IF v_existing.transaction_type::text IS DISTINCT FROM p_transaction_type
       OR v_existing.amount          IS DISTINCT FROM p_amount
       OR v_existing.from_account_id IS DISTINCT FROM p_from_account_id
       OR v_existing.to_account_id   IS DISTINCT FROM p_to_account_id
       OR v_existing.credit_card_id  IS DISTINCT FROM p_credit_card_id
    THEN
      RAISE EXCEPTION 'Transaction id already used for a different transaction'
        USING ERRCODE = 'PT409';
    END IF;

    -- Already saved by an earlier attempt: the balances already moved. Apply nothing.
    v_tx_id := v_existing.id;
  ELSE
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
  END IF;

  RETURN (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id);
END;
$$;
