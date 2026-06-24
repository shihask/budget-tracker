-- Fix: sync from_account_id when marking paid (commitments + savings)
-- Previously, marking a bill/savings paid would create the transaction with the
-- correct account but leave the record's from_account_id unchanged.

-- 1. Commitments: sync from_account_id to actual payment source
CREATE OR REPLACE FUNCTION mp_mark_commitment_paid(
  p_user_id          uuid,
  p_commitment_id    uuid,
  p_transaction_date date,
  p_description      text,
  p_amount           numeric,
  p_last_paid_date   date,
  p_new_installment  int,
  p_category_id      uuid    DEFAULT NULL,
  p_from_account_id  uuid    DEFAULT NULL,
  p_credit_card_id   uuid    DEFAULT NULL,
  p_from_delta       numeric DEFAULT NULL,
  p_cc_delta         numeric DEFAULT NULL,
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
  INSERT INTO transactions (
    user_id, transaction_date, description, amount, transaction_type,
    category_id, from_account_id, credit_card_id, to_account_id, notes
  ) VALUES (
    p_user_id, p_transaction_date, p_description, p_amount, 'commitment',
    p_category_id, p_from_account_id, p_credit_card_id, null, ''
  )
  RETURNING id INTO v_tx_id;

  UPDATE commitments SET
    last_paid_date      = p_last_paid_date,
    current_installment = p_new_installment,
    remaining           = COALESCE(p_new_remaining, remaining),
    is_active           = COALESCE(p_new_is_active, is_active),
    from_account_id     = COALESCE(p_from_account_id, p_credit_card_id, from_account_id)
  WHERE id = p_commitment_id AND user_id = p_user_id;

  IF p_from_account_id IS NOT NULL AND p_from_delta IS NOT NULL THEN
    UPDATE accounts SET current_balance = current_balance + p_from_delta
    WHERE id = p_from_account_id;
  END IF;

  IF p_credit_card_id IS NOT NULL AND p_cc_delta IS NOT NULL THEN
    UPDATE credit_cards SET current_balance = current_balance + p_cc_delta
    WHERE id = p_credit_card_id;
  END IF;

  RETURN (SELECT row_to_json(t)::jsonb FROM transactions t WHERE t.id = v_tx_id);
END;
$$;

-- 2. Savings: sync from_account_id to actual contribution account
CREATE OR REPLACE FUNCTION mp_record_savings_contribution(
  p_user_id                uuid,
  p_savings_id             uuid,
  p_account_id             uuid,
  p_amount                 numeric,
  p_transaction_date       date,
  p_description            text,
  p_new_installment        int,
  p_last_contribution_date date,
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
