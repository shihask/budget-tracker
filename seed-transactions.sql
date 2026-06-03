-- ============================================================
-- BudgetTracker — Seed Transactions
-- Run this in Supabase SQL Editor
-- ============================================================

-- Account IDs
-- Axis Bank   : eac3bc51-3008-45ab-9494-37d777f2e632
-- Federal Bank: cebed662-db16-4bda-b5f2-6bd9fb0a596e
-- Cash        : dc0b399d-7ae4-4bb9-8297-b04e373c1141

-- Category IDs
-- Food & Tea  : 5114d5dc-82ca-47ec-996c-7d76fbd693e6
-- Fuel        : 5c536f64-2c84-419a-ae2e-b15a4af85761
-- Groceries   : 8128fe8a-c10c-4a99-bc68-91c686a7e55e
-- Medical     : 3ffa230f-9597-49df-b04e-7476ebe29fd4
-- Shopping    : 13c3c071-7e09-4f61-8d3d-ef2b8e457fa7
-- Utilities   : 879f1e0a-95cc-45a8-92d1-a0e077214497
-- Gold Scheme : 0105c4f2-6c8c-4047-b8b4-9189c8d6129d
-- Loan EMI    : 501954e5-f931-4b31-a39e-1817e62efe57
-- SIP         : 3dfd8207-7836-47e0-8550-b675b7e74e9b
-- Electrical  : 3631a0cf-62ca-4b66-9e12-c8cbf122b56d
-- Granite     : d690c94d-49c5-4f43-99a7-6cccf8bc95eb
-- Kitchen     : 2dfbc3c6-6feb-4ddf-827f-0ee4ac3b5bd3
-- Plumbing    : 28103018-da25-4a58-bd75-f794d482c4d2
-- Family      : d4c09e01-8309-449a-8102-4702aec60dee

-- ── Current cycle seed transactions (from brief) ─────────────────────────────
INSERT INTO transactions (transaction_date, description, amount, transaction_type, category_id, from_account_id) VALUES
  ('2026-06-01', 'Petrol',        950.64, 'expense', '5c536f64-2c84-419a-ae2e-b15a4af85761', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-06-02', 'Mouse',         189.00, 'expense', '13c3c071-7e09-4f61-8d3d-ef2b8e457fa7', 'cebed662-db16-4bda-b5f2-6bd9fb0a596e'),
  ('2026-06-02', 'Evening Tea',    47.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-06-02', 'Kitchen Grill', 4200.00, 'expense', '2dfbc3c6-6feb-4ddf-827f-0ee4ac3b5bd3', 'eac3bc51-3008-45ab-9494-37d777f2e632');

-- ── Renovation history ────────────────────────────────────────────────────────
INSERT INTO transactions (transaction_date, description, amount, transaction_type, category_id, from_account_id) VALUES
  ('2026-05-22', 'Granite Slab',  8600.00, 'expense', 'd690c94d-49c5-4f43-99a7-6cccf8bc95eb', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-28', 'Wiring',        3100.00, 'expense', '3631a0cf-62ca-4b66-9e12-c8cbf122b56d', 'cebed662-db16-4bda-b5f2-6bd9fb0a596e');

-- ── Lifestyle history (last 5 weeks) ─────────────────────────────────────────
INSERT INTO transactions (transaction_date, description, amount, transaction_type, category_id, from_account_id) VALUES
  -- Week of May 26
  ('2026-05-26', 'Morning Tea',    45.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-26', 'Groceries',     850.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-27', 'Petrol',        950.00, 'expense', '5c536f64-2c84-419a-ae2e-b15a4af85761', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-27', 'Snacks',         60.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-28', 'Vegetables',    320.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-29', 'Mobile Recharge', 299.00, 'expense', '879f1e0a-95cc-45a8-92d1-a0e077214497', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-29', 'Coffee',         75.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-30', 'Shopping',      750.00, 'expense', '13c3c071-7e09-4f61-8d3d-ef2b8e457fa7', 'cebed662-db16-4bda-b5f2-6bd9fb0a596e'),
  ('2026-05-31', 'Pharmacy',      220.00, 'expense', '3ffa230f-9597-49df-b04e-7476ebe29fd4', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-31', 'Bakery',         55.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  -- Week of May 19
  ('2026-05-19', 'Groceries',    1100.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-19', 'Evening Tea',    47.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-20', 'Auto Fare',     120.00, 'expense', '5c536f64-2c84-419a-ae2e-b15a4af85761', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-21', 'Electricity',   780.00, 'expense', '879f1e0a-95cc-45a8-92d1-a0e077214497', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-21', 'Snacks',         80.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-22', 'Petrol',        950.00, 'expense', '5c536f64-2c84-419a-ae2e-b15a4af85761', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-23', 'Doctor',        500.00, 'expense', '3ffa230f-9597-49df-b04e-7476ebe29fd4', 'cebed662-db16-4bda-b5f2-6bd9fb0a596e'),
  ('2026-05-24', 'Supermarket',   650.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  -- Week of May 12
  ('2026-05-12', 'Morning Tea',    40.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-13', 'Groceries',     920.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-14', 'Internet',      399.00, 'expense', '879f1e0a-95cc-45a8-92d1-a0e077214497', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-14', 'Coffee',         65.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-15', 'Clothes',      1200.00, 'expense', '13c3c071-7e09-4f61-8d3d-ef2b8e457fa7', 'cebed662-db16-4bda-b5f2-6bd9fb0a596e'),
  ('2026-05-15', 'Petrol',        950.00, 'expense', '5c536f64-2c84-419a-ae2e-b15a4af85761', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-16', 'Vegetables',    280.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-17', 'Pharmacy',      180.00, 'expense', '3ffa230f-9597-49df-b04e-7476ebe29fd4', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  -- Week of May 5
  ('2026-05-05', 'Groceries',     780.00, 'expense', '8128fe8a-c10c-4a99-bc68-91c686a7e55e', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-06', 'Evening Tea',    50.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141'),
  ('2026-05-07', 'Petrol',        900.00, 'expense', '5c536f64-2c84-419a-ae2e-b15a4af85761', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-08', 'Home Items',    450.00, 'expense', '13c3c071-7e09-4f61-8d3d-ef2b8e457fa7', 'cebed662-db16-4bda-b5f2-6bd9fb0a596e'),
  ('2026-05-09', 'Electricity',   820.00, 'expense', '879f1e0a-95cc-45a8-92d1-a0e077214497', 'eac3bc51-3008-45ab-9494-37d777f2e632'),
  ('2026-05-10', 'Snacks',         70.00, 'expense', '5114d5dc-82ca-47ec-996c-7d76fbd693e6', 'dc0b399d-7ae4-4bb9-8297-b04e373c1141');

-- ── Update account balances to match seed values ──────────────────────────────
UPDATE accounts SET current_balance = 30050.90 WHERE id = 'eac3bc51-3008-45ab-9494-37d777f2e632';
UPDATE accounts SET current_balance = 21995.50 WHERE id = 'cebed662-db16-4bda-b5f2-6bd9fb0a596e';
UPDATE accounts SET current_balance = 13562.00 WHERE id = 'dc0b399d-7ae4-4bb9-8297-b04e373c1141';

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT COUNT(*) as total_transactions FROM transactions;
SELECT name, current_balance FROM accounts ORDER BY name;
