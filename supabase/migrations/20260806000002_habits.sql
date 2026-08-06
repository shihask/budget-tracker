CREATE TABLE IF NOT EXISTS habits (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title                text NOT NULL,
  description          text,
  category             text NOT NULL,
  preset_key           text,
  frequency            text NOT NULL CHECK (frequency IN ('daily', 'weekdays', 'weekends', 'specific_days', 'weekly', 'monthly')),
  days_of_week         integer[] NOT NULL DEFAULT '{}',
  weekly_day           integer,
  monthly_day          integer,
  target_amount        numeric,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'archived')),
  snoozed_until        text,
  current_streak       integer NOT NULL DEFAULT 0,
  best_streak          integer NOT NULL DEFAULT 0,
  total_completions    integer NOT NULL DEFAULT 0,
  total_paused         integer NOT NULL DEFAULT 0,
  total_missed         integer NOT NULL DEFAULT 0,
  last_completed_date  text,
  last_evaluated_date  text,
  created_date         text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "habits_owner" ON habits
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);

CREATE TABLE IF NOT EXISTS habit_completions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id   uuid REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date       date NOT NULL,
  status     text NOT NULL CHECK (status IN ('completed', 'paused', 'missed')),
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, date)
);

ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "habit_completions_owner" ON habit_completions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_date ON habit_completions(habit_id, date);
