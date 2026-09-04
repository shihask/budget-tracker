-- Master Directory — the single source of truth for the people and merchants a
-- user deals with repeatedly (Rahul, Father, Client John / Zomato, Lulu, Indian Oil).
--
-- This migration is DELIBERATELY ISOLATED. It adds one table and nothing else:
-- no column on transactions, no FK, no RPC, no backfill of the free-text
-- descriptions that serve as merchant names today. The next release is the one
-- that introduces `transactions.master_id`; until then nothing in the app reads
-- this table except the directory screen itself.
--
-- Why a table rather than reusing what exists: `borrowings.person_name` is bare
-- text with no identity, and the "merchant" the AI parses out of a description
-- (src/lib/gemini.ts) is never persisted. Neither can answer "how much at Lulu?"
-- because neither has a stable id to group by.

CREATE TABLE IF NOT EXISTS masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  -- The TRIMMED value the unique index is built on -- trim only, not full
  -- whitespace normalization. Generated here rather than trusted from the client
  -- so "Rahul " and "Rahul" collide even if a future writer (an import, a script,
  -- a second client) forgets to trim. The app additionally collapses inner
  -- whitespace before insert, so this is a narrower backstop than the client's
  -- normalization, not a mirror of it. `name` stays the raw value as typed.
  display_name text GENERATED ALWAYS AS (trim(name)) STORED,
  type text NOT NULL CHECK (type IN ('person','merchant')),
  -- Reserved for a future release: a default category for this master.
  -- No UI writes it in v1.60.
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  phone text,
  -- Reserved: avatars render initials in v1.60; there is no upload path.
  photo_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Soft delete rather than a hard DELETE. In v1.60 nothing references a master,
  -- so this buys nothing today — it is here for the NEXT release, which puts
  -- `transactions.master_id` (ON DELETE SET NULL) on this table. At that point a
  -- hard delete silently strips the tag off historical spending with no way to
  -- recover who it was; a tombstone lets that release restore or re-point it.
  --
  -- The cost is real and is the reason the rest of this codebase avoids soft
  -- delete (see 20260714000014_aa_sync_delete_synced_transactions.sql, which
  -- argues against it): EVERY read of this table must filter `deleted_at IS NULL`.
  -- In v1.60 there is exactly one such read, in useSupabaseData's load query.
  deleted_at timestamptz
);

-- Safety nets if an earlier draft of this table already exists.
ALTER TABLE masters ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE masters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "masters_owner" ON masters;
CREATE POLICY "masters_owner" ON masters FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_masters_user ON masters(user_id) WHERE deleted_at IS NULL;

-- Case-insensitive uniqueness *within a type*: "Rahul" the person and "Rahul"
-- the merchant are different entities and both are allowed. Built on
-- display_name, so trailing whitespace can't smuggle a duplicate past it.
-- Partial on deleted_at so deleting a master releases its name for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_masters_user_type_name
  ON masters(user_id, type, lower(display_name))
  WHERE deleted_at IS NULL;

-- Reuses mp_touch_updated_at() from 20260818000002_import_cleanup_cron_job.sql.
DROP TRIGGER IF EXISTS trg_masters_touch_updated_at ON masters;
CREATE TRIGGER trg_masters_touch_updated_at
  BEFORE UPDATE ON masters
  FOR EACH ROW
  EXECUTE FUNCTION mp_touch_updated_at();
