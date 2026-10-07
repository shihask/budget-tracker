-- Anonymous sign-up funnel counts: which step a visitor reached, nothing about who.
-- No user id, email, phone, IP or cookie — only the step, the ad it came from
-- (utm_campaign), the platform and whether it was an in-app browser. That is
-- what lets us see where ad visitors drop off without a Meta Pixel or any
-- tracking, keeping the "no tracking cookies" promise.
--
-- Write-only for the app: anon/authenticated may INSERT an allowed step; nobody
-- but the service role (dashboard / SQL editor) can read it.

CREATE TABLE IF NOT EXISTS funnel_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  step       text NOT NULL CHECK (step IN (
               'landing_view', 'signup_opened', 'signin_opened', 'google_clicked',
               'signup_code_sent', 'code_send_failed', 'signup_code_verified',
               'account_created', 'signin_success')),
  source     text CHECK (source IS NULL OR length(source) <= 40),
  platform   text CHECK (platform IN ('android', 'ios', 'desktop', 'other')),
  in_app     text CHECK (in_app IS NULL OR length(in_app) <= 20)
);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a funnel step" ON funnel_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS funnel_events_created_at_idx ON funnel_events (created_at);

-- One row per day × step × source, for reading in the SQL editor:
--   SELECT * FROM funnel_daily ORDER BY day DESC, step;
CREATE OR REPLACE VIEW funnel_daily WITH (security_invoker = true) AS
SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
       step,
       coalesce(source, '(direct)') AS source,
       count(*)                                        AS total,
       count(*) FILTER (WHERE platform = 'android')    AS android,
       count(*) FILTER (WHERE platform = 'ios')        AS ios,
       count(*) FILTER (WHERE in_app IS NOT NULL)      AS in_app
FROM funnel_events
GROUP BY 1, 2, 3;

REVOKE ALL ON funnel_daily FROM anon, authenticated;
