-- Kakeibo v2 — the four pillars (Survival / Optional / Culture / Unexpected).
-- See CLAUDE.md "Kakeibo".
--
-- Purely additive: two new tables and two new functions. Pillars are a
-- Kakeibo-only classification layer. Nothing here reads into or writes to
-- transactions, categories, budget_bucket, Budget Strategy or settings, and no
-- totals are stored (they are derived on the client from transactions).
--
-- Depends on 20261013000002_kakeibo.sql (kakeibo_reflections) and on
-- mp_touch_updated_at() from 20260818000002.
--
-- Rollback (nothing else references these objects):
--   DROP FUNCTION IF EXISTS mp_kakeibo_record_past_cycle(date, date);
--   DROP FUNCTION IF EXISTS mp_kakeibo_save_ai_pillars(jsonb);
--   DROP TABLE IF EXISTS kakeibo_txn_pillars;
--   DROP TABLE IF EXISTS kakeibo_category_pillars;

-- ── Category default pillar (AI-suggested or user-chosen) ────────────────────
CREATE TABLE IF NOT EXISTS kakeibo_category_pillars (
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  pillar      text NOT NULL,
  source      text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT kakeibo_category_pillar_value  CHECK (pillar IN ('survival', 'optional', 'culture', 'unexpected')),
  CONSTRAINT kakeibo_category_pillar_source CHECK (source IN ('ai', 'user'))
);

-- ── Per-expense override (user only) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kakeibo_txn_pillars (
  user_id        uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  pillar         text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, transaction_id),
  CONSTRAINT kakeibo_txn_pillar_value CHECK (pillar IN ('survival', 'optional', 'culture', 'unexpected'))
);
-- ON DELETE CASCADE on transaction_id needs an index led by it to stay cheap.
CREATE INDEX IF NOT EXISTS idx_kakeibo_txn_pillars_transaction ON kakeibo_txn_pillars (transaction_id);
CREATE INDEX IF NOT EXISTS idx_kakeibo_category_pillars_category ON kakeibo_category_pillars (category_id);

ALTER TABLE kakeibo_category_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE kakeibo_txn_pillars ENABLE ROW LEVEL SECURITY;

-- Ownership is enforced on the REFERENCED row too, not only on user_id: without
-- the EXISTS checks a user could attach a pillar row to another user's category
-- or transaction id. Delete = "reset to default", so it is allowed on own rows.
DROP POLICY IF EXISTS "Users read own kakeibo category pillars" ON kakeibo_category_pillars;
CREATE POLICY "Users read own kakeibo category pillars" ON kakeibo_category_pillars
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users add own kakeibo category pillars" ON kakeibo_category_pillars;
CREATE POLICY "Users add own kakeibo category pillars" ON kakeibo_category_pillars
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM categories c WHERE c.id = category_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own kakeibo category pillars" ON kakeibo_category_pillars;
CREATE POLICY "Users update own kakeibo category pillars" ON kakeibo_category_pillars
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM categories c WHERE c.id = category_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users delete own kakeibo category pillars" ON kakeibo_category_pillars;
CREATE POLICY "Users delete own kakeibo category pillars" ON kakeibo_category_pillars
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own kakeibo txn pillars" ON kakeibo_txn_pillars;
CREATE POLICY "Users read own kakeibo txn pillars" ON kakeibo_txn_pillars
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users add own kakeibo txn pillars" ON kakeibo_txn_pillars;
CREATE POLICY "Users add own kakeibo txn pillars" ON kakeibo_txn_pillars
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users update own kakeibo txn pillars" ON kakeibo_txn_pillars;
CREATE POLICY "Users update own kakeibo txn pillars" ON kakeibo_txn_pillars
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users delete own kakeibo txn pillars" ON kakeibo_txn_pillars;
CREATE POLICY "Users delete own kakeibo txn pillars" ON kakeibo_txn_pillars
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_kakeibo_category_pillars_touch_updated_at ON kakeibo_category_pillars;
CREATE TRIGGER trg_kakeibo_category_pillars_touch_updated_at
  BEFORE UPDATE ON kakeibo_category_pillars FOR EACH ROW EXECUTE FUNCTION mp_touch_updated_at();
