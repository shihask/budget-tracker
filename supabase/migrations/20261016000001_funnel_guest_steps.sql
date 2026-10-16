-- Guest-mode steps for the anonymous sign-up funnel. Same shape as every other
-- step: the step, utm_campaign, platform and in-app browser; never who.
--   guest_started        "Try MoneyPlant Free" opened an anonymous session
--   guest_first_expense  a guest saved their first expense (first_expense stays
--                        registered-only, so the two paths can be compared)
--   guest_saved          a guest linked an email/mobile: same uid, now permanent
--   guest_saved_return   a saved guest came back on a later day
-- Guests have the `authenticated` role, which the existing insert policy allows.

ALTER TABLE funnel_events DROP CONSTRAINT IF EXISTS funnel_events_step_check;
ALTER TABLE funnel_events ADD CONSTRAINT funnel_events_step_check CHECK (step IN (
  'landing_view', 'signup_opened', 'signin_opened', 'google_clicked',
  'signup_code_sent', 'code_send_failed', 'signup_code_verified',
  'account_created', 'signin_success', 'first_expense',
  'guest_started', 'guest_first_expense', 'guest_saved', 'guest_saved_return'));
