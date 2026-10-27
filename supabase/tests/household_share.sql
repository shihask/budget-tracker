-- "Share with Household" verification: atomic shared save, retry idempotency,
-- membership / category / type checks, private links, personal → household sync
-- (edit, delete, type change, inactive member), sync-failure observability, and
-- the account-deletion exception — against the live schema.
-- See supabase/migrations/20261028000001_household_share_from_quick_add.sql.
--
-- Safe to run on production: one transaction ending in ROLLBACK, throwaway
-- users only. It takes a brief lock on household_transactions (section 9 adds
-- and drops a temporary CHECK to force a sync failure). Paste into the SQL
-- editor, or: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/household_share.sql
-- Each check RAISEs on failure; success ends with 'HOUSEHOLD SHARE CHECKS PASSED'.
--
-- Users: A owner of H, B member of H, C owner of H2 (outsider), D no household,
-- G guest.

BEGIN;

-- ── 0. What the live schema does on account deletion (reported, then tested) ──
DO $$
DECLARE r record;
BEGIN
  SELECT c.conname, c.confdeltype INTO r
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND c.conrelid = 'public.transactions'::regclass
     AND c.confrelid = 'auth.users'::regclass AND a.attname = 'user_id';
  PERFORM set_config('hs.user_fk_action', coalesce(r.confdeltype::text, 'none'), true);
  RAISE NOTICE 'transactions.user_id → auth.users: % (on delete %)', coalesce(r.conname::text, 'NO FOREIGN KEY'), coalesce(r.confdeltype::text, '-');
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = 'public.transactions'::regclass
        AND tgname IN ('trg_transactions_household_sync_update', 'trg_transactions_household_sync_delete')) <> 2 THEN
    RAISE EXCEPTION '0: sync triggers missing on transactions';
  END IF;
END $$;

INSERT INTO auth.users (id, email, is_anonymous, aud, role, created_at, updated_at) VALUES
  ('00000000-0000-4000-e500-00000000000a', 'hshare-a@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e500-00000000000b', 'hshare-b@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e500-00000000000c', 'hshare-c@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e500-00000000000d', 'hshare-d@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e500-000000000010', NULL,                       true,  'authenticated', 'authenticated', now(), now());
INSERT INTO public.accounts (id, user_id, name, type, current_balance) VALUES
  ('00000000-0000-4000-e510-00000000000a', '00000000-0000-4000-e500-00000000000a', 'A bank', 'bank', 10000),
  ('00000000-0000-4000-e510-00000000001a', '00000000-0000-4000-e500-00000000000a', 'A cash', 'cash', 500),
  ('00000000-0000-4000-e510-00000000000b', '00000000-0000-4000-e500-00000000000b', 'B bank', 'bank', 10000),
  ('00000000-0000-4000-e510-00000000000d', '00000000-0000-4000-e500-00000000000d', 'D bank', 'bank', 10000),
  ('00000000-0000-4000-e510-000000000010', '00000000-0000-4000-e500-000000000010', 'G cash', 'cash', 1000);
INSERT INTO public.categories (id, user_id, name, group_name) VALUES
  ('00000000-0000-4000-e520-00000000000a', '00000000-0000-4000-e500-00000000000a', 'Groceries', 'Lifestyle');

-- Households: H (A + B), H2 (C).
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h uuid;
BEGIN
  h := mp_household_create('Share Home', 'Asha');
  PERFORM set_config('hs.h', h::text, true);
  PERFORM set_config('hs.m_a', mp_household_current()->>'member_id', true);
  PERFORM set_config('hs.tok', mp_household_create_invite(h)->>'token', true);
  PERFORM set_config('hs.cat_groc', (SELECT id FROM household_categories WHERE household_id = h AND name = 'Groceries')::text, true);
  PERFORM set_config('hs.cat_salary', (SELECT id FROM household_categories WHERE household_id = h AND name = 'Salary')::text, true);
  PERFORM set_config('hs.cat_rent', (SELECT id FROM household_categories WHERE household_id = h AND name = 'Rent')::text, true);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM mp_household_accept_invite(current_setting('hs.tok'), 'Bilal');
  PERFORM set_config('hs.m_b', mp_household_current()->>'member_id', true);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h2 uuid;
