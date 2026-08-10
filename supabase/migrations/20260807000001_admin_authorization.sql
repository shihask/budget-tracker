-- Admin panel authorization: database-backed roles + audit log.
-- No admin email is hardcoded anywhere in application code — every
-- authorization check reads user_roles, and grant/revoke is a data change,
-- not a code/deploy change. No seed row here on purpose; the first admin is
-- inserted manually post-deploy so this migration stays environment-independent.

-- Postgres has no `CREATE TYPE IF NOT EXISTS` — this is the standard idempotent
-- guard, matching the IF NOT EXISTS pattern used for every table/index below.
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
-- Intentionally zero policies: RLS-enabled with no grants means `authenticated`/`anon`
-- get no access at all (not even to their own row) — only the service-role key
-- (which bypasses RLS) can read/write this table. Regular users cannot self-promote.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  field TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- Same zero-policy pattern — only the service-role key can write/read audit rows.

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
