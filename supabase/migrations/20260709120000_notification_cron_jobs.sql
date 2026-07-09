-- Documents the pg_cron schedule for the push notification edge functions.
-- Previously these jobs existed only in the live database (created ad hoc via
-- the SQL editor), so the schedule was undocumented and two jobs (push-morning-alerts,
-- push-evening-recap) carried a broken Authorization header that silently failed on
-- every run, and push-financial-coach had no cron job at all despite existing code.
--
-- Prerequisite: pg_cron and pg_net must be enabled (Supabase Dashboard > Database >
-- Extensions), and a Vault secret named 'srkey' must exist containing a bearer token
-- authorized to invoke these edge functions (the project's service_role key). Vault
-- secrets are not created by migrations since their values must never be committed.
--
-- cron.schedule() upserts by job name, so this is safe to re-run.

select cron.schedule(
  'push-morning-alerts',
  '30 2 * * *', -- 8:00 AM IST daily
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-morning-alerts'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);

select cron.schedule(
  'push-commitment-reminder',
  '30 3 * * *', -- 9:00 AM IST daily
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-commitment-reminder'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);

select cron.schedule(
  'push-financial-coach',
  '30 3 * * 3,6', -- 9:00 AM IST Wednesday and Saturday
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-financial-coach'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);

select cron.schedule(
  'push-weekly-summary',
  '30 3 * * 1', -- 9:00 AM IST Monday
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-weekly-summary'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);

select cron.schedule(
  'push-daily-reminder',
  '30 14 * * *', -- 8:00 PM IST daily
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-daily-reminder'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);

select cron.schedule(
  'push-evening-recap',
  '0 15 * * *', -- 8:30 PM IST daily
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-evening-recap'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);
