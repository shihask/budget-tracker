-- ============================================================================
-- BudgetTracker — Supabase schema (Postgres)
-- Handoff reference for the dashboard prototype. Run in the Supabase SQL editor.
-- All CRUD is intended to go directly through the Supabase client SDK (no API).
-- ============================================================================

-- ─── enums ──────────────────────────────────────────────────────────────────
create type account_type    as enum ('bank', 'cash', 'credit_card');
create type category_group  as enum ('Lifestyle', 'Commitment', 'Renovation', 'Family', 'Transfer');
create type transaction_type as enum ('expense', 'income', 'transfer', 'commitment', 'borrowing', 'borrowing_repayment');

-- ─── accounts ───────────────────────────────────────────────────────────────
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            account_type not null,
  current_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ─── categories ─────────────────────────────────────────────────────────────
create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  group_name category_group not null
);

-- ─── transactions ───────────────────────────────────────────────────────────
create table transactions (
  id               uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  description      text not null,
  amount           numeric(14,2) not null,
  transaction_type transaction_type not null default 'expense',
  category_id      uuid references categories(id),
  from_account_id  uuid references accounts(id),
  to_account_id    uuid references accounts(id),       -- nullable (transfers)
  notes            text,
  created_at       timestamptz not null default now()
);
create index on transactions (transaction_date);
create index on transactions (transaction_type);

-- ─── borrowings ─────────────────────────────────────────────────────────────
create table borrowings (
  id               uuid primary key default gen_random_uuid(),
  person_name      text not null,
  total_amount     numeric(14,2) not null,
  paid_amount      numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) generated always as (total_amount - paid_amount) stored,
  notes            text
);

-- ─── settings (single row) ──────────────────────────────────────────────────
create table settings (
  id             uuid primary key default gen_random_uuid(),
  weekly_budget  numeric(14,2) not null default 5000,
  emergency_fund numeric(14,2) not null default 20000
);

-- ============================================================================
-- SEED DATA
-- ============================================================================
insert into accounts (name, type, current_balance) values
  ('Axis Bank',    'bank', 30050.90),
  ('Federal Bank', 'bank', 21995.50),
  ('Cash',         'cash', 13562.00);

insert into categories (name, group_name) values
  ('Food & Tea','Lifestyle'), ('Groceries','Lifestyle'), ('Fuel','Lifestyle'),
  ('Shopping','Lifestyle'),   ('Medical','Lifestyle'),   ('Utilities','Lifestyle'),
  ('Loan EMI','Commitment'),  ('Gold Scheme','Commitment'), ('SIP','Commitment'),
  ('Kitchen','Renovation'),   ('Granite','Renovation'),  ('Electrical','Renovation'),
  ('Plumbing','Renovation'),  ('Family','Family');

insert into settings (weekly_budget, emergency_fund) values (5000, 20000);

insert into borrowings (person_name, total_amount, paid_amount, notes) values
  ('Noushad', 6400, 4300, 'Lent in Apr — repaying monthly');

-- current-cycle transactions (join category/account by name in your seed script)
-- 2026-06-01  Petrol        950.64  expense  Fuel       Axis Bank
-- 2026-06-02  Mouse         189.00  expense  Shopping   Federal Bank
-- 2026-06-02  Evening Tea    47.00  expense  Food & Tea Cash
-- 2026-06-02  Kitchen Grill 4200.00 expense  Kitchen    Axis Bank

-- ============================================================================
-- DERIVED METRICS (compute client-side, or as views)
-- ============================================================================
-- actual_balance        = sum(current_balance) where is_active
-- available_balance     = actual_balance - emergency_fund
-- remaining_commitments = sum of open commitment balances
-- real_free_money       = available_balance - remaining_commitments
-- weekly_spent          = sum(amount) for Lifestyle txns in current Mon–Sun week
-- weekly_remaining      = weekly_budget - weekly_spent
-- ============================================================================

-- Example: enable Row Level Security per authenticated user (add user_id columns first)
-- alter table accounts enable row level security;
-- create policy "own rows" on accounts for all using (auth.uid() = user_id);
