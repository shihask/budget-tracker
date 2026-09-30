-- Which due date a recurring payment was for.
--
-- A payment date doesn't say which installment it pays: a scheme due on the
-- 27th paid on 30 Sep is either late for 27 Sep or early for 27 Oct, and
-- someone paid on the 29th routinely pays next month's dues on payday. The
-- client asks, and stores the latest due date paid here. Every due on or
-- before it counts as paid (forecast, obligations, reminders); nothing after.
--
-- NULL = recorded before this column existed: the client keeps the old
-- calendar-period rule on last_contribution_date / last_paid_date. No
-- backfill — the old rule can't know which due was meant either, and a
-- guessed value would look authoritative. Users correct it from the card.

ALTER TABLE savings     ADD COLUMN IF NOT EXISTS paid_through date DEFAULT NULL;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS paid_through date DEFAULT NULL;
