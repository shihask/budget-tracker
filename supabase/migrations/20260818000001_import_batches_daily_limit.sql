-- Caps how many statement-import batches one user can start per day, in the
-- database, because the client cannot cap itself: every user holds a valid
-- anon key and can POST /rest/v1/import_batches directly.
--
-- Placed on INSERT specifically because createPdfImportBatch /
-- createImageImportBatch (src/features/statement-import/lib/extract.ts)
-- insert the row BEFORE uploading to the statement-imports bucket, so a
-- rejected insert prevents the storage write with no extra work.
--
-- Sizing. 8 is a STORAGE-RATE cap, set from the expected size of a real
-- statement. It is NOT a guarantee about AI spend:
--   one import = ceil(pages / PAGES_PER_CHUNK) AI calls, PAGES_PER_CHUNK = 8
--   a year of monthly statements ~= 12 x 8 pages = 12 chunks
--   floor(DAILY_LIMIT 100 / 12) = 8
-- Page count is NOT capped anywhere: extract.ts derives totalChunks straight
-- from doc.numPages. A 200-page PDF is 25 chunks on its own, so eight imports
-- do NOT necessarily fit inside the 100/day AI budget. These are two
-- independent limits: this one bounds bytes, settings.ai_requests_used bounds
-- compute. If you ever want the stronger property, cap pages at import time.
--
-- Calendar day, not rolling 24h, deliberately: the AI cap already resets on
-- the UTC calendar day (ai-categorize/index.ts compares Y/M/D on
-- settings.ai_requests_reset_at). Two quotas expiring at different instants
-- is a worse user experience than one shared burst window.
--
-- Accepted hole: discardImportBatch DELETEs the row, so discard-and-retry
-- resets the count. Not worth closing -- discard removes the storage objects
-- first (storage-neutral by construction) and the AI cap is server-side and
-- untouched, leaving only bandwidth, burnable only by scripting an attack on
-- your own account. If it ever needs closing, use a monotonic counter
-- mirroring the AI quota (settings.import_batches_used +
-- import_batches_reset_at), NOT by taking DELETE away from users in RLS.

-- Serves the trigger's count below AND the sheet's resume query (user_id +
-- status, ORDER BY created_at DESC LIMIT 1). The existing
-- idx_import_batches_user_status has no created_at, so it can range-scan
-- neither one.
CREATE INDEX IF NOT EXISTS idx_import_batches_user_created
  ON import_batches (user_id, created_at DESC);


-- How many imports a user may start per UTC day. A function, not a literal
-- inlined into the trigger, so the SQL tests and any future "N left today"
-- read have exactly one number to agree with.
CREATE OR REPLACE FUNCTION mp_daily_import_batch_limit()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT 8;  -- floor(DAILY_LIMIT 100 / 12 chunks per worst-case import)
$fn$;


