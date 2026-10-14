-- Kakeibo for all income patterns — verifies 20261014000002_kakeibo_cycle_kind.sql:
-- the month CHECK, per-kind uniqueness, mp_kakeibo_ensure_month idempotency and
-- validation, salary-RPC compatibility with month rows present, RLS isolation,
-- anon denial, and that the documented rollback actually works.
--
-- Run after applying the migration (SQL editor, or
-- psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kakeibo_cycle_kind.sql).
-- One transaction ending in ROLLBACK; two throwaway auth.users; no real account is
-- read or written. Success ends with 'KAKEIBO CYCLE KIND CHECKS PASSED'.

BEGIN;

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-e000-00000000000a', 'kakeibo-kind-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-e000-00000000000b', 'kakeibo-kind-b@example.invalid', 'authenticated', 'authenticated');

-- ── As user A ────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r text; n int; v_end date; v_kind text;
BEGIN
  -- 1. A salary row written the old way (no kind given) is a salary row.
  r := mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-09-01"}}');
  SELECT cycle_kind INTO v_kind FROM kakeibo_reflections WHERE cycle_start = '2026-09-01';
  IF v_kind <> 'salary' THEN RAISE EXCEPTION '1: default kind is %', v_kind; END IF;

  -- 2. ensure_month: creates once, then 'exists'; end computed server-side.
  r := mp_kakeibo_ensure_month('2026-09-01');
  IF r <> 'applied' THEN RAISE EXCEPTION '2a: expected applied, got %', r; END IF;
  r := mp_kakeibo_ensure_month('2026-09-01');
  IF r <> 'exists' THEN RAISE EXCEPTION '2b: expected exists, got %', r; END IF;
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_kind = 'month' AND cycle_start = '2026-09-01';
  IF v_end <> '2026-09-30' THEN RAISE EXCEPTION '2c: month end %', v_end; END IF;
  SELECT count(*) INTO n FROM kakeibo_reflections WHERE cycle_start = '2026-09-01';
  IF n <> 2 THEN RAISE EXCEPTION '2d: salary and month rows on the same start should coexist (got %)', n; END IF;
END $$;

DO $$
DECLARE r text; n int; v_end date;
BEGIN
  -- 3. Leap-year February and year transition, via past months.
  r := mp_kakeibo_ensure_month('2024-02-01');
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_kind = 'month' AND cycle_start = '2024-02-01';
  IF v_end <> '2024-02-29' THEN RAISE EXCEPTION '3a: leap February ends %', v_end; END IF;
  r := mp_kakeibo_ensure_month('2025-12-01');
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_kind = 'month' AND cycle_start = '2025-12-01';
  IF v_end <> '2025-12-31' THEN RAISE EXCEPTION '3b: December ends %', v_end; END IF;

  -- 4. Validation: not the 1st, too far ahead, null → rejected; next month accepted (UTC/IST slack).
  BEGIN PERFORM mp_kakeibo_ensure_month('2026-09-15'); RAISE EXCEPTION '4a: mid-month start accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM mp_kakeibo_ensure_month((date_trunc('month', current_date) + interval '2 month')::date); RAISE EXCEPTION '4b: a month two ahead accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM mp_kakeibo_ensure_month(NULL); RAISE EXCEPTION '4c: null accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  r := mp_kakeibo_ensure_month((date_trunc('month', current_date) + interval '1 month')::date);
  IF r <> 'applied' THEN RAISE EXCEPTION '4d: next month (timezone slack) rejected'; END IF;

  -- 5. The month CHECK holds even for direct writes.
  BEGIN
    INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start, cycle_end) VALUES (auth.uid(), 'month', '2026-05-01', '2026-05-30');
    RAISE EXCEPTION '5a: a short month row was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start, cycle_end) VALUES (auth.uid(), 'quarter', '2026-04-01', '2026-06-30');
    RAISE EXCEPTION '5b: unknown kind accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- 6. Uniqueness is per kind: a second September month row is rejected.
  BEGIN
    INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start, cycle_end) VALUES (auth.uid(), 'month', '2026-09-01', '2026-09-30');
    RAISE EXCEPTION '6: duplicate month accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- 7. Salary RPCs ignore month rows entirely.
  --    Rollover: Sep salary cycle closes on 30 Sep even though month rows overlap it.
  r := mp_kakeibo_apply_sync('{"insert":{"cycle_start":"2026-10-01"},"setEnd":{"cycle_start":"2026-09-01","expected_end":null,"cycle_end":"2026-09-30"}}');
  IF r <> 'applied' THEN RAISE EXCEPTION '7a: salary rollover with month rows present: %', r; END IF;
  --    A salary plan naming a month row's start never touches the month row.
  r := mp_kakeibo_apply_sync('{"setEnd":{"cycle_start":"2025-12-01","expected_end":"2025-12-31","cycle_end":"2025-12-20"}}');
  IF r <> 'stale' THEN RAISE EXCEPTION '7b: salary RPC saw a month row (%)', r; END IF;
  SELECT cycle_end INTO v_end FROM kakeibo_reflections WHERE cycle_kind = 'month' AND cycle_start = '2025-12-01';
  IF v_end <> '2025-12-31' THEN RAISE EXCEPTION '7c: month row changed by a salary RPC'; END IF;
  --    record_past_cycle checks overlaps among salary rows only.
  r := mp_kakeibo_record_past_cycle('2026-07-01', '2026-07-31');
  IF r <> 'applied' THEN RAISE EXCEPTION '7d: past salary cycle refused because of a month row (%)', r; END IF;
  r := mp_kakeibo_record_past_cycle('2026-08-15', '2026-09-10');
  IF r <> 'conflict' THEN RAISE EXCEPTION '7e: salary overlap not detected (%)', r; END IF;

  -- 8. A month row's note/status lifecycle works through plain updates (RLS).
  UPDATE kakeibo_reflections SET reflection_note = 'Cook more', review_status = 'completed'
   WHERE cycle_kind = 'month' AND cycle_start = '2026-09-01';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '8: could not save a note on own month row'; END IF;