DROP TRIGGER IF EXISTS trg_kakeibo_txn_pillars_touch_updated_at ON kakeibo_txn_pillars;
CREATE TRIGGER trg_kakeibo_txn_pillars_touch_updated_at
  BEFORE UPDATE ON kakeibo_txn_pillars FOR EACH ROW EXECUTE FUNCTION mp_touch_updated_at();

-- ── AI suggestions: never overwrite the user ─────────────────────────────────
-- p_items: [{"category_id": "<uuid>", "pillar": "survival|optional|culture|unexpected"}, ...]
-- SECURITY INVOKER, so the RLS policies above apply to every write, including
-- category ownership. Every entry is validated, and a malformed payload raises
-- (22023) with nothing written. The upsert's WHERE clause is what makes a user's
-- choice permanent: an AI row may replace an AI row, never a 'user' row.
-- Returns the number of rows written.
CREATE OR REPLACE FUNCTION mp_kakeibo_save_ai_pillars(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_item jsonb;
  v_n    integer := 0;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'Invalid Kakeibo pillar payload' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR (v_item ->> 'category_id') IS NULL
       OR (v_item ->> 'category_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (v_item ->> 'pillar') IS NULL
       OR (v_item ->> 'pillar') NOT IN ('survival', 'optional', 'culture', 'unexpected') THEN
      RAISE EXCEPTION 'Invalid Kakeibo pillar payload' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Not owned (or not visible) → skipped quietly, never written. RLS would
    -- reject it anyway; skipping keeps one bad id from failing the whole batch.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM categories c WHERE c.id = (v_item ->> 'category_id')::uuid AND c.user_id = v_uid
    );
    INSERT INTO kakeibo_category_pillars AS kcp (user_id, category_id, pillar, source)
    VALUES (v_uid, (v_item ->> 'category_id')::uuid, v_item ->> 'pillar', 'ai')
    ON CONFLICT (user_id, category_id) DO UPDATE
      SET pillar = EXCLUDED.pillar
      WHERE kcp.source = 'ai';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_n := v_n + v_rows;
  END LOOP;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION mp_kakeibo_save_ai_pillars(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_kakeibo_save_ai_pillars(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION mp_kakeibo_save_ai_pillars(jsonb) TO authenticated;

-- ── Record a closed past cycle (so a note can be saved on it) ────────────────
-- For cycles before Kakeibo observed them live. The client derives the dates
-- from the same financial-cycle engine as the rest of the app; this function only
-- refuses anything that would break the stored timeline:
--   'exists'   — the same cycle is already recorded (idempotent);
--   'conflict' — it would overlap a recorded cycle, open ones included, which
--                also refuses anything at or after the current cycle;
--   'applied'  — inserted closed.
-- Same per-user lock and the same overlap invariant as mp_kakeibo_apply_sync.
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
  -- 46 = MAX_REVIEW_CYCLE_DAYS on the client (31 + the 15-day re-anchor window).
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR (p_end - p_start + 1) > 46 OR p_end >= current_date THEN
    RAISE EXCEPTION 'Invalid Kakeibo past cycle' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kakeibo_apply_sync'), hashtext(v_uid::text));

  IF EXISTS (SELECT 1 FROM kakeibo_reflections
             WHERE user_id = v_uid AND cycle_start = p_start AND cycle_end = p_end) THEN
    RETURN 'exists';
  END IF;
  IF EXISTS (SELECT 1 FROM kakeibo_reflections
             WHERE user_id = v_uid
               AND daterange(cycle_start, COALESCE(cycle_end, 'infinity'::date), '[]') && daterange(p_start, p_end, '[]')) THEN
    RETURN 'conflict';
  END IF;

  INSERT INTO kakeibo_reflections (user_id, cycle_start, cycle_end) VALUES (v_uid, p_start, p_end);

  SELECT count(*) INTO v_overlaps
  FROM (
    SELECT cycle_end, lead(cycle_start) OVER (ORDER BY cycle_start) AS next_start
    FROM kakeibo_reflections WHERE user_id = v_uid
  ) s
  WHERE s.cycle_end IS NOT NULL AND s.next_start IS NOT NULL AND s.cycle_end >= s.next_start;
  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'Kakeibo cycles would overlap' USING ERRCODE = '23514';
  END IF;
  RETURN 'applied';
END;
$fn$;

REVOKE ALL ON FUNCTION mp_kakeibo_record_past_cycle(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION mp_kakeibo_record_past_cycle(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION mp_kakeibo_record_past_cycle(date, date) TO authenticated;
