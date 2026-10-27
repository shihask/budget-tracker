-- Household post-apply verification — READ-ONLY. Run on PRODUCTION after
-- 20261027000001_household.sql is applied; send the result back for review.
--
-- One SELECT over the system catalogs plus row counts. Writes nothing. Checks
-- that what is live matches the migration's security design, and that no
-- throwaway rows from supabase/tests/household.sql were left behind.

SELECT n AS "#", check_name, status, detail
FROM (
  SELECT 1 AS n, 'RLS enabled on all 6 household tables' AS check_name,
         CASE WHEN count(*) FILTER (WHERE c.relrowsecurity) = 6 THEN 'ok' ELSE 'ATTENTION' END AS status,
         string_agg(c.relname::text || CASE WHEN c.relrowsecurity THEN '' ELSE ' (RLS OFF)' END, ', ' ORDER BY c.relname) AS detail
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    AND c.relname IN ('households', 'household_members', 'household_invites', 'household_categories', 'household_transactions', 'household_budgets')

  UNION ALL
  SELECT 2, '21 policies, all TO authenticated',
         CASE WHEN count(*) = 21 AND bool_and(roles = '{authenticated}') THEN 'ok' ELSE 'ATTENTION' END,
         count(*)::text || ' policies; roles: ' || string_agg(DISTINCT roles::text, ' ')
  FROM pg_policies WHERE schemaname = 'public' AND tablename ~ '^household'

  UNION ALL
  SELECT 3, 'no write policies on households / members / invites (RPC-only)',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(tablename::text || '.' || policyname::text, ', '), 'none')
  FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('households', 'household_members', 'household_invites') AND cmd <> 'SELECT'

  UNION ALL
  SELECT 4, 'anon has no privilege on any household table',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(t, ', '), 'none')
  FROM unnest(ARRAY['public.households', 'public.household_members', 'public.household_invites',
                    'public.household_categories', 'public.household_transactions', 'public.household_budgets']) t
  WHERE has_table_privilege('anon', t, 'SELECT') OR has_table_privilege('anon', t, 'INSERT')
     OR has_table_privilege('anon', t, 'UPDATE') OR has_table_privilege('anon', t, 'DELETE')

  UNION ALL
  SELECT 5, 'clients cannot read invites.token_hash or members.user_id',
         CASE WHEN NOT has_column_privilege('authenticated', 'public.household_invites', 'token_hash', 'SELECT')
               AND NOT has_column_privilege('authenticated', 'public.household_members', 'user_id', 'SELECT')
               AND NOT has_column_privilege('anon', 'public.household_invites', 'token_hash', 'SELECT') THEN 'ok' ELSE 'ATTENTION' END,
         'column grants'

  UNION ALL
  SELECT 6, 'clients cannot write households / members / invites directly',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(t || ':' || p, ', '), 'none')
  FROM unnest(ARRAY['public.households', 'public.household_members', 'public.household_invites']) t
  CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p
  WHERE has_table_privilege('authenticated', t, p)

  UNION ALL
  SELECT 7, 'all 15 functions SECURITY DEFINER with an empty search_path',
         CASE WHEN count(*) = 15 AND bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) THEN 'ok' ELSE 'ATTENTION' END,
         count(*)::text || ' found; not definer/empty path: ' ||
         coalesce(string_agg(p.proname::text, ', ') FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig @> ARRAY['search_path=""'], false))), 'none')
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND (p.proname ~ '^mp_household' OR p.proname = 'mp_is_active_household_member')

  UNION ALL
  SELECT 8, 'anon can execute no household function',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(p.proname::text, ', '), 'none')
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND (p.proname ~ '^mp_household' OR p.proname = 'mp_is_active_household_member')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')

  UNION ALL
  SELECT 9, 'internal functions not executable by clients',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(p.proname::text, ', '), 'none')
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('mp_household_settle_after_exit', 'mp_household_stamp_write', 'mp_household_member_cap',
                      'mp_household_member_identity_erased', 'mp_household_member_after_exit')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')

  UNION ALL
  SELECT 10, '7 triggers present and enabled',
         CASE WHEN count(*) = 7 AND bool_and(t.tgenabled <> 'D') THEN 'ok' ELSE 'ATTENTION' END,
         count(*)::text || ' found'
  FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname ~ '^trg_household'

  UNION ALL
  SELECT 11, 'only household_members.user_id references auth.users, ON DELETE SET NULL',
         CASE WHEN count(*) = 1 AND bool_and(c.conrelid = 'public.household_members'::regclass AND c.confdeltype = 'n') THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(c.conrelid::regclass::text || '.' || c.conname::text || ' on delete ' || c.confdeltype::text, ', '), 'none')
  FROM pg_constraint c
  WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.conrelid::regclass::text ~ '^household'

  UNION ALL
  SELECT 12, 'every FK between household tables is RESTRICT',
         CASE WHEN count(*) FILTER (WHERE c.confdeltype <> 'r') = 0 THEN 'ok' ELSE 'ATTENTION' END,
         count(*)::text || ' FKs; non-RESTRICT: ' ||
         coalesce(string_agg(c.conname::text, ', ') FILTER (WHERE c.confdeltype <> 'r'), 'none')
  FROM pg_constraint c
  WHERE c.contype = 'f' AND c.conrelid::regclass::text ~ '^household' AND c.confrelid::regclass::text ~ '^household'

  -- ── Leftovers (the security suite always rolls back; these must be zero) ──
  UNION ALL
  SELECT 20, 'no throwaway test users left (household-*@example.invalid / e000 ids)',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END, count(*)::text
  FROM auth.users WHERE id::text LIKE '00000000-0000-4000-e000-%' OR email LIKE 'household-_@example.invalid'

  UNION ALL
  SELECT 21, 'households in production (info: expected 0 until the app flag is on, unless you made one)', 'info',
         (SELECT count(*) FROM public.households)::text || ' households, ' ||
         (SELECT count(*) FROM public.household_transactions)::text || ' shared transactions'
) checks
ORDER BY n;
