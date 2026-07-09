-- Shared Projects money columns were created as bare `numeric` (unbounded
-- scale), unlike every other money column in the app (numeric(14,2)).
-- Align them so Postgres itself enforces cent precision on write, matching
-- the app-layer round2() normalization added alongside this migration.
-- Existing values are rounded to 2 decimals by the implicit numeric(14,2)
-- cast below (Postgres widens/narrows scale in place — no data loss beyond
-- the 2nd decimal, which is exactly what's being enforced).

ALTER TABLE projects ALTER COLUMN target_amount TYPE numeric(14,2);
ALTER TABLE project_transactions ALTER COLUMN amount TYPE numeric(14,2);
ALTER TABLE project_budgets ALTER COLUMN budget_amount TYPE numeric(14,2);
