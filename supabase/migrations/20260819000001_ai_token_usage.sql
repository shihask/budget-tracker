-- Meter AI in tokens, not just request count, and show users a percentage.
--
-- A flat 100 requests/day treats "coffee 80" and "analyse my entire financial
-- situation" as equal. Since the move to openai/gpt-oss-120b ($0.15 in /
-- $0.60 out per 1M) those differ by ~50x in real cost, and the app had no
-- visibility into it at all: Groq returns `usage` on every non-streaming
-- response and ai-categorize discarded all of it.
--
-- Two protections, neither exposed to the user:
--   100 requests/day   HARD abuse limit, always enforced
--   10,000 tokens/day  cost budget, MEASURED in v1, enforced once calibrated
--
-- The user only ever sees "Mint AI - 23% used today".
--
-- Follows 20260714000004_aa_sync_settings_flag.sql: the settings table is
-- dashboard-created, so only ADD COLUMN migrations exist for it.


-- 1. Counters ----------------------------------------------------------------

-- Authoritative daily token counter.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_tokens_used integer NOT NULL DEFAULT 0;

-- DISPLAY CACHE ONLY. mp_ai_usage_today() is the authoritative percentage.
-- Never enforce against this column, never do arithmetic on it, never treat it
-- as truth. It goes stale across midnight BY DESIGN: a user at 87% at 23:59
-- who opens Settings at 00:01 without making a call would otherwise still read
-- 87%, so every reader must discard it when
-- mp_ai_usage_is_stale(ai_requests_reset_at). It exists purely so the client
-- can render a number without being told the budget.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_usage_pct integer NOT NULL DEFAULT 0;

-- Also display cache. Mirrors the edge function's ENFORCE_TOKEN_LIMIT from the
-- last AI response, purely so the card knows which copy to use at 100%:
-- "Mint will continue working" while measuring, versus "limit reached" once
-- enforcing. The client must never infer this — getting it wrong means telling
-- a user Mint has stopped when it has not. Below 100% the two phases are
-- indistinguishable, which is what lets enforcement be switched on with no UI
-- change at all.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_usage_enforcing boolean NOT NULL DEFAULT false;


-- 2. Per-call log ------------------------------------------------------------

-- One row per upstream Groq call. Exists to answer the single question the
-- daily counter cannot: "what does each feature actually cost?" -- which the
-- token budget must be calibrated against before it is allowed to block.
--
-- `feature` is separate from `mode` on purpose. SIX distinct features send
-- mode='chat' (real chat plus the affordability / analytics / goal-plan /
-- goal-progress / coach one-shots), so mode alone collapses exactly the
-- distinctions calibration depends on. The edge function validates it against
-- a fixed allowlist and writes NULL for anything unrecognised, so a malformed
-- or hostile client cannot invent labels.
--
-- `model` matters because groqFetch falls back from gpt-oss-120b to
-- gpt-oss-20b under load, and those are priced 2x apart. It records the model
-- that ACTUALLY answered, not the one first attempted.
--
-- prompt/completion are NULLABLE, not 0-defaulted: a streaming chat whose
-- client disconnects before the usage chunk arrives genuinely has unknown
-- token counts. NULL means "this call happened, cost unknown" and is counted
-- separately in calibration. A fake 0 would silently drag the average down.
CREATE TABLE IF NOT EXISTS ai_call_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mode              text NOT NULL,
  feature           text,
  model             text NOT NULL,
  prompt_tokens     integer,
  completion_tokens integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_call_log ENABLE ROW LEVEL SECURITY;

-- Read-only to the owner. Every insert comes from the edge function under the
-- service role, which bypasses RLS. No client ever writes here.
DROP POLICY IF EXISTS "ai_call_log_owner_read" ON ai_call_log;
CREATE POLICY "ai_call_log_owner_read" ON ai_call_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_call_log_user_created ON ai_call_log (user_id, created_at DESC);
-- Serves the calibration window scan and the retention sweep.
CREATE INDEX IF NOT EXISTS idx_ai_call_log_created ON ai_call_log (created_at);


