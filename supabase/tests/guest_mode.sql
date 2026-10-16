-- Guest mode SQL verification — guest restrictions, registered-user parity,
-- mp_is_guest(), and the stale-guest purge.
--
-- RUN ONLY ON A NON-PRODUCTION DATABASE (local `supabase start`, or a branch or
-- staging project) after applying 20261016000002_guest_mode.sql:
--   psql "$NON_PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/guest_mode.sql
--
-- One transaction ending in ROLLBACK. Throwaway auth.users rows are created
-- inside it, so no real account is read or written. RLS is exercised by
-- switching to the `authenticated` role with forged request.jwt.claims (as the
-- postgres superuser RLS is bypassed). Each check RAISEs on failure; the last
-- line printed on success is 'GUEST MODE SQL CHECKS PASSED'.
--
-- The upgrade-vs-purge race needs two connections and lives in
-- scripts/test-guest-purge-race.mjs.

BEGIN;

-- Users: R = registered, G = live guest (RLS checks), P* = purge candidates.
INSERT INTO auth.users (id, email, phone, is_anonymous, aud, role, created_at, updated_at, last_sign_in_at) VALUES
  ('00000000-0000-4000-b000-0000000000a1', 'guest-test-r@example.invalid', NULL, false, 'authenticated', 'authenticated', now(), now(), now()),
  ('00000000-0000-4000-b000-0000000000a2', NULL, NULL, true, 'authenticated', 'authenticated', now(), now(), now());

INSERT INTO public.accounts (id, user_id, name, type) VALUES
  ('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-b000-0000000000a1', 'R cash', 'cash'),
  ('00000000-0000-4000-b000-0000000000c2', '00000000-0000-4000-b000-0000000000a2', 'G cash', 'cash');

-- ── mp_is_guest(): true only for an explicit true claim ─────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"x","role":"authenticated"}', true);
  IF mp_is_guest() THEN RAISE EXCEPTION 'is_guest: missing claim read as guest'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"x","is_anonymous":null}', true);
  IF mp_is_guest() THEN RAISE EXCEPTION 'is_guest: null claim read as guest'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"x","is_anonymous":false}', true);
  IF mp_is_guest() THEN RAISE EXCEPTION 'is_guest: false claim read as guest'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"x","is_anonymous":true}', true);
  IF NOT mp_is_guest() THEN RAISE EXCEPTION 'is_guest: true claim not read as guest'; END IF;
END $$;

-- ── As the guest ─────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-0000000000a2","role":"authenticated","is_anonymous":true}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE g uuid := '00000000-0000-4000-b000-0000000000a2'; n int;
BEGIN
  -- Own data still works
  INSERT INTO transactions (user_id, amount, description, from_account_id, transaction_type, transaction_date)
    VALUES (g, 120, 'guest tea', '00000000-0000-4000-b000-0000000000c2', 'expense', current_date);
  SELECT count(*) INTO n FROM transactions WHERE user_id = g;
  IF n <> 1 THEN RAISE EXCEPTION 'guest: expected to read 1 own transaction, got %', n; END IF;

  -- Each blocked insert must fail on RLS (42501), not on anything else
  BEGIN
    INSERT INTO import_batches (user_id, account_id, provider, storage_path, file_name)
      VALUES (g, '00000000-0000-4000-b000-0000000000c2', 'pdf', g || '/x.pdf', 'x.pdf');
    RAISE EXCEPTION 'guest: import_batches insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO sync_connections (user_id, provider, provider_connection_id) VALUES (g, 'aa', 'guest-conn');
    RAISE EXCEPTION 'guest: sync_connections insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO account_connections (user_id, account_id, provider, provider_account_id, provider_connection_id)
      VALUES (g, '00000000-0000-4000-b000-0000000000c2', 'aa', 'acc', 'guest-conn');
    RAISE EXCEPTION 'guest: account_connections insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO projects (owner_user_id, name) VALUES (g, 'guest project');
    RAISE EXCEPTION 'guest: projects insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('statement-imports', g || '/s.pdf');
    RAISE EXCEPTION 'guest: statement-imports upload was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('transaction-receipts', g || '/r.jpg');
    RAISE EXCEPTION 'guest: transaction-receipts upload was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('project-attachments', g || '/a.pdf');
    RAISE EXCEPTION 'guest: project-attachments upload was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

