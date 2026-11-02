-- Credit Card → Bank Transfer (cash advance through a rent / tuition gateway)
--
-- ₹5,000 moved from a card to a bank through a gateway charging ₹126.05 is TWO
-- financial facts, so it is two ordinary rows:
--   1. transfer  — credit_card_id = card, to_account_id = bank, amount 5,000.
--                  Bank +5,000, card outstanding +5,000. Borrowed money: never
--                  income, never spend (every reader already excludes 'transfer').
--   2. expense   — credit_card_id = card, amount 126.05, fee_for = (1).
--                  Card outstanding +126.05. A genuine expense.
--
-- Why fee_for on the FEE row (a nullable self-FK, same shape as
-- reimbursement_for) rather than a shared operation id on both: the transfer is
-- already identified by its own shape (transfer + credit_card_id), a transfer
-- with no fee needs no link at all, and one column cannot drift out of sync with
-- a second copy of itself.
--
-- Balances move only through mp_execute_transaction / mp_delete_transaction —
-- this file adds no balance arithmetic of its own beyond deriving the deltas
-- from stored rows.
--
-- Apply manually in the SQL editor (never `supabase db push`). Verify with
-- supabase/tests/card_to_bank.sql on a non-production database first.

BEGIN;

-- ── 1. The link ────────────────────────────────────────────────────────────
-- NO ACTION (the default), deliberately — not SET NULL, not CASCADE:
--   CASCADE would delete the fee WITHOUT reversing its 126.05 on the card.
--   SET NULL would let the transfer be deleted alone and orphan the fee.
--   NO ACTION refuses to delete a transfer while its fee exists, unless both go
--   in the same statement — which is exactly what account deletion and the guest
--   purge do (auth.users → ON DELETE CASCADE deletes all of a user's rows in one
--   cascaded statement). Proven by supabase/tests/card_to_bank.sql.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS fee_for uuid REFERENCES transactions(id);

-- One fee per transfer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_fee_for
  ON transactions(fee_for) WHERE fee_for IS NOT NULL;


-- ── 2. Authorization flag ──────────────────────────────────────────────────
-- The pair may be linked, unlinked or deleted only from inside the two RPCs
-- below. They raise a TRANSACTION-LOCAL setting (set_config(..., true)) around
-- the guarded statement and lower it straight after. A REST request is its own
-- transaction and PostgREST cannot set arbitrary settings from a request, so a
-- direct PATCH / DELETE / rpc('mp_delete_transaction') never sees it on.
CREATE OR REPLACE FUNCTION mp_card_pair_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(current_setting('mp.card_pair', true), '') = 'on';
$fn$;


-- ── 3. Link validation (+ the flag requirement for any change to the link) ──
CREATE OR REPLACE FUNCTION mp_validate_card_fee_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_target transactions%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.fee_for IS NOT DISTINCT FROM NEW.fee_for THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.fee_for IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT mp_card_pair_authorized() THEN
    RAISE EXCEPTION 'A processing fee can only be linked when the card-to-bank transfer is recorded'
      USING ERRCODE = 'PT422';
  END IF;

  IF NEW.fee_for IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.fee_for = NEW.id THEN
    RAISE EXCEPTION 'A transaction cannot be its own processing fee' USING ERRCODE = 'PT422';
  END IF;
  IF NEW.transaction_type <> 'expense' OR NEW.credit_card_id IS NULL THEN
    RAISE EXCEPTION 'A processing fee must be an expense on the credit card' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO v_target FROM transactions WHERE id = NEW.fee_for;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That transfer no longer exists' USING ERRCODE = 'PT422';
  END IF;
  IF v_target.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'That transfer belongs to another account' USING ERRCODE = 'PT422';
  END IF;
  IF v_target.transaction_type <> 'transfer' OR v_target.credit_card_id IS NULL THEN
    RAISE EXCEPTION 'A processing fee can only belong to a credit card to bank transfer' USING ERRCODE = 'PT422';
  END IF;
  IF v_target.credit_card_id <> NEW.credit_card_id THEN
    RAISE EXCEPTION 'The processing fee must be charged to the same card as the transfer' USING ERRCODE = 'PT422';
  END IF;
  IF v_target.fee_for IS NOT NULL THEN
    RAISE EXCEPTION 'That row is itself a processing fee' USING ERRCODE = 'PT422';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_transactions_card_fee_link ON transactions;
