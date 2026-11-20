-- v1.115.0 — Projects: receipts follow project access; orphaned receipt files are swept.
--
-- Before: the project-attachments bucket only let the UPLOADER read or delete a file
-- ((storage.foldername(name))[1] = auth.uid()). project_attachments ROWS were visible to the
-- owner and active collaborators, but opening someone else's receipt failed, and deleting it
-- removed the row while the file stayed. Deleting a transaction or project cascaded the rows
-- away and left every file behind.
--
-- After:
--   * view   = the project's owner, or an ACTIVE collaborator (editor or viewer)
--   * delete = the project's owner, or an ACTIVE editor
--   — exactly the existing project_attachments row policies. Access is decided by the file's
--   project_attachments row (matched on path), never by folder names, so a file with no row is
--   reachable only by its uploader (the original policies). Public share-link visitors still
--   can't open receipt files.
--   * The three original policies are untouched: upload and the uploader's own access are
--     unchanged. This migration only ADDS access.
--   * Orphaned files (no row, older than 24 h) are removed nightly by the
--     project-attachments-cleanup Edge Function. Deleting a storage.objects row does not free
--     the bytes, so that has to go through the Storage API, not SQL.
--
-- APPLY BY HAND in the Supabase SQL editor (never `supabase db push`).
-- Order: deploy the project-attachments-cleanup Edge Function first, then apply this.
-- Prerequisites (already true): pg_cron, pg_net, Vault secret 'srkey'.
--
-- Rollback:
--   select cron.unschedule('project-attachments-cleanup');
--   DROP POLICY IF EXISTS "Project members read project attachments" ON storage.objects;
--   DROP POLICY IF EXISTS "Project editors delete project attachments" ON storage.objects;
--   DROP FUNCTION IF EXISTS public.mp_project_attachment_orphans(integer, interval);
--   DROP FUNCTION IF EXISTS public.mp_can_access_project_attachment(text, boolean);
--   DROP INDEX IF EXISTS idx_project_attach_path;

-- 1. The storage policies look a file up by its path.
CREATE INDEX IF NOT EXISTS idx_project_attach_path ON project_attachments(path);

-- 2. One access rule. SECURITY DEFINER because the caller's own RLS hides projects and
--    collaborator rows it needs to read (same approach as mp_add_collaborator). Every check is
--    explicit here; it reads only, and answers only for auth.uid().
CREATE OR REPLACE FUNCTION public.mp_can_access_project_attachment(p_path text, p_write boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM project_attachments a
      JOIN project_transactions pt ON pt.id = a.project_transaction_id
      JOIN projects p ON p.id = pt.project_id
     WHERE a.path = p_path
       AND (
         p.owner_user_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM project_collaborators pc
            WHERE pc.project_id = p.id
              AND pc.user_id = auth.uid()
              AND pc.status = 'active'
              AND (NOT p_write OR pc.role = 'editor')
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION public.mp_can_access_project_attachment(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mp_can_access_project_attachment(text, boolean) TO authenticated;

-- 3. Storage policies (added alongside the uploader-only ones; policies are OR-ed).
DROP POLICY IF EXISTS "Project members read project attachments" ON storage.objects;
CREATE POLICY "Project members read project attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-attachments' AND public.mp_can_access_project_attachment(name, false));

DROP POLICY IF EXISTS "Project editors delete project attachments" ON storage.objects;
CREATE POLICY "Project editors delete project attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-attachments' AND public.mp_can_access_project_attachment(name, true));

-- 4. The sweep's work list: files with no project_attachments row, older than the grace period
--    (an upload writes the file first and the row second). Service role only.
--    bucket_total / orphan_total let the Edge Function refuse a suspiciously large sweep.
CREATE OR REPLACE FUNCTION public.mp_project_attachment_orphans(
  p_limit integer DEFAULT 500,
  p_grace interval DEFAULT interval '24 hours'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH orphans AS (
    SELECT o.name, o.created_at
      FROM storage.objects o
     WHERE o.bucket_id = 'project-attachments'
       AND o.created_at < now() - p_grace
       AND NOT EXISTS (SELECT 1 FROM project_attachments a WHERE a.path = o.name)
  )
  SELECT jsonb_build_object(
    'bucket_total', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'project-attachments'),
    'orphan_total', (SELECT count(*) FROM orphans),
    'paths', COALESCE(
      (SELECT jsonb_agg(name ORDER BY created_at)
         FROM (SELECT name, created_at FROM orphans ORDER BY created_at LIMIT greatest(p_limit, 0)) s),
      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.mp_project_attachment_orphans(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mp_project_attachment_orphans(integer, interval) TO service_role;

-- 5. Nightly at 01:30 UTC (07:00 IST) — clear of import-cleanup (02:00), the push-* jobs
--    (02:30–03:30) and ai-call-log-retention (03:00). cron.schedule upserts by name.
select cron.schedule(
  'project-attachments-cleanup',
  '30 1 * * *',
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/project-attachments-cleanup'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);

-- Verify:
--   select indexname from pg_indexes where indexname = 'idx_project_attach_path';            -- 1 row
--   select proname from pg_proc
--    where proname in ('mp_can_access_project_attachment', 'mp_project_attachment_orphans'); -- 2 rows
--   select policyname from pg_policies where tablename = 'objects'
--    and policyname in ('Project members read project attachments',
--                       'Project editors delete project attachments');                       -- 2 rows
--   select jobname, schedule from cron.job where jobname = 'project-attachments-cleanup';   -- 1 row
