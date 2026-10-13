-- Kakeibo v2 SQL verification — pillar tables: RLS, ownership of the referenced
-- category/transaction, AI-never-overwrites-user, payload validation, the
-- past-cycle RPC, and the delete cascades.
--
-- RUN ON A NON-PRODUCTION DATABASE first (Supabase branch / staging project),
-- after applying 20261013000002_kakeibo.sql and 20261013000003_kakeibo_pillars.sql.
-- Paste into the SQL editor, or: psql "$NON_PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kakeibo_pillars.sql
--
-- One transaction ending in ROLLBACK. Two throwaway auth.users, their categories
-- and transactions are created inside it — no real account is read or written.
-- RLS is exercised as the `authenticated` role (as postgres, RLS is bypassed).
-- Each check RAISEs on failure. Success ends with 'KAKEIBO PILLAR CHECKS PASSED'.

BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-b000-00000000000a', 'kakeibo-pillars-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-b000-00000000000b', 'kakeibo-pillars-b@example.invalid', 'authenticated', 'authenticated');

-- A owns two categories and two expenses; B owns one of each.
INSERT INTO categories (id, user_id, name, group_name) VALUES
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-00000000000a', 'Groceries', 'Utilities'),
  ('00000000-0000-4000-c000-0000000000a2', '00000000-0000-4000-b000-00000000000a', 'Courses', 'Lifestyle'),
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-b000-00000000000b', 'Food', 'Lifestyle');
INSERT INTO transactions (id, user_id, transaction_date, description, amount, transaction_type, category_id) VALUES
  ('00000000-0000-4000-d000-0000000000a1', '00000000-0000-4000-b000-00000000000a', '2026-10-01', 'Milk', 60, 'expense', '00000000-0000-4000-c000-0000000000a1'),
  ('00000000-0000-4000-d000-0000000000a2', '00000000-0000-4000-b000-00000000000a', '2026-10-02', 'Car repair', 2500, 'expense', '00000000-0000-4000-c000-0000000000a1'),
  ('00000000-0000-4000-d000-0000000000b1', '00000000-0000-4000-b000-00000000000b', '2026-10-03', 'Lunch', 300, 'expense', '00000000-0000-4000-c000-0000000000b1');

-- ── As user A ────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n int; p text; s text; r text;
BEGIN
  -- 1. A sets a user pillar on Groceries and a per-expense override on the repair.
  INSERT INTO kakeibo_category_pillars (user_id, category_id, pillar, source)
    VALUES (auth.uid(), '00000000-0000-4000-c000-0000000000a1', 'survival', 'user');
  INSERT INTO kakeibo_txn_pillars (user_id, transaction_id, pillar)
    VALUES (auth.uid(), '00000000-0000-4000-d000-0000000000a2', 'unexpected');

  -- 2. AI suggests for both categories: Groceries (user row) must stay; Courses gets the AI row.
  n := mp_kakeibo_save_ai_pillars('[{"category_id":"00000000-0000-4000-c000-0000000000a1","pillar":"optional"},
                                     {"category_id":"00000000-0000-4000-c000-0000000000a2","pillar":"culture"}]');
  SELECT pillar, source INTO p, s FROM kakeibo_category_pillars WHERE category_id = '00000000-0000-4000-c000-0000000000a1';
  IF p <> 'survival' OR s <> 'user' THEN RAISE EXCEPTION '2: AI overwrote the user choice (% / %)', p, s; END IF;
  SELECT pillar, source INTO p, s FROM kakeibo_category_pillars WHERE category_id = '00000000-0000-4000-c000-0000000000a2';
  IF p <> 'culture' OR s <> 'ai' THEN RAISE EXCEPTION '2: AI row missing (% / %)', p, s; END IF;

  -- 3. AI may replace its own suggestion.
  PERFORM mp_kakeibo_save_ai_pillars('[{"category_id":"00000000-0000-4000-c000-0000000000a2","pillar":"optional"}]');
  SELECT pillar INTO p FROM kakeibo_category_pillars WHERE category_id = '00000000-0000-4000-c000-0000000000a2';
  IF p <> 'optional' THEN RAISE EXCEPTION '3: AI could not update its own row'; END IF;

  -- 4. Malformed payloads are rejected with nothing written.
  BEGIN
    PERFORM mp_kakeibo_save_ai_pillars('[{"category_id":"00000000-0000-4000-c000-0000000000a2","pillar":"luxury"}]');
    RAISE EXCEPTION '4a: unknown pillar accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM mp_kakeibo_save_ai_pillars('[{"category_id":"not-a-uuid","pillar":"culture"}]');
    RAISE EXCEPTION '4b: bad uuid accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM mp_kakeibo_save_ai_pillars('{"category_id":"00000000-0000-4000-c000-0000000000a2"}');
    RAISE EXCEPTION '4c: non-array accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    INSERT INTO kakeibo_txn_pillars (user_id, transaction_id, pillar) VALUES (auth.uid(), '00000000-0000-4000-d000-0000000000a1', 'luxury');
    RAISE EXCEPTION '4d: unknown pillar stored';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 5. A cannot attach a pillar to B's category or transaction — directly or via the RPC.
  BEGIN
    INSERT INTO kakeibo_category_pillars (user_id, category_id, pillar, source)
      VALUES (auth.uid(), '00000000-0000-4000-c000-0000000000b1', 'survival', 'user');
    RAISE EXCEPTION '5a: pillar on another user''s category accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO kakeibo_txn_pillars (user_id, transaction_id, pillar)
      VALUES (auth.uid(), '00000000-0000-4000-d000-0000000000b1', 'unexpected');
    RAISE EXCEPTION '5b: pillar on another user''s transaction accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  n := mp_kakeibo_save_ai_pillars('[{"category_id":"00000000-0000-4000-c000-0000000000b1","pillar":"culture"}]');
  IF n <> 0 THEN RAISE EXCEPTION '5c: RPC wrote a pillar on another user''s category'; END IF;
  BEGIN
    UPDATE kakeibo_category_pillars SET category_id = '00000000-0000-4000-c000-0000000000b1'
     WHERE category_id = '00000000-0000-4000-c000-0000000000a2';
    RAISE EXCEPTION '5d: re-pointed a pillar to another user''s category';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 6. Past-cycle RPC: records a closed cycle once, refuses overlaps and the future.
  r := mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-09-28"}}');
  r := mp_kakeibo_record_past_cycle('2026-07-28', '2026-08-27');
  IF r <> 'applied' THEN RAISE EXCEPTION '6a: expected applied, got %', r; END IF;
  r := mp_kakeibo_record_past_cycle('2026-07-28', '2026-08-27');
  IF r <> 'exists' THEN RAISE EXCEPTION '6b: expected exists, got %', r; END IF;
  r := mp_kakeibo_record_past_cycle('2026-08-20', '2026-09-19');
  IF r <> 'conflict' THEN RAISE EXCEPTION '6c: overlap with a recorded cycle, got %', r; END IF;
  r := mp_kakeibo_record_past_cycle('2026-08-28', '2026-09-28');
  IF r <> 'conflict' THEN RAISE EXCEPTION '6d: overlap with the open cycle, got %', r; END IF;
  BEGIN
    PERFORM mp_kakeibo_record_past_cycle('2026-01-01', '2026-03-31');
    RAISE EXCEPTION '6e: a 90-day cycle was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM mp_kakeibo_record_past_cycle(current_date - 3, current_date + 5);
    RAISE EXCEPTION '6f: a cycle ending in the future was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- 7. Delete = reset to default (own rows).
  DELETE FROM kakeibo_category_pillars WHERE category_id = '00000000-0000-4000-c000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '7: could not reset own pillar'; END IF;
