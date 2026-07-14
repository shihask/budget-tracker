-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_list_unlinked_accounts_rpc
-- Date: 2026-07-14
--
-- mp_list_unlinked_sync_accounts — backs AccountLinkReviewSheet. Surfaces
-- (provider_connection_id, provider_account_id) pairs that have pending
-- sync_events but no account_connections row yet.
--
-- In steady state this should only ever contain accounts useSyncPromotion
-- deliberately left pending — the "no likely match" case auto-links
-- immediately via mp_link_sync_account and never appears here; only the
-- "a likely match exists, awaiting user confirmation" case persists (see
-- the Phase 1b plan's account-linking heuristic).
--
-- An RPC, not a security_invoker view — every other capability in this
-- schema (mp_link_sync_account, mp_finalize_sync_event) is a SECURITY
-- INVOKER function relying on auth.uid(), so this matches that convention
-- rather than introducing a second access pattern.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mp_list_unlinked_sync_accounts()
RETURNS TABLE (
  provider                text,
  provider_connection_id  text,
  provider_account_id     text,
  masked_acc_number       text,
  pending_count           bigint,
  oldest_pending_at       timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    se.provider,
    se.provider_connection_id,
    se.provider_account_id,
    se.provider_metadata->>'maskedAccNumber',
    count(*),
    min(se.fetched_at)
  FROM sync_events se
  WHERE se.user_id = auth.uid()
    AND se.status = 'pending'
    AND se.provider_account_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM account_connections ac
      WHERE ac.provider_connection_id = se.provider_connection_id
        AND ac.provider_account_id = se.provider_account_id
    )
  GROUP BY se.provider, se.provider_connection_id, se.provider_account_id, se.provider_metadata->>'maskedAccNumber';
$$;
