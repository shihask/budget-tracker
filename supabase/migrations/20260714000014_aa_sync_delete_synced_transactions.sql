-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_delete_synced_transactions
-- Date: 2026-07-14
--
-- "Delete Imported Data" — the most destructive of the three connection-
-- management actions. Deletes only transactions this specific connection's
-- sync CREATED (promotion_action = 'insert'), reversing their balance
-- effect. Transactions the sync only LINKED (promotion_action =
-- 'merge_into', i.e. pre-existing manual entries) are never touched —
-- that's the entire reason promotion_action exists (see
-- 20260714000011/20260714000012).
--
-- Preserves history via an audit log, not soft-delete: a full soft-delete
-- of `transactions` would require every read site across the app (initial
-- load, loadMoreTransactions, the dedup candidate query, services/index.ts,
-- CategoriesPage.tsx, every dashboard/forecast/budget component reading
-- state.transactions in memory) to add a deleted_at IS NULL filter — miss
-- one and a "deleted" transaction silently reappears in a balance or
-- total. This table is purely additive instead: nothing existing changes,
-- so nothing existing can break. Restoring from it is a manual/support-
-- assisted action (re-INSERT from the snapshot), not a one-tap undo —
-- sufficient for audit/debugging, which is the actual need here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_deleted_transactions_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id        uuid, -- not FK'd to sync_connections: the connection itself is often already removed by the time this is read
  transaction_id       uuid NOT NULL,
  transaction_snapshot jsonb NOT NULL,
  deleted_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sync_deleted_transactions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_deleted_transactions_log_owner" ON sync_deleted_transactions_log
  FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION mp_delete_synced_transactions(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_txn           record;
  v_delta         numeric;
  v_deleted_count int := 0;
  v_total_amount  numeric := 0;
BEGIN
  FOR v_txn IN
    SELECT t.id, t.transaction_date, t.description, t.amount, t.transaction_type,
           t.category_id, t.from_account_id
    FROM   transactions t
    JOIN   sync_events se ON se.id = t.sync_event_id
    WHERE  se.connection_id = p_connection_id
      AND  se.promotion_action = 'insert'
      AND  t.user_id = auth.uid()
  LOOP
    INSERT INTO sync_deleted_transactions_log (user_id, connection_id, transaction_id, transaction_snapshot)
    VALUES (
      auth.uid(),
      p_connection_id,
      v_txn.id,
      jsonb_build_object(
        'transaction_date', v_txn.transaction_date,
        'description',      v_txn.description,
        'amount',            v_txn.amount,
        'transaction_type', v_txn.transaction_type,
        'category_id',      v_txn.category_id,
        'from_account_id',  v_txn.from_account_id
      )
    );

    -- Mirrors delta()'s convention in src/hooks/useSupabaseData.ts — safe to
    -- inline here since useSyncPromotion only ever creates 'income'/'expense'
    -- transactions via the 'insert' outcome (never transfer/commitment/etc).
    v_delta := CASE v_txn.transaction_type WHEN 'income' THEN v_txn.amount ELSE -v_txn.amount END;

    UPDATE accounts
    SET    current_balance = current_balance - v_delta
    WHERE  id = v_txn.from_account_id AND user_id = auth.uid();

    DELETE FROM transactions WHERE id = v_txn.id;

    v_deleted_count := v_deleted_count + 1;
    v_total_amount  := v_total_amount + v_delta;
  END LOOP;

  RETURN jsonb_build_object('deleted_count', v_deleted_count, 'total_amount', v_total_amount);
END;
$$;
