-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DESTRUCTIVE — PERMANENTLY DELETES EVERY HOUSEHOLD AND ALL SHARED DATA     ║
-- ║  (households, members, invites, shared transactions, categories, budgets) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Rolls back supabase/migrations/20261027000001_household.sql by dropping only
-- the objects it created. Nothing else is touched: no existing table, policy,
-- function or personal row.
--
-- Intended for a non-production rehearsal, or for production only BEFORE real
-- users have created households. There is no undo; take a backup first.
--
-- Safety: refuses to run until you uncomment the SET LOCAL line below. Uses no
-- CASCADE, so if anything outside this feature has come to depend on these
-- objects the DROP fails and the whole transaction rolls back instead of
-- silently taking that dependency with it.

BEGIN;

-- SET LOCAL mp.confirm_household_rollback = 'DELETE ALL HOUSEHOLD DATA';

DO $$
DECLARE
  v_households bigint := 0;
  v_txns       bigint := 0;
BEGIN
  IF current_setting('mp.confirm_household_rollback', true) IS DISTINCT FROM 'DELETE ALL HOUSEHOLD DATA' THEN
    RAISE EXCEPTION 'Refusing to roll back Household: uncomment the SET LOCAL line to confirm. This deletes all household data.';
  END IF;
  IF to_regclass('public.households') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.households' INTO v_households;
  END IF;
  IF to_regclass('public.household_transactions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.household_transactions' INTO v_txns;
  END IF;
  RAISE NOTICE 'Dropping Household: % household(s), % shared transaction(s) will be deleted.', v_households, v_txns;
END $$;

-- Tables, children first. Their policies, triggers, indexes and constraints go
-- with them.
DROP TABLE public.household_budgets;
DROP TABLE public.household_transactions;
DROP TABLE public.household_invites;
DROP TABLE public.household_categories;
DROP TABLE public.household_members;
DROP TABLE public.households;

-- Functions (no longer referenced by any trigger or policy).
DROP FUNCTION public.mp_household_remove_member(uuid);
DROP FUNCTION public.mp_household_leave(uuid);
DROP FUNCTION public.mp_household_revoke_invite(uuid);
DROP FUNCTION public.mp_household_accept_invite(text, text);
DROP FUNCTION public.mp_household_preview_invite(text);
DROP FUNCTION public.mp_household_create_invite(uuid);
DROP FUNCTION public.mp_household_rename(uuid, text);
DROP FUNCTION public.mp_household_create(text, text);
DROP FUNCTION public.mp_household_current();
DROP FUNCTION public.mp_household_member_after_exit();
DROP FUNCTION public.mp_household_member_identity_erased();
DROP FUNCTION public.mp_household_settle_after_exit(uuid);
DROP FUNCTION public.mp_household_member_cap();
DROP FUNCTION public.mp_household_stamp_write();
DROP FUNCTION public.mp_is_active_household_member(uuid);

COMMIT;
