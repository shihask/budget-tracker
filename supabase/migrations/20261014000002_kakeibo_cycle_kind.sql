-- Kakeibo for every income pattern: salary cycles (Monthly income) and
-- calendar months (Weekly, Variable/Daily, Business). See CLAUDE.md "Kakeibo".
--
-- Additive for existing data: every existing row becomes cycle_kind = 'salary'
-- (the column default) with no rewrite of its dates, goal, note or status.
-- Nothing outside the Kakeibo tables is read or written.
--
-- 1. cycle_kind on kakeibo_reflections, plus a CHECK that a 'month' row is
--    exactly one calendar month.
-- 2. Uniqueness becomes (user_id, cycle_kind, cycle_start): a salary cycle and
--    a calendar month may both start on the 1st.
-- 3. mp_kakeibo_apply_sync / mp_kakeibo_record_past_cycle are re-created
--    SCOPED TO cycle_kind = 'salary'. Their logic is otherwise unchanged:
--    the same expectations, writes, lock and overlap invariant, now over
--    salary rows only. (Months can't overlap each other by construction, and a
--    month may legitimately overlap a salary cycle from before an
--    income-pattern change.)
-- 4. mp_kakeibo_ensure_month(p_month_start): idempotently creates the row for
--    one calendar month; the end date is computed here, never trusted from
--    the client.
--
-- Safe to re-run (IF EXISTS / OR REPLACE throughout).
--
-- Rollback (in this order; the first line is needed only if month rows exist,
-- because the old unique key can't hold a month and a salary row on the same
-- start):
--   DELETE FROM kakeibo_reflections WHERE cycle_kind = 'month';
--   DROP FUNCTION IF EXISTS mp_kakeibo_ensure_month(date);
--   ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_one_row_per_cycle;
--   ALTER TABLE kakeibo_reflections ADD CONSTRAINT kakeibo_one_row_per_cycle UNIQUE (user_id, cycle_start);
--   ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_month_bounds;
--   ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_cycle_kind_value;
--   ALTER TABLE kakeibo_reflections DROP COLUMN IF EXISTS cycle_kind;
--   then re-run the two functions from 20261013000002 / 20261013000003.

-- ── 1. cycle_kind ────────────────────────────────────────────────────────────
ALTER TABLE kakeibo_reflections ADD COLUMN IF NOT EXISTS cycle_kind text NOT NULL DEFAULT 'salary';

ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_cycle_kind_value;
ALTER TABLE kakeibo_reflections ADD CONSTRAINT kakeibo_cycle_kind_value
  CHECK (cycle_kind IN ('salary', 'month'));

ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_month_bounds;
ALTER TABLE kakeibo_reflections ADD CONSTRAINT kakeibo_month_bounds
  CHECK (cycle_kind <> 'month' OR (
    extract(day FROM cycle_start) = 1
    AND cycle_end = (date_trunc('month', cycle_start) + interval '1 month - 1 day')::date
  ));

-- ── 2. Uniqueness per kind ───────────────────────────────────────────────────
ALTER TABLE kakeibo_reflections DROP CONSTRAINT IF EXISTS kakeibo_one_row_per_cycle;
ALTER TABLE kakeibo_reflections ADD CONSTRAINT kakeibo_one_row_per_cycle
  UNIQUE (user_id, cycle_kind, cycle_start);

-- ── 3. Salary RPCs, scoped to salary rows ────────────────────────────────────
CREATE OR REPLACE FUNCTION mp_kakeibo_apply_sync(p_plan jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_uid             uuid := auth.uid();
  v_insert          date := (p_plan -> 'insert' ->> 'cycle_start')::date;
  v_rekey_from      date := (p_plan -> 'rekey'  ->> 'from')::date;
  v_rekey_to        date := (p_plan -> 'rekey'  ->> 'to')::date;
  v_end_start       date := (p_plan -> 'setEnd' ->> 'cycle_start')::date;
  v_end_expected    date := (p_plan -> 'setEnd' ->> 'expected_end')::date;
  v_end_value       date := (p_plan -> 'setEnd' ->> 'cycle_end')::date;
  v_reopen_start    date := (p_plan -> 'reopen' ->> 'cycle_start')::date;
  v_reopen_expected date := (p_plan -> 'reopen' ->> 'expected_end')::date;
  v_overlaps        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object'
     OR (p_plan ? 'insert' AND v_insert IS NULL)
     OR (p_plan ? 'rekey'  AND (v_rekey_from IS NULL OR v_rekey_to IS NULL))
     OR (p_plan ? 'setEnd' AND (v_end_start IS NULL OR v_end_value IS NULL))
     OR (p_plan ? 'reopen' AND (v_reopen_start IS NULL OR v_reopen_expected IS NULL)) THEN
    RAISE EXCEPTION 'Invalid Kakeibo sync plan' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kakeibo_apply_sync'), hashtext(v_uid::text));

  IF p_plan ? 'rekey' THEN
    IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_rekey_from AND cycle_end IS NULL)
       OR EXISTS (SELECT 1 FROM kakeibo_reflections WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_rekey_to) THEN
      RETURN 'stale';
    END IF;
  END IF;
  IF p_plan ? 'setEnd' THEN
    IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections
                   WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_end_start
                     AND cycle_end IS NOT DISTINCT FROM v_end_expected) THEN
      RETURN 'stale';
    END IF;
  END IF;
  IF p_plan ? 'reopen' THEN
    IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections
                   WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_reopen_start AND cycle_end = v_reopen_expected) THEN
      RETURN 'stale';
    END IF;
  END IF;

  IF p_plan ? 'rekey' THEN
    UPDATE kakeibo_reflections SET cycle_start = v_rekey_to
     WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_rekey_from;
  END IF;
  IF p_plan ? 'setEnd' THEN
    UPDATE kakeibo_reflections SET cycle_end = v_end_value
     WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_end_start;
  END IF;
  IF p_plan ? 'reopen' THEN
    UPDATE kakeibo_reflections SET cycle_end = NULL
     WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = v_reopen_start;
  END IF;
  IF p_plan ? 'insert' THEN
    INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start) VALUES (v_uid, 'salary', v_insert)
    ON CONFLICT (user_id, cycle_kind, cycle_start) DO NOTHING;
  END IF;

  SELECT count(*) INTO v_overlaps
  FROM (
    SELECT cycle_end, lead(cycle_start) OVER (ORDER BY cycle_start) AS next_start
    FROM kakeibo_reflections
    WHERE user_id = v_uid AND cycle_kind = 'salary'
  ) s
  WHERE s.cycle_end IS NOT NULL AND s.next_start IS NOT NULL AND s.cycle_end >= s.next_start;
  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'Kakeibo cycles would overlap' USING ERRCODE = '23514';
  END IF;

  RETURN 'applied';
