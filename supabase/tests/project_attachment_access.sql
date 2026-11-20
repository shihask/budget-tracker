-- Verification for 20261122000001_project_attachment_access.sql.
-- NON-PRODUCTION DATABASE ONLY (local `supabase start`, a branch or staging). Apply the migration
-- there first, then run this in its SQL editor or:
--   psql "$NON_PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/project_attachment_access.sql
--
-- One transaction ending in ROLLBACK. Throwaway auth.users rows and storage.objects rows are
-- created inside it; no real account or file is read or written (storage.objects rows here are
-- metadata only — no bytes exist). RLS is exercised by switching to the `authenticated` role with
-- forged request.jwt.claims. Each check RAISEs on failure; success ends with
-- 'PROJECT ATTACHMENT ACCESS CHECKS PASSED'.
--
-- DELETE is checked through the policy's own predicate (mp_can_access_project_attachment(..., true))
-- and the policy definition, not a real DELETE: newer Storage versions block direct DELETEs on
-- storage.objects (deletes must go through the Storage API).

BEGIN;

-- O owner · E editor (also the uploader) · V viewer · P pending invite · S stranger
INSERT INTO auth.users (id, email, aud, role, created_at, updated_at) VALUES
  ('00000000-0000-4000-c000-0000000000a1', 'att-owner@example.invalid',    'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c000-0000000000a2', 'att-editor@example.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c000-0000000000a3', 'att-viewer@example.invalid',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c000-0000000000a4', 'att-pending@example.invalid',  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-c000-0000000000a5', 'att-stranger@example.invalid', 'authenticated', 'authenticated', now(), now());

INSERT INTO projects (id, owner_user_id, name, is_public, share_code) VALUES
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-c000-0000000000a1', 'attachment test', true, 'att-test-share');

INSERT INTO project_collaborators (project_id, user_id, role, status) VALUES
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-c000-0000000000a2', 'editor', 'active'),
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-c000-0000000000a3', 'viewer', 'active'),
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-c000-0000000000a4', 'editor', 'pending');

INSERT INTO project_transactions (id, project_id, transaction_type, amount, transaction_date) VALUES
  ('00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-c000-0000000000b1', 'expense', 100, current_date);

-- f1: the editor's upload, with a row. f_old_orphan / f_new_orphan: no row, 2 days / 1 hour old.
INSERT INTO project_attachments (project_transaction_id, path, file_name) VALUES
  ('00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-f1.jpg', 'f1.jpg');
INSERT INTO storage.objects (bucket_id, name, created_at) VALUES
  ('project-attachments', '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-f1.jpg', now() - interval '3 days'),
  ('project-attachments', '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-old-orphan.jpg', now() - interval '2 days'),
  ('project-attachments', '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-new-orphan.jpg', now() - interval '1 hour');

DO $$
DECLARE
  f1 text := '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-f1.jpg';
  old_orphan text := '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-old-orphan.jpg';
  who text;
  expect_read boolean;
  expect_write boolean;
  n int;
  can_write boolean;
  failed boolean;
  rec record;
  j jsonb;
BEGIN
  -- Per user: can they SELECT f1 (real RLS), and does the DELETE predicate allow them?
  FOR rec IN SELECT * FROM (VALUES
      ('00000000-0000-4000-c000-0000000000a1', 'owner',    true,  true),
      ('00000000-0000-4000-c000-0000000000a2', 'editor',   true,  true),
      ('00000000-0000-4000-c000-0000000000a3', 'viewer',   true,  false),
      ('00000000-0000-4000-c000-0000000000a4', 'pending',  false, false),
      ('00000000-0000-4000-c000-0000000000a5', 'stranger', false, false)
    ) AS t(uid, label, r, w)
  LOOP
    who := rec.label; expect_read := rec.r; expect_write := rec.w;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', rec.uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-attachments' AND name = f1;
    can_write := public.mp_can_access_project_attachment(f1, true);
    RESET ROLE;
    IF (n = 1) IS DISTINCT FROM expect_read THEN RAISE EXCEPTION '% read f1: saw % rows', who, n; END IF;
    IF can_write IS DISTINCT FROM expect_write THEN RAISE EXCEPTION '% delete predicate: %', who, can_write; END IF;
  END LOOP;

  -- An orphan (no row) is reachable only by its uploader, through the original folder policy.
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-0000000000a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-attachments' AND name = old_orphan;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'owner could read a file with no attachment row'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-0000000000a2","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-attachments' AND name = old_orphan;
  RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'uploader lost access to their own file'; END IF;

  -- Signed out (no sub): the predicate is false.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  can_write := public.mp_can_access_project_attachment(f1, false);
  RESET ROLE;
  IF can_write THEN RAISE EXCEPTION 'no-uid caller passed the access check'; END IF;

  -- Removing the viewer cuts access at once.
  DELETE FROM project_collaborators
   WHERE project_id = '00000000-0000-4000-c000-0000000000b1' AND user_id = '00000000-0000-4000-c000-0000000000a3';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-0000000000a3","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'project-attachments' AND name = f1;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'removed collaborator can still read'; END IF;

  -- Policy definitions are what the migration says (scoped to the bucket, write flag on DELETE).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Project editors delete project attachments' AND cmd = 'DELETE'
                  AND qual LIKE '%project-attachments%' AND qual LIKE '%mp_can_access_project_attachment%true%') THEN
    RAISE EXCEPTION 'delete policy missing or wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'Project members read project attachments' AND cmd = 'SELECT'
                  AND qual LIKE '%project-attachments%' AND qual LIKE '%mp_can_access_project_attachment%false%') THEN
    RAISE EXCEPTION 'read policy missing or wrong';
  END IF;

  -- Sweep list: old orphan in, new orphan (grace) out, f1 (has a row) out.
  j := public.mp_project_attachment_orphans(100000);
  IF NOT ((j -> 'paths') ? old_orphan) THEN RAISE EXCEPTION 'sweep missed the old orphan'; END IF;
  IF (j -> 'paths') ? f1 THEN RAISE EXCEPTION 'sweep listed a file that has a row'; END IF;
  IF (j -> 'paths') ? '00000000-0000-4000-c000-0000000000a2/00000000-0000-4000-c000-0000000000b1/att-test-new-orphan.jpg' THEN
    RAISE EXCEPTION 'sweep listed a file inside the 24 h grace period';
  END IF;

  -- Deleting the transaction cascades the row away: f1 becomes an orphan (once past grace).
  DELETE FROM project_transactions WHERE id = '00000000-0000-4000-c000-0000000000c1';
  j := public.mp_project_attachment_orphans(100000);
  IF NOT ((j -> 'paths') ? f1) THEN RAISE EXCEPTION 'deleted transaction''s file not listed'; END IF;

  -- The sweep list is service-role only.
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-c000-0000000000a1","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  failed := false;
  BEGIN
    PERFORM public.mp_project_attachment_orphans(10);
  EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  RESET ROLE;
  IF NOT failed THEN RAISE EXCEPTION 'authenticated user could call the sweep list'; END IF;

  RAISE NOTICE 'PROJECT ATTACHMENT ACCESS CHECKS PASSED';
END $$;

ROLLBACK;
