-- ═══════════════════════════════════════════════════════════════════════════
-- Projects Phase 2 — Collaboration + Budget Breakdown
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Alter project_collaborators for pending invites ─────────────────────
ALTER TABLE project_collaborators
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE project_collaborators
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'invited'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_collab_email
  ON project_collaborators(project_id, invited_email)
  WHERE invited_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_collab_uid
  ON project_collaborators(user_id)
  WHERE user_id IS NOT NULL;

-- ── New table: project_budgets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  category        text NOT NULL,
  budget_amount   numeric NOT NULL CHECK (budget_amount >= 0),
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_budgets_pid ON project_budgets(project_id);

-- ── project_budgets RLS ─────────────────────────────────────────────────
CREATE POLICY "project_budgets_owner" ON project_budgets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_user_id = auth.uid())
  );

CREATE POLICY "project_budgets_collab_read" ON project_budgets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_budgets.project_id
        AND pc.user_id = auth.uid()
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_budgets_collab_write" ON project_budgets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_budgets.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_budgets_collab_update" ON project_budgets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_budgets.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_budgets_collab_delete" ON project_budgets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_budgets.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_budgets_public_read" ON project_budgets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.is_public = true AND p.share_code IS NOT NULL)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Collaborator RLS on ALL existing project tables (additive)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── projects: collaborators can read ────────────────────────────────────
CREATE POLICY "projects_collab_read" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = projects.id
        AND pc.user_id = auth.uid()
        AND pc.status = 'active'
    )
  );

-- ── project_members: collaborators read; editors write ──────────────────
CREATE POLICY "project_members_collab_read" ON project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_members.project_id
        AND pc.user_id = auth.uid()
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_members_collab_write" ON project_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_members.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_members_collab_update" ON project_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_members.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_members_collab_delete" ON project_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_members.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

-- ── project_transactions: collaborators read; editors write ─────────────
CREATE POLICY "project_txns_collab_read" ON project_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_transactions.project_id
        AND pc.user_id = auth.uid()
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_txns_collab_write" ON project_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_transactions.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_txns_collab_update" ON project_transactions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_transactions.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_txns_collab_delete" ON project_transactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = project_transactions.project_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

-- ── project_attachments: collaborators read; editors write ──────────────
CREATE POLICY "project_attachments_collab_read" ON project_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_transactions pt
      JOIN project_collaborators pc ON pc.project_id = pt.project_id
      WHERE pt.id = project_attachments.project_transaction_id
        AND pc.user_id = auth.uid()
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_attachments_collab_write" ON project_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_transactions pt
      JOIN project_collaborators pc ON pc.project_id = pt.project_id
      WHERE pt.id = project_attachments.project_transaction_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

CREATE POLICY "project_attachments_collab_delete" ON project_attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_transactions pt
      JOIN project_collaborators pc ON pc.project_id = pt.project_id
      WHERE pt.id = project_attachments.project_transaction_id
        AND pc.user_id = auth.uid()
        AND pc.role = 'editor'
        AND pc.status = 'active'
    )
  );

-- ── project_collaborators: users can see their own records ──────────────
CREATE POLICY "project_collaborators_self_read" ON project_collaborators
  FOR SELECT USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Add collaborator by email (no user enumeration) ─────────────────────
CREATE OR REPLACE FUNCTION mp_add_collaborator(
  p_project_id uuid,
  p_email text,
  p_role text DEFAULT 'viewer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_uid uuid;
  v_owner_uid uuid;
  v_existing uuid;
BEGIN
  SELECT owner_user_id INTO v_owner_uid
  FROM projects WHERE id = p_project_id;

  IF v_owner_uid IS NULL OR v_owner_uid != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT id INTO v_target_uid
  FROM auth.users
  WHERE email = lower(trim(p_email));

  IF v_target_uid = auth.uid() THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  IF v_target_uid IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM project_collaborators
    WHERE project_id = p_project_id AND user_id = v_target_uid;

    IF v_existing IS NOT NULL THEN
      UPDATE project_collaborators
      SET role = p_role, status = 'active', invited_email = lower(trim(p_email))
      WHERE id = v_existing;
    ELSE
      DELETE FROM project_collaborators
      WHERE project_id = p_project_id
        AND invited_email = lower(trim(p_email))
        AND status = 'pending';

      INSERT INTO project_collaborators (project_id, user_id, invited_email, role, status)
      VALUES (p_project_id, v_target_uid, lower(trim(p_email)), p_role, 'active');
    END IF;
  ELSE
    SELECT id INTO v_existing
    FROM project_collaborators
    WHERE project_id = p_project_id AND invited_email = lower(trim(p_email));

    IF v_existing IS NOT NULL THEN
      UPDATE project_collaborators SET role = p_role WHERE id = v_existing;
    ELSE
      INSERT INTO project_collaborators (project_id, user_id, invited_email, role, status)
      VALUES (p_project_id, NULL, lower(trim(p_email)), p_role, 'pending');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Remove collaborator ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mp_remove_collaborator(
  p_project_id uuid,
  p_collaborator_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM project_collaborators
  WHERE id = p_collaborator_id AND project_id = p_project_id;
END;
$$;

-- ── Resolve pending invites on login ────────────────────────────────────
CREATE OR REPLACE FUNCTION mp_resolve_pending_invites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  IF v_email IS NOT NULL THEN
    UPDATE project_collaborators
    SET user_id = auth.uid(), status = 'invited'
    WHERE invited_email = lower(v_email)
      AND status = 'pending'
      AND user_id IS NULL;
  END IF;
END;
$$;
