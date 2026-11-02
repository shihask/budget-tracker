-- Credit Card → Bank Transfer verification: atomic creation, retry idempotency,
-- conflict on a changed retry, ownership / validation refusals, the link
-- triggers, locked financial fields, the pair-delete guard, atomic pair delete
-- and account deletion with a linked pair.
-- See supabase/migrations/20261102000001_card_to_bank_transfer.sql.
--
-- NON-PRODUCTION DATABASE ONLY. One transaction ending in ROLLBACK, throwaway
-- users only. Paste into the SQL editor of a non-prod project, or:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/card_to_bank.sql
-- Each check RAISEs on failure; success ends with 'CARD TO BANK CHECKS PASSED'.
--
-- Users: A (main), B (outsider), C (account deletion), G (guest, purge path).
-- Running example: HDFC 20,000 · Axis outstanding 10,000 · transfer 5,000 + fee 126.05.

BEGIN;

-- ── 0. Schema facts (reported; the fee_for one is asserted) ─────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.attname, c.confrelid::regclass AS target, c.confdeltype
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.conrelid = 'public.transactions'::regclass
       AND a.attname IN ('user_id', 'credit_card_id', 'to_account_id', 'fee_for')
  LOOP
    RAISE NOTICE 'transactions.% → % (on delete %)', r.attname, r.target, r.confdeltype;
    IF r.attname = 'fee_for' AND r.confdeltype <> 'a' THEN
      RAISE EXCEPTION '0: fee_for must be ON DELETE NO ACTION, found %', r.confdeltype;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = 'public.transactions'::regclass
        AND tgname IN ('trg_transactions_card_fee_link', 'trg_transactions_card_transfer_lock', 'trg_transactions_card_pair_delete')) <> 3 THEN
    RAISE EXCEPTION '0: card-to-bank triggers missing';
  END IF;
END $$;

INSERT INTO auth.users (id, email, is_anonymous, aud, role, created_at, updated_at) VALUES
  ('00000000-0000-4000-c2b0-00000000000a', 'c2b-a@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c2b0-00000000000b', 'c2b-b@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c2b0-00000000000c', 'c2b-c@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c2b0-000000000010', NULL,                    true,  'authenticated', 'authenticated', now(), now());

INSERT INTO public.accounts (id, user_id, name, type, current_balance) VALUES
  ('00000000-0000-4000-c2b1-00000000000a', '00000000-0000-4000-c2b0-00000000000a', 'HDFC Savings', 'bank', 20000),
  ('00000000-0000-4000-c2b1-00000000000b', '00000000-0000-4000-c2b0-00000000000b', 'B bank',       'bank', 1000),
  ('00000000-0000-4000-c2b1-00000000000c', '00000000-0000-4000-c2b0-00000000000c', 'C bank',       'bank', 1000),
  ('00000000-0000-4000-c2b1-000000000010', '00000000-0000-4000-c2b0-000000000010', 'G cash',       'cash', 1000);

INSERT INTO public.credit_cards (id, user_id, name, last_four, credit_limit, cycle_start_day, bill_day, due_day, current_balance, is_active) VALUES
  ('00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b0-00000000000a', 'Axis Visa CC', '1234', 50000, 16, 15, 5, 10000, true),
  ('00000000-0000-4000-c2b2-00000000001a', '00000000-0000-4000-c2b0-00000000000a', 'Old card',     '9999', 10000, 16, 15, 5, 0,     false),
  ('00000000-0000-4000-c2b2-00000000000b', '00000000-0000-4000-c2b0-00000000000b', 'B card',       '5555', 10000, 16, 15, 5, 0,     true),
  ('00000000-0000-4000-c2b2-00000000000c', '00000000-0000-4000-c2b0-00000000000c', 'C card',       '6666', 10000, 16, 15, 5, 0,     true),
  ('00000000-0000-4000-c2b2-000000000010', '00000000-0000-4000-c2b0-000000000010', 'G card',       '7777', 10000, 16, 15, 5, 0,     true);

