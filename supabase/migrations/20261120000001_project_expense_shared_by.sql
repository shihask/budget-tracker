-- v1.112.0 — Projects: who shared this expense.
--
-- project_transactions.shared_by lists the members who shared an expense. The expense is
-- split among them by share_ratio. NULL = everyone active (the behaviour before this column),
-- so every existing row keeps settling exactly as before.
--
-- Rules enforced here:
--   * only expenses may carry it (contributions / group money never do)
--   * never an empty array, never a NULL element
-- No foreign key on the array elements (Postgres can't). If a member is permanently deleted,
-- the app ignores their id; if nobody valid is left, Settlement flags the expense instead of
-- guessing. A cleanup trigger is deliberately not used: removing the last id would leave '{}',
-- which the CHECK forbids, and would make the member delete itself fail.
--
-- RLS: unchanged — the column inherits project_transactions' existing policies.
--
-- APPLY BY HAND in the Supabase SQL editor (never `supabase db push`), BEFORE deploying v1.112.0.
-- Rollback: ALTER TABLE project_transactions DROP COLUMN shared_by;

ALTER TABLE project_transactions
  ADD COLUMN IF NOT EXISTS shared_by uuid[] DEFAULT NULL;

ALTER TABLE project_transactions
  DROP CONSTRAINT IF EXISTS project_transactions_shared_by_valid;

ALTER TABLE project_transactions
  ADD CONSTRAINT project_transactions_shared_by_valid CHECK (
    shared_by IS NULL OR (
      transaction_type = 'expense'
      AND cardinality(shared_by) > 0
      AND array_position(shared_by, NULL) IS NULL
    )
  );

COMMENT ON COLUMN project_transactions.shared_by IS
  'Members who shared this expense (split by share_ratio). NULL = everyone active.';

-- Verify:
--   select column_name, data_type from information_schema.columns
--    where table_name = 'project_transactions' and column_name = 'shared_by';      -- 1 row, ARRAY
--   select conname from pg_constraint where conname = 'project_transactions_shared_by_valid';  -- 1 row
