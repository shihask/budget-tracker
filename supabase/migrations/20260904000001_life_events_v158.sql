-- Life Events v1.58 — the feature becomes data-driven.
--
-- track_events was an opt-in flag, off by default, surfaced only on page 6 of 7
-- of the signup carousel and in Settings. mp_onboarded_<uid> is written once to
-- localStorage, so every user who existed before v1.57.0 never saw that page at
-- all — the feature was effectively undiscoverable. A flag that can hide a
-- feature the user already has data in was only ever a way to lose track of it.
--
-- The card and the page now appear whenever an event exists; discovery happens
-- through the Create menu instead.
ALTER TABLE settings DROP COLUMN IF EXISTS track_events;

-- `icon` is a lucide key (see src/features/events/lib/eventIcons.tsx), never a
-- glyph and never null. EventIcon already falls back to 'ring' at render, so
-- make the data agree with the renderer rather than carrying the fallback in
-- two places. Backfill BEFORE constraining, or the SET NOT NULL fails on any
-- row written while the column was still nullable.
UPDATE events SET icon = 'ring' WHERE icon IS NULL;
ALTER TABLE events ALTER COLUMN icon SET DEFAULT 'ring';
ALTER TABLE events ALTER COLUMN icon SET NOT NULL;