RESET ROLE;

-- ── As the registered user: exactly as before (claim present-false, then absent) ──
DO $$
DECLARE
  claims text;
  r uuid := '00000000-0000-4000-b000-0000000000a1';
  pid uuid; bid uuid; sid uuid; n int;
BEGIN
  FOREACH claims IN ARRAY ARRAY[
    '{"sub":"00000000-0000-4000-b000-0000000000a1","role":"authenticated","is_anonymous":false}',
    '{"sub":"00000000-0000-4000-b000-0000000000a1","role":"authenticated"}'
  ] LOOP
    PERFORM set_config('request.jwt.claims', claims, true);
    SET LOCAL ROLE authenticated;

    INSERT INTO import_batches (user_id, account_id, provider, storage_path, file_name)
      VALUES (r, '00000000-0000-4000-b000-0000000000c1', 'pdf', r || '/x.pdf', 'x.pdf') RETURNING id INTO bid;
    UPDATE import_batches SET file_name = 'y.pdf' WHERE id = bid;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'registered: import_batches update'; END IF;
    DELETE FROM import_batches WHERE id = bid;

    INSERT INTO sync_connections (user_id, provider, provider_connection_id)
      VALUES (r, 'aa', 'reg-conn-' || length(claims)) RETURNING id INTO sid;
    INSERT INTO account_connections (user_id, account_id, provider, provider_account_id, provider_connection_id)
      VALUES (r, '00000000-0000-4000-b000-0000000000c1', 'aa', 'acc-' || length(claims), 'reg-conn-' || length(claims));
    DELETE FROM account_connections WHERE user_id = r;
    DELETE FROM sync_connections WHERE id = sid;

    INSERT INTO projects (owner_user_id, name) VALUES (r, 'registered project') RETURNING id INTO pid;
    INSERT INTO project_collaborators (project_id, invited_email) VALUES (pid, 'collab@example.invalid');
    UPDATE projects SET name = 'renamed' WHERE id = pid;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'registered: projects update'; END IF;
    DELETE FROM project_collaborators WHERE project_id = pid;
    DELETE FROM projects WHERE id = pid;

    INSERT INTO storage.objects (bucket_id, name) VALUES
      ('statement-imports', r || '/s-' || length(claims) || '.pdf'),
      ('transaction-receipts', r || '/r-' || length(claims) || '.jpg'),
      ('project-attachments', r || '/a-' || length(claims) || '.pdf');
    SELECT count(*) INTO n FROM storage.objects WHERE (storage.foldername(name))[1] = r::text;
    IF n <> 3 THEN RAISE EXCEPTION 'registered: expected to read 3 own objects, got %', n; END IF;
    DELETE FROM storage.objects WHERE (storage.foldername(name))[1] = r::text;

    RESET ROLE;
  END LOOP;
END $$;

-- ── Purge: one stale-on-every-signal guest goes; one fresh signal keeps a guest ──
-- Everything below runs as postgres. Inside one transaction now() is fixed, so a
-- row inserted here is "fresh" and a backdated one is 40 days old.
DO $$
DECLARE
  old timestamptz := now() - interval '40 days';
  p_none    uuid := '00000000-0000-4000-b000-0000000000d1';  -- stale, no rows        → deleted
  p_oldtx   uuid := '00000000-0000-4000-b000-0000000000d2';  -- stale, old txn only   → deleted (+ cascade)
  p_tx      uuid := '00000000-0000-4000-b000-0000000000d3';  -- fresh transaction     → kept
  p_acct    uuid := '00000000-0000-4000-b000-0000000000d4';  -- fresh account         → kept
  p_event   uuid := '00000000-0000-4000-b000-0000000000d5';  -- fresh event (updated) → kept
  p_kakeibo uuid := '00000000-0000-4000-b000-0000000000d6';  -- fresh kakeibo row     → kept
  p_sess    uuid := '00000000-0000-4000-b000-0000000000d7';  -- recent session refresh → kept
  p_young   uuid := '00000000-0000-4000-b000-0000000000d8';  -- created 10 days ago   → kept
  p_saved   uuid := '00000000-0000-4000-b000-0000000000d9';  -- upgraded (not anon)   → kept
  p_email   uuid := '00000000-0000-4000-b000-0000000000da';  -- anon flag but email   → kept
  reg_old   uuid := '00000000-0000-4000-b000-0000000000db';  -- old registered user   → kept
  deleted int; leftover int; fk record;
