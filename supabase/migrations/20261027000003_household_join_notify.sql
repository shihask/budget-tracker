-- Household: notify the inviter when their partner joins (push + email).
-- See supabase/functions/household-member-joined/index.ts.
--
-- One nullable column on Household's own table, used as a once-only claim:
-- the Edge Function sets it with `WHERE join_notified_at IS NULL`, so however
-- often a client calls, a join is announced at most once. Not granted to
-- clients — the column-level SELECT grant on household_members lists its
-- columns explicitly, so a new column is invisible to them by default.
--
-- Rollback: ALTER TABLE public.household_members DROP COLUMN join_notified_at;

ALTER TABLE public.household_members ADD COLUMN join_notified_at timestamptz;
