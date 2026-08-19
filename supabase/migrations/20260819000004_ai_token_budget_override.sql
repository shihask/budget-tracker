-- Per-user daily AI token budget, settable by an admin.
--
-- mp_daily_ai_token_budget() is one global number for everyone, which is the
-- right default but the wrong only-option: calibration will show a spread, and
-- some users legitimately need more (heavy but genuine) while an abusive one
-- needs less without being cut off entirely.
--
-- NULL means "use the global default" rather than storing 10000 against every
-- row. That matters: when the global budget is recalibrated, everyone on the
-- default moves with it automatically, and only the deliberate overrides stay
-- put. Storing the default explicitly would silently freeze every user at
-- today's guess.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_token_budget_override integer;

-- Bounds, enforced at the column so a bad admin request cannot write nonsense
-- that only shows up later as a user mysteriously locked out (or unlimited).
-- 0 is allowed and meaningful: it is how an admin cuts off a specific user's
-- AI once enforcement is on, without disabling the feature for everyone.
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_ai_token_budget_override_range;
ALTER TABLE settings ADD CONSTRAINT settings_ai_token_budget_override_range
  CHECK (ai_token_budget_override IS NULL
         OR (ai_token_budget_override >= 0 AND ai_token_budget_override <= 1000000));


-- Resolves the budget that actually applies to one user.
--
-- STABLE, not IMMUTABLE: it reads a table. The global
-- mp_daily_ai_token_budget() stays IMMUTABLE and unchanged — it is still the
-- single definition of the default, and this only layers an override over it.
CREATE OR REPLACE FUNCTION mp_user_ai_token_budget(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT ai_token_budget_override FROM settings WHERE user_id = p_user_id),
    mp_daily_ai_token_budget()
  );
$fn$;


-- Percentage now resolves against the user's own budget. Everything else is
-- unchanged: still token-derived in both phases, still clamped to 100, still
-- zero when the stored day is stale.
--
-- A budget of 0 would divide by zero, so it short-circuits to 100% — which is
-- the correct reading anyway: any usage at all is already over an allowance of
-- nothing.
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
  WHERE s.user_id = p_user_id;
$fn$;


-- The reservation returns a percentage too, and it must resolve against the
-- SAME budget as mp_ai_usage_today or the gate and the display would disagree
-- for any user with an override — the enforcement check in the edge function
-- reads this one.
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

-- Recreating the function drops its grants, so re-apply them. Without this it
-- silently becomes callable by `authenticated` again, which is exactly the
-- hole the original REVOKE closed.
REVOKE EXECUTE ON FUNCTION mp_try_start_ai_request(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION mp_try_start_ai_request(uuid, date) TO service_role;
