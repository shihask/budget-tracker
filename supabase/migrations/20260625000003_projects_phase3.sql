-- Phase 3: Activity Log table for projects

CREATE TABLE IF NOT EXISTS project_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users,
  action_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;

-- Owner can read & insert
CREATE POLICY "Owner reads activity" ON project_activity_log
  FOR SELECT USING (mp_is_project_owner(project_id));

CREATE POLICY "Owner logs activity" ON project_activity_log
  FOR INSERT WITH CHECK (mp_is_project_owner(project_id));

-- Collaborators can read & editors can insert
CREATE POLICY "Collaborator reads activity" ON project_activity_log
  FOR SELECT USING (mp_is_collaborator(project_id));

CREATE POLICY "Editor logs activity" ON project_activity_log
  FOR INSERT WITH CHECK (mp_is_editor(project_id));

-- Public projects: activity visible
CREATE POLICY "Public activity readable" ON project_activity_log
  FOR SELECT USING (mp_is_project_public(project_id));

CREATE INDEX idx_activity_project_date ON project_activity_log(project_id, created_at DESC);

-- Storage bucket for project attachments (idempotent — no-op if exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-attachments', 'project-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project attachments
CREATE POLICY "Users upload project attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own project attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own project attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'project-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
