// Seeds a demo Supabase account with realistic Indian pilot data for the
// promo-reel recordings (see C:\Users\Admin\.claude\plans\i-want-to-create-abstract-book.md).
//
// WARNING: this WIPES all transactions and commitments for the signed-in
// account and resets its first active account's balance before reseeding.
// Only ever point this at a dedicated demo account — never a real one.
//
// Usage: npm run seed:reels
// Requires REEL_EMAIL / REEL_PASSWORD (.env.reels) and VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY (.env). The demo account must already exist and have
// logged into the app once (so its default categories/groups/settings rows
// exist) with at least one account added.

import { createClient } from '@supabase/supabase-js'

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, REEL_EMAIL, REEL_PASSWORD } = process.env

if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check .env')
  process.exit(1)
}
if (!REEL_EMAIL || !REEL_PASSWORD) {
  console.error('Missing REEL_EMAIL / REEL_PASSWORD — copy .env.reels.example to .env.reels and fill in your demo account')
  process.exit(1)
}

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

const iso = d => d.toISOString().slice(0, 10)
const daysFromNow = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

async function main() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: REEL_EMAIL, password: REEL_PASSWORD })
  if (authError || !auth.user) {
    console.error('Sign-in failed:', authError?.message ?? 'unknown error')
    process.exit(1)
  }
  const userId = auth.user.id
  console.log(`Signed in as ${REEL_EMAIL} (${userId})`)

  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', userId).eq('is_active', true).order('created_at').limit(1)
  const account = accounts?.[0]
  if (!account) {
    console.error('No account found for this user. Log into the app as the demo account, complete onboarding, and add one bank account first.')
    process.exit(1)
  }
  console.log(`Using account "${account.name}" (${account.id})`)

  const { data: categories } = await supabase.from('categories').select('*').eq('user_id', userId)
  const catByName = name => {
    const cat = categories?.find(c => c.name === name)
    if (!cat) throw new Error(`Category "${name}" not found — has the demo account logged into the app at least once?`)
    return cat.id
  }

  // ── Reset: wipe old seed data, reset balance to a clean baseline ──────────
  await supabase.from('transactions').delete().eq('user_id', userId)
  await supabase.from('commitments').delete().eq('user_id', userId)

  const BASELINE_BALANCE = 8000
  await supabase.from('accounts').update({ current_balance: BASELINE_BALANCE }).eq('id', account.id)

  // ── Commitments ─────────────────────────────────────────────────────────
  const emiDue = daysFromNow(2)
  const rentDue = daysFromNow(16)

  const { error: commitError } = await supabase.from('commitments').insert([
    {
      user_id: userId,
      name: 'Bike EMI',
      amount: 4500,
      remaining: 4500,
      category_id: catByName('Loan EMI'),
      is_recurring: true,
      frequency: 'monthly',
      due_day: emiDue.getDate(),
      due_date: iso(emiDue),
      from_account_id: account.id,
      is_active: true,
      last_paid_date: iso(daysFromNow(-28)),
      total_installments: 18,
      current_installment: 6,
    },
    {
      user_id: userId,
      name: 'Rent',
      amount: 18000,
      remaining: 18000,
      category_id: catByName('Rent'),
      is_recurring: true,
      frequency: 'monthly',
      due_day: rentDue.getDate(),
      due_date: iso(rentDue),
      from_account_id: account.id,
      is_active: true,
      last_paid_date: iso(daysFromNow(-14)),
      total_installments: null,
      current_installment: 0,
    },
  ])
  if (commitError) throw commitError
  console.log('Seeded commitments: Bike EMI (due in 2 days), Rent (due in 16 days)')

  // ── Transactions ────────────────────────────────────────────────────────
  // Chronological: salary, then ~3 weeks of everyday spends. Today is left
  // free of a "chai" transaction on purpose — that's added live on camera
  // for the Quick Add + AI auto-categorize reel.
  const txns = [
    { daysAgo: 18, type: 'expense', desc: 'BigBasket', amount: 2100, category: 'Groceries' },
    { daysAgo: 16, type: 'expense', desc: 'Petrol',    amount: 1000, category: 'Fuel' },
    { daysAgo: 14, type: 'expense', desc: 'Chai',      amount: 40,   category: 'Tea & Snacks' },
    { daysAgo: 12, type: 'expense', desc: 'Zomato',    amount: 520,  category: 'Food' },
    { daysAgo: 9,  type: 'expense', desc: 'Amazon',    amount: 1200, category: 'Shopping' },
    { daysAgo: 6,  type: 'expense', desc: 'Swiggy',    amount: 340,  category: 'Food' },
    { daysAgo: 5,  type: 'income',  desc: 'Salary',    amount: 85000, category: 'Salary' },
    { daysAgo: 3,  type: 'expense', desc: 'Chai',      amount: 40,   category: 'Tea & Snacks' },
  ]

  for (const t of txns) {
    const amount = t.type === 'income' ? t.amount : t.amount
    const fromDelta = t.type === 'income' ? amount : -amount
    const { error } = await supabase.rpc('mp_execute_transaction', {
      p_user_id: userId,
      p_transaction_date: iso(daysFromNow(-t.daysAgo)),
      p_description: t.desc,
      p_amount: amount,
      p_transaction_type: t.type,
      p_category_id: catByName(t.category),
      p_from_account_id: account.id,
      p_to_account_id: null,
      p_credit_card_id: null,
      p_notes: '',
      p_borrowing_id: null,
      p_savings_id: null,
      p_is_credit: null,
      p_from_delta: fromDelta,
      p_to_delta: null,
      p_cc_delta: null,
    })
    if (error) throw error
  }
  console.log(`Seeded ${txns.length} transactions (1 salary + ${txns.length - 1} expenses)`)

  // ── Settings so Budget Strategy / Forecast render meaningfully ─────────
  const { error: settingsError } = await supabase.from('settings').update({
    monthly_salary: 85000,
    income_pattern: 'monthly',
    salary_date: daysFromNow(-5).getDate(),
    weekly_budget: 12000,
  }).eq('user_id', userId)
  if (settingsError) throw settingsError

  const { error: strategyError } = await supabase.from('budget_strategy_settings').update({ budget_strategy: 'balanced' }).eq('user_id', userId)
  if (strategyError) throw strategyError

  const { error: forecastError } = await supabase.from('forecast_settings').update({ enabled: true }).eq('user_id', userId)
  if (forecastError) throw forecastError

  const { data: finalAccount } = await supabase.from('accounts').select('current_balance').eq('id', account.id).single()
  console.log(`Done. Account balance: baseline ₹${BASELINE_BALANCE.toLocaleString('en-IN')} → ₹${finalAccount.current_balance.toLocaleString('en-IN')}`)
  console.log('Ready to record. Log into the app as the demo account to see the seeded state.')
}

main().catch(err => { console.error(err); process.exit(1) })
