-- track_aa_sync — gates visibility of the "Connect Bank" entry point.
-- Matches the existing opt-in pattern (track_credit_cards, track_savings,
-- track_projects). No seeding side-effects needed on toggle, unlike
-- track_savings — plain updateSettings() patch is sufficient.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS track_aa_sync boolean NOT NULL DEFAULT false;
