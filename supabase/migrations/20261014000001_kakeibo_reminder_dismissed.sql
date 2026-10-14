-- Kakeibo — separate "dismiss the reminder" from "skip the review".
--
-- The dashboard's "Not now" hides the review reminder only. The cycle stays
-- pending in Analytics → Kakeibo, so it can still be reviewed. Skipping the
-- review itself stays an explicit action in the workspace
-- (review_status = 'skipped').
--
-- Additive and nullable. Existing rows read as "not dismissed", and covered by
-- the existing RLS update policy (own rows only). The client writes it as a
-- column-scoped update, like every other Kakeibo mutation.
--
-- Rollback: ALTER TABLE kakeibo_reflections DROP COLUMN IF EXISTS review_reminder_dismissed_at;

ALTER TABLE kakeibo_reflections ADD COLUMN IF NOT EXISTS review_reminder_dismissed_at timestamptz;
