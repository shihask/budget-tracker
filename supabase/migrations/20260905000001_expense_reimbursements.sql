-- Expense Reimbursement (Linked Recovery)
--
-- When someone pays you back, the app used to record two unrelated rows: the
-- original expense and a plain income transaction. Cash flow came out right, but
-- both income and expense were inflated -- a 408 gift refunded 400 read as 408
-- spent AND 400 earned, when the truth is 8 spent and 0 earned.
--
-- This links the incoming row back to the expense it repays. The money still
-- lands in the account (balances, cash flow and net worth are untouched), but the
-- row stops counting as income and instead reduces the original expense in
-- analytics.
--
-- Why not a new transaction_type: the row IS income as far as every balance delta
-- is concerned -- delta() must keep crediting the account. Only the analytics
-- reading changes, and that is exactly what a nullable grouping key expresses.
-- Same shape as transactions.event_id / savings_id / borrowing_id.
--
-- Totals are ALWAYS derived by summing linked rows, never stored, so editing,
-- unlinking and deleting are correct on the next render with no backfill.

-- ON DELETE SET NULL, never CASCADE: deleting the expense must never delete money
-- the user actually received. It becomes ordinary income again.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS reimbursement_for uuid
    REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_reimbursement_for
  ON transactions(reimbursement_for) WHERE reimbursement_for IS NOT NULL;

-- One column only -- deliberately no `reimbursed_at`.
--
-- Life Events needed event_linked_at because tagging is retroactive: the event is
-- created after the spending, so the link's date and the row's date are genuinely
-- different facts. That does not hold here -- the reimbursement row already
-- carries its own transaction_date, which IS the day the money came back. A
-- second timestamp would be redundant and would immediately go stale when that
-- date is edited. Do not add one later without a reason this argument misses.


