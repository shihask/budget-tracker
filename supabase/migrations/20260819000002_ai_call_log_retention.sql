-- Retention sweep for ai_call_log.
--
-- The table exists to calibrate the daily token budget, which needs roughly a
-- week of data; 30 days gives room to compare weeks without letting the table
-- grow forever on a 500 MB free-tier database. Growth is already bounded by
-- the 100 requests/day cap -- worst case ~100 rows/user/day, so 30 days is
-- ~3,000 rows per active user -- and this keeps that from being cumulative.
--
-- Unlike import-cleanup, this needs NO Edge Function. That job had to call the
-- Storage API because deleting a storage.objects row does not delete the
-- underlying bytes. Here the rows ARE the data, so a plain DELETE is the whole
-- job and pg_cron can run it directly.
--
-- Prerequisite: pg_cron enabled (already true -- the push-* and
-- aa-sync-scheduler jobs use it). No Vault secret needed, since nothing is
-- being called over HTTP.
--
-- cron.schedule() upserts by job name, so this is safe to re-run.
--
-- 03:00 UTC (08:30 IST) keeps it clear of the push-* jobs clustered at
-- 02:30-03:30 UTC and of import-cleanup at 02:00.
select cron.schedule(
  'ai-call-log-retention',
  '0 3 * * *',
  $job$ DELETE FROM ai_call_log WHERE created_at < now() - interval '30 days'; $job$
);
