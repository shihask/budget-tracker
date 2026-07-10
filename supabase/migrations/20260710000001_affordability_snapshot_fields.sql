-- Affordability Checker "changed since yesterday" snapshot fields.
-- Frozen once per day so the checker can explain what moved since the last visit.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS affordability_snapshot_date date;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS affordability_snapshot_daily_lifestyle numeric;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS affordability_snapshot_bills_total numeric;
