-- Statement/screenshot import: extends the existing AA-sync review pipeline
-- (sync_events + mp_finalize_sync_event) with a new provider ('image', for
-- UPI-app/bank-statement screenshots) and reuses the already-reserved 'pdf'
-- provider for PDF uploads. See docs/plan for the full design.

ALTER TABLE sync_events DROP CONSTRAINT IF EXISTS sync_events_provider_check;
ALTER TABLE sync_events ADD CONSTRAINT sync_events_provider_check
  CHECK (provider IN ('aa', 'csv', 'pdf', 'image'));

-- One row per uploaded file. Generic (not statement-specific) so the
-- already-reserved 'csv' provider's future importer can reuse this same
-- table without another migration. Tracks extraction progress
-- (total_chunks/chunks_processed/chunk_log) so a browser crash or tab close
-- partway through a large multi-page file doesn't lose progress — extraction
-- resumes from the original file (kept in Storage) rather than starting over.
CREATE TABLE IF NOT EXISTS import_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_id        uuid REFERENCES accounts(id) NOT NULL,
  provider          text NOT NULL CHECK (provider IN ('image', 'pdf', 'csv')),
  file_name         text NOT NULL,
  storage_path      text NOT NULL,
  status            text NOT NULL DEFAULT 'uploading'
                     CHECK (status IN ('uploading', 'extracting', 'review', 'completed', 'cancelled', 'error')),
  extractor_version integer NOT NULL DEFAULT 1,
  total_chunks      integer,
  chunks_processed  integer NOT NULL DEFAULT 0,
  chunk_log         jsonb NOT NULL DEFAULT '[]'::jsonb,
  unparsed_count    integer NOT NULL DEFAULT 0,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_owner" ON import_batches
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_import_batches_user_status ON import_batches(user_id, status);

-- Storage for the original uploaded file — kept indefinitely (no auto-delete)
-- so extraction can be re-run later without asking the user to re-upload;
-- "Discard import" is the only deletion path, and it's user-initiated.
INSERT INTO storage.buckets (id, name, public)
VALUES ('statement-imports', 'statement-imports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own statement imports" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'statement-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own statement imports" ON storage.objects FOR SELECT
  USING (bucket_id = 'statement-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own statement imports" ON storage.objects FOR UPDATE
  USING (bucket_id = 'statement-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own statement imports" ON storage.objects FOR DELETE
  USING (bucket_id = 'statement-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