CREATE TRIGGER trg_transactions_card_fee_link
  BEFORE INSERT OR UPDATE OF fee_for ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION mp_validate_card_fee_link();


-- ── 4. Locked financial fields ─────────────────────────────────────────────
-- Every card-to-bank transfer, and every linked fee. Description and notes (and
-- tags: event, category of the fee, time) stay editable. The only way to change
-- an amount is delete-and-re-enter, which keeps both rows consistent by design.
CREATE OR REPLACE FUNCTION mp_lock_card_transfer_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
     OR NEW.amount           IS DISTINCT FROM OLD.amount
     OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
     OR NEW.from_account_id  IS DISTINCT FROM OLD.from_account_id
     OR NEW.to_account_id    IS DISTINCT FROM OLD.to_account_id
     OR NEW.credit_card_id   IS DISTINCT FROM OLD.credit_card_id
  THEN
    RAISE EXCEPTION 'This is part of a credit card to bank transfer. Delete the transfer and record it again to change its amount, accounts or date.'
      USING ERRCODE = 'PT422';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_transactions_card_transfer_lock ON transactions;
CREATE TRIGGER trg_transactions_card_transfer_lock
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  WHEN (OLD.fee_for IS NOT NULL OR (OLD.transaction_type = 'transfer' AND OLD.credit_card_id IS NOT NULL))
  EXECUTE FUNCTION mp_lock_card_transfer_fields();


-- ── 5. Pair-delete guard ───────────────────────────────────────────────────
-- A linked leg is deleted only by mp_delete_card_to_bank — or by account
-- deletion. Account deletion is auth.admin.deleteUser → DELETE auth.users → FK
-- cascade; by the time the cascade reaches transactions the owner's auth.users
-- row is already gone. Same test as mp_household_tx_sync_delete
-- (20261028000001), verified there against the live schema.
--
-- The transfer side is also protected by the NO ACTION FK; this guard gives it a
-- readable message instead of a bare 23503. A card transfer WITHOUT a fee is a
-- single self-consistent row and may be deleted normally.
--
-- SECURITY DEFINER for the auth.users read only (authenticated cannot select
-- auth.users) — same reason as mp_household_tx_sync_delete. Every name is
-- schema-qualified under an empty search_path.
CREATE OR REPLACE FUNCTION mp_guard_card_pair_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF public.mp_card_pair_authorized() THEN
    RETURN OLD;
  END IF;
  IF OLD.fee_for IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.transactions f WHERE f.fee_for = OLD.id)
  THEN
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'This is part of a credit card to bank transfer. Delete the whole transfer instead.'
    USING ERRCODE = 'PT422';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_transactions_card_pair_delete ON transactions;
CREATE TRIGGER trg_transactions_card_pair_delete
  BEFORE DELETE ON transactions
  FOR EACH ROW
  WHEN (OLD.fee_for IS NOT NULL OR (OLD.transaction_type = 'transfer' AND OLD.credit_card_id IS NOT NULL))
  EXECUTE FUNCTION mp_guard_card_pair_delete();


