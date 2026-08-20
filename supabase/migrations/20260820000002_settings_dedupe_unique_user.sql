-- One user, two settings rows — and a UNIQUE constraint so it cannot recur.
--
-- Found while diagnosing a 21000 cardinality violation that broke chat: a
-- scalar subquery in mp_user_ai_token_budget errors on more than one row.
-- 20260820000001 made the AI functions tolerant; this removes the cause.
--
-- The duplicates had DIVERGED, which is what makes them dangerous rather than
-- merely untidy:
--   79a940b3-…  weekly_budget 1100, salary_date 30   <- live
--   92ec653e-…  weekly_budget  495, salary_date 28   <- stale orphan
--
-- 79a940b3 is the live row, on three independent signals:
--   * the app renders Weekly Budget 1,100 and salary date 30
--   * updateSettings() writes by settings.id, so every edit landed there
--   * the app loads with .limit(1).single() and the AI functions now use
--     ORDER BY id LIMIT 1 — and 79… sorts before 92… — so both already
--     resolve to it
--
-- Nothing reads 92ec653e. Its values are a snapshot from whenever the two
-- diverged.
--
-- BEFORE RUNNING THIS: capture the row being deleted. There are no database
-- backups on the free plan, so this delete is unrecoverable.
--
--   SELECT to_jsonb(s) FROM settings s
--   WHERE id = '92ec653e-06cd-46e7-b29d-523b2ad58668';
--
-- Save that output somewhere outside the database first.

DELETE FROM settings
WHERE id = '92ec653e-06cd-46e7-b29d-523b2ad58668';


-- The actual fix. Without it this recurs silently and the next symptom will be
-- just as indirect as the last: settings appearing to revert between sessions,
-- or a query strict enough to trip over the duplicate months later.
--
-- Deliberately NOT guarded with an IF NOT EXISTS dance: if any duplicates
-- remain, this fails loudly here rather than letting them persist. Re-run the
-- diagnostic and resolve them before retrying.
--
--   SELECT user_id, count(*) FROM settings
--   GROUP BY user_id HAVING count(*) > 1;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_user_id_unique;
ALTER TABLE settings ADD CONSTRAINT settings_user_id_unique UNIQUE (user_id);
