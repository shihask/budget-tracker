-- ─────────────────────────────────────────────────────────────────────────────
-- Migration part 2 of 2: columns, backfill, and reclassification
-- Date: 2026-06-19
--
-- Run this AFTER 20260619000001_transaction_schema_updates.sql has completed.
-- That file adds 'credit_card_payment' to the transaction_type enum. PostgreSQL
-- requires that commit to land before this file can reference the new value.
--
-- Changes:
--   1. Add is_credit boolean column for borrowing direction storage
--   2. Add savings_id FK column to link savings transactions to savings records
--   3. Backfill is_credit from existing category name rules
--   4. Backfill savings_id by description matching
--   5. Reclassify existing CC bill payments to credit_card_payment
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add is_credit column ──────────────────────────────────────────────────
-- Stores the credit/debit direction for borrowing and borrowing_repayment
-- transactions. NULL for all other types.
--
--   TRUE  = from_account was credited (money came in):
--             'Borrowed Money'  — you borrowed, account received cash
--             'Lent Repayment'  — someone repaid you, account received cash
--   FALSE = from_account was debited (money went out):
--             'Lent Money'      — you lent, account sent cash
--             'Borrow Repayment'— you repaid, account sent cash

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_credit boolean;


-- ── 2. Add savings_id column ─────────────────────────────────────────────────
-- Links savings_contribution and savings_withdrawal transactions back to their
-- savings record by FK instead of relying on description string matching.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS savings_id uuid REFERENCES savings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_savings_id
  ON transactions(savings_id)
  WHERE savings_id IS NOT NULL;


-- ── 3. Backfill is_credit ────────────────────────────────────────────────────
-- Derive direction from the category name. These category names are
-- system-seeded and protected from renaming (is_system = true).

UPDATE transactions t
SET    is_credit = EXISTS (
         SELECT 1
         FROM   categories c
         WHERE  c.id = t.category_id
         AND    c.name IN ('Borrowed Money', 'Lent Repayment')
       )
WHERE  t.transaction_type IN ('borrowing', 'borrowing_repayment')
AND    t.is_credit IS NULL;


-- ── 4. Backfill savings_id ───────────────────────────────────────────────────
-- Match by description: contributions use sv.name directly; withdrawals use
-- sv.name + ' — Chit Prize' or ' — Redemption'. Both patterns are covered.
-- Where multiple savings records share a name, the most recently created one
-- wins (DISTINCT ON prevents duplicate-match errors).

UPDATE transactions t
SET    savings_id = matched.id
FROM (
  SELECT DISTINCT ON (t2.id)
         t2.id   AS txn_id,
         s.id    AS id
  FROM   transactions t2
  JOIN   savings s
         ON  s.user_id = t2.user_id
         AND (
               t2.description = s.name
               OR t2.description LIKE (s.name || ' —%')
             )
  WHERE  t2.transaction_type IN ('savings_contribution', 'savings_withdrawal')
  AND    t2.savings_id IS NULL
  ORDER  BY t2.id, s.created_at DESC
) matched
WHERE  t.id = matched.txn_id
AND    t.savings_id IS NULL;


-- ── 5. Reclassify existing CC bill payments ───────────────────────────────────
-- CC bill payments were previously stored as 'expense' with no category.
-- This backfill reclassifies them so they are excluded from spending analytics.
--
-- Matches: expense, no category, no credit_card_id, has a bank from_account,
-- description contains 'bill payment'. Review before running if you have
-- custom-named bill payments that should remain as expenses.

UPDATE transactions
SET    transaction_type = 'credit_card_payment'
WHERE  transaction_type = 'expense'
AND    category_id IS NULL
AND    credit_card_id IS NULL
AND    from_account_id IS NOT NULL
AND    lower(description) LIKE '%bill payment%';


-- ── Validation queries ───────────────────────────────────────────────────────
-- Uncomment and run these after the migration to confirm data integrity.

-- Borrowing is_credit coverage:
-- SELECT COUNT(*)                       AS total_borrowings,
--        COUNT(is_credit)               AS populated,
--        COUNT(*) - COUNT(is_credit)    AS missing
-- FROM   transactions
-- WHERE  transaction_type IN ('borrowing', 'borrowing_repayment');

-- Savings savings_id coverage:
-- SELECT COUNT(*)                       AS total_savings_txns,
--        COUNT(savings_id)              AS populated,
--        COUNT(*) - COUNT(savings_id)   AS missing
-- FROM   transactions
-- WHERE  transaction_type IN ('savings_contribution', 'savings_withdrawal');

-- Reclassified CC bill payments:
-- SELECT COUNT(*) AS reclassified_payments
-- FROM   transactions
-- WHERE  transaction_type = 'credit_card_payment';