-- ── 6. Atomic, idempotent creation ─────────────────────────────────────────
-- One plpgsql call = one transaction: any RAISE rolls back both rows and every
-- balance move. Ids come from the client (generated once when the sheet opens),
-- so a retry after a lost response finds both rows instead of inserting again.
--
-- Retry contract:
--   same ids, same payload   → both rows returned, NO balances move
--   same ids, changed amount / accounts / card → PT409 (mp_execute_transaction)
--   same ids, fee added or dropped since the first attempt → PT409 (checked here,
--     because mp_execute_transaction only ever sees one row at a time)
CREATE OR REPLACE FUNCTION mp_execute_card_to_bank(
  p_transfer_id       uuid,
  p_fee_id            uuid,
  p_credit_card_id    uuid,
  p_to_account_id     uuid,
  p_amount            numeric,
  p_fee               numeric,
  p_fee_category_id   uuid,
  p_transaction_date  date,
  p_transaction_time  time    DEFAULT NULL,
  p_description       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_fee      numeric := coalesce(p_fee, 0);
  v_desc     text := coalesce(nullif(btrim(p_description), ''), 'Credit Card to Bank Transfer');
  v_retry    boolean;
  v_has_fee  boolean;
  v_transfer jsonb;
  v_fee_row  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'Missing transfer id' USING ERRCODE = 'PT422';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount received must be more than zero' USING ERRCODE = 'PT422';
  END IF;
  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Processing fee cannot be negative' USING ERRCODE = 'PT422';
  END IF;
  IF p_amount <> round(p_amount, 2) OR v_fee <> round(v_fee, 2) THEN
    RAISE EXCEPTION 'Amounts can have at most two decimal places' USING ERRCODE = 'PT422';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Choose a date' USING ERRCODE = 'PT422';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM credit_cards c
                  WHERE c.id = p_credit_card_id AND c.user_id = v_uid AND c.is_active IS NOT FALSE) THEN
    RAISE EXCEPTION 'Choose one of your active credit cards' USING ERRCODE = 'PT422';
  END IF;
  -- accounts never holds a card (cards live in credit_cards), so membership here
  -- is also the "destination is not a card" check.
  IF NOT EXISTS (SELECT 1 FROM accounts a
                  WHERE a.id = p_to_account_id AND a.user_id = v_uid AND a.is_active IS NOT FALSE) THEN
    RAISE EXCEPTION 'Choose one of your active bank, cash or wallet accounts' USING ERRCODE = 'PT422';
  END IF;

  IF v_fee > 0 THEN
    IF p_fee_id IS NULL OR p_fee_id = p_transfer_id THEN
      RAISE EXCEPTION 'Missing processing fee id' USING ERRCODE = 'PT422';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = p_fee_category_id AND c.user_id = v_uid) THEN
      RAISE EXCEPTION 'Choose a category for the processing fee' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  -- A retry must describe the same operation as the attempt that committed.
  v_retry := EXISTS (SELECT 1 FROM transactions WHERE id = p_transfer_id);
  IF v_retry THEN
    v_has_fee := p_fee_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM transactions WHERE id = p_fee_id AND fee_for = p_transfer_id);
    IF v_has_fee <> (v_fee > 0) THEN
      RAISE EXCEPTION 'Transaction id already used for a different transaction'
        USING ERRCODE = 'PT409';
    END IF;
  END IF;

  -- Principal: bank +amount, card outstanding +amount.
  v_transfer := mp_execute_transaction(
    p_user_id          => v_uid,
    p_transaction_date => p_transaction_date,
    p_description      => v_desc,
    p_amount           => p_amount,
    p_transaction_type => 'transfer',
    p_to_account_id    => p_to_account_id,
    p_credit_card_id   => p_credit_card_id,
    p_notes            => '',
    p_to_delta         => p_amount,
    p_cc_delta         => p_amount,
    p_id               => p_transfer_id
  );

  IF v_fee > 0 THEN
    -- Fee: card outstanding +fee. A genuine expense.
    PERFORM mp_execute_transaction(
      p_user_id          => v_uid,
      p_transaction_date => p_transaction_date,
      p_description      => 'Processing fee - Credit Card to Bank',
      p_amount           => v_fee,
      p_transaction_type => 'expense',
      p_category_id      => p_fee_category_id,
      p_credit_card_id   => p_credit_card_id,
      p_notes            => '',
      p_cc_delta         => v_fee,
      p_id               => p_fee_id
    );

    PERFORM set_config('mp.card_pair', 'on', true);
    UPDATE transactions SET fee_for = p_transfer_id
     WHERE id = p_fee_id AND fee_for IS DISTINCT FROM p_transfer_id;
    PERFORM set_config('mp.card_pair', 'off', true);
  END IF;

  IF p_transaction_time IS NOT NULL THEN
    UPDATE transactions SET transaction_time = p_transaction_time
     WHERE id IN (p_transfer_id, p_fee_id) AND transaction_time IS DISTINCT FROM p_transaction_time;
  END IF;

  SELECT row_to_json(t)::jsonb INTO v_transfer FROM transactions t WHERE t.id = p_transfer_id;
  IF v_fee > 0 THEN
    SELECT row_to_json(t)::jsonb INTO v_fee_row FROM transactions t WHERE t.id = p_fee_id;
  END IF;
  RETURN jsonb_build_object('transfer', v_transfer, 'fee', v_fee_row);
