-- Enable Realtime for project_collaborators so clients receive live invite notifications.
-- REPLICA IDENTITY FULL is required for column-level filtering on postgres_changes.
ALTER TABLE project_collaborators REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE project_collaborators;
