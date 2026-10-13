-- Kakeibo SQL verification — RLS, cross-user isolation, atomic sync, constraints.
--
-- RUN ONLY ON A NON-PRODUCTION DATABASE (local `supabase start`, or a branch or
-- staging project) after applying 20261013000002_kakeibo.sql:
--   psql "$NON_PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kakeibo_sync.sql
--
-- Everything runs in one transaction that ends in ROLLBACK. Two throwaway
-- auth.users rows are created inside it, so no real account is ever read or
-- written.
--
-- RLS is exercised by switching to the `authenticated` role. As the postgres
-- superuser, RLS is bypassed and set_config alone scopes nothing. Each check
-- RAISEs on failure, so ON_ERROR_STOP aborts at the first broken expectation.
-- The last line printed on success is 'KAKEIBO SQL CHECKS PASSED'.

BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-a000-00000000000a', 'kakeibo-test-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'kakeibo-test-b@example.invalid', 'authenticated', 'authenticated');

-- ── As user A ────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r text; n int; v_end date;
BEGIN
  -- 1. First sight
  r := mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-09-28"}}');
  IF r <> 'applied' THEN RAISE EXCEPTION '1: expected applied, got %', r; END IF;

  -- 2. Payday rollover: insert + close predecessor, atomically
  r := mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-10-28"},"setEnd":{"cycle_start":"2026-09-28","expected_end":null,"cycle_end":"2026-10-27"}}');
  IF r <> 'applied' THEN RAISE EXCEPTION '2: expected applied, got %', r; END IF;
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_start = '2026-09-28';
  IF v_end <> '2026-10-27' THEN RAISE EXCEPTION '2: Sep end %', v_end; END IF;

  -- 3. Second tab, same stale plan → 'stale', nothing written, no duplicate
  r := mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-10-28"},"setEnd":{"cycle_start":"2026-09-28","expected_end":null,"cycle_end":"2026-10-27"}}');
  IF r <> 'stale' THEN RAISE EXCEPTION '3: expected stale, got %', r; END IF;
  SELECT count(*) INTO n FROM kakeibo_reflections;
  IF n <> 2 THEN RAISE EXCEPTION '3: expected 2 rows, got %', n; END IF;

  -- 4. Backdated salary: Sep(end 29 Oct) + Oct30(open) → re-key to 26 Oct and move Sep's end to 25 Oct
  UPDATE kakeibo_reflections SET cycle_start = '2026-10-30' WHERE cycle_start = '2026-10-28';
  UPDATE kakeibo_reflections SET cycle_end = '2026-10-29' WHERE cycle_start = '2026-09-28';
  UPDATE kakeibo_reflections SET reflection_note = 'keep me', review_status = 'completed' WHERE cycle_start = '2026-09-28';
  r := mp_kakeibo_apply_sync('{"rekey":{"from":"2026-10-30","to":"2026-10-26"},"setEnd":{"cycle_start":"2026-09-28","expected_end":"2026-10-29","cycle_end":"2026-10-25"}}');
  IF r <> 'applied' THEN RAISE EXCEPTION '4: expected applied, got %', r; END IF;
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_start = '2026-09-28';
  IF v_end <> '2026-10-25' THEN RAISE EXCEPTION '4: Sep end %, expected 2026-10-25', v_end; END IF;
  IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections WHERE cycle_start = '2026-10-26' AND cycle_end IS NULL) THEN RAISE EXCEPTION '4: Oct26 missing'; END IF;
  IF EXISTS (SELECT 1 FROM kakeibo_reflections WHERE cycle_start = '2026-10-30') THEN RAISE EXCEPTION '4: Oct30 still present'; END IF;
  IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections WHERE cycle_start = '2026-09-28' AND reflection_note = 'keep me' AND review_status = 'completed') THEN
    RAISE EXCEPTION '4: sync touched the note or status';
  END IF;

  -- 5. A plan that would overlap cycles raises and rolls back entirely
  BEGIN
    PERFORM mp_kakeibo_apply_sync('{"setEnd":{"cycle_start":"2026-09-28","expected_end":"2026-10-25","cycle_end":"2026-11-05"}}');
    RAISE EXCEPTION '5: overlap was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_start = '2026-09-28';
  IF v_end <> '2026-10-25' THEN RAISE EXCEPTION '5: partial write survived (Sep end %)', v_end; END IF;

  -- 6. Unique (user_id, cycle_start)
  BEGIN
    INSERT INTO kakeibo_reflections (user_id, cycle_start) VALUES (auth.uid(), '2026-10-26');
    RAISE EXCEPTION '6: duplicate cycle accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 7. Value checks
  BEGIN
    UPDATE kakeibo_reflections SET reflection_note = repeat('x', 501) WHERE cycle_start = '2026-10-26';
    RAISE EXCEPTION '7a: 501-char note accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE kakeibo_reflections SET savings_goal = -1 WHERE cycle_start = '2026-10-26';
    RAISE EXCEPTION '7b: negative goal accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE kakeibo_reflections SET review_status = 'pending' WHERE cycle_start = '2026-10-26';
    RAISE EXCEPTION '7c: unknown status accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM mp_kakeibo_apply_sync('{"rekey":{"from":"2026-10-26"}}');
    RAISE EXCEPTION '7d: malformed plan accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- 8. Clients cannot delete (no DELETE policy)
  DELETE FROM kakeibo_reflections WHERE cycle_start = '2026-10-26';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '8: delete was allowed'; END IF;