BEGIN
  h2 := mp_household_create('Other Home', 'Chitra');
  PERFORM set_config('hs.cat_other', (SELECT id FROM household_categories WHERE household_id = h2 AND name = 'Groceries')::text, true);
END $$;
RESET ROLE;

-- Admin: an archived category in H, for the category check.
INSERT INTO public.household_categories (household_id, name, kind, is_archived, created_by_member_id, updated_by_member_id)
VALUES (current_setting('hs.h')::uuid, 'Old stuff', 'expense', true, current_setting('hs.m_a')::uuid, current_setting('hs.m_a')::uuid);
SELECT set_config('hs.cat_archived', (SELECT id FROM public.household_categories
  WHERE household_id = current_setting('hs.h')::uuid AND name = 'Old stuff')::text, true);

-- ── 1–3. A: shared save, retry, and an ordinary (unshared) save ─────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a    uuid := '00000000-0000-4000-e500-00000000000a';
  acc  uuid := '00000000-0000-4000-e510-00000000000a';
  x    uuid := '00000000-0000-4000-e530-000000000001';
  p    uuid := '00000000-0000-4000-e530-000000000002';
  r1 jsonb; r2 jsonb; n int; bal numeric; ht record;
BEGIN
  -- 1. ₹650 groceries, shared.
  r1 := mp_execute_shared_transaction(
    p_user_id => a, p_transaction_date => current_date, p_description => 'Big Basket', p_amount => 650,
    p_transaction_type => 'expense', p_category_id => '00000000-0000-4000-e520-00000000000a',
    p_from_account_id => acc, p_from_delta => -650, p_id => x,
    p_household_category_id => current_setting('hs.cat_groc')::uuid);
  IF r1->>'id' <> x::text OR r1->>'household_transaction_id' IS NULL THEN RAISE EXCEPTION '1: wrong result %', r1; END IF;
  PERFORM set_config('hs.htx_x', r1->>'household_transaction_id', true);
  SELECT current_balance INTO bal FROM accounts WHERE id = acc;
  IF bal <> 9350 THEN RAISE EXCEPTION '1: balance % (expected 9350: moved once)', bal; END IF;
  SELECT * INTO ht FROM household_transactions WHERE id = (r1->>'household_transaction_id')::uuid;
  IF ht.amount <> 650 OR ht.type <> 'expense' OR ht.description <> 'Big Basket' OR ht.txn_date <> current_date
     OR ht.category_id <> current_setting('hs.cat_groc')::uuid OR ht.paid_by_member_id <> current_setting('hs.m_a')::uuid THEN
    RAISE EXCEPTION '1: household copy wrong: %', row_to_json(ht);
  END IF;
  IF (SELECT count(*) FROM household_transaction_links WHERE transaction_id = x) <> 1 THEN RAISE EXCEPTION '1: link missing'; END IF;

  -- 2. Retry with the same id: same pair back, nothing new, balance untouched.
  r2 := mp_execute_shared_transaction(
    p_user_id => a, p_transaction_date => current_date, p_description => 'Big Basket', p_amount => 650,
    p_transaction_type => 'expense', p_category_id => '00000000-0000-4000-e520-00000000000a',
    p_from_account_id => acc, p_from_delta => -650, p_id => x,
    p_household_category_id => current_setting('hs.cat_groc')::uuid);
  IF r2->>'household_transaction_id' <> r1->>'household_transaction_id' THEN RAISE EXCEPTION '2: retry made a new household copy'; END IF;
  SELECT count(*) INTO n FROM household_transactions WHERE household_id = current_setting('hs.h')::uuid;
  IF n <> 1 THEN RAISE EXCEPTION '2: % household rows after retry', n; END IF;
  SELECT current_balance INTO bal FROM accounts WHERE id = acc;
  IF bal <> 9350 THEN RAISE EXCEPTION '2: retry moved the balance (%)', bal; END IF;

  -- 3. Sharing off: the existing RPC, one personal row, nothing in the household.
  PERFORM mp_execute_transaction(
    p_user_id => a, p_transaction_date => current_date, p_description => 'Personal shirt', p_amount => 1200,
    p_transaction_type => 'expense', p_from_account_id => acc, p_from_delta => -1200, p_id => p);
  SELECT current_balance INTO bal FROM accounts WHERE id = acc;
  IF bal <> 8150 THEN RAISE EXCEPTION '3: balance %', bal; END IF;
  IF (SELECT count(*) FROM household_transactions WHERE household_id = current_setting('hs.h')::uuid) <> 1
     OR EXISTS (SELECT 1 FROM household_transaction_links WHERE transaction_id = p) THEN
    RAISE EXCEPTION '3: an unshared save reached the household';
  END IF;

  -- 4a. Refusals are atomic: no personal row, no balance movement.
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => a, p_transaction_date => current_date, p_description => 'x', p_amount => 10,
      p_transaction_type => 'expense', p_from_account_id => acc, p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000041', p_household_category_id => current_setting('hs.cat_other')::uuid);
    RAISE EXCEPTION '4: another household''s category accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => a, p_transaction_date => current_date, p_description => 'x', p_amount => 10,
      p_transaction_type => 'expense', p_from_account_id => acc, p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000042', p_household_category_id => current_setting('hs.cat_salary')::uuid);
    RAISE EXCEPTION '4: income category on an expense accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => a, p_transaction_date => current_date, p_description => 'x', p_amount => 10,
      p_transaction_type => 'expense', p_from_account_id => acc, p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000043', p_household_category_id => current_setting('hs.cat_archived')::uuid);
    RAISE EXCEPTION '4: archived category accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => a, p_transaction_date => current_date, p_description => 'x', p_amount => 10,
      p_transaction_type => 'expense', p_from_account_id => acc, p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000044', p_household_category_id => NULL);
    RAISE EXCEPTION '4: missing category accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => a, p_transaction_date => current_date, p_description => 'x', p_amount => 10,
      p_transaction_type => 'transfer', p_from_account_id => acc, p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000045', p_household_category_id => current_setting('hs.cat_groc')::uuid);
    RAISE EXCEPTION '4: a transfer was shared';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  IF EXISTS (SELECT 1 FROM transactions WHERE id::text LIKE '00000000-0000-4000-e530-00000000004%') THEN
    RAISE EXCEPTION '4: a refused shared save left a personal row behind';
  END IF;
  SELECT current_balance INTO bal FROM accounts WHERE id = acc;
  IF bal <> 8150 THEN RAISE EXCEPTION '4: a refused shared save moved the balance (%)', bal; END IF;

  -- 5. Links are not writable by clients, even your own.
  BEGIN
    INSERT INTO household_transaction_links (transaction_id, household_transaction_id, user_id)
    VALUES (p, current_setting('hs.htx_x')::uuid, a);
    RAISE EXCEPTION '5: client inserted a link';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- An unshared personal transaction can be shared later only via the checked function; a transfer can't.
  PERFORM mp_execute_transaction(p_user_id => a, p_transaction_date => current_date, p_description => 'Move', p_amount => 5,
    p_transaction_type => 'transfer', p_from_account_id => acc, p_to_account_id => '00000000-0000-4000-e510-00000000001a',
    p_from_delta => -5, p_to_delta => 5, p_id => '00000000-0000-4000-e530-000000000005');
  BEGIN
    PERFORM mp_household_share_recorded_transaction('00000000-0000-4000-e530-000000000005', current_setting('hs.cat_groc')::uuid);
    RAISE EXCEPTION '5: a transfer was shared via the direct function';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
