-- Adds an optional expected repayment date to "borrowed" entries.
-- NULL means "no date set" — preserves current behavior (always counted as due).
ALTER TABLE borrowings ADD COLUMN IF NOT EXISTS repayment_date date;

-- mp_add_borrowing: persist repayment_date on create.
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
  p_description      text,
  p_repayment_date   date DEFAULT NULL
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
  INSERT INTO borrowings (user_id, person_name, total_amount, paid_amount, notes, direction, repayment_date)
  VALUES (p_user_id, p_person_name, p_total_amount, p_paid_amount, p_notes, p_direction, p_repayment_date)
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


-- mp_update_borrowing: persist repayment_date on edit.
CREATE OR REPLACE FUNCTION mp_update_borrowing(
  p_user_id         uuid,
  p_borrowing_id    uuid,
  p_person_name     text,
  p_total_amount    numeric,
  p_paid_amount     numeric,
  p_notes           text,
  p_direction       text,
  p_account_delta   numeric DEFAULT NULL,  -- null when amount did not change
  p_new_description text    DEFAULT NULL,  -- null when name did not change
  p_repayment_date  date    DEFAULT NULL
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
    person_name    = p_person_name,
    total_amount   = p_total_amount,
    paid_amount    = p_paid_amount,
    notes          = p_notes,
    direction      = p_direction,
    repayment_date = p_repayment_date
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
