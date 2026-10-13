-- Email a transaction statement to yourself (send-statement-email Edge Function).
-- One row per email actually handed to Brevo, so the function can cap sends per
-- user per UTC day. Only the user id and time — never the recipient, filters or
-- contents. The function reads and writes with the service role; RLS is on with
-- no policies, so clients can't touch it.

CREATE TABLE IF NOT EXISTS statement_email_sends (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_email_sends_user_created_idx
  ON statement_email_sends (user_id, created_at DESC);

ALTER TABLE statement_email_sends ENABLE ROW LEVEL SECURITY;