END;
$fn$;

CREATE OR REPLACE FUNCTION mp_kakeibo_record_past_cycle(p_start date, p_end date)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_overlaps integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR (p_end - p_start + 1) > 46 OR p_end >= current_date THEN
    RAISE EXCEPTION 'Invalid Kakeibo past cycle' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kakeibo_apply_sync'), hashtext(v_uid::text));

  IF EXISTS (SELECT 1 FROM kakeibo_reflections
             WHERE user_id = v_uid AND cycle_kind = 'salary' AND cycle_start = p_start AND cycle_end = p_end) THEN
    RETURN 'exists';
  END IF;
  IF EXISTS (SELECT 1 FROM kakeibo_reflections
             WHERE user_id = v_uid AND cycle_kind = 'salary'
               AND daterange(cycle_start, COALESCE(cycle_end, 'infinity'::date), '[]') && daterange(p_start, p_end, '[]')) THEN
    RETURN 'conflict';
  END IF;

  INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start, cycle_end) VALUES (v_uid, 'salary', p_start, p_end);

  SELECT count(*) INTO v_overlaps
  FROM (
    SELECT cycle_end, lead(cycle_start) OVER (ORDER BY cycle_start) AS next_start
    FROM kakeibo_reflections WHERE user_id = v_uid AND cycle_kind = 'salary'
  ) s
  WHERE s.cycle_end IS NOT NULL AND s.next_start IS NOT NULL AND s.cycle_end >= s.next_start;
  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'Kakeibo cycles would overlap' USING ERRCODE = '23514';
  END IF;
  RETURN 'applied';
END;
$fn$;

-- Grants carry over on CREATE OR REPLACE; restated so a fresh database matches.
REVOKE ALL ON FUNCTION mp_kakeibo_apply_sync(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_kakeibo_apply_sync(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION mp_kakeibo_apply_sync(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION mp_kakeibo_record_past_cycle(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_kakeibo_record_past_cycle(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION mp_kakeibo_record_past_cycle(date, date) TO authenticated;

-- ── 4. Calendar months ───────────────────────────────────────────────────────
-- Creates the row for the calendar month starting p_month_start, idempotently:
--   'applied' — created;  'exists' — already there (nothing written).
-- p_month_start must be the 1st. Up to NEXT month is accepted: the client uses
-- local dates, and on the 1st in IST the server's UTC date can still be the
-- previous month. SECURITY INVOKER, so RLS (own rows only) applies to the insert.
CREATE OR REPLACE FUNCTION mp_kakeibo_ensure_month(p_month_start date)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL
     OR extract(day FROM p_month_start) <> 1
     OR p_month_start > (date_trunc('month', current_date) + interval '1 month')::date THEN
    RAISE EXCEPTION 'Invalid Kakeibo month' USING ERRCODE = '22023';
  END IF;

  INSERT INTO kakeibo_reflections (user_id, cycle_kind, cycle_start, cycle_end)
  VALUES (v_uid, 'month', p_month_start, (p_month_start + interval '1 month - 1 day')::date)
  ON CONFLICT (user_id, cycle_kind, cycle_start) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN CASE WHEN v_rows = 1 THEN 'applied' ELSE 'exists' END;
END;
$fn$;

REVOKE ALL ON FUNCTION mp_kakeibo_ensure_month(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_kakeibo_ensure_month(date) FROM anon;
GRANT EXECUTE ON FUNCTION mp_kakeibo_ensure_month(date) TO authenticated;