INSERT INTO public.categories (id, user_id, name, group_name) VALUES
  ('00000000-0000-4000-c2b3-00000000000a', '00000000-0000-4000-c2b0-00000000000a', 'Bank & Processing Charges', 'Obligations'),
  ('00000000-0000-4000-c2b3-00000000001a', '00000000-0000-4000-c2b0-00000000000a', 'Food',                      'Lifestyle'),
  ('00000000-0000-4000-c2b3-00000000000b', '00000000-0000-4000-c2b0-00000000000b', 'B charges',                 'Obligations'),
  ('00000000-0000-4000-c2b3-00000000000c', '00000000-0000-4000-c2b0-00000000000c', 'C charges',                 'Obligations'),
  ('00000000-0000-4000-c2b3-000000000010', '00000000-0000-4000-c2b0-000000000010', 'G charges',                 'Obligations');

-- An ordinary bank expense of A (target for invalid-link attempts) and one of B
-- (an id A can't see — used to force a transfer-insert failure).
INSERT INTO public.transactions (id, user_id, transaction_date, description, amount, transaction_type, category_id, from_account_id) VALUES
  ('00000000-0000-4000-c2b4-0000000000e1', '00000000-0000-4000-c2b0-00000000000a', '2026-10-18', 'Lunch', 300, 'expense', '00000000-0000-4000-c2b3-00000000001a', '00000000-0000-4000-c2b1-00000000000a'),
  ('00000000-0000-4000-c2b4-0000000000b1', '00000000-0000-4000-c2b0-00000000000b', '2026-10-18', 'B row', 10,  'expense', '00000000-0000-4000-c2b3-00000000000b', '00000000-0000-4000-c2b1-00000000000b');
-- The lunch above was inserted directly; put HDFC back to exactly 20,000.
UPDATE public.accounts SET current_balance = 20000 WHERE id = '00000000-0000-4000-c2b1-00000000000a';

-- Ids: T = transfer, F = fee.
--   T1/F1  the running example          T2  no-fee transfer
--   T3     fee-insert-failure attempt   T4  transfer-insert-failure attempt

-- ── 1. Atomic creation (A) ──────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c2b0-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb; t record; f record; bank numeric; card numeric;
BEGIN
  r := mp_execute_card_to_bank(
    '00000000-0000-4000-c2b5-0000000000a1', '00000000-0000-4000-c2b5-0000000000f1',
    '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
    5000, 126.05, '00000000-0000-4000-c2b3-00000000000a', '2026-10-20', '10:30', 'Tuition fee transfer');

  IF r->'transfer'->>'id' <> '00000000-0000-4000-c2b5-0000000000a1'
     OR r->'fee'->>'id' <> '00000000-0000-4000-c2b5-0000000000f1' THEN
    RAISE EXCEPTION '1: RPC returned the wrong rows: %', r;
  END IF;

  SELECT * INTO t FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000a1';
  SELECT * INTO f FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000f1';
  IF t.transaction_type <> 'transfer' OR t.amount <> 5000 OR t.from_account_id IS NOT NULL
     OR t.to_account_id <> '00000000-0000-4000-c2b1-00000000000a'
     OR t.credit_card_id <> '00000000-0000-4000-c2b2-00000000000a'
     OR t.description <> 'Tuition fee transfer' OR t.transaction_time <> '10:30' OR t.fee_for IS NOT NULL THEN
    RAISE EXCEPTION '1: transfer row wrong: %', row_to_json(t);
  END IF;
  IF f.transaction_type <> 'expense' OR f.amount <> 126.05 OR f.from_account_id IS NOT NULL
     OR f.credit_card_id <> '00000000-0000-4000-c2b2-00000000000a'
     OR f.category_id <> '00000000-0000-4000-c2b3-00000000000a'
     OR f.fee_for <> '00000000-0000-4000-c2b5-0000000000a1' OR f.transaction_time <> '10:30' THEN
    RAISE EXCEPTION '1: fee row wrong: %', row_to_json(f);
  END IF;

  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  IF bank <> 25000 OR card <> 15126.05 THEN
    RAISE EXCEPTION '1: balances wrong: bank % card % (want 25000 / 15126.05)', bank, card;
  END IF;
  IF (bank - 20000) - (card - 10000) <> -126.05 THEN
    RAISE EXCEPTION '1: net worth change % (want -126.05)', (bank - 20000) - (card - 10000);
  END IF;
END $$;

-- ── 2. Same-id retry is a no-op ─────────────────────────────────────────────
DO $$
DECLARE r jsonb; bank numeric; card numeric; n int;
BEGIN
  r := mp_execute_card_to_bank(
    '00000000-0000-4000-c2b5-0000000000a1', '00000000-0000-4000-c2b5-0000000000f1',
    '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
    5000, 126.05, '00000000-0000-4000-c2b3-00000000000a', '2026-10-20', '10:30', 'Tuition fee transfer');
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  SELECT count(*) INTO n FROM transactions WHERE id IN ('00000000-0000-4000-c2b5-0000000000a1', '00000000-0000-4000-c2b5-0000000000f1');
  IF bank <> 25000 OR card <> 15126.05 OR n <> 2 OR r->'fee'->>'id' IS NULL THEN
    RAISE EXCEPTION '2: retry moved balances or rows: bank % card % rows %', bank, card, n;
  END IF;
END $$;

-- ── 3. Changed retry → PT409, nothing moves ─────────────────────────────────
DO $$
DECLARE bank numeric; card numeric;
BEGIN
  BEGIN
    PERFORM mp_execute_card_to_bank(
      '00000000-0000-4000-c2b5-0000000000a1', '00000000-0000-4000-c2b5-0000000000f1',
      '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
      6000, 126.05, '00000000-0000-4000-c2b3-00000000000a', '2026-10-20', '10:30', NULL);
    RAISE EXCEPTION '3: changed amount was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM mp_execute_card_to_bank(
      '00000000-0000-4000-c2b5-0000000000a1', '00000000-0000-4000-c2b5-0000000000f1',
      '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
      5000, 0, NULL, '2026-10-20', NULL, NULL);
    RAISE EXCEPTION '3: dropping the fee on retry was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  IF bank <> 25000 OR card <> 15126.05 THEN
    RAISE EXCEPTION '3: a rejected retry moved balances: bank % card %', bank, card;
  END IF;