END;
$fn$;


-- ── 7. Atomic pair deletion ────────────────────────────────────────────────
-- Takes ONLY the transfer id. Every reversal is derived from the stored rows,
-- locked FOR UPDATE, and applied through the existing mp_delete_transaction
-- (which just applies the deltas it is given, then deletes) — so no number from
-- the client ever reaches a balance.
-- Fee first: under the NO ACTION FK the transfer cannot go while its fee exists.
CREATE OR REPLACE FUNCTION mp_delete_card_to_bank(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_t   transactions%ROWTYPE;
  v_f   transactions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM transactions
   WHERE id = p_transfer_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Already deleted (a retry), or never the caller's. Nothing moved.
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;
  IF v_t.transaction_type <> 'transfer' OR v_t.credit_card_id IS NULL THEN
    RAISE EXCEPTION 'That is not a credit card to bank transfer' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO v_f FROM transactions
   WHERE fee_for = v_t.id AND user_id = v_uid
   FOR UPDATE;

  PERFORM set_config('mp.card_pair', 'on', true);

  IF v_f.id IS NOT NULL THEN
    PERFORM mp_delete_transaction(
      p_transaction_id => v_f.id,
      p_credit_card_id => v_f.credit_card_id,
      p_cc_delta       => -v_f.amount
    );
  END IF;

  PERFORM mp_delete_transaction(
    p_transaction_id => v_t.id,
    p_to_account_id  => v_t.to_account_id,
    p_to_delta       => CASE WHEN v_t.to_account_id IS NULL THEN NULL ELSE -v_t.amount END,
    p_credit_card_id => v_t.credit_card_id,
    p_cc_delta       => -v_t.amount
  );

  PERFORM set_config('mp.card_pair', 'off', true);

  -- Everything the client needs to mirror the reversal locally, even when one leg
  -- was never in its loaded window.
  RETURN jsonb_build_object(
    'deleted', true,
    'transfer_id', v_t.id,
    'fee_id', v_f.id,
    'amount', v_t.amount,
    'fee', coalesce(v_f.amount, 0),
    'to_account_id', v_t.to_account_id,
    'credit_card_id', v_t.credit_card_id
  );
END;
$fn$;


-- ── 8. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION
  mp_card_pair_authorized(),
  mp_validate_card_fee_link(),
  mp_lock_card_transfer_fields(),
  mp_guard_card_pair_delete(),
  mp_execute_card_to_bank(uuid, uuid, uuid, uuid, numeric, numeric, uuid, date, time, text),
  mp_delete_card_to_bank(uuid)
FROM PUBLIC, anon, authenticated;
-- Trigger functions run as the row-writing role, which needs EXECUTE on the
-- helper they call.
GRANT EXECUTE ON FUNCTION
  mp_card_pair_authorized(),
  mp_execute_card_to_bank(uuid, uuid, uuid, uuid, numeric, numeric, uuid, date, time, text),
  mp_delete_card_to_bank(uuid)
TO authenticated;

COMMIT;