END $$;

-- ── As user B: sees and changes none of A's pillars ──────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM kakeibo_category_pillars;
  IF n <> 0 THEN RAISE EXCEPTION '8a: B sees % of A''s category pillars', n; END IF;
  SELECT count(*) INTO n FROM kakeibo_txn_pillars;
  IF n <> 0 THEN RAISE EXCEPTION '8b: B sees % of A''s transaction pillars', n; END IF;
  UPDATE kakeibo_category_pillars SET pillar = 'culture' WHERE user_id = '00000000-0000-4000-b000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '8c: B updated A''s pillars'; END IF;
  DELETE FROM kakeibo_txn_pillars WHERE user_id = '00000000-0000-4000-b000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '8d: B deleted A''s overrides'; END IF;
  n := mp_kakeibo_save_ai_pillars('[{"category_id":"00000000-0000-4000-c000-0000000000a1","pillar":"culture"}]');
  IF n <> 0 THEN RAISE EXCEPTION '8e: B''s RPC touched A''s category'; END IF;
END $$;

-- ── As postgres: A's data intact; cascades on category / transaction delete ──
RESET ROLE;
DO $$
BEGIN
  IF (SELECT pillar FROM kakeibo_category_pillars WHERE category_id = '00000000-0000-4000-c000-0000000000a1') <> 'survival' THEN
    RAISE EXCEPTION '9a: A''s user pillar changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM kakeibo_txn_pillars WHERE transaction_id = '00000000-0000-4000-d000-0000000000a2') THEN
    RAISE EXCEPTION '9b: A''s override vanished';
  END IF;
  -- The underlying rows were never modified by any of the above.
  IF (SELECT category_id FROM transactions WHERE id = '00000000-0000-4000-d000-0000000000a2') <> '00000000-0000-4000-c000-0000000000a1' THEN
    RAISE EXCEPTION '9c: a transaction''s category was changed';
  END IF;

  DELETE FROM transactions WHERE id = '00000000-0000-4000-d000-0000000000a2';
  IF EXISTS (SELECT 1 FROM kakeibo_txn_pillars WHERE transaction_id = '00000000-0000-4000-d000-0000000000a2') THEN
    RAISE EXCEPTION '10a: override survived its transaction';
  END IF;
  DELETE FROM transactions WHERE category_id = '00000000-0000-4000-c000-0000000000a1';
  DELETE FROM categories WHERE id = '00000000-0000-4000-c000-0000000000a1';
  IF EXISTS (SELECT 1 FROM kakeibo_category_pillars WHERE category_id = '00000000-0000-4000-c000-0000000000a1') THEN
    RAISE EXCEPTION '10b: category pillar survived its category';
  END IF;
END $$;

-- ── anon cannot call either RPC ──────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM mp_kakeibo_save_ai_pillars('[]');
    RAISE EXCEPTION '11a: anon executed save_ai_pillars';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM mp_kakeibo_record_past_cycle('2026-07-28', '2026-08-27');
    RAISE EXCEPTION '11b: anon executed record_past_cycle';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT 'KAKEIBO PILLAR CHECKS PASSED' AS result;
ROLLBACK;
