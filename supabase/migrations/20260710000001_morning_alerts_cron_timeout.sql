-- push-morning-alerts does more work per run (credit cards, commitments, a month of
-- transactions, spending-spike analysis across every enabled user) than the other
-- notification functions, and was exceeding net.http_post's 5000ms default timeout
-- on every cron-triggered run, silently failing before the edge function could respond.
-- Raises the timeout to 30s. cron.alter_job() updates the existing job in place, so
-- this is safe to re-run.

select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'push-morning-alerts'),
  command := 'select net.http_post(
      url     := ''https://prkzgxympgupuwppytlf.supabase.co/functions/v1/push-morning-alerts'',
      headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',
                   (select decrypted_secret from vault.decrypted_secrets where name=''srkey'')),
      body    := ''{}''::jsonb,
      timeout_milliseconds := 30000
    );'
);
