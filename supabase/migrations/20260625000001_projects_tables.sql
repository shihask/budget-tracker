-- ═══════════════════════════════════════════════════════════════════════════
-- Projects feature — standalone tables, RLS, indexes, RPC
-- ═══════════════════════════════════════════════════════════════════════════

-- ── projects ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid REFERENCES auth.users NOT NULL,
  name            text NOT NULL,
  description     text,
  notes           text,
  target_amount   numeric NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'INR',
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'archived')),
  share_code      text UNIQUE,
  is_public       boolean NOT NULL DEFAULT false,
  shared_at       timestamptz,
  share_views     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_owner" ON projects
  FOR ALL USING (auth.uid() = owner_user_id);

CREATE POLICY "projects_public_read" ON projects
  FOR SELECT USING (is_public = true AND share_code IS NOT NULL);

-- ── project_members ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name            text NOT NULL,
  email           text,
  share_ratio     numeric NOT NULL DEFAULT 1,
  display_order   integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_members_owner" ON project_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_user_id = auth.uid())
  );

CREATE POLICY "project_members_public_read" ON project_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.is_public = true AND p.share_code IS NOT NULL)
  );

-- ── project_transactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  member_id         uuid REFERENCES project_members(id) ON DELETE SET NULL,
  transaction_type  text NOT NULL CHECK (transaction_type IN ('contribution', 'expense')),
  amount            numeric NOT NULL CHECK (amount > 0),
  description       text,
  category          text,
  notes             text,
  transaction_date  date NOT NULL DEFAULT CURRENT_DATE,
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_txns_owner" ON project_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_user_id = auth.uid())
  );

CREATE POLICY "project_txns_public_read" ON project_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.is_public = true AND p.share_code IS NOT NULL)
  );

-- ── project_attachments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_attachments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_transaction_id  uuid REFERENCES project_transactions(id) ON DELETE CASCADE NOT NULL,
  path                    text NOT NULL,
  file_name               text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_attachments_owner" ON project_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM project_transactions pt
      JOIN projects p ON p.id = pt.project_id
      WHERE pt.id = project_transaction_id AND p.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "project_attachments_public_read" ON project_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_transactions pt
      JOIN projects p ON p.id = pt.project_id
      WHERE pt.id = project_transaction_id AND p.is_public = true AND p.share_code IS NOT NULL
    )
  );

-- ── project_collaborators (Phase 2 — schema only) ──────────────────────
CREATE TABLE IF NOT EXISTS project_collaborators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id     uuid REFERENCES auth.users NOT NULL,
  role        text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_collaborators_owner" ON project_collaborators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_user_id = auth.uid())
  );

-- ── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_owner        ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_share_code   ON projects(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_members_pid   ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_txns_pid      ON project_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_txns_mid      ON project_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_project_attach_tid    ON project_attachments(project_transaction_id);
CREATE INDEX IF NOT EXISTS idx_project_collab_pid    ON project_collaborators(project_id);

-- ── RPC: generate share code ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mp_generate_share_code(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM projects WHERE share_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  UPDATE projects
  SET share_code = v_code,
      is_public  = true,
      shared_at  = now(),
      updated_at = now()
  WHERE id = p_project_id
    AND owner_user_id = auth.uid();

  RETURN v_code;
END;
$$;

-- ── RPC: increment share views ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION mp_increment_share_views(p_share_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE projects
  SET share_views = share_views + 1
  WHERE share_code = p_share_code AND is_public = true;
END;
$$;

-- ── Settings column ─────────────────────────────────────────────────────
ALTER TABLE settings ADD COLUMN IF NOT EXISTS track_projects boolean NOT NULL DEFAULT false;