-- == Helper: the rows a link actually refers to =============================
-- A split expense is N ordinary rows sharing a split_group_id, with no parent
-- row. Excluding split legs would make a 300-Axis + 108-Cash gift unreimbursable,
-- which is a real and common case -- so the GROUP is the unit. A link points at
-- one leg (the client writes the anchor); this resolves it back to the whole
-- group so `remaining` is measured against 408, not 300.
CREATE OR REPLACE FUNCTION mp_reimbursement_target_ids(p_target_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN t.split_group_id IS NULL THEN ARRAY[t.id]
    ELSE (SELECT array_agg(g.id) FROM transactions g
           WHERE g.split_group_id = t.split_group_id)
  END
  FROM transactions t WHERE t.id = p_target_id;
$fn$;


-- == Validation =============================================================
-- The client cannot be the only guard: the link is written by a FOLLOW-UP UPDATE
-- (mp_execute_transaction owns the atomic balance deltas and should not grow a
-- column that has no effect on them), so a table CHECK can never see it.
CREATE OR REPLACE FUNCTION mp_validate_reimbursement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_target       transactions%ROWTYPE;
  v_target_ids   uuid[];
  v_target_total numeric;
  v_existing     numeric;
  v_lock_key     text;
  v_group        text;
BEGIN
  IF NEW.id = NEW.reimbursement_for THEN
    RAISE EXCEPTION 'A transaction cannot reimburse itself'
      USING ERRCODE = 'PT422';
  END IF;

  -- Only incoming money can repay an expense. This also rejects the whole
  -- transfer / savings / borrowing family on the reimbursing side.
  IF NEW.transaction_type <> 'income' THEN
    RAISE EXCEPTION 'Only money received can be recorded as a reimbursement'
      USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO v_target FROM transactions WHERE id = NEW.reimbursement_for;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That expense no longer exists' USING ERRCODE = 'PT422';
  END IF;

  IF v_target.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'That expense belongs to another account' USING ERRCODE = 'PT422';
  END IF;

  -- Economic meaning, not just direction. Transfers, savings movements and
  -- borrowing movements are money-out for a different reason and have their own
  -- trackers; reimbursing them would double-count against those.
  IF v_target.transaction_type NOT IN ('expense', 'commitment') THEN
    RAISE EXCEPTION 'Only an expense can be reimbursed' USING ERRCODE = 'PT422';
  END IF;

  -- The SQL half of isSystemTx (src/lib/data.ts). The type check above already
  -- covers its five transaction_type clauses; this is the category-group
  -- fallback that catches legacy adjustment rows.
  SELECT c.group_name INTO v_group FROM categories c WHERE c.id = v_target.category_id;
  IF v_group = 'Adjustment' THEN
    RAISE EXCEPTION 'Balance adjustments cannot be reimbursed' USING ERRCODE = 'PT422';
  END IF;

  -- No chains: a reimbursement cannot itself be reimbursed.
  IF v_target.reimbursement_for IS NOT NULL THEN
    RAISE EXCEPTION 'That row is already a reimbursement' USING ERRCODE = 'PT422';
  END IF;

  v_target_ids := mp_reimbursement_target_ids(NEW.reimbursement_for);

  -- Serialize per target group, so two concurrent inserts cannot both pass the
  -- remaining check and overshoot. Precedent: trg_import_batches_daily_limit.
  v_lock_key := COALESCE(v_target.split_group_id::text, v_target.id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT COALESCE(SUM(t.amount), 0) INTO v_target_total
    FROM transactions t WHERE t.id = ANY(v_target_ids);

  -- id <> NEW.id is load-bearing on UPDATE: without it, editing an existing
  -- reimbursement from 250 to 300 is checked against its own stale 250 and
  -- falsely "exceeds remaining".
  SELECT COALESCE(SUM(t.amount), 0) INTO v_existing
    FROM transactions t
   WHERE t.reimbursement_for = ANY(v_target_ids)
     AND t.id <> NEW.id;

  IF v_existing + NEW.amount > v_target_total THEN
    RAISE EXCEPTION 'Exceeds remaining amount. Only % can still be reimbursed on this expense.',
      to_char(v_target_total - v_existing, 'FM999999999.00')
      USING ERRCODE = 'PT422';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_transactions_validate_reimbursement ON transactions;
CREATE TRIGGER trg_transactions_validate_reimbursement
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  WHEN (NEW.reimbursement_for IS NOT NULL)
  EXECUTE FUNCTION mp_validate_reimbursement();


-- == The other direction: editing the expense ===============================
-- Reducing a 408 expense to 300 while 400 is already recovered would yield a
-- negative net. This is the spec's "editing recalculates remaining" rule,
-- enforced rather than merely displayed.
CREATE OR REPLACE FUNCTION mp_guard_reimbursed_expense_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_target_ids uuid[];
  v_total      numeric;
  v_reimbursed numeric;
BEGIN
  v_target_ids := mp_reimbursement_target_ids(NEW.id);

  SELECT COALESCE(SUM(t.amount), 0) INTO v_reimbursed
    FROM transactions t WHERE t.reimbursement_for = ANY(v_target_ids);

  IF v_reimbursed = 0 THEN
    RETURN NEW;
  END IF;

  -- Group-aware: shrinking one leg of a split is fine while the group still
  -- covers what was recovered against it.
  SELECT COALESCE(SUM(t.amount), 0) INTO v_total
    FROM transactions t WHERE t.id = ANY(v_target_ids) AND t.id <> NEW.id;
  v_total := v_total + NEW.amount;

  IF v_total < v_reimbursed THEN
    RAISE EXCEPTION 'This expense has % reimbursed against it and cannot be reduced below that.',
      to_char(v_reimbursed, 'FM999999999.00')
      USING ERRCODE = 'PT422';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_transactions_guard_reimbursed_amount ON transactions;
CREATE TRIGGER trg_transactions_guard_reimbursed_amount
  BEFORE UPDATE OF amount ON transactions
  FOR EACH ROW
  WHEN (NEW.amount < OLD.amount)
  EXECUTE FUNCTION mp_guard_reimbursed_expense_amount();


-- == Re-anchoring ===========================================================
-- A link points at one leg of a split group. Deleting THAT leg would otherwise
-- hit the FK's ON DELETE SET NULL and silently drop the link, even though the
-- expense (the group) still exists and still has money recovered against it.
--
-- A BEFORE DELETE trigger rather than a change to mp_delete_split_leg: it fires
-- ahead of the FK action and covers every delete path, present and future.
CREATE OR REPLACE FUNCTION mp_reanchor_reimbursements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_survivor uuid;
BEGIN
  -- Same anchor rule the client uses: earliest leg, tie-broken by id.
  SELECT t.id INTO v_survivor
    FROM transactions t
   WHERE t.split_group_id = OLD.split_group_id AND t.id <> OLD.id
   ORDER BY t.created_at, t.id
   LIMIT 1;

  IF v_survivor IS NOT NULL THEN
    UPDATE transactions SET reimbursement_for = v_survivor
     WHERE reimbursement_for = OLD.id;
  END IF;

  RETURN OLD;
END;
$fn$;

-- Only for split legs: for an ordinary expense, SET NULL is the correct
-- behaviour and the link should be dropped.
DROP TRIGGER IF EXISTS trg_transactions_reanchor_reimbursements ON transactions;
CREATE TRIGGER trg_transactions_reanchor_reimbursements
  BEFORE DELETE ON transactions
  FOR EACH ROW
  WHEN (OLD.split_group_id IS NOT NULL)
  EXECUTE FUNCTION mp_reanchor_reimbursements();