END $$;

-- ── 4. No-fee transfer; adding a fee on its retry → PT409 ───────────────────
DO $$
DECLARE r jsonb; bank numeric; card numeric;
BEGIN
  r := mp_execute_card_to_bank(
    '00000000-0000-4000-c2b5-0000000000a2', NULL,
    '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
    1000, 0, NULL, '2026-10-21', NULL, NULL);
  IF r->'fee' <> 'null'::jsonb THEN
    RAISE EXCEPTION '4: a zero fee created a fee row: %', r;
  END IF;
  BEGIN
    PERFORM mp_execute_card_to_bank(
      '00000000-0000-4000-c2b5-0000000000a2', '00000000-0000-4000-c2b5-0000000000f2',
      '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
      1000, 50, '00000000-0000-4000-c2b3-00000000000a', '2026-10-21', NULL, NULL);
    RAISE EXCEPTION '4: adding a fee on retry was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  IF bank <> 26000 OR card <> 16126.05 THEN
    RAISE EXCEPTION '4: balances wrong after no-fee transfer: bank % card % (want 26000 / 16126.05)', bank, card;
  END IF;
END $$;

-- ── 5. Fee insert fails AFTER the transfer insert → both roll back ──────────
-- T3 is new, but its fee id reuses F1 (already a 126.05 fee): the fee's
-- mp_execute_transaction raises PT409 after T3 was inserted and moved balances.
DO $$
DECLARE bank numeric; card numeric;
BEGIN
  BEGIN
    PERFORM mp_execute_card_to_bank(
      '00000000-0000-4000-c2b5-0000000000a3', '00000000-0000-4000-c2b5-0000000000f1',
      '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
      2000, 99, '00000000-0000-4000-c2b3-00000000000a', '2026-10-22', NULL, NULL);
    RAISE EXCEPTION '5: fee-insert failure was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000a3') THEN
    RAISE EXCEPTION '5: the transfer survived its fee failing';
  END IF;
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  IF bank <> 26000 OR card <> 16126.05 THEN
    RAISE EXCEPTION '5: a failed creation moved balances: bank % card %', bank, card;
  END IF;
END $$;

