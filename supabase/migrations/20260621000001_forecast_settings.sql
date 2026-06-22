-- Cash Flow Forecast settings. Forecast output itself is NEVER stored — it is a
-- derived calculation. Only these inputs are persisted. No salary-day duplication:
-- the forecast reuses the existing settings.salary_date.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS forecast_enabled         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS forecast_days            integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS forecast_commitment_ids  jsonb,          -- null = include all active
  ADD COLUMN IF NOT EXISTS forecast_savings_ids     jsonb,          -- null = include all active
  ADD COLUMN IF NOT EXISTS forecast_salary_override numeric;        -- used ONLY when salary can't be estimated
