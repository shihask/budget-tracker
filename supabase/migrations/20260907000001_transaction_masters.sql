-- Links a transaction to a Master (the person/merchant directory added in
-- 20260906000001). Completes the foundation that release deliberately left
-- disconnected.
--
-- A fourth nullable grouping key, the same shape as event_id / savings_id /
-- borrowing_id: it groups rows without changing what the money did. Balances,
-- cash flow and net worth must never consult it.
--
-- Weaker than event_id, and deliberately so: an event can EXCLUDE its spend
-- from budget analytics (events.excluded_from_budget). A master must not.
-- Spending at Lulu is completely ordinary spending, so there is no
-- ring-fencing predicate anywhere for this column — it adds a label and a
-- read, never an alteration to an existing total.

-- ON DELETE SET NULL, never CASCADE: deleting a master must remove only the
-- association, never the user's real spending. Same rule as events.
--
-- NOTE this rarely fires in practice: masters are SOFT-deleted (deleted_at),
-- which is an UPDATE, so a tagged transaction keeps pointing at a master the
-- app no longer loads. Readers must tolerate a master_id that resolves to
-- nothing. This is the first place v1.60's soft-delete choice costs something.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS master_id uuid REFERENCES masters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_master
  ON transactions(master_id) WHERE master_id IS NOT NULL;

-- Deliberately absent, though the events migration has them:
--   * No master_linked_at. That column exists for events because retroactive
--     bulk-linking is the normal path there (you create the wedding after the
--     spending). Masters are tagged at capture time and there is no bulk-link
--     sheet yet, so the stamp would record nothing created_at doesn't say.
--   * No trigger — nothing to stamp.
--   * No RLS change — transactions already has its owner policy, and the FK
--     cannot leak across users because masters is itself RLS-scoped.