-- Counts every batch row that exists for the user today, whatever its status:
-- a batch stuck at 'error' or abandoned in 'review' still holds its uploaded
-- source files, so it must consume a slot.
--
-- The one exception lives in the client, not here: createPdfImportBatch /
-- createImageImportBatch DELETE their own row if the storage upload fails
-- (extract.ts), so a pre-storage failure consumes nothing. That is deliberate
-- -- this cap exists to bound bucket growth, and an attempt that left no bytes
-- behind has nothing to bound. It does mean insert -> upload-fail -> delete ->
-- retry is an uncapped loop; acceptable, because it moves no bytes and the AI
-- quota is untouched by it.
--
-- SECURITY INVOKER on purpose: the SELECT stays under import_batches_owner,
-- so it can only ever see the caller's own rows.
CREATE OR REPLACE FUNCTION mp_import_batches_used_today(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT count(*)::integer
  FROM import_batches
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
$fn$;


-- SECURITY INVOKER, per the rule set out in
-- 20260817000001_transaction_split_groups.sql: RLS stays the primary guard and
-- this is defence in depth on top of it.
--
-- NEW.user_id is client-supplied and has NOT been checked against auth.uid()
-- yet -- RLS WITH CHECK runs on the final row, after BEFORE triggers. That is
-- fine: the count above is RLS-filtered, so a spoofed user_id counts 0 rows,
-- passes here, and is then rejected by WITH CHECK anyway.
CREATE OR REPLACE FUNCTION mp_import_batches_enforce_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_limit integer := mp_daily_import_batch_limit();
  v_used  integer;
BEGIN
  -- Serialize check-then-insert per user. Without this the trigger enforces
  -- only APPROXIMATELY 8: two concurrent requests can both count 7, both
  -- pass, and both insert, landing on 9.
  --
  -- Two-int form so the key is namespaced and cannot collide with any other
  -- advisory lock in the database. xact-scoped, so it releases on COMMIT or
  -- ROLLBACK with no unlock call and no lock outliving the statement.
  -- Contention is per-user, so unrelated users never serialize against each
  -- other. The hash is only a lock key: collisions cost extra serialization
  -- but cannot permit a quota bypass, because the count below is still
  -- filtered by user_id.
  PERFORM pg_advisory_xact_lock(
    hashtext('import_batches_daily_limit'),
    hashtext(NEW.user_id::text)
  );

  -- Counted AFTER the lock, never before. Under READ COMMITTED this statement
  -- takes a fresh snapshot, so a request that waited on the lock observes the
  -- row the previous holder just committed.
  v_used := mp_import_batches_used_today(NEW.user_id);

  IF v_used >= v_limit THEN
    -- PT429 rather than a bare RAISE (which would be P0001, the same code
    -- every other RAISE in this schema uses and therefore useless to branch
    -- on). PostgREST turns a PTxyz sqlstate into HTTP xyz and echoes the code
    -- verbatim in the JSON body, so the client matches on
    -- error.code = 'PT429' (see isDailyImportLimitError in
    -- src/features/statement-import/lib/pure.ts).
    --
    -- MESSAGE is user-facing copy on purpose: the sheet renders it verbatim,
    -- which keeps the number "8" in exactly one place -- here.
    RAISE EXCEPTION
      'You have already started % statement imports today. You can import more after midnight UTC.', v_limit
      USING ERRCODE = 'PT429',
            DETAIL  = format('import_batches created since UTC midnight: %s of %s', v_used, v_limit),
            HINT    = 'Resets at 00:00 UTC, the same moment the daily AI scan limit resets.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_import_batches_daily_limit ON import_batches;
CREATE TRIGGER trg_import_batches_daily_limit
  BEFORE INSERT ON import_batches
  FOR EACH ROW
  EXECUTE FUNCTION mp_import_batches_enforce_daily_limit();


-- Bucket hardening -----------------------------------------------------------
-- The daily cap bounds how MANY batches a user starts; it cannot bound how big
-- each one is, because nothing caps page count or file size. 10 MB is generous
-- for a bank statement PDF or a compressed screenshot.
--
-- What this buys, stated precisely: it bounds per-user INGRESS to
-- 8 x 10 MB = 80 MB of newly accepted source data per UTC day. It is NOT a
-- bound on total bucket size -- abandoned batches keep their files, so an
-- adversarial user still accumulates ~80 MB/day indefinitely. Purge-on-
-- completion handles the normal case, the 7-day sweep (see the import-cleanup
-- migration) handles abandonment, and this handles the "one enormous object"
-- case.
--
-- MIME list is exactly what the two upload paths actually produce, nothing
-- speculative:
--   application/pdf  createPdfImportBatch, from the picked file
--   image/webp       createImageImportBatch -- handleImagesPick runs every
--                    picked image through compressImage first, and
--                    imageCompress.ts encodes webp whenever the browser
--                    supports it, which is all current browsers. This is the
--                    COMMON case, not an edge case.
--   image/jpeg       imageCompress.ts fallback when webp encoding is
--                    unavailable.
-- Deliberately NOT image/png: the input is accept="image/*" so a user can pick
-- a PNG, but it is re-encoded before upload and never reaches storage as PNG.
--
-- Strength of each half is NOT equal, and callers should not assume otherwise:
--   file_size_limit    enforced against the actual bytes received. A real bound.
--   allowed_mime_types checked against the Content-Type the CLIENT sends, and
--                      extract.ts sets it from file.type. A modified client can
--                      declare application/pdf and upload anything under 10 MB.
--                      Treat it as a contract control that keeps this bucket
--                      from drifting into general-purpose storage, NOT as a
--                      security boundary or content validation.
UPDATE storage.buckets
SET file_size_limit    = 10485760,  -- 10 MB
    allowed_mime_types = ARRAY['application/pdf','image/webp','image/jpeg']
WHERE id = 'statement-imports';
