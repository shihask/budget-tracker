-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: aa_sync_link_account_rpc
-- Date: 2026-07-14
--
-- mp_link_sync_account — resolves a synced (provider_connection_id,
-- provider_account_id) pair to a real MoneyPlant Account, atomically.
-- Race-safe by design: the promotion loop can re-enter (a new webhook-
-- inserted event arrives mid-batch), and worst case two browser tabs both
-- try to link the same provider account at once.
--
-- Idempotent SELECT-first, then either link to an existing account
-- (p_existing_account_id, from the account-link review sheet) or
-- auto-create one (p_new_account). ON CONFLICT DO NOTHING on the unique
-- (provider_connection_id, provider_account_id) index means a lost race just
-- produces a harmless empty orphan Account (0 balance, unlinked) rather than
-- a corrupted double-link — not auto-deleted here, since that risks deleting
-- a row a concurrent reader might already hold.
--
-- SECURITY INVOKER — RLS on accounts/account_connections requires user_id to
-- be set explicitly to auth.uid() on insert (FOR ALL USING doubles as the
-- WITH CHECK clause here), matching every other RPC in this codebase.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mp_link_sync_account(
  p_provider              text,
  p_provider_connection_id text,
  p_provider_account_id   text,
  p_existing_account_id   uuid  DEFAULT NULL,
  p_new_account           jsonb DEFAULT NULL,
  p_provider_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_existing   record;
  v_inserted   int;
BEGIN
  -- Already linked — no-op, return the existing mapping.
  SELECT account_id INTO v_existing
  FROM   account_connections
  WHERE  provider_connection_id = p_provider_connection_id
  AND    provider_account_id = p_provider_account_id;

  IF FOUND THEN
    RETURN jsonb_build_object('account_id', v_existing.account_id, 'created', false, 'already_linked', true);
  END IF;

  IF p_existing_account_id IS NOT NULL THEN
    v_account_id := p_existing_account_id;
  ELSE
    INSERT INTO accounts (user_id, name, type, current_balance, is_active)
    VALUES (
      auth.uid(),
      p_new_account->>'name',
      (p_new_account->>'type')::account_type,
      COALESCE((p_new_account->>'current_balance')::numeric, 0),
      true
    )
    RETURNING id INTO v_account_id;
  END IF;

  INSERT INTO account_connections (user_id, account_id, provider, provider_connection_id, provider_account_id, provider_metadata)
  VALUES (auth.uid(), v_account_id, p_provider, p_provider_connection_id, p_provider_account_id, p_provider_metadata)
  ON CONFLICT (provider_connection_id, provider_account_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    -- We won the race (or there was no race) — the account_id we resolved
    -- above is the one that's now actually linked.
    RETURN jsonb_build_object('account_id', v_account_id, 'created', p_existing_account_id IS NULL, 'already_linked', false);
  END IF;

  -- Lost the race — someone else linked this provider account first. Return
  -- their mapping, not ours; if we auto-created an account above, it's now
  -- a harmless unlinked orphan, not falsely reported as "created" here.
  SELECT account_id INTO v_existing
  FROM   account_connections
  WHERE  provider_connection_id = p_provider_connection_id
  AND    provider_account_id = p_provider_account_id;

  RETURN jsonb_build_object('account_id', v_existing.account_id, 'created', false, 'already_linked', false);
END;
$$;
