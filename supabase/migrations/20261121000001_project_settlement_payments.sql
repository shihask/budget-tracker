-- v1.113.0 — Projects: record settlement payments.
--
-- A settlement payment is a project_transactions row with transaction_type = 'settlement':
--   member_id    = who paid       (NULL = paid out of the kitty)
--   to_member_id = who received   (NULL = paid into the kitty, i.e. a top-up)
-- It moves money between two parties and never counts as an expense, a contribution or
-- group money. Payments are recorded and undone (deleted), never edited.
--
-- Safeguards:
--   * shape CHECK: only settlements carry to_member_id; a settlement has no shared_by, is not
--     kitty → kitty and not to the payer themselves.
--   * immutability trigger: any UPDATE of a settlement row is rejected (PT409).
--   * member delete guard: a member referenced by any settlement row can't be deleted (PT409),
--     because ON DELETE SET NULL on member_id would silently turn their payment into a kitty
--     payment. Skipped when the whole project is being deleted (cascade) — the project row is
--     already gone then, and every transaction row goes with it.
--   * to_member_id FK is NO ACTION (checked at end of statement) so a project delete still
--     cascades cleanly.
--
-- RLS: unchanged — the new column inherits project_transactions' existing policies.
--
-- APPLY BY HAND in the Supabase SQL editor (never `supabase db push`), BEFORE deploying v1.113.0.
-- Rollback (only after deleting any settlement rows):
--   DROP TRIGGER IF EXISTS trg_project_member_delete_guard ON project_members;
--   DROP FUNCTION IF EXISTS mp_project_member_delete_guard();
--   DROP TRIGGER IF EXISTS trg_project_settlement_immutable ON project_transactions;
--   DROP FUNCTION IF EXISTS mp_project_settlement_immutable();
--   ALTER TABLE project_transactions DROP CONSTRAINT IF EXISTS project_transactions_settlement_shape;
--   ALTER TABLE project_transactions DROP COLUMN IF EXISTS to_member_id;
--   ALTER TABLE project_transactions DROP CONSTRAINT IF EXISTS project_transactions_transaction_type_check;
--   ALTER TABLE project_transactions ADD CONSTRAINT project_transactions_transaction_type_check
--     CHECK (transaction_type IN ('contribution', 'expense'));

-- 1. A third transaction type.
ALTER TABLE project_transactions
  DROP CONSTRAINT IF EXISTS project_transactions_transaction_type_check;
ALTER TABLE project_transactions
  ADD CONSTRAINT project_transactions_transaction_type_check
  CHECK (transaction_type IN ('contribution', 'expense', 'settlement'));

-- 2. The recipient of a payment (NULL = the kitty).
ALTER TABLE project_transactions
  ADD COLUMN IF NOT EXISTS to_member_id uuid REFERENCES project_members(id) ON DELETE NO ACTION;

-- 3. Shape.
ALTER TABLE project_transactions
  DROP CONSTRAINT IF EXISTS project_transactions_settlement_shape;
ALTER TABLE project_transactions
  ADD CONSTRAINT project_transactions_settlement_shape CHECK (
    (transaction_type = 'settlement'
       AND shared_by IS NULL
       AND NOT (member_id IS NULL AND to_member_id IS NULL)
       AND member_id IS DISTINCT FROM to_member_id)
    OR (transaction_type <> 'settlement' AND to_member_id IS NULL)
  );

-- 4. Payments are immutable.
CREATE OR REPLACE FUNCTION mp_project_settlement_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'PT409',
    MESSAGE = 'Settlement payments can''t be edited. Undo it and record it again.';
END;
$$;

DROP TRIGGER IF EXISTS trg_project_settlement_immutable ON project_transactions;
CREATE TRIGGER trg_project_settlement_immutable
  BEFORE UPDATE ON project_transactions
  FOR EACH ROW
  WHEN (OLD.transaction_type = 'settlement' OR NEW.transaction_type = 'settlement')
  EXECUTE FUNCTION mp_project_settlement_immutable();

-- 5. Don't let a permanent member delete reinterpret settlement history.
CREATE OR REPLACE FUNCTION mp_project_member_delete_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id)
     AND EXISTS (
       SELECT 1 FROM project_transactions
        WHERE project_id = OLD.project_id
          AND transaction_type = 'settlement'
          AND (member_id = OLD.id OR to_member_id = OLD.id)
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PT409',
      MESSAGE = 'This member has recorded settlement payments, so they can''t be deleted. Mark them inactive instead.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_member_delete_guard ON project_members;
CREATE TRIGGER trg_project_member_delete_guard
  BEFORE DELETE ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION mp_project_member_delete_guard();

COMMENT ON COLUMN project_transactions.to_member_id IS
  'Settlement payments only: who received it. NULL = paid into the kitty.';

-- Verify:
--   select column_name from information_schema.columns
--    where table_name = 'project_transactions' and column_name = 'to_member_id';           -- 1 row
--   select conname from pg_constraint
--    where conname in ('project_transactions_transaction_type_check', 'project_transactions_settlement_shape');  -- 2 rows
--   select tgname from pg_trigger
--    where tgname in ('trg_project_settlement_immutable', 'trg_project_member_delete_guard');  -- 2 rows