END $$;
RESET ROLE;

-- 4b. No household, guest: refused, nothing written.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-00000000000d', p_transaction_date => current_date,
      p_description => 'x', p_amount => 10, p_transaction_type => 'expense',
      p_from_account_id => '00000000-0000-4000-e510-00000000000d', p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000046', p_household_category_id => current_setting('hs.cat_groc')::uuid);
    RAISE EXCEPTION '4: a non-member shared into H';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  IF EXISTS (SELECT 1 FROM transactions WHERE id = '00000000-0000-4000-e530-000000000046')
     OR (SELECT current_balance FROM accounts WHERE id = '00000000-0000-4000-e510-00000000000d') <> 10000 THEN
    RAISE EXCEPTION '4: the non-member''s refused save was partly kept';
  END IF;
  -- Can't share someone else's transaction by id either.
  BEGIN
    PERFORM mp_household_share_recorded_transaction('00000000-0000-4000-e530-000000000001', current_setting('hs.cat_groc')::uuid);
    RAISE EXCEPTION '5: shared another user''s transaction';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-000000000010","role":"authenticated","is_anonymous":true}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-000000000010', p_transaction_date => current_date,
      p_description => 'x', p_amount => 10, p_transaction_type => 'expense',
      p_from_account_id => '00000000-0000-4000-e510-000000000010', p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000047', p_household_category_id => current_setting('hs.cat_groc')::uuid);
    RAISE EXCEPTION '4: a guest shared';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  IF EXISTS (SELECT 1 FROM transactions WHERE id = '00000000-0000-4000-e530-000000000047') THEN
    RAISE EXCEPTION '4: the guest''s refused save was kept';
  END IF;
