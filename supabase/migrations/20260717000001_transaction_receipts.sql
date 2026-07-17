-- v1: one receipt per expense, path-addressed by transaction id (see receipt_path below).
-- Can migrate to a separate transaction_attachments table later (multiple files per
-- transaction) without breaking receipt_path — it would just become "the primary receipt".
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_path text DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz DEFAULT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-receipts', 'transaction-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own receipts" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'transaction-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own receipts" ON storage.objects FOR SELECT
  USING (bucket_id = 'transaction-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own receipts" ON storage.objects FOR UPDATE
  USING (bucket_id = 'transaction-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own receipts" ON storage.objects FOR DELETE
  USING (bucket_id = 'transaction-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
