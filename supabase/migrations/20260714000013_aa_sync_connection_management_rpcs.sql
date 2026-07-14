-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_connection_management_rpcs
-- Date: 2026-07-14
--
-- Two of the three connection-management actions users can take on a
-- sync_connections row: Disconnect (stop syncing, keep everything) and
-- Remove Connection (delete the connection record, keep the account and
-- transactions). Delete Imported Data is a separate migration — it needs
-- promotion_action (20260714000011) and touches transactions/accounts.
-- ─────────────────────────────────────────────────────────────────────────────

-- mp_disconnect_sync_connection — a status flip, nothing else. Verified
-- against aa-sync-scheduler/index.ts: it only ever queries connections with
-- status IN ('active','syncing') or status = 'synced', so moving off those
-- values is sufficient to stop all future scheduled syncing. This is
-- local-only — no verified Setu API exists for revoking a consent
-- server-side (setu-client.ts has no revoke/delete export), so this does
-- not call out to Setu. Reuses the 'revoked' status value already in the
-- SyncConnectionStatus lifecycle rather than adding a new one, since the
-- practical effect (stop syncing, health shows as revoked) is identical
-- regardless of whether Setu or the user caused it.
CREATE OR REPLACE FUNCTION mp_disconnect_sync_connection(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE sync_connections
  SET    status = 'revoked', updated_at = now()
  WHERE  id = p_connection_id AND user_id = auth.uid();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated > 0);
END;
$$;

-- mp_remove_sync_connection — deletes only the connection record. Safe by
-- construction: sync_events.connection_id has ON DELETE CASCADE (deleting
-- the connection deletes its sync_events), and transactions.sync_event_id
-- has ON DELETE SET NULL (any transaction linked to one of those sync_events
-- just loses the link — the transaction row and its balance effect are
-- untouched). account_connections has no FK to sync_connections (only a
-- plain provider_connection_id text match), so it must be deleted
-- explicitly here.
CREATE OR REPLACE FUNCTION mp_remove_sync_connection(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_provider_connection_id text;
  v_deleted int;
BEGIN
  SELECT provider_connection_id INTO v_provider_connection_id
  FROM   sync_connections
  WHERE  id = p_connection_id AND user_id = auth.uid();

  IF v_provider_connection_id IS NULL THEN
    RETURN jsonb_build_object('removed', false);
  END IF;

  DELETE FROM account_connections
  WHERE  provider_connection_id = v_provider_connection_id AND user_id = auth.uid();

  DELETE FROM sync_connections
  WHERE  id = p_connection_id AND user_id = auth.uid();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('removed', v_deleted > 0);
END;
$$;