BEGIN
  INSERT INTO auth.users (id, email, is_anonymous, aud, role, created_at, updated_at, last_sign_in_at) VALUES
    (p_none, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_oldtx, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_tx, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_acct, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_event, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_kakeibo, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_sess, NULL, true, 'authenticated', 'authenticated', old, old, old),
    (p_young, NULL, true, 'authenticated', 'authenticated', now() - interval '10 days', now() - interval '10 days', now() - interval '10 days'),
    (p_saved, NULL, false, 'authenticated', 'authenticated', old, old, old),
    (p_email, 'odd-anon@example.invalid', true, 'authenticated', 'authenticated', old, old, old),
    (reg_old, 'old-user@example.invalid', false, 'authenticated', 'authenticated', old, old, old);

  INSERT INTO accounts (id, user_id, name, type, created_at) VALUES
    ('00000000-0000-4000-b000-0000000000e2', p_oldtx, 'old', 'cash', old),
    ('00000000-0000-4000-b000-0000000000e3', p_tx, 'old', 'cash', old),
    ('00000000-0000-4000-b000-0000000000e4', p_acct, 'fresh', 'cash', now());
  INSERT INTO transactions (user_id, amount, description, from_account_id, transaction_type, transaction_date, created_at) VALUES
    (p_oldtx, 50, 'old tea', '00000000-0000-4000-b000-0000000000e2', 'expense', (old)::date, old),
    (p_tx, 50, 'fresh tea', '00000000-0000-4000-b000-0000000000e3', 'expense', current_date, now());
  INSERT INTO events (user_id, name, created_at, updated_at) VALUES (p_event, 'Trip', old, now());
  INSERT INTO kakeibo_reflections (user_id, cycle_start, created_at, updated_at) VALUES (p_kakeibo, date_trunc('month', old)::date, old, now());
  INSERT INTO auth.sessions (id, user_id, created_at, updated_at, refreshed_at)
    VALUES (gen_random_uuid(), p_sess, old, now(), now()::timestamp);

  deleted := mp_purge_stale_guests(500);

  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (p_none, p_oldtx)) THEN RAISE EXCEPTION 'purge: a fully stale guest survived'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE id IN (p_tx, p_acct, p_event, p_kakeibo, p_sess, p_young, p_saved, p_email, reg_old)) <> 9 THEN
    RAISE EXCEPTION 'purge: deleted a user with a fresh signal, or a non-guest';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-b000-0000000000a1')
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-b000-0000000000a2') THEN
    RAISE EXCEPTION 'purge: touched the live test users';
  END IF;
  -- deleted counts only rows of this test (plus any genuinely stale guest in a
  -- non-prod DB), so check at least our two, not exactly two.
  IF deleted < 2 THEN RAISE EXCEPTION 'purge: reported % deletions, expected at least 2', deleted; END IF;

  -- Nothing of a purged guest remains in any table that references auth.users
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I IN ($1, $2)', fk.tbl, fk.col) INTO leftover USING p_none, p_oldtx;
    IF leftover > 0 THEN RAISE EXCEPTION 'purge: % row(s) left in %.%', leftover, fk.tbl, fk.col; END IF;
  END LOOP;
END $$;

-- Clients can't call the purge or read activity
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.mp_purge_stale_guests(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: authenticated can run the purge';
  END IF;
  IF has_function_privilege('anon', 'public.mp_guest_last_active_at(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: anon can read guest activity';
  END IF;
END $$;

SELECT 'GUEST MODE SQL CHECKS PASSED';
ROLLBACK;
