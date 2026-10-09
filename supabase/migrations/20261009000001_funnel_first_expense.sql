-- Adds 'first_expense' to the anonymous sign-up funnel: a new account saved its
-- first expense, i.e. actually started using the app. Same shape as every other
-- step — the step, utm_campaign, platform and in-app browser; never who.
-- The client fires it at most once per device and only for accounts under a
-- week old (see createActivationWatcher in src/lib/funnel.ts).

ALTER TABLE funnel_events DROP CONSTRAINT IF EXISTS funnel_events_step_check;
ALTER TABLE funnel_events ADD CONSTRAINT funnel_events_step_check CHECK (step IN (
  'landing_view', 'signup_opened', 'signin_opened', 'google_clicked',
  'signup_code_sent', 'code_send_failed', 'signup_code_verified',
  'account_created', 'signin_success', 'first_expense'));
