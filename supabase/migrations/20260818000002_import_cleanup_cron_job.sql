-- Backstop for abandoned statement imports. Purge-on-completion (see
-- completeImportBatch in src/features/statement-import/lib/extract.ts) only
-- reclaims batches a user actually finishes; batches left in 'error',
-- 'uploading', 'review' or 'cancelled' keep their source files forever. With
-- the 8/day x 10 MB ingress cap that residue grows at up to 80 MB/user/day
-- indefinitely, which a 1 GB free-tier bucket cannot absorb.
--
-- Retention is 7 days of INACTIVITY, not 7 days since creation. See the
-- updated_at trigger below for why that distinction is load-bearing.
--
-- Prerequisite: pg_cron and pg_net must be enabled, and a Vault secret named
-- 'srkey' must exist (the same secret the push-* and aa-sync-scheduler cron
-- jobs already use -- the project's service_role key). Not created by this
-- migration since its value must never be committed.

-- 1. Make updated_at mean "last activity" ------------------------------------
-- The column was declared `timestamptz NOT NULL DEFAULT now()` with no trigger
-- and was maintained only by hand, in updateBatch() (extract.ts). Three writes
-- bypass that helper entirely (ImportStatementSheet.tsx: the 'error' flip, the
-- resume -> 'extracting' flip, and the 'completed' flip), so updated_at could
-- be arbitrarily stale on exactly the rows this sweep inspects.
--
-- That matters because selecting stale batches on created_at is wrong
-- regardless of locking: created_at never changes, so a batch created 8 days
-- ago and resumed 10 seconds ago still matches a "created more than 7 days
-- ago" predicate, and the sweep would delete the source files of an import the
-- user is actively resuming. Keying on activity is what makes the window
-- correct; the trigger is what makes activity trustworthy.
CREATE OR REPLACE FUNCTION mp_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_import_batches_touch_updated_at ON import_batches;
CREATE TRIGGER trg_import_batches_touch_updated_at
  BEFORE UPDATE ON import_batches
  FOR EACH ROW
  EXECUTE FUNCTION mp_touch_updated_at();


-- 2. A claim status so the sweep and a resume cannot collide ------------------
-- Even keyed on activity, a worker can SELECT a stale row, the user can resume
-- it, and the worker can then delete its files. The worker must claim the row
-- atomically before touching Storage.
--
-- The claim lives in `status` rather than a separate claimed_at column because
-- the claim only prevents the race if the RESUME QUERY stops selecting the row
-- -- and that query filters on status (ImportStatementSheet.tsx), as does
-- useStatementReviewCount. Putting the claim in status means both readers
-- exclude claimed batches with zero client changes; a separate column would
-- need every reader edited, and any reader that forgot would reintroduce the
-- race.
--
-- An advisory lock is the wrong primitive here, even though Step 1's daily cap
-- uses one: PostgREST runs each request in its own transaction, so a browser
-- client cannot hold pg_advisory_xact_lock across an extraction that spans
-- many HTTP requests. Advisory locks fit a short atomic COUNT -> INSERT;
-- 'purging' fits a multi-step cleanup lifecycle.
ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE import_batches ADD CONSTRAINT import_batches_status_check
  CHECK (status IN ('uploading','extracting','review','completed','cancelled','error','purging'));

-- Supports the sweep's ORDER BY updated_at range scan. The existing indexes
-- are (user_id, status) and (user_id, created_at) -- neither can serve a
-- cross-user scan on updated_at.
CREATE INDEX IF NOT EXISTS idx_import_batches_updated_at
  ON import_batches (updated_at)
  WHERE status <> 'completed';


-- 3. The atomic claim --------------------------------------------------------
-- How long a batch may sit untouched before it is considered abandoned. A
-- function, not a literal, for the same reason as
-- mp_daily_import_batch_limit(): the sweep and any test must agree on one
-- number.
CREATE OR REPLACE FUNCTION mp_import_batch_retention_days()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT 7;
$fn$;

-- Claims up to p_limit abandoned batches and returns only what it actually
-- won. The caller must treat the returned rows as the complete work list --
-- anything not returned belongs to someone else or is not eligible.
--
-- This has to be ONE statement. A select-then-update from the Edge Function
-- would reopen exactly the race this exists to close: the worker reads a stale
-- row, the user resumes it, the worker deletes its files.
--
-- Three things make the claim safe:
--   FOR UPDATE SKIP LOCKED  a concurrent run steps over rows already being
--                           claimed instead of blocking on them.
--   the outer WHERE repeats the predicate  under READ COMMITTED, an UPDATE
--                           that waited on a row lock re-evaluates its own
--                           WHERE against the NEW row version. Repeating the
--                           status/age test there means a batch the user
--                           resumed mid-flight (which bumps updated_at via
--                           trg_import_batches_touch_updated_at) fails the
--                           re-check and is silently skipped, not claimed.
--   'completed' is excluded  a finished import is never abandoned work,
--                           whatever its age. Its source should already be
--                           gone; if it is not, that is a purge failure in
--                           completeImportBatch to investigate, not something
--                           for this sweep to reinterpret.
CREATE OR REPLACE FUNCTION mp_claim_stale_import_batches(p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, user_id uuid, storage_path text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $fn$
  UPDATE import_batches b
  SET status = 'purging'
  WHERE b.id IN (
    SELECT s.id FROM import_batches s
    WHERE s.status NOT IN ('completed', 'purging')
      AND s.updated_at < now() - (mp_import_batch_retention_days() || ' days')::interval
    ORDER BY s.updated_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
    AND b.status NOT IN ('completed', 'purging')
    AND b.updated_at < now() - (mp_import_batch_retention_days() || ' days')::interval
  RETURNING b.id, b.user_id, b.storage_path;
$fn$;


-- 4. Schedule the sweep ------------------------------------------------------
-- Daily is sufficient: the retention window is 7 days, so nothing is urgent,
-- and a single run claims up to 200 batches. 02:00 UTC (07:30 IST) keeps it
-- clear of the push-* jobs clustered at 02:30-03:30 UTC.
--
-- cron.schedule() upserts by job name, so this is safe to re-run.
select cron.schedule(
  'import-cleanup',
  '0 2 * * *',
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/import-cleanup'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);
