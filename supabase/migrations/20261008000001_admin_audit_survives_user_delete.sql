-- admin_audit_logs referenced auth.users with NO ACTION, so deleting any user an
-- admin had ever changed (or an admin who had changed someone) failed with a
-- foreign-key error — and so would Admin → Delete account, which audits itself.
-- The log must outlive the people in it: keep the rows, drop the link.
-- Every other user-linked table already CASCADEs (checked 2026-10-08).

ALTER TABLE admin_audit_logs ALTER COLUMN admin_user_id DROP NOT NULL;
ALTER TABLE admin_audit_logs ALTER COLUMN target_user_id DROP NOT NULL;

ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_admin_user_id_fkey;
ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_user_id_fkey;

ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_admin_user_id_fkey
    FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