END $$;

-- ── As user B ────────────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r text; n int;
BEGIN
  SELECT count(*) INTO n FROM kakeibo_reflections;
  IF n <> 0 THEN RAISE EXCEPTION '9a: B sees % of A''s rows', n; END IF;
  UPDATE kakeibo_reflections SET reflection_note = 'hijacked' WHERE user_id = '00000000-0000-4000-e000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '9b: B updated A''s rows'; END IF;
  -- B's ensure_month for the same month creates B's own row, not a clash with A's.
  r := mp_kakeibo_ensure_month('2026-09-01');
  IF r <> 'applied' THEN RAISE EXCEPTION '9c: B blocked by A''s month row (%)', r; END IF;
  BEGIN
    INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start, cycle_end)
      VALUES ('00000000-0000-4000-e000-00000000000a', 'month', '2026-06-01', '2026-06-30');
    RAISE EXCEPTION '9d: B inserted a month row for A';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ── anon ─────────────────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM mp_kakeibo_ensure_month('2026-09-01'); RAISE EXCEPTION '10: anon executed ensure_month';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- ── As postgres: A's data intact; then rehearse the documented rollback ──────
DO $$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM kakeibo_reflections WHERE reflection_note = 'hijacked') THEN RAISE EXCEPTION '11a: hijack landed'; END IF;
  IF (SELECT reflection_note FROM kakeibo_reflections
      WHERE user_id = '00000000-0000-4000-e000-00000000000a' AND cycle_kind = 'month' AND cycle_start = '2026-09-01') <> 'Cook more' THEN
    RAISE EXCEPTION '11b: A''s month note lost';
  END IF;
END $$;

SAVEPOINT rollback_rehearsal;
DELETE FROM kakeibo_reflections WHERE cycle_kind = 'month';
DROP FUNCTION IF EXISTS mp_kakeibo_ensure_month(date);
ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_one_row_per_cycle;
ALTER TABLE kakeibo_reflections ADD CONSTRAINT kakeibo_one_row_per_cycle UNIQUE (user_id, cycle_start);
ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_month_bounds;
ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_cycle_kind_value;
ALTER TABLE kakeibo_reflections DROP COLUMN IF EXISTS cycle_kind;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kakeibo_reflections' AND column_name = 'cycle_kind') THEN
    RAISE EXCEPTION '12: rollback left cycle_kind behind';
  END IF;
END $$;
ROLLBACK TO SAVEPOINT rollback_rehearsal;

SELECT 'KAKEIBO CYCLE KIND CHECKS PASSED' AS result;
ROLLBACK;
