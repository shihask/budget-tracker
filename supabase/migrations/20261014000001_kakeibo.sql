-- Kakeibo — Monthly Money Reflection (v1). See CLAUDE.md "Kakeibo".
--
-- Purely additive: one new table and one function. Nothing here reads or writes
-- settings, transactions or any other existing table.
--
-- Only the ritual is stored (goal, note, review status). Every money figure the
-- review shows is derived from transactions on the client and never stored here.
--
-- The client is the only cycle authority. It runs the same financial-cycle engine
-- as the rest of the app, plans the writes (planCycleSync in
-- src/features/kakeibo/lib/kakeibo.ts), and this function applies the plan
-- atomically. The database holds no cycle rules, only guarded writes plus one
-- invariant.
--
-- Rollback (nothing else references these objects):
--   DROP FUNCTION IF EXISTS mp_kakeibo_apply_sync(jsonb);
--   DROP TABLE IF EXISTS kakeibo_reflections;

CREATE TABLE IF NOT EXISTS kakeibo_reflections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cycle_start            date NOT NULL,
  cycle_end              date,
  savings_goal           numeric,
  goal_decided_at        timestamptz,
  reflection_note        text,
  review_status          text,
  reviewed_at            timestamptz,
  lesson_acknowledged_at timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kakeibo_cycle_order     CHECK (cycle_end IS NULL OR cycle_end >= cycle_start),
  CONSTRAINT kakeibo_goal_range      CHECK (savings_goal IS NULL OR (savings_goal >= 0 AND savings_goal < 1e10)),
  CONSTRAINT kakeibo_note_length     CHECK (reflection_note IS NULL OR char_length(reflection_note) <= 500),
  CONSTRAINT kakeibo_review_status   CHECK (review_status IS NULL OR review_status IN ('completed', 'skipped')),
  -- One row per observed cycle. Its index also serves "this user's latest cycles".
  CONSTRAINT kakeibo_one_row_per_cycle UNIQUE (user_id, cycle_start)
);

ALTER TABLE kakeibo_reflections ENABLE ROW LEVEL SECURITY;

-- Select / insert / update only. There is deliberately no DELETE policy: nothing
-- in the client deletes a reflection (a row whose salary was deleted is hidden,
-- not removed), and account deletion goes through the FK cascade, not RLS.
DROP POLICY IF EXISTS "Users read own kakeibo reflections" ON kakeibo_reflections;
CREATE POLICY "Users read own kakeibo reflections" ON kakeibo_reflections
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users add own kakeibo reflections" ON kakeibo_reflections;
CREATE POLICY "Users add own kakeibo reflections" ON kakeibo_reflections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own kakeibo reflections" ON kakeibo_reflections;
CREATE POLICY "Users update own kakeibo reflections" ON kakeibo_reflections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reuses mp_touch_updated_at() from 20260818000002 (not redefined here).
DROP TRIGGER IF EXISTS trg_kakeibo_reflections_touch_updated_at ON kakeibo_reflections;
CREATE TRIGGER trg_kakeibo_reflections_touch_updated_at
  BEFORE UPDATE ON kakeibo_reflections
  FOR EACH ROW
  EXECUTE FUNCTION mp_touch_updated_at();

-- Applies one SyncPlan atomically:
--   { insert?: {cycle_start}, rekey?: {from, to},
--     setEnd?: {cycle_start, expected_end, cycle_end}, reopen?: {cycle_start, expected_end} }
--
-- Security: SECURITY INVOKER, so every statement runs as the caller under the
-- RLS policies above. The function is never more powerful than the client's own
-- direct writes. It never reads a user id from the plan: every statement is also
-- scoped to auth.uid() explicitly (defence in depth), so a plan naming another
-- user's dates can only ever touch the caller's own rows. Usually that finds
-- nothing and returns 'stale'.
--
-- Concurrency: a per-user transaction advisory lock serialises two tabs,
-- StrictMode's double effect and reloads. All expectations are checked before
-- any write. If one fails, the function returns 'stale' with nothing written, and
-- the client re-reads and re-plans.
--
-- Invariant (checked last; a violation raises and rolls the whole plan back): in
-- cycle_start order, every closed cycle ends before the next one starts. Cycle
-- boundaries can never be left overlapping, even partly.
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

  -- ── Expectations: all checked before any write ──────────────────────────────
  IF p_plan ? 'rekey' THEN
    IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections WHERE user_id = v_uid AND cycle_start = v_rekey_from AND cycle_end IS NULL)
       OR EXISTS (SELECT 1 FROM kakeibo_reflections WHERE user_id = v_uid AND cycle_start = v_rekey_to) THEN
      RETURN 'stale';
    END IF;
  END IF;
  IF p_plan ? 'setEnd' THEN
    IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections
                   WHERE user_id = v_uid AND cycle_start = v_end_start
                     AND cycle_end IS NOT DISTINCT FROM v_end_expected) THEN
      RETURN 'stale';
    END IF;
  END IF;
  IF p_plan ? 'reopen' THEN
    IF NOT EXISTS (SELECT 1 FROM kakeibo_reflections
                   WHERE user_id = v_uid AND cycle_start = v_reopen_start AND cycle_end = v_reopen_expected) THEN
      RETURN 'stale';
    END IF;
  END IF;

  -- ── Writes ──────────────────────────────────────────────────────────────────
  IF p_plan ? 'rekey' THEN
    UPDATE kakeibo_reflections SET cycle_start = v_rekey_to
     WHERE user_id = v_uid AND cycle_start = v_rekey_from;
  END IF;
  IF p_plan ? 'setEnd' THEN
    UPDATE kakeibo_reflections SET cycle_end = v_end_value
     WHERE user_id = v_uid AND cycle_start = v_end_start;
  END IF;
  IF p_plan ? 'reopen' THEN
    UPDATE kakeibo_reflections SET cycle_end = NULL
     WHERE user_id = v_uid AND cycle_start = v_reopen_start;
  END IF;
  IF p_plan ? 'insert' THEN
    INSERT INTO kakeibo_reflections (user_id, cycle_start) VALUES (v_uid, v_insert)
    ON CONFLICT (user_id, cycle_start) DO NOTHING;
  END IF;

  -- ── Invariant ───────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_overlaps
  FROM (
    SELECT cycle_end, lead(cycle_start) OVER (ORDER BY cycle_start) AS next_start
    FROM kakeibo_reflections
    WHERE user_id = v_uid
  ) s
  WHERE s.cycle_end IS NOT NULL AND s.next_start IS NOT NULL AND s.cycle_end >= s.next_start;
  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'Kakeibo cycles would overlap' USING ERRCODE = '23514';
  END IF;

  RETURN 'applied';
END;
$fn$;

REVOKE ALL ON FUNCTION mp_kakeibo_apply_sync(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_kakeibo_apply_sync(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION mp_kakeibo_apply_sync(jsonb) TO authenticated;