END $$;
RESET ROLE;

-- ── 5–7. B: privacy, and household-side edits never reach the personal row ──
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM household_transaction_links;
  IF n <> 0 THEN RAISE EXCEPTION '5: partner reads % link(s)', n; END IF;
  SELECT count(*) INTO n FROM transactions WHERE user_id = '00000000-0000-4000-e500-00000000000a';
  IF n <> 0 THEN RAISE EXCEPTION '5: partner reads A''s personal transactions'; END IF;
  SELECT count(*) INTO n FROM household_transactions WHERE id = current_setting('hs.htx_x')::uuid;
  IF n <> 1 THEN RAISE EXCEPTION '5: partner can''t see the shared copy'; END IF;
  -- 7. Household-side edit.
  UPDATE household_transactions SET amount = 999, description = 'edited by B' WHERE id = current_setting('hs.htx_x')::uuid;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT amount FROM public.transactions WHERE id = '00000000-0000-4000-e530-000000000001') <> 650
     OR (SELECT description FROM public.transactions WHERE id = '00000000-0000-4000-e530-000000000001') <> 'Big Basket' THEN
    RAISE EXCEPTION '7: a household-side edit changed the personal transaction';
  END IF;
END $$;

-- ── 6. A: personal edit → household copy follows (amount, date, note ≤ 120) ──
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ht record;
BEGIN
  UPDATE transactions SET amount = 700, transaction_date = current_date - 1, description = repeat('n', 150)
   WHERE id = '00000000-0000-4000-e530-000000000001';
  SELECT * INTO ht FROM household_transactions WHERE id = current_setting('hs.htx_x')::uuid;
  IF ht.amount <> 700 OR ht.txn_date <> current_date - 1 OR ht.description <> repeat('n', 120)
     OR ht.updated_by_member_id <> current_setting('hs.m_a')::uuid OR ht.category_id <> current_setting('hs.cat_groc')::uuid THEN
    RAISE EXCEPTION '6: copy not synced: %', row_to_json(ht);
  END IF;
END $$;
RESET ROLE;

-- ── 8. Type change → unlinked, household copy kept as it was ─────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; ht record;
BEGIN
  r := mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-00000000000a', p_transaction_date => current_date,
    p_description => 'Rent share', p_amount => 5000, p_transaction_type => 'expense',
    p_from_account_id => '00000000-0000-4000-e510-00000000000a', p_from_delta => -5000,
    p_id => '00000000-0000-4000-e530-000000000008', p_household_category_id => current_setting('hs.cat_rent')::uuid);
  PERFORM set_config('hs.htx_8', r->>'household_transaction_id', true);
  UPDATE transactions SET transaction_type = 'income' WHERE id = '00000000-0000-4000-e530-000000000008';
  IF EXISTS (SELECT 1 FROM household_transaction_links WHERE transaction_id = '00000000-0000-4000-e530-000000000008') THEN
    RAISE EXCEPTION '8: still linked after a type change';
  END IF;
  SELECT * INTO ht FROM household_transactions WHERE id = (r->>'household_transaction_id')::uuid;
  IF ht IS NULL OR ht.amount <> 5000 OR ht.type <> 'expense' THEN RAISE EXCEPTION '8: household copy not preserved'; END IF;
  -- Later personal edits no longer reach it.
  UPDATE transactions SET amount = 1 WHERE id = '00000000-0000-4000-e530-000000000008';
  IF (SELECT amount FROM household_transactions WHERE id = (r->>'household_transaction_id')::uuid) <> 5000 THEN
    RAISE EXCEPTION '8: an unlinked copy was still synced';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.household_sync_events WHERE transaction_id = '00000000-0000-4000-e530-000000000008'
                 AND operation = 'update' AND outcome = 'unlinked_type_change') THEN
    RAISE EXCEPTION '8: type-change unlink not recorded';
  END IF;
