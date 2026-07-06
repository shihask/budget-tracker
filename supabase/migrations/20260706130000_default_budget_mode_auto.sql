-- New sign-ups start in Auto Budget mode by default instead of Manual, so they
-- immediately experience MoneyPlant's core "Know Before You Spend" cycle-tracking
-- feature rather than the simpler manual weekly/daily budget. Existing accounts are
-- untouched — this only changes what NEW settings rows get when budget_mode isn't
-- explicitly specified on insert.

ALTER TABLE settings ALTER COLUMN budget_mode SET DEFAULT 'auto';
