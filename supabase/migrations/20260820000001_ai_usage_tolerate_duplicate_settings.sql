-- Make the AI usage functions tolerant of duplicate settings rows.
--
-- Chat started returning 500 for at least one account with:
--   21000  more than one row returned by a subquery used as an expression
--
-- The cause is in mp_user_ai_token_budget (20260819000004), which resolves the
-- override with a SCALAR subquery:
--   (SELECT ai_token_budget_override FROM settings WHERE user_id = p_user_id)
-- A scalar subquery is a hard error on more than one row, and some accounts
-- have more than one settings row.
--
-- The duplicates are pre-existing, not new: the app has always read settings
-- with `.limit(1).single()` (useSupabaseData.ts) and the edge function's old
-- gate used `.single()` whose error was ignored, so a duplicate silently
-- resolved to "some row" instead of failing. The scalar subquery was simply
-- the first code strict enough to notice.
--
-- This migration only stops the bleeding. The duplicates themselves are a data
-- problem worth fixing separately, with a dedupe plus a UNIQUE constraint on
-- settings(user_id) — see the diagnostic at the bottom. Until then, every
-- reader here picks the SAME row deterministically (lowest id), so the budget,
-- the percentage and the counters cannot disagree with each other.

CREATE OR REPLACE FUNCTION mp_user_ai_token_budget(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT s.ai_token_budget_override
       FROM settings s
      WHERE s.user_id = p_user_id
      ORDER BY s.id
      LIMIT 1),
    mp_daily_ai_token_budget()
  );
$fn$;


-- Same hazard, different shape: this returns a row per settings row, so a
-- duplicate made it return two. The edge function reads [0] and would have
-- silently used an arbitrary one. ORDER BY id + LIMIT 1 makes it the same row
-- mp_user_ai_token_budget resolves against.
CREATE OR REPLACE FUNCTION mp_ai_usage_today(p_user_id uuid)
RETURNS TABLE (requests integer, tokens integer, usage_pct integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT
    CASE WHEN mp_ai_usage_is_stale(s.ai_requests_reset_at) THEN 0
         ELSE COALESCE(s.ai_requests_used, 0) END,
    CASE WHEN mp_ai_usage_is_stale(s.ai_requests_reset_at) THEN 0
         ELSE COALESCE(s.ai_tokens_used, 0) END,
    CASE
      WHEN mp_ai_usage_is_stale(s.ai_requests_reset_at) THEN 0
      WHEN mp_user_ai_token_budget(p_user_id) <= 0 THEN 100
      ELSE LEAST(100, FLOOR(COALESCE(s.ai_tokens_used, 0)::numeric
                            / mp_user_ai_token_budget(p_user_id) * 100))::integer
    END
  FROM settings s
  WHERE s.user_id = p_user_id
  ORDER BY s.id
  LIMIT 1;
$fn$;


-- mp_try_start_ai_request needs no change for correctness: its SELECT ... INTO
-- already takes a single row without erroring, and its UPDATE writes every
-- duplicate row, which keeps them in step rather than drifting apart. It is
-- pinned to the same row for the read, though, so the reserved count and the
-- returned percentage describe the same record.
CREATE OR REPLACE FUNCTION mp_try_start_ai_request(
  p_user_id    uuid,
  p_usage_date date
)
RETURNS TABLE (allowed boolean, requests integer, tokens integer, usage_pct integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_stored_day date;
  v_requests   integer;
  v_tokens     integer;
  v_new_day    boolean;
  v_allowed    boolean;
  v_budget     integer;
BEGIN
  SELECT (s.ai_requests_reset_at AT TIME ZONE 'utc')::date,
         COALESCE(s.ai_requests_used, 0),
         COALESCE(s.ai_tokens_used, 0)
    INTO v_stored_day, v_requests, v_tokens
  FROM settings s
  WHERE s.user_id = p_user_id
  ORDER BY s.id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 0;
    RETURN;
  END IF;

  v_new_day := v_stored_day IS NULL OR v_stored_day < p_usage_date;
  IF v_new_day THEN
    v_requests := 0;
    v_tokens := 0;
  END IF;

  IF v_requests >= mp_daily_ai_request_limit() THEN
    v_allowed := false;
  ELSE
    v_allowed := true;
    v_requests := v_requests + 1;
    UPDATE settings s
    SET ai_requests_used = v_requests,
        ai_tokens_used   = v_tokens,
        ai_requests_reset_at = CASE WHEN v_new_day
                                    THEN (p_usage_date + time '00:00') AT TIME ZONE 'utc'
                                    ELSE s.ai_requests_reset_at END
    WHERE s.user_id = p_user_id;
  END IF;

  v_budget := mp_user_ai_token_budget(p_user_id);
  RETURN QUERY SELECT
    v_allowed,
    v_requests,
    v_tokens,
    CASE WHEN v_budget <= 0 THEN 100
         ELSE LEAST(100, FLOOR(v_tokens::numeric / v_budget * 100))::integer END;
END;
$fn$;

-- Recreating the function drops its grants.
REVOKE EXECUTE ON FUNCTION mp_try_start_ai_request(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION mp_try_start_ai_request(uuid, date) TO service_role;


-- Diagnostic — how widespread are the duplicates? Run this before deciding on
-- a dedupe; it is read-only.
--
--   SELECT user_id, count(*) AS rows
--   FROM settings GROUP BY user_id HAVING count(*) > 1 ORDER BY rows DESC;