END $$;

-- ── 9. A sync failure never fails the personal edit, and is recorded ─────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-00000000000a', p_transaction_date => current_date,
    p_description => 'Milk', p_amount => 60, p_transaction_type => 'expense',
    p_from_account_id => '00000000-0000-4000-e510-00000000000a', p_from_delta => -60,
    p_id => '00000000-0000-4000-e530-000000000009', p_household_category_id => current_setting('hs.cat_groc')::uuid);
  PERFORM set_config('hs.htx_9', r->>'household_transaction_id', true);
END $$;
RESET ROLE;

-- Admin: make household updates above ₹5,000 fail (NOT VALID: existing rows untouched).
ALTER TABLE public.household_transactions ADD CONSTRAINT hs_test_force_failure CHECK (amount < 5000) NOT VALID;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE transactions SET amount = 6000 WHERE id = '00000000-0000-4000-e530-000000000009';   -- must not raise
  IF (SELECT amount FROM transactions WHERE id = '00000000-0000-4000-e530-000000000009') <> 6000 THEN
    RAISE EXCEPTION '9: the personal edit did not stick';
  END IF;
END $$;
RESET ROLE;

ALTER TABLE public.household_transactions DROP CONSTRAINT hs_test_force_failure;

DO $$
DECLARE cols text;
BEGIN
  IF (SELECT amount FROM public.household_transactions WHERE id = current_setting('hs.htx_9')::uuid) <> 60 THEN
    RAISE EXCEPTION '9: the failed sync half-applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_sync_events WHERE transaction_id = '00000000-0000-4000-e530-000000000009'
                 AND operation = 'update' AND outcome = 'failed' AND sqlstate = '23514') THEN
    RAISE EXCEPTION '9: the failure was not recorded with its sqlstate';
  END IF;
  -- The diagnostics table holds nothing sensitive: exactly these columns.
  SELECT string_agg(attname::text, ',' ORDER BY attnum) INTO cols FROM pg_attribute
   WHERE attrelid = 'public.household_sync_events'::regclass AND attnum > 0 AND NOT attisdropped;
  IF cols <> 'id,created_at,operation,outcome,sqlstate,transaction_id,household_transaction_id' THEN
    RAISE EXCEPTION '9: diagnostics columns changed: %', cols;
  END IF;
END $$;

-- ── 10. Personal delete → household copy deleted ─────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  DELETE FROM transactions WHERE id = '00000000-0000-4000-e530-000000000001';
  IF EXISTS (SELECT 1 FROM household_transactions WHERE id = current_setting('hs.htx_x')::uuid) THEN
    RAISE EXCEPTION '10: household copy survived the personal delete';
  END IF;
END $$;
RESET ROLE;

-- ── 11. Household-side delete → personal transaction kept ────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  DELETE FROM household_transactions WHERE id = current_setting('hs.htx_9')::uuid;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = '00000000-0000-4000-e530-000000000009') THEN
    RAISE EXCEPTION '11: a household-side delete deleted the personal transaction';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_transaction_links WHERE transaction_id = '00000000-0000-4000-e530-000000000009') THEN
    RAISE EXCEPTION '11: link survived the household-side delete';
  END IF;
END $$;

