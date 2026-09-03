-- Life Events — one-off events (wedding, trip, house construction, festival)
-- whose spending is real money out of real accounts, but which should be
-- totalled separately and kept out of the running lifestyle averages.
--
-- Why a tag on transactions rather than a new ledger: the existing
-- shared-projects feature stores its spending in project_transactions, which
-- never reaches account balances or the cash-flow forecast. For a wedding paid
-- from the user's own Axis/Cash accounts that is exactly wrong — the money
-- really did leave. So an event is a nullable grouping key on the real row,
-- the same shape as transactions.savings_id / borrowing_id / split_group_id.
--
-- Why not a category: the event is orthogonal to the category. A wedding
-- expense is still Food or Clothing or Decoration; it needs both labels.

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'ring',
  target_amount numeric,
  start_date date,
  end_date date,
  -- true = tagged spend is kept out of weekly pacing, the lifestyle forecast,
  -- spending streaks and budget-strategy adherence. It NEVER affects account
  -- balances, cash flow or net worth — those read raw transactions.
  -- Default true: the common case is a one-off life event that would otherwise
  -- wreck the running averages for months afterwards.
  excluded_from_budget boolean NOT NULL DEFAULT true,
  -- Prefills for one-tap capture from the dashboard card.
  default_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  default_account_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- The column started life as `emoji` during development. Icons are keys into a
-- lucide set, not emoji — the app never renders a raw glyph — so rename in place
-- for anyone who applied the earlier version of this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'events' AND column_name = 'emoji')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'events' AND column_name = 'icon')
  THEN
    ALTER TABLE events RENAME COLUMN emoji TO icon;
  END IF;
END $$;

-- Safety net if the table pre-existed without either column.
ALTER TABLE events ADD COLUMN IF NOT EXISTS icon text;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_owner" ON events;
CREATE POLICY "events_owner" ON events FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);

-- One live event per name per user — nobody should end up with two
-- "Brother's Wedding" cards on the dashboard and their spend split across
-- both. Archived events are excluded so the name is released for reuse
-- (an annual festival can be archived and recreated next year).
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_name_active
  ON events(user_id, lower(name))
  WHERE status != 'archived';

-- Reuses mp_touch_updated_at() from 20260818000002_import_cleanup_cron_job.sql.
DROP TRIGGER IF EXISTS trg_events_touch_updated_at ON events;
CREATE TRIGGER trg_events_touch_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION mp_touch_updated_at();

-- ── The tag itself ──────────────────────────────────────────────────────────
-- ON DELETE SET NULL, never CASCADE: deleting an event must remove only the
-- association, never the user's real spending.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_event
  ON transactions(event_id) WHERE event_id IS NOT NULL;

-- When the tag was applied, which is NOT created_at — retroactive linking is
-- the normal case (you create the event after the wedding, then bulk-link the
-- last few weeks of spending). Gives a future activity log its timestamps
-- without an extra table.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS event_linked_at timestamptz;

-- Stamped by trigger rather than by the client because four separate paths
-- write event_id — the bulk link sheet, Quick Add, the transaction detail
-- chip, and the implicit SET NULL when an event is deleted. Client-side
-- bookkeeping would miss the fourth and drift.
CREATE OR REPLACE FUNCTION mp_stamp_event_linked_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.event_linked_at := CASE WHEN NEW.event_id IS NULL THEN NULL ELSE now() END;
  RETURN NEW;
END;
$fn$;

-- Two triggers, not one: OLD is not available in an INSERT trigger's WHEN
-- clause, so the insert case can't share the "only when it changed" guard.
DROP TRIGGER IF EXISTS trg_transactions_stamp_event_linked_at_ins ON transactions;
CREATE TRIGGER trg_transactions_stamp_event_linked_at_ins
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION mp_stamp_event_linked_at();

DROP TRIGGER IF EXISTS trg_transactions_stamp_event_linked_at ON transactions;
CREATE TRIGGER trg_transactions_stamp_event_linked_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  WHEN (OLD.event_id IS DISTINCT FROM NEW.event_id)
  EXECUTE FUNCTION mp_stamp_event_linked_at();

