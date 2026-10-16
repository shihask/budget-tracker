-- Guest mode (Supabase anonymous sign-in) — server-side limits and cleanup.
--
-- A guest is a real auth user with is_anonymous = true and its own auth.uid(),
-- so every existing owner policy (auth.uid() = user_id) already lets a guest
-- read and write their own rows. This migration only ADDS restrictions:
--
--   1. mp_is_guest()                     the one SQL test for "the caller is a guest"
--   2. restrictive INSERT policies       guests can't start imports, bank sync,
--                                        shared projects, or upload any file
--   3. mp_guest_last_active_at()         the one definition of a guest's last activity
--   4. mp_purge_stale_guests() + cron    delete guests idle for 30 days
--
-- Nothing here changes what a registered user can do: every new policy is
-- AS RESTRICTIVE, FOR INSERT, TO authenticated, and passes whenever the caller
-- is not a guest (claim false, null or missing). No existing policy is altered.
-- Edge Functions refuse guests separately (ai-categorize, send-invite-email,
-- aa-connect), because they run as the service role and bypass RLS.

-- 1. The guest test ----------------------------------------------------------
-- auth.jwt() is the caller's token; GoTrue writes is_anonymous as a boolean.
-- Missing / null → false, so tokens issued before anonymous sign-in existed
-- read as registered users.
CREATE OR REPLACE FUNCTION public.mp_is_guest()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- 2. What a guest can't create ----------------------------------------------
-- Restrictive policies are ANDed with the permissive owner policies, so for a
-- registered user they are a no-op (NOT mp_is_guest() is true).

DROP POLICY IF EXISTS "Guests cannot create import batches" ON public.import_batches;
CREATE POLICY "Guests cannot create import batches" ON public.import_batches
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());

DROP POLICY IF EXISTS "Guests cannot connect bank sync" ON public.sync_connections;
CREATE POLICY "Guests cannot connect bank sync" ON public.sync_connections
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());

DROP POLICY IF EXISTS "Guests cannot link bank accounts" ON public.account_connections;
CREATE POLICY "Guests cannot link bank accounts" ON public.account_connections
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());

-- A project can be published by share code; a throwaway account shouldn't.
DROP POLICY IF EXISTS "Guests cannot create projects" ON public.projects;
CREATE POLICY "Guests cannot create projects" ON public.projects
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());

DROP POLICY IF EXISTS "Guests cannot add collaborators" ON public.project_collaborators;
CREATE POLICY "Guests cannot add collaborators" ON public.project_collaborators
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());

-- Files cost storage and need the Storage API to delete. With uploads blocked a
-- guest never owns a file, which is what lets the purge below stay pure SQL.
-- Scoped to these three buckets: any other bucket is untouched.
DROP POLICY IF EXISTS "Guests cannot upload files" ON storage.objects;
CREATE POLICY "Guests cannot upload files" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('statement-imports', 'transaction-receipts', 'project-attachments')
    OR NOT public.mp_is_guest()
  );

-- 3. A guest's last activity -------------------------------------------------
-- The newest of:
--   * auth activity: the user row (created, signed in, updated), every session
--     (created / refreshed / updated) and refresh token. Opening the app after
--     the 1 h access-token expiry refreshes the session, so any real use —
--     including editing a row that has no timestamp — shows up here.
--   * data activity, as a second signal: the newest created_at / updated_at in
--     every guest-writable table that has one. settings, forecast_settings,
--     budget_strategy_settings, categories, commitments, borrowings and
--     user_achievements have no timestamp columns, so they are covered by the
--     auth signal only.
-- A function, not a view: a view in public would be readable through the API.
CREATE OR REPLACE FUNCTION public.mp_guest_last_active_at(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT max(t) FROM (
    SELECT greatest(u.created_at, u.last_sign_in_at, u.updated_at) AS t FROM auth.users u WHERE u.id = p_user_id
    UNION ALL SELECT max(greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz)) FROM auth.sessions s WHERE s.user_id = p_user_id
    UNION ALL SELECT max(greatest(r.created_at, r.updated_at)) FROM auth.refresh_tokens r WHERE r.user_id = p_user_id::text
    UNION ALL SELECT max(created_at) FROM public.transactions       WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.accounts           WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.credit_cards       WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.groups             WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.goals              WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.goal_contributions WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.savings            WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.planned_expenses   WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.habits             WHERE user_id = p_user_id
    UNION ALL SELECT max(created_at) FROM public.habit_completions  WHERE user_id = p_user_id
    UNION ALL SELECT max(greatest(created_at, updated_at)) FROM public.events              WHERE user_id = p_user_id
    UNION ALL SELECT max(greatest(created_at, updated_at)) FROM public.masters             WHERE user_id = p_user_id
    UNION ALL SELECT max(greatest(created_at, updated_at)) FROM public.kakeibo_reflections WHERE user_id = p_user_id
    UNION ALL SELECT max(updated_at) FROM public.kakeibo_category_pillars WHERE user_id = p_user_id
    UNION ALL SELECT max(updated_at) FROM public.kakeibo_txn_pillars      WHERE user_id = p_user_id
  ) activity
$$;

REVOKE ALL ON FUNCTION public.mp_guest_last_active_at(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Purge guests idle for 30 days ------------------------------------------
-- Only a row that is a guest *on the locked row* is deleted:
--   * candidates are locked FOR UPDATE SKIP LOCKED. A guest being saved right
--     now (GoTrue's UPDATE of the row) or gaining a transaction (the FK takes
--     FOR KEY SHARE on the user row) holds a conflicting lock, so it is skipped
--     this run instead of waited on;
--   * the DELETE re-checks is_anonymous, no email, no phone and idleness on the
--     locked rows, so nothing that changed between pick and delete goes.
-- A permanent user has is_anonymous = false and an email or phone, so it can
-- never match. Every user-linked table CASCADEs (verified 2026-10-16;
-- project_activity_log and admin_audit_logs SET NULL), and guests own no files.
CREATE OR REPLACE FUNCTION public.mp_purge_stale_guests(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cutoff  timestamptz := now() - interval '30 days';
  v_ids     uuid[];
  v_deleted integer;
BEGIN
  SELECT array_agg(c.id) INTO v_ids FROM (
    SELECT u.id FROM auth.users u
    WHERE u.is_anonymous
      AND u.email IS NULL AND u.phone IS NULL
      AND u.created_at < v_cutoff
      AND coalesce(public.mp_guest_last_active_at(u.id), u.created_at) < v_cutoff
    ORDER BY u.created_at
    LIMIT greatest(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  ) c;

  IF v_ids IS NULL THEN RETURN 0; END IF;

  DELETE FROM auth.users u
  WHERE u.id = ANY (v_ids)
    AND u.is_anonymous
    AND u.email IS NULL AND u.phone IS NULL
    AND coalesce(public.mp_guest_last_active_at(u.id), u.created_at) < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION public.mp_purge_stale_guests(integer) FROM PUBLIC, anon, authenticated;

-- Daily at 04:00 UTC (09:30 IST), clear of the 02:00-03:30 UTC jobs.
-- cron.schedule() upserts by job name, so this is safe to re-run.
SELECT cron.schedule('purge-stale-guests', '0 4 * * *', 'select public.mp_purge_stale_guests(500);');