-- ── 6. Transfer insert fails → no fee is created ────────────────────────────
-- T4 reuses B's row id: invisible to A under RLS, so the insert conflicts and
-- mp_execute_transaction raises PT409 before the fee is ever attempted.
DO $$
BEGIN
  BEGIN
    PERFORM mp_execute_card_to_bank(
      '00000000-0000-4000-c2b4-0000000000b1', '00000000-0000-4000-c2b5-0000000000f4',
      '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a',
      700, 20, '00000000-0000-4000-c2b3-00000000000a', '2026-10-22', NULL, NULL);
    RAISE EXCEPTION '6: transfer-insert failure was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000f4') THEN
    RAISE EXCEPTION '6: a fee was created although its transfer failed';
  END IF;
END $$;

-- ── 7. Validation refusals → PT422 ──────────────────────────────────────────
DO $$
DECLARE
  -- card, account, amount, fee, category
  cases text[][] := ARRAY[
    ARRAY['00000000-0000-4000-c2b2-00000000000b', '00000000-0000-4000-c2b1-00000000000a', '100', '0',  '', 'another user''s card'],
    ARRAY['00000000-0000-4000-c2b2-00000000001a', '00000000-0000-4000-c2b1-00000000000a', '100', '0',  '', 'inactive card'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000b', '100', '0',  '', 'another user''s account'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b2-00000000000a', '100', '0',  '', 'a card as destination'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a', '0',   '0',  '', 'zero amount'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a', '-5',  '0',  '', 'negative amount'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a', '10.005', '0', '', 'three decimals'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a', '100', '-1', '', 'negative fee'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a', '100', '5',  '', 'fee without category'],
    ARRAY['00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b1-00000000000a', '100', '5',  '00000000-0000-4000-c2b3-00000000000b', 'another user''s category']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(cases, 1) LOOP
    BEGIN
      PERFORM mp_execute_card_to_bank(
        gen_random_uuid(), gen_random_uuid(),
        cases[i][1]::uuid, cases[i][2]::uuid, cases[i][3]::numeric, cases[i][4]::numeric,
        nullif(cases[i][5], '')::uuid, '2026-10-22', NULL, NULL);
      RAISE EXCEPTION '7: % was accepted', cases[i][6];
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
    END;
  END LOOP;
END $$;

-- ── 8. The link cannot be written outside the RPC ───────────────────────────
DO $$
BEGIN
  BEGIN
    UPDATE transactions SET fee_for = '00000000-0000-4000-c2b5-0000000000a1'
     WHERE id = '00000000-0000-4000-c2b4-0000000000e1';
    RAISE EXCEPTION '8: linking a row directly was accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN
    UPDATE transactions SET fee_for = NULL WHERE id = '00000000-0000-4000-c2b5-0000000000f1';
    RAISE EXCEPTION '8: clearing fee_for directly was accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN
    INSERT INTO transactions (user_id, transaction_date, description, amount, transaction_type, credit_card_id, fee_for)
    VALUES ('00000000-0000-4000-c2b0-00000000000a', '2026-10-22', 'sneaky', 1, 'expense',
            '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b5-0000000000a2');
    RAISE EXCEPTION '8: inserting a linked fee directly was accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
END $$;

-- The relationship rules themselves, with the flag raised by hand. (Raw SQL can
-- do this; a REST request cannot — see the migration's section 2.)
DO $$
BEGIN
  PERFORM set_config('mp.card_pair', 'on', true);
  BEGIN   -- a bank expense is not a card fee
    UPDATE transactions SET fee_for = '00000000-0000-4000-c2b5-0000000000a2' WHERE id = '00000000-0000-4000-c2b4-0000000000e1';
    RAISE EXCEPTION '8b: a bank expense became a card fee';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN   -- a second fee for T1 (unique index)
    INSERT INTO transactions (user_id, transaction_date, description, amount, transaction_type, credit_card_id, fee_for)
    VALUES ('00000000-0000-4000-c2b0-00000000000a', '2026-10-22', 'second fee', 1, 'expense',
            '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b5-0000000000a1');
    RAISE EXCEPTION '8b: a second fee for one transfer was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN   -- a fee pointing at an ordinary expense, not a card transfer
    INSERT INTO transactions (user_id, transaction_date, description, amount, transaction_type, credit_card_id, fee_for)
    VALUES ('00000000-0000-4000-c2b0-00000000000a', '2026-10-22', 'bad target', 1, 'expense',
            '00000000-0000-4000-c2b2-00000000000a', '00000000-0000-4000-c2b4-0000000000e1');
    RAISE EXCEPTION '8b: a fee for a non-transfer was accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  PERFORM set_config('mp.card_pair', 'off', true);
END $$;

-- ── 9. Locked financial fields; description stays editable ──────────────────
DO $$
DECLARE
  stmts text[] := ARRAY[
    'UPDATE transactions SET amount = 4000 WHERE id = ''00000000-0000-4000-c2b5-0000000000a1''',
    'UPDATE transactions SET transaction_date = ''2026-10-25'' WHERE id = ''00000000-0000-4000-c2b5-0000000000a1''',
    'UPDATE transactions SET to_account_id = NULL WHERE id = ''00000000-0000-4000-c2b5-0000000000a1''',
    'UPDATE transactions SET credit_card_id = NULL WHERE id = ''00000000-0000-4000-c2b5-0000000000a1''',
    'UPDATE transactions SET transaction_type = ''expense'' WHERE id = ''00000000-0000-4000-c2b5-0000000000a1''',
    'UPDATE transactions SET amount = 1 WHERE id = ''00000000-0000-4000-c2b5-0000000000f1''',
    'UPDATE transactions SET from_account_id = ''00000000-0000-4000-c2b1-00000000000a'' WHERE id = ''00000000-0000-4000-c2b5-0000000000f1''',
    'UPDATE transactions SET amount = 1 WHERE id = ''00000000-0000-4000-c2b5-0000000000a2'''
  ];
  s text;
BEGIN
  FOREACH s IN ARRAY stmts LOOP
    BEGIN
      EXECUTE s;
      RAISE EXCEPTION '9: locked field changed: %', s;
    EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
    END;
  END LOOP;
  UPDATE transactions SET description = 'Rent via gateway', notes = 'Oct rent'
   WHERE id = '00000000-0000-4000-c2b5-0000000000a1';
  IF (SELECT description FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000a1') <> 'Rent via gateway' THEN
    RAISE EXCEPTION '9: description edit did not apply';
  END IF;
END $$;

-- ── 10. A linked leg cannot be deleted on its own ───────────────────────────
DO $$
BEGIN
  BEGIN
    DELETE FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000a1';
    RAISE EXCEPTION '10: transfer deleted alone';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN
    DELETE FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000f1';
    RAISE EXCEPTION '10: fee deleted alone';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  BEGIN
    PERFORM mp_delete_transaction(
      p_transaction_id => '00000000-0000-4000-c2b5-0000000000f1',
      p_credit_card_id => '00000000-0000-4000-c2b2-00000000000a',
      p_cc_delta       => -126.05);
    RAISE EXCEPTION '10: fee deleted alone through mp_delete_transaction';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  IF (SELECT current_balance FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a') <> 16126.05 THEN
    RAISE EXCEPTION '10: a refused delete moved the card balance';
  END IF;
END $$;

-- ── 11. Another user can't delete A's pair ──────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c2b0-00000000000b","role":"authenticated"}', true);
DO $$
DECLARE r jsonb;
BEGIN
  r := mp_delete_card_to_bank('00000000-0000-4000-c2b5-0000000000a1');
  IF (r->>'deleted')::boolean THEN
    RAISE EXCEPTION '11: B deleted A''s transfer';
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c2b0-00000000000a","role":"authenticated"}', true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = '00000000-0000-4000-c2b5-0000000000a1') THEN
    RAISE EXCEPTION '11: A''s transfer disappeared';
  END IF;
END $$;

-- ── 12. Pair delete restores both balances; a repeat is a safe no-op ────────
DO $$
DECLARE r jsonb; bank numeric; card numeric;
BEGIN
  r := mp_delete_card_to_bank('00000000-0000-4000-c2b5-0000000000a1');
  IF NOT (r->>'deleted')::boolean OR (r->>'amount')::numeric <> 5000 OR (r->>'fee')::numeric <> 126.05 THEN
    RAISE EXCEPTION '12: pair delete result wrong: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE id IN ('00000000-0000-4000-c2b5-0000000000a1', '00000000-0000-4000-c2b5-0000000000f1')) THEN
    RAISE EXCEPTION '12: a row survived the pair delete';
  END IF;
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  IF bank <> 21000 OR card <> 11000 THEN   -- only T2 (1,000, no fee) remains
    RAISE EXCEPTION '12: balances not restored: bank % card % (want 21000 / 11000)', bank, card;
  END IF;

  r := mp_delete_card_to_bank('00000000-0000-4000-c2b5-0000000000a1');
  IF (r->>'deleted')::boolean OR r->>'reason' <> 'not_found' THEN
    RAISE EXCEPTION '12: repeat delete result wrong: %', r;
  END IF;
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  IF bank <> 21000 THEN
    RAISE EXCEPTION '12: repeat delete moved the bank balance';
  END IF;

  -- A no-fee card transfer goes through the same RPC.
  r := mp_delete_card_to_bank('00000000-0000-4000-c2b5-0000000000a2');
  SELECT current_balance INTO bank FROM accounts WHERE id = '00000000-0000-4000-c2b1-00000000000a';
  SELECT current_balance INTO card FROM credit_cards WHERE id = '00000000-0000-4000-c2b2-00000000000a';
  IF NOT (r->>'deleted')::boolean OR bank <> 20000 OR card <> 10000 THEN
    RAISE EXCEPTION '12: no-fee delete wrong: % bank % card %', r, bank, card;
  END IF;

  -- The pair RPC refuses anything that isn't a card-to-bank transfer.
  BEGIN
    PERFORM mp_delete_card_to_bank('00000000-0000-4000-c2b4-0000000000e1');
    RAISE EXCEPTION '12: pair delete accepted an ordinary expense';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
END $$;

-- ── 13. Account deletion and guest purge with a linked pair ─────────────────
-- Both delete the auth.users row; the cascade removes every transaction in one
-- statement, which the NO ACTION FK and the delete guard must both allow.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c2b0-00000000000c","role":"authenticated"}', true);
SELECT mp_execute_card_to_bank(
  '00000000-0000-4000-c2b5-0000000000c1', '00000000-0000-4000-c2b5-0000000000c2',
  '00000000-0000-4000-c2b2-00000000000c', '00000000-0000-4000-c2b1-00000000000c',
  500, 12.5, '00000000-0000-4000-c2b3-00000000000c', '2026-10-22', NULL, NULL);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c2b0-000000000010","role":"authenticated"}', true);
SELECT mp_execute_card_to_bank(
  '00000000-0000-4000-c2b5-0000000000d1', '00000000-0000-4000-c2b5-0000000000d2',
  '00000000-0000-4000-c2b2-000000000010', '00000000-0000-4000-c2b1-000000000010',
  300, 7.5, '00000000-0000-4000-c2b3-000000000010', '2026-10-22', NULL, NULL);

RESET ROLE;
DO $$
DECLARE cascades boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.conrelid = 'public.transactions'::regclass
       AND c.confrelid = 'auth.users'::regclass AND a.attname = 'user_id' AND c.confdeltype = 'c'
  ) INTO cascades;
  IF NOT cascades THEN
    RAISE NOTICE '13: transactions.user_id does not cascade from auth.users here — account deletion step SKIPPED';
    RETURN;
  END IF;

  DELETE FROM auth.users WHERE id = '00000000-0000-4000-c2b0-00000000000c';   -- account deletion
  IF EXISTS (SELECT 1 FROM transactions WHERE user_id = '00000000-0000-4000-c2b0-00000000000c') THEN
    RAISE EXCEPTION '13: account deletion left transactions behind';
  END IF;

  DELETE FROM auth.users WHERE id = '00000000-0000-4000-c2b0-000000000010';   -- what mp_purge_stale_guests does
  IF EXISTS (SELECT 1 FROM transactions WHERE user_id = '00000000-0000-4000-c2b0-000000000010') THEN
    RAISE EXCEPTION '13: guest purge left transactions behind';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'CARD TO BANK CHECKS PASSED'; END $$;

ROLLBACK;
