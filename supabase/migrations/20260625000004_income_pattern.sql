-- Phase 1: Income Pattern foundation
-- Adds income_pattern and associated optional fields to the settings table.
-- Default is 'monthly' so existing users see zero behavior changes.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS income_pattern text DEFAULT 'monthly';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS weekly_income numeric DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS income_day integer DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS average_daily_income numeric DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS working_days_per_week integer DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_monthly_drawings numeric DEFAULT NULL;
