-- Household: "Share with Household" from Quick Add. See CLAUDE.md "Household".
--
-- One save creates the personal transaction AND its household copy atomically,
-- and the copy then follows personal edits/deletes. Additive, except for two new
-- triggers on public.transactions (approved 2026-10-28), which never block a
-- personal edit or delete.
--
-- Objects:
--   household_transaction_links      private 1:1 link (owner-readable only)
--   household_sync_events            diagnostics: ids and outcomes only
--   mp_household_share_recorded_transaction(tx, category)  SECURITY DEFINER
--   mp_execute_shared_transaction(<mp_execute_transaction args>, category)  SECURITY INVOKER
--   trg_transactions_household_sync_update  AFTER UPDATE on transactions
--   trg_transactions_household_sync_delete  BEFORE DELETE on transactions
--
-- Shared fields: amount, date, note (first 120 chars), household category, payer
-- (the caller's own member id). Never an account, card, balance or personal id —
-- the link table that ties the two records is invisible to the partner.
--
-- Rollback (drops the feature; household copies already made stay as ordinary
-- household entries):
--   DROP TRIGGER trg_transactions_household_sync_update ON public.transactions;
--   DROP TRIGGER trg_transactions_household_sync_delete ON public.transactions;
--   DROP FUNCTION public.mp_execute_shared_transaction(uuid,date,text,numeric,text,uuid,uuid,uuid,uuid,text,uuid,uuid,boolean,numeric,numeric,numeric,uuid,uuid);
--   DROP FUNCTION public.mp_household_share_recorded_transaction(uuid,uuid);
--   DROP FUNCTION public.mp_household_tx_sync_update();
--   DROP FUNCTION public.mp_household_tx_sync_delete();
--   DROP FUNCTION public.mp_household_log_sync(text,text,text,uuid,uuid);
--   DROP TABLE public.household_transaction_links;
--   DROP TABLE public.household_sync_events;

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- One household copy per personal transaction, and vice versa. Deleting either
-- side removes the link (CASCADE on both FKs); the link never deletes data.
CREATE TABLE public.household_transaction_links (
  transaction_id           uuid PRIMARY KEY REFERENCES public.transactions (id) ON DELETE CASCADE,
  household_transaction_id uuid NOT NULL UNIQUE REFERENCES public.household_transactions (id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.household_transaction_links ENABLE ROW LEVEL SECURITY;
-- Read-only, and only your own: the partner can't map a household entry back to
-- a personal transaction id. Rows are written only by the definer functions below.
CREATE POLICY "Owners read their household links" ON public.household_transaction_links
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Observability for the sync triggers, which must never fail a personal write.
-- Opaque ids, an outcome and a SQLSTATE only — no amount, note, account or name.
CREATE TABLE public.household_sync_events (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at               timestamptz NOT NULL DEFAULT now(),
  operation                text NOT NULL,
  outcome                  text NOT NULL,
  sqlstate                 text,
  transaction_id           uuid,
  household_transaction_id uuid,
  CONSTRAINT household_sync_events_operation CHECK (operation IN ('update', 'delete')),
  CONSTRAINT household_sync_events_outcome CHECK (outcome IN
    ('failed', 'skipped_inactive', 'unlinked_type_change', 'kept_account_deleted'))
);
ALTER TABLE public.household_sync_events ENABLE ROW LEVEL SECURITY;   -- no policies: service role only
CREATE INDEX household_sync_events_created ON public.household_sync_events (created_at DESC);

-- ── 2. Diagnostics helper ───────────────────────────────────────────────────
CREATE FUNCTION public.mp_household_log_sync(p_operation text, p_outcome text, p_sqlstate text, p_tx uuid, p_htx uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.household_sync_events (operation, outcome, sqlstate, transaction_id, household_transaction_id)
  VALUES (p_operation, p_outcome, p_sqlstate, p_tx, p_htx);
EXCEPTION WHEN OTHERS THEN
  -- Logging must not fail the caller either; leave a trace in the Postgres log.
  RAISE WARNING 'household sync: could not record % / % (sqlstate %)', p_operation, p_outcome, SQLSTATE;
END;
$$;

-- ── 3. Share an already-recorded personal transaction ───────────────────────
-- SECURITY DEFINER, so every check is explicit. The household and the payer come
-- from the caller's own active membership — never from the client. Idempotent: a
-- second call for the same transaction returns the existing household copy.
CREATE FUNCTION public.mp_household_share_recorded_transaction(p_transaction_id uuid, p_household_category_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tx     record;
  v_member record;
  v_htx    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  IF public.mp_is_guest() THEN
    RAISE EXCEPTION 'guest_not_allowed' USING ERRCODE = 'PT403';
  END IF;

  -- Lock the personal row: concurrent shares of one transaction serialise here.
  SELECT t.id, t.transaction_type::text AS type, t.amount, t.transaction_date, t.description, t.reimbursement_for
    INTO v_tx
    FROM public.transactions t
   WHERE t.id = p_transaction_id AND t.user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found.' USING ERRCODE = 'PT404';
  END IF;

  SELECT l.household_transaction_id INTO v_htx
    FROM public.household_transaction_links l WHERE l.transaction_id = p_transaction_id;
  IF v_htx IS NOT NULL THEN
    RETURN v_htx;   -- retry of a share that already committed
  END IF;

  IF v_tx.type NOT IN ('expense', 'income') OR v_tx.reimbursement_for IS NOT NULL THEN
    RAISE EXCEPTION 'Only expenses and income can be shared with a household.' USING ERRCODE = 'PT422';
  END IF;

  -- FOR SHARE on the household: an archive (which locks it FOR UPDATE) can't
  -- interleave with this insert.
  SELECT m.id, m.household_id INTO v_member
    FROM public.household_members m
    JOIN public.households h ON h.id = m.household_id
   WHERE m.user_id = v_uid AND m.status = 'active' AND h.status = 'active'
   FOR SHARE OF h;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You''re no longer in an active household. Turn off sharing to save this.' USING ERRCODE = 'PT403';
  END IF;

  IF p_household_category_id IS NULL THEN
    RAISE EXCEPTION 'Pick a household category.' USING ERRCODE = 'PT422';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_categories c
                 WHERE c.id = p_household_category_id AND c.household_id = v_member.household_id
                   AND c.kind = v_tx.type AND NOT c.is_archived) THEN
    RAISE EXCEPTION 'That household category isn''t available. Pick another one.' USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO public.household_transactions
    (household_id, type, amount, category_id, description, txn_date,
     paid_by_member_id, created_by_member_id, updated_by_member_id)
  VALUES
    (v_member.household_id, v_tx.type, v_tx.amount, p_household_category_id,
     nullif(left(btrim(v_tx.description), 120), ''), v_tx.transaction_date,
     v_member.id, v_member.id, v_member.id)
  RETURNING id INTO v_htx;

  INSERT INTO public.household_transaction_links (transaction_id, household_transaction_id, user_id)
  VALUES (p_transaction_id, v_htx, v_uid);

  RETURN v_htx;
END;
$$;

-- ── 4. Save + share in ONE transaction ──────────────────────────────────────
-- SECURITY INVOKER, like mp_execute_transaction itself: the personal write runs
-- under the caller's RLS exactly as an ordinary save does. Any failure in the
-- share step raises, rolling back the personal row and its balance deltas too.
-- p_id is required: it is what makes a retry return both existing records
-- instead of creating a second pair.
CREATE FUNCTION public.mp_execute_shared_transaction(
  p_user_id               uuid,
  p_transaction_date      date,
  p_description           text,
  p_amount                numeric,
  p_transaction_type      text,
  p_category_id           uuid    DEFAULT NULL,
  p_from_account_id       uuid    DEFAULT NULL,
  p_to_account_id         uuid    DEFAULT NULL,
  p_credit_card_id        uuid    DEFAULT NULL,
  p_notes                 text    DEFAULT '',
  p_borrowing_id          uuid    DEFAULT NULL,
  p_savings_id            uuid    DEFAULT NULL,
  p_is_credit             boolean DEFAULT NULL,
  p_from_delta            numeric DEFAULT NULL,
  p_to_delta              numeric DEFAULT NULL,
  p_cc_delta              numeric DEFAULT NULL,
  p_id                    uuid    DEFAULT NULL,
  p_household_category_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_htx uuid;
BEGIN
  IF p_transaction_type NOT IN ('expense', 'income') THEN
    RAISE EXCEPTION 'Only expenses and income can be shared with a household.' USING ERRCODE = 'PT422';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'A shared save needs a transaction id.' USING ERRCODE = 'PT422';
  END IF;

  v_row := public.mp_execute_transaction(
    p_user_id          => p_user_id,
    p_transaction_date => p_transaction_date,
    p_description      => p_description,
    p_amount           => p_amount,
    p_transaction_type => p_transaction_type,
    p_category_id      => p_category_id,
    p_from_account_id  => p_from_account_id,
    p_to_account_id    => p_to_account_id,
    p_credit_card_id   => p_credit_card_id,
    p_notes            => p_notes,
    p_borrowing_id     => p_borrowing_id,
    p_savings_id       => p_savings_id,
    p_is_credit        => p_is_credit,
    p_from_delta       => p_from_delta,
    p_to_delta         => p_to_delta,
    p_cc_delta         => p_cc_delta,
    p_id               => p_id
  );
  v_htx := public.mp_household_share_recorded_transaction((v_row ->> 'id')::uuid, p_household_category_id);
  RETURN v_row || jsonb_build_object('household_transaction_id', v_htx);
END;
$$;

-- ── 5. Personal → household sync ────────────────────────────────────────────
-- Both triggers are SECURITY DEFINER with explicit checks, catch every error in
-- a subtransaction, record it in household_sync_events, and return normally:
-- a household problem can never fail a personal edit or delete.

-- Personal edit: amount / date / note follow to the household copy. A type
-- change (or a later reimbursement link) unlinks instead, keeping the copy.
CREATE FUNCTION public.mp_household_tx_sync_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_htx    uuid;
  v_member uuid;
BEGIN
  SELECT l.household_transaction_id INTO v_htx
    FROM public.household_transaction_links l WHERE l.transaction_id = NEW.id;
  IF v_htx IS NULL THEN
    RETURN NULL;   -- not shared: the common case, one index probe
  END IF;

  BEGIN
    IF NEW.transaction_type IS DISTINCT FROM OLD.transaction_type OR NEW.reimbursement_for IS NOT NULL THEN
      DELETE FROM public.household_transaction_links WHERE transaction_id = NEW.id;
      PERFORM public.mp_household_log_sync('update', 'unlinked_type_change', NULL, NEW.id, v_htx);
      RETURN NULL;
    END IF;

    -- Only while the owner is still an active member of that active household.
    SELECT m.id INTO v_member
      FROM public.household_transactions ht
      JOIN public.households h        ON h.id = ht.household_id AND h.status = 'active'
      JOIN public.household_members m ON m.household_id = ht.household_id
                                     AND m.user_id = NEW.user_id AND m.status = 'active'
     WHERE ht.id = v_htx;
    IF v_member IS NULL THEN
      PERFORM public.mp_household_log_sync('update', 'skipped_inactive', NULL, NEW.id, v_htx);
      RETURN NULL;
    END IF;

    UPDATE public.household_transactions
       SET amount = NEW.amount,
           txn_date = NEW.transaction_date,
           description = nullif(left(btrim(NEW.description), 120), ''),
           updated_by_member_id = v_member
     WHERE id = v_htx;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.mp_household_log_sync('update', 'failed', SQLSTATE, NEW.id, v_htx);
    RAISE WARNING 'household sync: update of a shared copy failed (sqlstate %)', SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

-- Personal delete: the household copy goes too — except during account
-- deletion. Account deletion is auth.admin.deleteUser → DELETE auth.users →
-- FK cascade to transactions. By the time that cascade fires this trigger, the
-- owner's auth.users row is already deleted (the cascade runs after the parent
-- delete, with its effects visible), so "owner no longer exists" identifies it.
-- pg_trigger_depth() can't: deleting a personal account also cascades into
-- transactions, and that delete should take the household copy with it.
-- Verified against the live schema by supabase/tests/household_share.sql.
CREATE FUNCTION public.mp_household_tx_sync_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_htx    uuid;
  v_active boolean;
BEGIN
  SELECT l.household_transaction_id INTO v_htx
    FROM public.household_transaction_links l WHERE l.transaction_id = OLD.id;
  IF v_htx IS NULL THEN
    RETURN OLD;
  END IF;

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
      -- Account deletion: shared history stays; the link cascades away.
      PERFORM public.mp_household_log_sync('delete', 'kept_account_deleted', NULL, OLD.id, v_htx);
      RETURN OLD;
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM public.household_transactions ht
        JOIN public.households h        ON h.id = ht.household_id AND h.status = 'active'
        JOIN public.household_members m ON m.household_id = ht.household_id
                                       AND m.user_id = OLD.user_id AND m.status = 'active'
       WHERE ht.id = v_htx
    ) INTO v_active;
    IF NOT v_active THEN
      PERFORM public.mp_household_log_sync('delete', 'skipped_inactive', NULL, OLD.id, v_htx);
      RETURN OLD;
    END IF;

    DELETE FROM public.household_transactions WHERE id = v_htx;   -- cascades the link
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.mp_household_log_sync('delete', 'failed', SQLSTATE, OLD.id, v_htx);
    RAISE WARNING 'household sync: delete of a shared copy failed (sqlstate %)', SQLSTATE;
  END;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_transactions_household_sync_update
  AFTER UPDATE OF amount, transaction_date, description, transaction_type, reimbursement_for ON public.transactions
  FOR EACH ROW
  WHEN (OLD.amount IS DISTINCT FROM NEW.amount
     OR OLD.transaction_date IS DISTINCT FROM NEW.transaction_date
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.transaction_type IS DISTINCT FROM NEW.transaction_type
     OR OLD.reimbursement_for IS DISTINCT FROM NEW.reimbursement_for)
  EXECUTE FUNCTION public.mp_household_tx_sync_update();

CREATE TRIGGER trg_transactions_household_sync_delete
  BEFORE DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.mp_household_tx_sync_delete();

-- ── 6. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON public.household_transaction_links, public.household_sync_events FROM PUBLIC, anon, authenticated;
GRANT SELECT (transaction_id, household_transaction_id, created_at) ON public.household_transaction_links TO authenticated;

REVOKE ALL ON FUNCTION
  public.mp_household_log_sync(text, text, text, uuid, uuid),
  public.mp_household_share_recorded_transaction(uuid, uuid),
  public.mp_execute_shared_transaction(uuid, date, text, numeric, text, uuid, uuid, uuid, uuid, text, uuid, uuid, boolean, numeric, numeric, numeric, uuid, uuid),
  public.mp_household_tx_sync_update(),
  public.mp_household_tx_sync_delete()
FROM PUBLIC, anon, authenticated;
-- The share step runs as the caller (from the INVOKER wrapper), so authenticated
-- needs EXECUTE on it. Called directly it can only share the caller's own
-- expense/income into the caller's own active household — all checked inside.
GRANT EXECUTE ON FUNCTION
  public.mp_household_share_recorded_transaction(uuid, uuid),
  public.mp_execute_shared_transaction(uuid, date, text, numeric, text, uuid, uuid, uuid, uuid, text, uuid, uuid, boolean, numeric, numeric, numeric, uuid, uuid)
TO authenticated;

COMMIT;
