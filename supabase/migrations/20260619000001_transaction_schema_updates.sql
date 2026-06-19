-- ─────────────────────────────────────────────────────────────────────────────
-- Migration part 1 of 2: add credit_card_payment enum value
-- Date: 2026-06-19
--
-- IMPORTANT: Run this file first in the Supabase SQL editor and wait for it
-- to complete before running part 2. PostgreSQL requires the new enum value to
-- be committed before it can be referenced in any UPDATE or INSERT statement.
--
-- After this succeeds, run:
--   20260619000002_transaction_columns_and_backfill.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'credit_card_payment';