-- 3. Limits, defined once ----------------------------------------------------

-- The hard abuse cap. A function so mp_try_start_ai_request and any future
-- reader agree on one number.
CREATE OR REPLACE FUNCTION mp_daily_ai_request_limit()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public
AS $fn$ SELECT 100; $fn$;

-- The cost budget. Lives in SQL, not the edge function, so the percentage has
-- exactly one definition and the client never receives the number.
--
-- NOT CALIBRATED YET. 10,000 is an initial guess; ENFORCE_TOKEN_LIMIT is false
-- in the edge function until the ai_call_log calibration query says what a
-- real day of usage costs. Changing it later is a one-line migration with no
-- redeploy.
CREATE OR REPLACE FUNCTION mp_daily_ai_token_budget()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public
AS $fn$ SELECT 10000; $fn$;


-- 4. UTC day helper ----------------------------------------------------------

-- STABLE, never IMMUTABLE: this reads now(). Marking it IMMUTABLE would let
-- the planner constant-fold it, so the daily rollover would silently stop
-- happening -- a failure that looks like nothing for weeks and is miserable to
-- trace.
--
-- Defined once because three copies of this comparison already existed
-- (ai-categorize, admin-api, SettingsPanel) and had already drifted.
CREATE OR REPLACE FUNCTION mp_ai_usage_is_stale(p_reset_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT p_reset_at IS NULL
      OR (p_reset_at AT TIME ZONE 'utc')::date < (now() AT TIME ZONE 'utc')::date;
$fn$;


-- 5. Authoritative usage read ------------------------------------------------

-- Effective counters AND the user-facing percentage with the daily reset
-- applied, so no caller re-implements either. Read-only: it must never mutate
-- as a side effect of being read.
--
-- The percentage is ALWAYS token-derived, in both the measuring and enforcing
-- phases. Deriving it from requests (8 of 100 -> 8%) is specifically
-- forbidden: the whole point of this work is that 8 requests might have cost
-- 8,000 tokens.
--
-- Clamped to 100. A user who spends 14,000 against a 10,000 budget is at
-- "100% used today", not 140% -- but ai_tokens_used keeps the true 14,000 for
-- calibration.
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
    CASE WHEN mp_ai_usage_is_stale(s.ai_requests_reset_at) THEN 0
         ELSE LEAST(100, FLOOR(COALESCE(s.ai_tokens_used, 0)::numeric
                               / mp_daily_ai_token_budget() * 100))::integer END
  FROM settings s
  WHERE s.user_id = p_user_id;
$fn$;


-- 6. Atomic request reservation ----------------------------------------------

-- The hard cap must NOT be read-check-then-increment. That is raceable: two
-- requests arriving at 99 both read 99, both pass the check, both increment,
-- and the user lands on 101. Making only the increment atomic does not help --
-- the check has to be inside the same lock.
--
-- Reset, check and reserve therefore happen under one FOR UPDATE:
--   at 99 with two simultaneous requests, A locks -> 100 -> allowed;
--   B waits, sees 100, is refused. Exactly one succeeds.
--
-- A stored day AHEAD of p_usage_date (clock skew, or a request stamped before
-- midnight arriving after) is deliberately NOT treated as a new day: resetting
-- there would wipe counters the current day is already using. Such a request
-- is simply checked against today's real counters.
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
BEGIN
  SELECT (s.ai_requests_reset_at AT TIME ZONE 'utc')::date,
         COALESCE(s.ai_requests_used, 0),
         COALESCE(s.ai_tokens_used, 0)
    INTO v_stored_day, v_requests, v_tokens
  FROM settings s
  WHERE s.user_id = p_user_id
  FOR UPDATE;

  -- No settings row means there is nothing to meter against. Refuse rather
  -- than allow unmetered AI: a blocked request is recoverable, untracked
  -- spend is not.
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

  RETURN QUERY SELECT
    v_allowed,
    v_requests,
    v_tokens,
    LEAST(100, FLOOR(v_tokens::numeric / mp_daily_ai_token_budget() * 100))::integer;
END;
$fn$;


-- 7. Token bump --------------------------------------------------------------

-- Adds measured token usage after the Groq call(s) have returned. Requests are
-- already reserved by mp_try_start_ai_request, so p_requests is 0 at every
-- current call site; the parameter exists so the two counters stay expressible
-- in one atomic operation if that ever changes.
--
-- p_usage_date is what makes the split safe across midnight, and it is NOT
-- optional. A chat can start at 23:59:55 and flush its tokens at 00:00:02.
-- Deciding the rollover from now() at flush time, the flush would take the
-- "new day" branch and SET the counters to its own arguments -- and it carries
-- p_requests = 0, so the new day would begin with ZERO requests recorded but
-- 8,000 tokens banked. The caller stamps the date ONCE at request start and
-- passes the same value to every update for that request.
--
--   stored day <  p_usage_date   first write of a new day  -> SET
--   stored day =  p_usage_date   same day                  -> ACCUMULATE
--   stored day >  p_usage_date   late flush, day closed    -> DROP
--
-- The drop is deliberate: the counter has moved on, and back-dating it would
-- corrupt a day the user is currently spending. Nothing is lost for
-- calibration -- ai_call_log still holds the row with its true created_at, and
-- that is the table calibration reads.
CREATE OR REPLACE FUNCTION mp_bump_ai_usage(
  p_user_id    uuid,
  p_usage_date date,
  p_requests   integer,
  p_tokens     integer
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_stored_day date;
BEGIN
  IF p_requests < 0 OR p_tokens < 0 THEN
    RAISE EXCEPTION 'mp_bump_ai_usage: negative usage (requests=%, tokens=%)', p_requests, p_tokens;
  END IF;
  -- Far above any real call (the largest today is a statement chunk at
  -- max_tokens 3000). Stops a malformed edge-function bug from banking
  -- millions of tokens and silently locking a user out once enforcement is on.
  IF p_tokens > 1000000 THEN
    RAISE EXCEPTION 'mp_bump_ai_usage: implausible token count %', p_tokens;
  END IF;

  SELECT (s.ai_requests_reset_at AT TIME ZONE 'utc')::date
    INTO v_stored_day
  FROM settings s
  WHERE s.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_stored_day IS NOT NULL AND v_stored_day > p_usage_date THEN
    RETURN;  -- late flush for a day that has already closed
  END IF;

  UPDATE settings s
  SET
    ai_requests_used = CASE WHEN v_stored_day IS DISTINCT FROM p_usage_date
                            THEN p_requests
                            ELSE COALESCE(s.ai_requests_used, 0) + p_requests END,
    ai_tokens_used   = CASE WHEN v_stored_day IS DISTINCT FROM p_usage_date
                            THEN p_tokens
                            ELSE COALESCE(s.ai_tokens_used, 0) + p_tokens END,
    ai_requests_reset_at = CASE WHEN v_stored_day IS DISTINCT FROM p_usage_date
                            THEN (p_usage_date + time '00:00') AT TIME ZONE 'utc'
                            ELSE s.ai_requests_reset_at END
  WHERE s.user_id = p_user_id;
END;
$fn$;


-- 8. Grants ------------------------------------------------------------------

-- These two are server infrastructure, not client-facing operations. Both take
-- p_user_id as a parameter, so leaving them callable by `authenticated` would
-- let any user inflate -- or, once enforcement is on, exhaust -- another
-- user's budget. The edge function calls them with the service-role client.
--
-- mp_ai_usage_today and the limit functions stay readable: they mutate
-- nothing, and RLS on settings already scopes what a user can see.
REVOKE EXECUTE ON FUNCTION mp_try_start_ai_request(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION mp_try_start_ai_request(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION mp_bump_ai_usage(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION mp_bump_ai_usage(uuid, date, integer, integer) TO service_role;