-- ── 12. After leaving: no sync either way, no new shares ─────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-00000000000b', p_transaction_date => current_date,
    p_description => 'Veg', p_amount => 120, p_transaction_type => 'expense',
    p_from_account_id => '00000000-0000-4000-e510-00000000000b', p_from_delta => -120,
    p_id => '00000000-0000-4000-e530-000000000012', p_household_category_id => current_setting('hs.cat_groc')::uuid);
  PERFORM set_config('hs.htx_12', r->>'household_transaction_id', true);
  PERFORM mp_household_leave(current_setting('hs.h')::uuid);

  UPDATE transactions SET amount = 130 WHERE id = '00000000-0000-4000-e530-000000000012';
  BEGIN
    PERFORM mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-00000000000b', p_transaction_date => current_date,
      p_description => 'x', p_amount => 10, p_transaction_type => 'expense',
      p_from_account_id => '00000000-0000-4000-e510-00000000000b', p_from_delta => -10,
      p_id => '00000000-0000-4000-e530-000000000048', p_household_category_id => current_setting('hs.cat_groc')::uuid);
    RAISE EXCEPTION '12: a former member shared';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  DELETE FROM transactions WHERE id = '00000000-0000-4000-e530-000000000012';
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT amount FROM public.household_transactions WHERE id = current_setting('hs.htx_12')::uuid) IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION '12: a former member''s edit or delete reached the household';
  END IF;
  IF (SELECT count(*) FROM public.household_sync_events WHERE transaction_id = '00000000-0000-4000-e530-000000000012'
      AND outcome = 'skipped_inactive') <> 2 THEN
    RAISE EXCEPTION '12: inactive skips not recorded (edit + delete)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE id = '00000000-0000-4000-e530-000000000048') THEN
    RAISE EXCEPTION '12: the former member''s refused save was kept';
  END IF;
END $$;

-- ── 13. Account deletion: the household copy survives ────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e500-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := mp_execute_shared_transaction(p_user_id => '00000000-0000-4000-e500-00000000000a', p_transaction_date => current_date,
    p_description => 'Gas cylinder', p_amount => 900, p_transaction_type => 'expense',
    p_from_account_id => '00000000-0000-4000-e510-00000000000a', p_from_delta => -900,
    p_id => '00000000-0000-4000-e530-000000000013', p_household_category_id => current_setting('hs.cat_groc')::uuid);
  PERFORM set_config('hs.htx_13', r->>'household_transaction_id', true);
END $$;
RESET ROLE;

-- As admin.auth.admin.deleteUser does: one DELETE on auth.users, everything else by cascade.
DELETE FROM auth.users WHERE id = '00000000-0000-4000-e500-00000000000a';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.household_transactions WHERE id = current_setting('hs.htx_13')::uuid) THEN
    RAISE EXCEPTION '13: deleting the account deleted shared history';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_transaction_links WHERE household_transaction_id = current_setting('hs.htx_13')::uuid) THEN
    RAISE EXCEPTION '13: link survived account deletion';
  END IF;
  IF current_setting('hs.user_fk_action') = 'c' THEN
    -- The cascade really reached transactions, and the trigger saw the owner gone.
    IF EXISTS (SELECT 1 FROM public.transactions WHERE id = '00000000-0000-4000-e530-000000000013') THEN
      RAISE EXCEPTION '13: personal row not removed by the cascade';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.household_sync_events WHERE transaction_id = '00000000-0000-4000-e530-000000000013'
                   AND operation = 'delete' AND outcome = 'kept_account_deleted') THEN
      RAISE EXCEPTION '13: account deletion was not recognised by the delete trigger';
    END IF;
  ELSE
    RAISE NOTICE '13: transactions.user_id does not cascade from auth.users (%); the account-deletion branch was not exercised', current_setting('hs.user_fk_action');
  END IF;
END $$;

-- ── 14. Grants ──────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.mp_household_log_sync(text,text,text,uuid,uuid)',
                           'public.mp_household_tx_sync_update()', 'public.mp_household_tx_sync_delete()'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '14: internal % is client-executable', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.mp_household_share_recorded_transaction(uuid,uuid)',
    'public.mp_execute_shared_transaction(uuid,date,text,numeric,text,uuid,uuid,uuid,uuid,text,uuid,uuid,boolean,numeric,numeric,numeric,uuid,uuid)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION '14: anon can execute %', f; END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.household_sync_events', 'SELECT')
     OR has_table_privilege('anon', 'public.household_sync_events', 'SELECT') THEN
    RAISE EXCEPTION '14: diagnostics readable by clients';
  END IF;
  IF has_table_privilege('authenticated', 'public.household_transaction_links', 'INSERT')
     OR has_table_privilege('authenticated', 'public.household_transaction_links', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.household_transaction_links', 'DELETE')
     OR has_table_privilege('anon', 'public.household_transaction_links', 'SELECT') THEN
    RAISE EXCEPTION '14: links writable by clients, or readable by anon';
  END IF;
END $$;

SELECT 'HOUSEHOLD SHARE CHECKS PASSED';
ROLLBACK;
