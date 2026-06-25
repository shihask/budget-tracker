-- Fix: user_id FKs that reference auth.users without ON DELETE CASCADE,
-- blocking user deletion.

-- forecast_settings
ALTER TABLE forecast_settings
  DROP CONSTRAINT forecast_settings_user_id_fkey;
ALTER TABLE forecast_settings
  ADD CONSTRAINT forecast_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- projects.owner_user_id
ALTER TABLE projects
  DROP CONSTRAINT projects_owner_user_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- project_collaborators.user_id
ALTER TABLE project_collaborators
  DROP CONSTRAINT project_collaborators_user_id_fkey;
ALTER TABLE project_collaborators
  ADD CONSTRAINT project_collaborators_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- project_activity_log.user_id
ALTER TABLE project_activity_log
  DROP CONSTRAINT project_activity_log_user_id_fkey;
ALTER TABLE project_activity_log
  ADD CONSTRAINT project_activity_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
