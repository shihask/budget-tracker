-- Auto Budget hero card: freeze a "Cycle Start Free Money" snapshot once per income
-- cycle so the ring % and "Cycle Budget Remaining" figure use a STABLE denominator
-- instead of the live, ever-shrinking realFreeMoney value. See src/lib/data.ts `derive()`.
--
-- cycle_snapshot_key identifies which cycle cycle_start_free_money was captured for
-- (currently the local calendar date of the cycle's start, stored as text so the
-- definition of a "cycle key" can evolve later without a schema change).

ALTER TABLE settings ADD COLUMN IF NOT EXISTS cycle_start_free_money numeric DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cycle_snapshot_key text DEFAULT NULL;
