-- Household SQL verification: invitations, membership, cross-household access,
-- private-data isolation, removal, archiving, guests, grants and account
-- deletion. See supabase/migrations/20261027000001_household.sql.
--
-- RUN ONLY ON A NON-PRODUCTION DATABASE (local `supabase start`, or a branch or
-- staging project) after applying 20261027000001_household.sql:
--   psql "$NON_PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/household.sql
--
-- One transaction ending in ROLLBACK. Throwaway auth.users rows are created
-- inside it, so no real account is read or written. RLS is exercised by
-- switching to the `authenticated` role with forged request.jwt.claims (as the
-- postgres superuser RLS is bypassed, which the "admin" checks rely on). Ids
-- created along the way are carried between blocks in transaction-local
-- settings (hh.*). Each check RAISEs on failure; the last line printed on
-- success is 'HOUSEHOLD SQL CHECKS PASSED'.
--
-- Concurrency (two simultaneous accepts, concurrent inserts) needs two
-- connections and lives in scripts/test-household-accept-race.mjs.
--
-- Users: A owner of H1 · B joins H1 · C owner of H2, outsider to H1 · D joins
-- then is removed from H2 · E, F share H3 (deleted together) · G is a guest.

BEGIN;

INSERT INTO auth.users (id, email, is_anonymous, aud, role, created_at, updated_at) VALUES
  ('00000000-0000-4000-e000-00000000000a', 'household-a@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e000-00000000000b', 'household-b@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e000-00000000000c', 'household-c@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e000-00000000000d', 'household-d@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e000-00000000000e', 'household-e@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e000-00000000000f', 'household-f@example.invalid', false, 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-e000-000000000010', NULL,                          true,  'authenticated', 'authenticated', now(), now());

-- A's and B's private finances: must stay unreadable to the partner and
-- byte-for-byte unchanged by every household operation.
INSERT INTO public.accounts (id, user_id, name, type, current_balance) VALUES
  ('00000000-0000-4000-e100-00000000000a', '00000000-0000-4000-e000-00000000000a', 'A bank', 'bank', 50000),
  ('00000000-0000-4000-e100-00000000000b', '00000000-0000-4000-e000-00000000000b', 'B cash', 'cash', 3000);
INSERT INTO public.categories (id, user_id, name, group_name) VALUES
  ('00000000-0000-4000-e200-00000000000a', '00000000-0000-4000-e000-00000000000a', 'Groceries', 'Lifestyle');
INSERT INTO public.transactions (id, user_id, transaction_date, description, amount, transaction_type, category_id, from_account_id) VALUES
  ('00000000-0000-4000-e300-00000000000a', '00000000-0000-4000-e000-00000000000a', current_date, 'A private groceries', 640, 'expense',
   '00000000-0000-4000-e200-00000000000a', '00000000-0000-4000-e100-00000000000a');

SELECT set_config('hh.personal_fingerprint', md5(
  coalesce((SELECT string_agg(a::text, '|' ORDER BY a.id) FROM public.accounts a
            WHERE a.user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b')), '') ||
  coalesce((SELECT string_agg(t::text, '|' ORDER BY t.id) FROM public.transactions t
            WHERE t.user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b')), '') ||
  coalesce((SELECT string_agg(c::text, '|' ORDER BY c.id) FROM public.categories c
            WHERE c.user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b')), '')
), true);

-- A forced invite token for the cap checks (section 7), hashed as the RPCs do.
SELECT set_config('hh.tok_forced', repeat('F', 43), true);

-- ── 1. As A: create H1, invite, secret columns, RPC-only tables ────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE h uuid; n int; s text; cur jsonb; inv jsonb; p jsonb;
BEGIN
  IF mp_household_current() IS NOT NULL THEN RAISE EXCEPTION '1: A has a household before creating one'; END IF;

  h := mp_household_create('  Our Home ', 'Asha');
  PERFORM set_config('hh.h1', h::text, true);
  SELECT name INTO s FROM households WHERE id = h;
  IF s IS DISTINCT FROM 'Our Home' THEN RAISE EXCEPTION '1: name not trimmed/stored: %', s; END IF;
  SELECT count(*) INTO n FROM household_categories WHERE household_id = h;
  IF n <> 21 THEN RAISE EXCEPTION '1: expected 21 seeded categories, got %', n; END IF;
  IF EXISTS (SELECT 1 FROM household_categories WHERE household_id = h
             AND lower(name) IN ('transfer', 'credit card bill', 'loan emi', 'opening balance', 'balance adjustment')) THEN
    RAISE EXCEPTION '1: a transfer/card/borrowing/adjustment category was seeded';
  END IF;

  cur := mp_household_current();
  IF cur->>'household_id' <> h::text OR cur->>'role' <> 'owner' THEN RAISE EXCEPTION '1: current() wrong: %', cur; END IF;
  PERFORM set_config('hh.m_a', cur->>'member_id', true);

  -- Validation runs before the membership rule; then one household per user.
  BEGIN PERFORM mp_household_create('', 'Asha'); RAISE EXCEPTION '1: empty name allowed';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  BEGIN PERFORM mp_household_create('Second home', 'Asha'); RAISE EXCEPTION '1: second active household allowed';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  inv := mp_household_create_invite(h);
  IF inv->>'token' !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION '1: token format: %', inv->>'token'; END IF;
  IF (inv->>'expires_at')::timestamptz <> now() + interval '7 days' THEN RAISE EXCEPTION '1: expiry is not 7 days'; END IF;
  PERFORM set_config('hh.tok1', inv->>'token', true);
  PERFORM set_config('hh.inv1', inv->>'invite_id', true);

  -- token_hash and members.user_id are never readable by clients.
  BEGIN PERFORM token_hash FROM household_invites; RAISE EXCEPTION '1: token_hash readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM user_id FROM household_members; RAISE EXCEPTION '1: members.user_id readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- households / members / invites change only through the RPCs.
  BEGIN INSERT INTO household_members (household_id, display_name) VALUES (h, 'Sneaky');
    RAISE EXCEPTION '1: direct member insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE households SET name = 'Hacked' WHERE id = h; RAISE EXCEPTION '1: direct household update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE household_invites SET status = 'revoked' WHERE household_id = h; RAISE EXCEPTION '1: direct invite update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM households WHERE id = h; RAISE EXCEPTION '1: direct household delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- The inviter's own link: preview says so; accepting it is refused.
  p := mp_household_preview_invite(inv->>'token');
  IF NOT (p->>'valid')::boolean OR NOT (p->>'already_member')::boolean THEN RAISE EXCEPTION '1: own preview: %', p; END IF;
  BEGIN PERFORM mp_household_accept_invite(inv->>'token', 'Asha'); RAISE EXCEPTION '1: inviter accepted own invite';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;

RESET ROLE;

-- ── 2. C previews (valid), B accepts, the link is then dead for everyone ────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE p jsonb;
BEGIN
  p := mp_household_preview_invite(current_setting('hh.tok1'));
  IF NOT (p->>'valid')::boolean OR p->>'household_name' <> 'Our Home' OR p->>'inviter_display_name' <> 'Asha'
     OR (p->>'already_member')::boolean OR (p->>'in_other_household')::boolean THEN
    RAISE EXCEPTION '2: valid preview wrong: %', p;
  END IF;
  -- Unknown and malformed tokens: the same bare answer, no error to distinguish them.
  IF mp_household_preview_invite(repeat('A', 43)) <> '{"valid": false}'::jsonb THEN RAISE EXCEPTION '2: unknown token preview leaked'; END IF;
  IF mp_household_preview_invite('not a token') <> '{"valid": false}'::jsonb THEN RAISE EXCEPTION '2: malformed token preview leaked'; END IF;
  IF mp_household_preview_invite(NULL) <> '{"valid": false}'::jsonb THEN RAISE EXCEPTION '2: null token preview leaked'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h uuid; cur jsonb; n int;
BEGIN
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok1'), '   '); RAISE EXCEPTION '2: blank display name allowed';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;

  h := mp_household_accept_invite(current_setting('hh.tok1'), 'Bilal');
  IF h <> current_setting('hh.h1')::uuid THEN RAISE EXCEPTION '2: accept returned the wrong household'; END IF;
  cur := mp_household_current();
  IF cur->>'role' <> 'member' THEN RAISE EXCEPTION '2: B should be member: %', cur; END IF;
  PERFORM set_config('hh.m_b', cur->>'member_id', true);
  SELECT count(*) INTO n FROM household_members WHERE household_id = h AND status = 'active';
  IF n <> 2 THEN RAISE EXCEPTION '2: B should see 2 members, got %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM household_invites WHERE id = current_setting('hh.inv1')::uuid AND status = 'accepted'
                 AND accepted_by_member_id = (cur->>'member_id')::uuid) THEN
    RAISE EXCEPTION '2: invite not marked accepted by B';
  END IF;
END $$;
RESET ROLE;

-- Reuse by anyone else: no metadata, accept refused.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF mp_household_preview_invite(current_setting('hh.tok1')) <> '{"valid": false}'::jsonb THEN
    RAISE EXCEPTION '2: used token still previews';
  END IF;
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok1'), 'Chitra'); RAISE EXCEPTION '2: used token accepted twice';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
  IF mp_household_current() IS NOT NULL THEN RAISE EXCEPTION '2: C joined through a used token'; END IF;
END $$;
RESET ROLE;

-- ── 3. As A: shared records, server-stamped authorship, integrity ──────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  h uuid := current_setting('hh.h1')::uuid;
  ma uuid := current_setting('hh.m_a')::uuid;
  mb uuid := current_setting('hh.m_b')::uuid;
  groceries uuid; salary uuid; tx uuid; cb uuid; ub uuid;
BEGIN
  BEGIN PERFORM mp_household_create_invite(h); RAISE EXCEPTION '3: invite created for a full household';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  SELECT id INTO groceries FROM household_categories WHERE household_id = h AND name = 'Groceries' AND kind = 'expense';
  SELECT id INTO salary    FROM household_categories WHERE household_id = h AND name = 'Salary'    AND kind = 'income';
  PERFORM set_config('hh.cat_groceries', groceries::text, true);

  -- The brief's example: Partner A records ₹2,000 of shared groceries. A also
  -- tries to attribute the row to B; the server overrides it.
  INSERT INTO household_transactions (household_id, type, amount, category_id, description, txn_date,
                                      paid_by_member_id, created_by_member_id, updated_by_member_id)
    VALUES (h, 'expense', 2000, groceries, 'Groceries', current_date, ma, mb, mb)
    RETURNING id, created_by_member_id, updated_by_member_id INTO tx, cb, ub;
  IF cb <> ma OR ub <> ma THEN RAISE EXCEPTION '3: authorship taken from the client (created %, updated %)', cb, ub; END IF;
  PERFORM set_config('hh.tx1', tx::text, true);

  INSERT INTO household_transactions (household_id, type, amount, category_id, txn_date, paid_by_member_id)
    VALUES (h, 'income', 60000, salary, current_date, mb);
  INSERT INTO household_budgets (household_id, category_id, monthly_limit) VALUES (h, NULL, 35000);
  INSERT INTO household_budgets (household_id, category_id, monthly_limit) VALUES (h, groceries, 8000);

  BEGIN INSERT INTO household_budgets (household_id, category_id, monthly_limit) VALUES (h, NULL, 1);
    RAISE EXCEPTION '3: second overall budget allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO household_budgets (household_id, category_id, monthly_limit) VALUES (h, salary, 1);
    RAISE EXCEPTION '3: budget on an income category allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO household_budgets (household_id, category_id, monthly_limit) VALUES (h, groceries, -1);
    RAISE EXCEPTION '3: negative budget allowed';
  EXCEPTION WHEN check_violation OR unique_violation THEN NULL; END;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, category_id, txn_date, paid_by_member_id)
      VALUES (h, 'expense', 100, salary, current_date, ma);
    RAISE EXCEPTION '3: expense with an income category allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (h, 'expense', 0, current_date, ma);
    RAISE EXCEPTION '3: zero amount allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (h, 'transfer', 100, current_date, ma);
    RAISE EXCEPTION '3: a transfer type allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- A referenced category can't be deleted (archive it instead).
  BEGIN DELETE FROM household_categories WHERE id = groceries; RAISE EXCEPTION '3: referenced category deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
RESET ROLE;

-- ── 4. As B: sees and edits the shared row; can't see A's private data ─────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  h uuid := current_setting('hh.h1')::uuid;
  tx uuid := current_setting('hh.tx1')::uuid;
  groceries uuid := current_setting('hh.cat_groceries')::uuid;
  spent numeric; lim numeric; cb uuid; ub uuid; n int;
BEGIN
  SELECT coalesce(sum(amount), 0) INTO spent FROM household_transactions
   WHERE household_id = h AND type = 'expense' AND category_id = groceries
     AND txn_date >= date_trunc('month', current_date)::date
     AND txn_date <  (date_trunc('month', current_date) + interval '1 month')::date;
  SELECT monthly_limit INTO lim FROM household_budgets WHERE household_id = h AND category_id = groceries;
  IF spent <> 2000 OR lim - spent <> 6000 THEN RAISE EXCEPTION '4: groceries spent % / remaining %', spent, lim - spent; END IF;
  -- Income never counts as spending.
  SELECT coalesce(sum(amount), 0) INTO spent FROM household_transactions WHERE household_id = h AND type = 'expense';
  IF spent <> 2000 THEN RAISE EXCEPTION '4: household expense total %, expected 2000', spent; END IF;

  UPDATE household_transactions SET amount = 2500, created_by_member_id = current_setting('hh.m_b')::uuid
   WHERE id = tx RETURNING created_by_member_id, updated_by_member_id INTO cb, ub;
  IF cb <> current_setting('hh.m_a')::uuid THEN RAISE EXCEPTION '4: created_by was rewritten'; END IF;
  IF ub <> current_setting('hh.m_b')::uuid THEN RAISE EXCEPTION '4: updated_by not stamped as B'; END IF;
  UPDATE household_transactions SET amount = 2000 WHERE id = tx;

  -- Membership grants nothing personal.
  SELECT count(*) INTO n FROM transactions WHERE user_id = '00000000-0000-4000-e000-00000000000a';
  IF n <> 0 THEN RAISE EXCEPTION '4: B read % of A''s personal transactions', n; END IF;
  SELECT count(*) INTO n FROM accounts WHERE user_id = '00000000-0000-4000-e000-00000000000a';
  IF n <> 0 THEN RAISE EXCEPTION '4: B read % of A''s accounts', n; END IF;
  SELECT count(*) INTO n FROM categories WHERE user_id = '00000000-0000-4000-e000-00000000000a';
  IF n <> 0 THEN RAISE EXCEPTION '4: B read % of A''s categories', n; END IF;
  UPDATE accounts SET current_balance = 0 WHERE user_id = '00000000-0000-4000-e000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '4: B updated A''s account'; END IF;

  -- B is not the owner.
  BEGIN PERFORM mp_household_remove_member(current_setting('hh.m_a')::uuid); RAISE EXCEPTION '4: non-owner removed the owner';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;

-- ── 5. As C: an outsider with their own household H2 ────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  h1 uuid := current_setting('hh.h1')::uuid;
  tx1 uuid := current_setting('hh.tx1')::uuid;
  h2 uuid; mc uuid; cat2 uuid; tx2 uuid; n int;
BEGIN
  h2 := mp_household_create('Flat 4B', 'Chitra');
  mc := (mp_household_current()->>'member_id')::uuid;
  PERFORM set_config('hh.h2', h2::text, true);
  PERFORM set_config('hh.m_c', mc::text, true);
  SELECT id INTO cat2 FROM household_categories WHERE household_id = h2 AND name = 'Rent';
  INSERT INTO household_transactions (household_id, type, amount, category_id, txn_date, paid_by_member_id)
    VALUES (h2, 'expense', 12000, cat2, current_date, mc) RETURNING id INTO tx2;
  PERFORM set_config('hh.tx2', tx2::text, true);

  -- H1 by id: nothing visible, nothing writable.
  SELECT count(*) INTO n FROM households WHERE id = h1;
  IF n <> 0 THEN RAISE EXCEPTION '5: C sees H1'; END IF;
  SELECT (SELECT count(*) FROM household_members WHERE household_id = h1)
       + (SELECT count(*) FROM household_invites WHERE household_id = h1)
       + (SELECT count(*) FROM household_categories WHERE household_id = h1)
       + (SELECT count(*) FROM household_transactions WHERE household_id = h1 OR id = tx1)
       + (SELECT count(*) FROM household_budgets WHERE household_id = h1) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '5: C sees % H1 rows', n; END IF;
  UPDATE household_transactions SET amount = 1 WHERE id = tx1;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '5: C updated an H1 transaction'; END IF;
  DELETE FROM household_transactions WHERE id = tx1;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '5: C deleted an H1 transaction'; END IF;
  UPDATE household_budgets SET monthly_limit = 0 WHERE household_id = h1;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '5: C updated H1 budgets'; END IF;
  IF mp_is_active_household_member(h1) THEN RAISE EXCEPTION '5: helper says C is in H1'; END IF;

  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (h1, 'expense', 1, current_date, current_setting('hh.m_a')::uuid);
    RAISE EXCEPTION '5: C inserted into H1';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN NULL; END;

  -- Cross-household ids inside C's own household are rejected by the composite FKs.
  BEGIN INSERT INTO household_transactions (household_id, type, amount, category_id, txn_date, paid_by_member_id)
      VALUES (h2, 'expense', 1, current_setting('hh.cat_groceries')::uuid, current_date, mc);
    RAISE EXCEPTION '5: H1 category used in H2';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (h2, 'expense', 1, current_date, current_setting('hh.m_a')::uuid);
    RAISE EXCEPTION '5: H1 member used as payer in H2';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO household_budgets (household_id, category_id, monthly_limit)
      VALUES (h2, current_setting('hh.cat_groceries')::uuid, 1);
    RAISE EXCEPTION '5: H1 category budgeted in H2';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN UPDATE household_transactions SET household_id = h1 WHERE id = tx2;
    RAISE EXCEPTION '5: row moved to another household';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT422' THEN NULL; END;

  -- Every RPC refuses an H1 target.
  BEGIN PERFORM mp_household_rename(h1, 'Mine'); RAISE EXCEPTION '5: C renamed H1';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_create_invite(h1); RAISE EXCEPTION '5: C invited into H1';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_leave(h1); RAISE EXCEPTION '5: C "left" H1';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_remove_member(current_setting('hh.m_b')::uuid); RAISE EXCEPTION '5: C removed B';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM mp_household_revoke_invite(current_setting('hh.inv1')::uuid); RAISE EXCEPTION '5: C revoked an H1 invite';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;

-- ── 6. Expiry and revocation (H2 invites, D as recipient) ───────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE inv jsonb;
BEGIN
  inv := mp_household_create_invite(current_setting('hh.h2')::uuid);
  PERFORM set_config('hh.tok2', inv->>'token', true);
  PERFORM set_config('hh.inv2', inv->>'invite_id', true);
END $$;
RESET ROLE;

-- Admin: age the invite past its expiry (now() is fixed inside a transaction).
UPDATE public.household_invites
   SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
 WHERE id = current_setting('hh.inv2')::uuid;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF mp_household_preview_invite(current_setting('hh.tok2')) <> '{"valid": false}'::jsonb THEN
    RAISE EXCEPTION '6: expired invite previews';
  END IF;
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok2'), 'Dev'); RAISE EXCEPTION '6: expired invite accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE inv jsonb;
BEGIN
  inv := mp_household_create_invite(current_setting('hh.h2')::uuid);
  -- A new invite revokes the previous pending one.
  IF NOT EXISTS (SELECT 1 FROM household_invites WHERE id = current_setting('hh.inv2')::uuid AND status = 'revoked') THEN
    RAISE EXCEPTION '6: previous pending invite not revoked';
  END IF;
  PERFORM mp_household_revoke_invite((inv->>'invite_id')::uuid);
  PERFORM set_config('hh.tok3', inv->>'token', true);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF mp_household_preview_invite(current_setting('hh.tok3')) <> '{"valid": false}'::jsonb THEN
    RAISE EXCEPTION '6: revoked invite previews';
  END IF;
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok3'), 'Dev'); RAISE EXCEPTION '6: revoked invite accepted';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT set_config('hh.tok4', mp_household_create_invite(current_setting('hh.h2')::uuid)->>'token', true);
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM mp_household_accept_invite(current_setting('hh.tok4'), 'Dev');
  PERFORM set_config('hh.m_d', mp_household_current()->>'member_id', true);
  -- D is now in H2: creating another household is refused.
  BEGIN PERFORM mp_household_create('Elsewhere', 'Dev'); RAISE EXCEPTION '6: D created a second household';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;

-- ── 7. Two-member cap, through the RPC and underneath it ────────────────────
-- Admin: plant a pending invite into the full H1 (no RPC would issue one).
INSERT INTO public.household_invites (household_id, token_hash, created_by_member_id, expires_at)
VALUES (current_setting('hh.h1')::uuid, sha256(convert_to(current_setting('hh.tok_forced'), 'UTF8')),
        current_setting('hh.m_a')::uuid, now() + interval '1 day');

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000e","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF mp_household_preview_invite(current_setting('hh.tok_forced')) <> '{"valid": false}'::jsonb THEN
    RAISE EXCEPTION '7: invite into a full household previews';
  END IF;
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok_forced'), 'Extra'); RAISE EXCEPTION '7: third member joined';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
END $$;
RESET ROLE;

-- D is active in H2, so the "another household" rule fires before the cap.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok_forced'), 'Dev'); RAISE EXCEPTION '7: D joined a second household';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;

-- Underneath the RPCs: the cap trigger refuses a third active member outright.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.household_members (household_id, user_id, display_name)
    VALUES (current_setting('hh.h1')::uuid, '00000000-0000-4000-e000-00000000000e', 'Extra');
    RAISE EXCEPTION '7: cap trigger let a third member in';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;

-- ── 8. Removal revokes access at once ───────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN PERFORM mp_household_remove_member(current_setting('hh.m_c')::uuid); RAISE EXCEPTION '8: owner removed themselves';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM mp_household_remove_member(current_setting('hh.m_d')::uuid);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h2 uuid := current_setting('hh.h2')::uuid; n int;
BEGIN
  IF mp_household_current() IS NOT NULL THEN RAISE EXCEPTION '8: removed member still has a household'; END IF;
  SELECT (SELECT count(*) FROM households WHERE id = h2)
       + (SELECT count(*) FROM household_members WHERE household_id = h2)
       + (SELECT count(*) FROM household_categories WHERE household_id = h2)
       + (SELECT count(*) FROM household_transactions WHERE household_id = h2)
       + (SELECT count(*) FROM household_invites WHERE household_id = h2) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '8: removed member still reads % H2 rows', n; END IF;
  UPDATE household_transactions SET amount = 1 WHERE id = current_setting('hh.tx2')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '8: removed member updated a row'; END IF;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (h2, 'expense', 1, current_date, current_setting('hh.m_d')::uuid);
    RAISE EXCEPTION '8: removed member inserted';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN NULL; END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE id = current_setting('hh.m_d')::uuid
                 AND status = 'removed' AND left_at IS NOT NULL) THEN
    RAISE EXCEPTION '8: removed member row not marked removed';
  END IF;
END $$;

-- ── 9. Last member leaves: archived, invites revoked, history kept unreadable ──
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE inv jsonb; n int; h2 uuid := current_setting('hh.h2')::uuid;
BEGIN
  inv := mp_household_create_invite(h2);
  PERFORM set_config('hh.tok5', inv->>'token', true);
  PERFORM set_config('hh.inv5', inv->>'invite_id', true);
  PERFORM mp_household_leave(h2);
  IF mp_household_current() IS NOT NULL THEN RAISE EXCEPTION '9: leaver still has a household'; END IF;
  SELECT (SELECT count(*) FROM households WHERE id = h2)
       + (SELECT count(*) FROM household_transactions WHERE household_id = h2)
       + (SELECT count(*) FROM household_members WHERE household_id = h2) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '9: former member reads % archived rows', n; END IF;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (h2, 'expense', 1, current_date, current_setting('hh.m_c')::uuid);
    RAISE EXCEPTION '9: write into an archived household';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_create_invite(h2); RAISE EXCEPTION '9: invite into an archived household';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_leave(h2); RAISE EXCEPTION '9: left twice';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF mp_household_preview_invite(current_setting('hh.tok5')) <> '{"valid": false}'::jsonb THEN
    RAISE EXCEPTION '9: invite of an archived household previews';
  END IF;
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok5'), 'Dev'); RAISE EXCEPTION '9: joined an archived household';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL; END;
END $$;
RESET ROLE;

DO $$
DECLARE h2 uuid := current_setting('hh.h2')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = h2 AND status = 'archived' AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION '9: household not archived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_invites WHERE id = current_setting('hh.inv5')::uuid AND status = 'revoked') THEN
    RAISE EXCEPTION '9: pending invite not revoked on archive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_transactions WHERE id = current_setting('hh.tx2')::uuid) THEN
    RAISE EXCEPTION '9: archiving deleted a transaction';
  END IF;
  IF (SELECT count(*) FROM public.household_categories WHERE household_id = h2) <> 21 THEN
    RAISE EXCEPTION '9: archiving deleted categories';
  END IF;
END $$;

-- The leaver is free to start over.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM mp_household_create('Fresh start', 'Chitra');
END $$;
RESET ROLE;

-- ── 10. Guests are refused everywhere ───────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-000000000010","role":"authenticated","is_anonymous":true}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN PERFORM mp_household_create('Guest home', 'Guest'); RAISE EXCEPTION '10: guest created a household';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_preview_invite(current_setting('hh.tok_forced')); RAISE EXCEPTION '10: guest previewed an invite';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN PERFORM mp_household_accept_invite(current_setting('hh.tok_forced'), 'Guest'); RAISE EXCEPTION '10: guest accepted an invite';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
      VALUES (current_setting('hh.h1')::uuid, 'expense', 1, current_date, current_setting('hh.m_a')::uuid);
    RAISE EXCEPTION '10: guest inserted a household transaction';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN NULL; END;
  IF mp_household_current() IS NOT NULL THEN RAISE EXCEPTION '10: guest has a household'; END IF;
END $$;
RESET ROLE;

-- ── 11. Grants: anon gets nothing; internals aren't callable ────────────────
DO $$
DECLARE f text; t text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.mp_is_active_household_member(uuid)', 'public.mp_household_current()',
    'public.mp_household_create(text,text)', 'public.mp_household_rename(uuid,text)',
    'public.mp_household_create_invite(uuid)', 'public.mp_household_preview_invite(text)',
    'public.mp_household_accept_invite(text,text)', 'public.mp_household_revoke_invite(uuid)',
    'public.mp_household_leave(uuid)', 'public.mp_household_remove_member(uuid)'
  ] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION '11: anon can execute %', f; END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION '11: authenticated can''t execute %', f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.mp_household_settle_after_exit(uuid)', 'public.mp_household_stamp_write()',
    'public.mp_household_member_cap()', 'public.mp_household_member_identity_erased()',
    'public.mp_household_member_after_exit()'
  ] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '11: internal function % is client-executable', f;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.households', 'public.household_members', 'public.household_invites',
                           'public.household_categories', 'public.household_transactions', 'public.household_budgets'] LOOP
    IF has_table_privilege('anon', t, 'SELECT') OR has_table_privilege('anon', t, 'INSERT')
       OR has_table_privilege('anon', t, 'UPDATE') OR has_table_privilege('anon', t, 'DELETE') THEN
      RAISE EXCEPTION '11: anon has privileges on %', t;
    END IF;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.household_invites', 'token_hash', 'SELECT') THEN
    RAISE EXCEPTION '11: token_hash selectable';
  END IF;
  IF has_column_privilege('authenticated', 'public.household_members', 'user_id', 'SELECT') THEN
    RAISE EXCEPTION '11: members.user_id selectable';
  END IF;
END $$;

-- ── 12. Personal finances untouched by everything above ─────────────────────
DO $$
BEGIN
  IF md5(
    coalesce((SELECT string_agg(a::text, '|' ORDER BY a.id) FROM public.accounts a
              WHERE a.user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b')), '') ||
    coalesce((SELECT string_agg(t::text, '|' ORDER BY t.id) FROM public.transactions t
              WHERE t.user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b')), '') ||
    coalesce((SELECT string_agg(c::text, '|' ORDER BY c.id) FROM public.categories c
              WHERE c.user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b')), '')
  ) <> current_setting('hh.personal_fingerprint') THEN
    RAISE EXCEPTION '12: a personal account, transaction or category changed';
  END IF;
END $$;

-- ── 13. Account deletion: owner first, then the remaining member ────────────
-- The throwaway personal rows are removed first so deleting the auth user is
-- only about the household (existing personal FKs aren't under test here).
DELETE FROM public.transactions WHERE user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b');
DELETE FROM public.categories   WHERE user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b');
DELETE FROM public.accounts     WHERE user_id IN ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b');

SELECT set_config('hh.h1_tx', (SELECT count(*) FROM public.household_transactions WHERE household_id = current_setting('hh.h1')::uuid)::text, true);
SELECT set_config('hh.h1_budgets', (SELECT count(*) FROM public.household_budgets WHERE household_id = current_setting('hh.h1')::uuid)::text, true);

DELETE FROM auth.users WHERE id = '00000000-0000-4000-e000-00000000000a';

DO $$
DECLARE h1 uuid := current_setting('hh.h1')::uuid; r record;
BEGIN
  SELECT * INTO r FROM public.household_members WHERE id = current_setting('hh.m_a')::uuid;
  IF r IS NULL THEN RAISE EXCEPTION '13: owner''s member row was deleted'; END IF;
  IF r.user_id IS NOT NULL OR r.status <> 'left' OR r.role <> 'member' OR r.display_name <> 'Former member' OR r.left_at IS NULL THEN
    RAISE EXCEPTION '13: deleted owner''s row not erased/left: %', row_to_json(r);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE id = current_setting('hh.m_b')::uuid
                 AND status = 'active' AND role = 'owner') THEN
    RAISE EXCEPTION '13: remaining member not promoted to owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = h1 AND status = 'active') THEN
    RAISE EXCEPTION '13: household archived while a member remains';
  END IF;
  IF (SELECT count(*) FROM public.household_transactions WHERE household_id = h1) <> current_setting('hh.h1_tx')::int
     OR (SELECT count(*) FROM public.household_budgets WHERE household_id = h1) <> current_setting('hh.h1_budgets')::int THEN
    RAISE EXCEPTION '13: deleting the owner removed shared transactions or budgets';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_transactions WHERE id = current_setting('hh.tx1')::uuid
                 AND created_by_member_id = current_setting('hh.m_a')::uuid) THEN
    RAISE EXCEPTION '13: the deleted owner''s transaction lost its attribution';
  END IF;
  -- The invite the deleted owner stood behind is revoked.
  IF EXISTS (SELECT 1 FROM public.household_invites WHERE household_id = h1 AND status = 'pending') THEN
    RAISE EXCEPTION '13: the deleted owner''s pending invite survived';
  END IF;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h1 uuid := current_setting('hh.h1')::uuid; n int; inv jsonb;
BEGIN
  IF mp_household_current()->>'role' <> 'owner' THEN RAISE EXCEPTION '13: B does not see themselves as owner'; END IF;
  SELECT count(*) INTO n FROM household_transactions WHERE household_id = h1;
  IF n <> current_setting('hh.h1_tx')::int THEN RAISE EXCEPTION '13: B reads % of % transactions', n, current_setting('hh.h1_tx'); END IF;
  SELECT count(*) INTO n FROM household_members WHERE household_id = h1 AND display_name = 'Former member';
  IF n <> 1 THEN RAISE EXCEPTION '13: B should see the former member, got %', n; END IF;
  INSERT INTO household_transactions (household_id, type, amount, category_id, txn_date, paid_by_member_id)
    VALUES (h1, 'expense', 450, current_setting('hh.cat_groceries')::uuid, current_date, current_setting('hh.m_b')::uuid);
  UPDATE household_transactions SET description = 'Groceries (edited)' WHERE id = current_setting('hh.tx1')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '13: B can''t edit the deleted owner''s row'; END IF;
  inv := mp_household_create_invite(h1);
  PERFORM set_config('hh.inv6', inv->>'invite_id', true);
END $$;
RESET ROLE;

SELECT set_config('hh.h1_tx', (SELECT count(*) FROM public.household_transactions WHERE household_id = current_setting('hh.h1')::uuid)::text, true);
DELETE FROM auth.users WHERE id = '00000000-0000-4000-e000-00000000000b';

DO $$
DECLARE h1 uuid := current_setting('hh.h1')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = h1 AND status = 'archived' AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION '13: deleting the last member did not archive the household';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_invites WHERE id = current_setting('hh.inv6')::uuid AND status = 'revoked') THEN
    RAISE EXCEPTION '13: pending invite not revoked when the last member was deleted';
  END IF;
  IF (SELECT count(*) FROM public.household_transactions WHERE household_id = h1) <> current_setting('hh.h1_tx')::int
     OR (SELECT count(*) FROM public.household_budgets WHERE household_id = h1) <> current_setting('hh.h1_budgets')::int THEN
    RAISE EXCEPTION '13: deleting the last member removed shared transactions or budgets';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE household_id = h1
             AND (status = 'active' OR user_id IS NOT NULL OR display_name <> 'Former member')) THEN
    RAISE EXCEPTION '13: a deleted member is still active or identifiable';
  END IF;
END $$;

-- ── 14. Both members deleted in one statement ───────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000e","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h3 uuid; me uuid;
BEGIN
  h3 := mp_household_create('E and F', 'Esha');
  me := (mp_household_current()->>'member_id')::uuid;
  PERFORM set_config('hh.h3', h3::text, true);
  PERFORM set_config('hh.tok7', mp_household_create_invite(h3)->>'token', true);
  INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
    VALUES (h3, 'expense', 999.99, current_date, me);
  INSERT INTO household_budgets (household_id, category_id, monthly_limit) VALUES (h3, NULL, 0);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000f","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE h3 uuid := current_setting('hh.h3')::uuid;
BEGIN
  PERFORM mp_household_accept_invite(current_setting('hh.tok7'), 'Farah');
  INSERT INTO household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
    VALUES (h3, 'income', 5000, current_date, (mp_household_current()->>'member_id')::uuid);
END $$;
RESET ROLE;

SELECT set_config('hh.h3_rows', (
  (SELECT count(*) FROM public.household_transactions WHERE household_id = current_setting('hh.h3')::uuid)
  + (SELECT count(*) FROM public.household_budgets WHERE household_id = current_setting('hh.h3')::uuid)
  + (SELECT count(*) FROM public.household_categories WHERE household_id = current_setting('hh.h3')::uuid)
)::text, true);

DELETE FROM auth.users WHERE id IN ('00000000-0000-4000-e000-00000000000e', '00000000-0000-4000-e000-00000000000f');

DO $$
DECLARE h3 uuid := current_setting('hh.h3')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = h3 AND status = 'archived') THEN
    RAISE EXCEPTION '14: household not archived after both members were deleted together';
  END IF;
  IF (SELECT count(*) FROM public.household_members WHERE household_id = h3
      AND status = 'left' AND user_id IS NULL AND display_name = 'Former member' AND role = 'member') <> 2 THEN
    RAISE EXCEPTION '14: members not both left/erased';
  END IF;
  IF ((SELECT count(*) FROM public.household_transactions WHERE household_id = h3)
      + (SELECT count(*) FROM public.household_budgets WHERE household_id = h3)
      + (SELECT count(*) FROM public.household_categories WHERE household_id = h3)) <> current_setting('hh.h3_rows')::int THEN
    RAISE EXCEPTION '14: shared rows lost when both members were deleted';
  END IF;
END $$;

SELECT 'HOUSEHOLD SQL CHECKS PASSED';
ROLLBACK;
