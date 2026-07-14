-- Documents the pg_cron schedule for aa-sync-scheduler, following the exact
-- pattern established in 20260709120000_notification_cron_jobs.sql.
--
-- Prerequisite: pg_cron and pg_net must be enabled, and a Vault secret named
-- 'srkey' must exist (same secret the push-* cron jobs already use — it's
-- the project's service_role key). Not created by this migration since its
-- value must never be committed.
--
-- Every 5 minutes: frequent enough to make the scheduler's documented
-- 1min/5min/30min stuck-connection backoff meaningful, and to keep PERIODIC
-- (1/DAY) re-fetches from drifting far past their next_sync_after time.
--
-- cron.schedule() upserts by job name, so this is safe to re-run.

select cron.schedule(
  'aa-sync-scheduler',
  '*/5 * * * *',
  'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/aa-sync-scheduler'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb
    );'
);
