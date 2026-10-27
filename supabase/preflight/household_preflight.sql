-- Household pre-flight — READ-ONLY. Run on PRODUCTION before applying
-- supabase/migrations/20261027000001_household.sql, and send the result back
-- for review. See supabase/preflight/README.md.
--
-- One SELECT over the system catalogs. It creates, alters, locks and writes
-- nothing, and reads no user data (only catalog metadata and the migration
-- history table). Paste it into the SQL editor and export the result.
--
-- Every row is a check: status 'ok' means the migration's assumption holds;
-- 'ATTENTION' means stop and review before applying; 'info' is context only.

SELECT n AS "#", check_name, status, detail
FROM (
  -- ── Platform ──────────────────────────────────────────────────────────────
  SELECT 1 AS n, 'PostgreSQL version >= 14' AS check_name,
         CASE WHEN current_setting('server_version_num')::int >= 140000 THEN 'ok' ELSE 'ATTENTION' END AS status,
         version() AS detail

  UNION ALL
  SELECT 2, 'pgcrypto extension installed',
         CASE WHEN e.oid IS NOT NULL THEN 'ok' ELSE 'ATTENTION' END,
         coalesce('schema ' || e.extnamespace::regnamespace::text || ', version ' || e.extversion, 'not installed')
  FROM (SELECT 1) one LEFT JOIN pg_extension e ON e.extname = 'pgcrypto'

  UNION ALL
  SELECT 3, 'extensions.gen_random_bytes(integer) (invite tokens)',
         CASE WHEN to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(to_regprocedure('extensions.gen_random_bytes(integer)')::text, 'missing — the migration calls it schema-qualified')

  UNION ALL
  SELECT 4, 'core sha256(bytea), hashtextextended(text,bigint), gen_random_uuid()',
         CASE WHEN to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL
               AND to_regprocedure('pg_catalog.hashtextextended(text,bigint)') IS NOT NULL
               AND to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL THEN 'ok' ELSE 'ATTENTION' END,
         concat_ws(', ',
           coalesce(to_regprocedure('pg_catalog.sha256(bytea)')::text, 'sha256 missing'),
           coalesce(to_regprocedure('pg_catalog.hashtextextended(text,bigint)')::text, 'hashtextextended missing'),
           coalesce(to_regprocedure('pg_catalog.gen_random_uuid()')::text, 'gen_random_uuid missing'))

  -- ── Supabase auth ─────────────────────────────────────────────────────────
  UNION ALL
  SELECT 5, 'auth.uid() and auth.jwt() exist',
         CASE WHEN to_regprocedure('auth.uid()') IS NOT NULL AND to_regprocedure('auth.jwt()') IS NOT NULL THEN 'ok' ELSE 'ATTENTION' END,
         concat_ws(', ', coalesce(to_regprocedure('auth.uid()')::text, 'auth.uid missing'),
                         coalesce(to_regprocedure('auth.jwt()')::text, 'auth.jwt missing'))

  UNION ALL
  SELECT 6, 'auth.users(id uuid) — target of household_members.user_id FK',
         CASE WHEN EXISTS (SELECT 1 FROM pg_attribute a
                           WHERE a.attrelid = to_regclass('auth.users') AND a.attname = 'id'
                             AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped) THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(to_regclass('auth.users')::text, 'auth.users missing')

  UNION ALL
  SELECT 7, 'roles anon / authenticated / service_role exist',
         CASE WHEN (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) = 3 THEN 'ok' ELSE 'ATTENTION' END,
         (SELECT string_agg(rolname || CASE WHEN rolbypassrls THEN ' (BYPASSRLS)' ELSE '' END, ', ' ORDER BY rolname)
          FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role'))

  UNION ALL
  SELECT 8, 'authenticated / anon do NOT bypass RLS',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated') AND (rolbypassrls OR rolsuper))
              THEN 'ok' ELSE 'ATTENTION' END,
         'household privacy relies on RLS for these two roles'

  -- ── The one existing app function the migration depends on ───────────────
  UNION ALL
  SELECT 9, 'public.mp_is_guest() matches 20261016000002_guest_mode.sql',
         CASE
           WHEN p.oid IS NULL THEN 'ATTENTION'
           WHEN p.prorettype = 'boolean'::regtype
            AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) = 'SELECT coalesce((auth.jwt() ->> ''is_anonymous'')::boolean, false)'
           THEN 'ok' ELSE 'ATTENTION' END,
         coalesce('returns ' || p.prorettype::regtype::text || CASE WHEN p.prosecdef THEN ', SECURITY DEFINER' ELSE ', invoker' END
                  || ', body: ' || btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')), 'missing — apply the guest-mode migration first')
  FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.mp_is_guest()')

  -- ── Name collisions (the migration uses plain CREATE and would fail) ──────
  UNION ALL
  SELECT 10, 'no existing relation (table/view/index/sequence) named household*',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(c.relname || ' (' || c.relkind || ')', ', ' ORDER BY c.relname), 'none')
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname ~ '^household'

  UNION ALL
  SELECT 11, 'no existing function mp_household_* / mp_is_active_household_member',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname), 'none')
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND (p.proname ~ '^mp_household' OR p.proname = 'mp_is_active_household_member')

  UNION ALL
  SELECT 12, 'no existing trigger named trg_household*',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(t.tgname || ' on ' || t.tgrelid::regclass::text, ', ' ORDER BY t.tgname), 'none')
  FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname ~ '^trg_household'

  UNION ALL
  SELECT 13, 'no existing type named household*',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'ATTENTION' END,
         coalesce(string_agg(t.typname, ', ' ORDER BY t.typname), 'none')
  FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typname ~ '^_?household' AND t.typrelid = 0

  -- ── Context (no action needed unless something looks unexpected) ──────────
  UNION ALL
  SELECT 20, 'default privileges in schema public (the migration revokes then re-grants explicitly)', 'info',
         coalesce((SELECT string_agg(pg_get_userbyid(d.defaclrole) || ' → ' ||
                                     CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'f' THEN 'functions' WHEN 'S' THEN 'sequences'
                                                          WHEN 'T' THEN 'types' ELSE d.defaclobjtype::text END
                                     || ': ' || d.defaclacl::text, '; ')
                   FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace), 'none')

  UNION ALL
  SELECT 21, 'event triggers (fire on CREATE TABLE/FUNCTION)', 'info',
         coalesce((SELECT string_agg(e.evtname || ' [' || e.evtevent || '] ' || e.evtfoid::regproc::text
                                     || CASE WHEN e.evtenabled = 'D' THEN ' (disabled)' ELSE '' END, '; ' ORDER BY e.evtname)
                   FROM pg_event_trigger e), 'none')

  UNION ALL
  SELECT 22, 'latest recorded migrations (remote history is known to be stale — never db push)', 'info',
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'no history table'
              ELSE (xpath('/row/v/text()', query_to_xml(
                     'SELECT string_agg(version, '', '' ORDER BY version DESC) AS v
                        FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8) s',
                     false, true, '')))[1]::text END

  UNION ALL
  SELECT 23, 'household migration already recorded in history?',
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'info'
              WHEN (xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM supabase_migrations.schema_migrations WHERE version = ''20261027000001''',
                     false, true, '')))[1]::text = '0' THEN 'ok'
              ELSE 'ATTENTION' END,
         'expected: not recorded yet'

  UNION ALL
  SELECT 24, 'Shared Projects functions that exist only in the live DB (audit finding; Household does NOT use them)', 'info',
         coalesce((SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname)
                   FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                     AND p.proname IN ('mp_is_project_owner', 'mp_is_collaborator', 'mp_is_editor',
                                       'mp_is_project_public', 'mp_accept_invite', 'mp_decline_invite')), 'none found')

  UNION ALL
  SELECT 25, 'FKs referencing auth.users with no ON DELETE action (could block account deletion; context for section 13 of the test)', 'info',
         coalesce((SELECT string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' ORDER BY 1)
                   FROM pg_constraint c
                   WHERE c.contype = 'f' AND c.confrelid = to_regclass('auth.users') AND c.confdeltype IN ('a', 'r')), 'none')
) checks
ORDER BY n;