END $$;

-- ── As user B: cannot see, change or sync A's rows ───────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r text; n int;
BEGIN
  SELECT count(*) INTO n FROM kakeibo_reflections;
  IF n <> 0 THEN RAISE EXCEPTION '9: B can see % of A''s rows', n; END IF;

  UPDATE kakeibo_reflections SET reflection_note = 'hijacked'
   WHERE user_id = '00000000-0000-4000-a000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '10: B updated % of A''s rows', n; END IF;

  -- A plan naming A's dates: only B's (nonexistent) rows are considered → stale
  r := mp_kakeibo_apply_sync('{"setEnd":{"cycle_start":"2026-09-28","expected_end":"2026-10-25","cycle_end":"2026-10-20"}}');
  IF r <> 'stale' THEN RAISE EXCEPTION '11: expected stale, got %', r; END IF;
  r := mp_kakeibo_apply_sync('{"rekey":{"from":"2026-10-26","to":"2026-10-20"}}');
  IF r <> 'stale' THEN RAISE EXCEPTION '11b: expected stale, got %', r; END IF;

  BEGIN
    INSERT INTO kakeibo_reflections (user_id, cycle_start) VALUES ('00000000-0000-4000-a000-00000000000a', '2026-12-28');
    RAISE EXCEPTION '12: B inserted a row for A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ── A's rows are exactly as A left them ──────────────────────────────────────
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM kakeibo_reflections WHERE user_id = '00000000-0000-4000-a000-00000000000a') <> 2 THEN
    RAISE EXCEPTION '13: A row count changed';
  END IF;
  IF EXISTS (SELECT 1 FROM kakeibo_reflections WHERE reflection_note = 'hijacked') THEN RAISE EXCEPTION '13: hijack landed'; END IF;
  IF (SELECT cycle_end FROM kakeibo_reflections WHERE user_id = '00000000-0000-4000-a000-00000000000a' AND cycle_start = '2026-09-28') <> '2026-10-25' THEN
    RAISE EXCEPTION '13: B changed A''s cycle_end';
  END IF;
  IF EXISTS (SELECT 1 FROM kakeibo_reflections WHERE user_id = '00000000-0000-4000-a000-00000000000a' AND cycle_start = '2026-12-28') THEN
    RAISE EXCEPTION '13: B''s insert landed on A';
  END IF;
END $$;

-- ── anon cannot call the RPC ─────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-09-28"}}');
    RAISE EXCEPTION '14: anon executed the RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT 'KAKEIBO SQL CHECKS PASSED' AS result;
ROLLBACK;
