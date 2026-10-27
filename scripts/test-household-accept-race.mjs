// Race tests for Household (supabase/migrations/20261027000001_household.sql).
//
// LOCAL DATABASE ONLY — `supabase start`, apply the migration, then:
//   npm i --no-save pg
//   node scripts/test-household-accept-race.mjs postgresql://postgres:postgres@127.0.0.1:54322/postgres
//
// Refuses any URL that isn't localhost. Uses separate connections acting as
// different `authenticated` users (forged request.jwt.claims, as the SQL tests
// do) to race the paths a single transaction can't exercise:
//   1. two users accepting the same invite token at once → exactly one joins
//   2. two direct member inserts into a one-member household → cap holds
//   3. one user creating two households at once → exactly one
//   4. concurrent shared-transaction inserts from both members → total = sum
// Test users use a fixed id prefix; their household rows and users are removed
// at the end.

import pg from 'pg'

const url = process.argv[2]
if (!url || !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
  console.error('Usage: node scripts/test-household-accept-race.mjs <local postgres url>  (localhost only)')
  process.exit(2)
}

const P = new pg.Client({ connectionString: url })   // postgres: setup, checks, cleanup
const X = new pg.Client({ connectionString: url })
const Y = new pg.Client({ connectionString: url })
await P.connect(); await X.connect(); await Y.connect()

const PREFIX = '00000000-0000-4000-e900-'
let seq = 0
const newId = () => PREFIX + String(++seq).padStart(12, '0')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failures = 0
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg) } }

async function newUser() {
  const id = newId()
  await P.query(`insert into auth.users (id, email, is_anonymous, aud, role, created_at, updated_at)
                 values ($1, $2, false, 'authenticated', 'authenticated', now(), now())`, [id, `hh-race-${id.slice(-6)}@example.invalid`])
  return id
}

// Runs fn inside a transaction on `client` as user `uid`; resolves to fn's result.
async function asUser(client, uid, fn, { holdMs = 0 } = {}) {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    await client.query('set local role authenticated')
    const out = await fn(client)
    if (holdMs) await sleep(holdMs)
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback')
    throw err
  }
}

async function householdWithInvite() {
  const owner = await newUser()
  const { hid, token } = await asUser(P, owner, async c => {
    const hid = (await c.query(`select mp_household_create('Race home', 'Owner') as id`)).rows[0].id
    const token = (await c.query(`select mp_household_create_invite($1) ->> 'token' as t`, [hid])).rows[0].t
    return { hid, token }
  })
  return { owner, hid, token }
}

const activeMembers = async hid =>
  Number((await P.query(`select count(*) from public.household_members where household_id = $1 and status = 'active'`, [hid])).rows[0].count)

// Household rows are never deleted by the feature (every FK is RESTRICT), so
// the test removes its own, children first, before deleting its users.
async function cleanup() {
  const ids = (await P.query(`select distinct household_id as id from public.household_members where user_id::text like $1`, [PREFIX + '%'])).rows.map(r => r.id)
  if (ids.length) {
    await P.query('delete from public.household_budgets      where household_id = any($1)', [ids])
    await P.query('delete from public.household_transactions where household_id = any($1)', [ids])
    await P.query('delete from public.household_invites      where household_id = any($1)', [ids])
    await P.query('delete from public.household_categories where household_id = any($1)', [ids])
    await P.query('delete from public.household_members    where household_id = any($1)', [ids])
    await P.query('delete from public.households           where id = any($1)', [ids])
  }
  await P.query('delete from auth.users where id::text like $1', [PREFIX + '%'])
}

try {
  await cleanup()

  // 1a. Deterministic: X accepts and holds its transaction; Y accepts meanwhile
  //     (blocks on the household lock), then X commits. Y must fail.
  {
    const { hid, token } = await householdWithInvite()
    const ux = await newUser(), uy = await newUser()
    const xDone = asUser(X, ux, c => c.query(`select mp_household_accept_invite($1, 'X')`, [token]), { holdMs: 300 })
    await sleep(50)
    const yDone = asUser(Y, uy, c => c.query(`select mp_household_accept_invite($1, 'Y')`, [token]))
    const [xr, yr] = await Promise.allSettled([xDone, yDone])
    check(xr.status === 'fulfilled', `1a: first accept failed: ${xr.reason?.message}`)
    check(yr.status === 'rejected' && yr.reason?.code === 'PT422', `1a: second accept was not refused (${yr.status} ${yr.reason?.code})`)
    check(await activeMembers(hid) === 2, '1a: household does not have exactly 2 members')
  }

  // 1b. 50 random interleavings of the same race.
  for (let i = 0; i < 50; i++) {
    const { hid, token } = await householdWithInvite()
    const ux = await newUser(), uy = await newUser()
    const results = await Promise.allSettled([
      sleep(Math.random() * 10).then(() => asUser(X, ux, c => c.query(`select mp_household_accept_invite($1, 'X')`, [token]), { holdMs: Math.random() * 10 })),
      sleep(Math.random() * 10).then(() => asUser(Y, uy, c => c.query(`select mp_household_accept_invite($1, 'Y')`, [token]), { holdMs: Math.random() * 10 })),
    ])
    const ok = results.filter(r => r.status === 'fulfilled').length
    check(ok === 1, `1b.${i}: ${ok} accepts succeeded (expected exactly 1)`)
    check(await activeMembers(hid) === 2, `1b.${i}: member count is not 2`)
  }

  // 2. Under the RPCs: two concurrent direct member inserts (as postgres, so
  //    only the cap trigger stands in the way) into a one-member household.
  for (let i = 0; i < 20; i++) {
    const { hid } = await householdWithInvite()
    const ux = await newUser(), uy = await newUser()
    const insert = (client, uid) => (async () => {
      await client.query('begin')
      try {
        await client.query(`insert into public.household_members (household_id, user_id, display_name) values ($1, $2, 'Direct')`, [hid, uid])
        await sleep(Math.random() * 10)
        await client.query('commit')
      } catch (err) { await client.query('rollback'); throw err }
    })()
    const results = await Promise.allSettled([insert(X, ux), insert(Y, uy)])
    check(results.filter(r => r.status === 'fulfilled').length === 1, `2.${i}: cap let both or neither in`)
    check(await activeMembers(hid) === 2, `2.${i}: member count is not 2`)
  }

  // 3. One user creating two households at the same moment → exactly one.
  for (let i = 0; i < 20; i++) {
    const u = await newUser()
    const results = await Promise.allSettled([
      asUser(X, u, c => c.query(`select mp_household_create('One', 'U')`), { holdMs: Math.random() * 10 }),
      asUser(Y, u, c => c.query(`select mp_household_create('Two', 'U')`), { holdMs: Math.random() * 10 }),
    ])
    check(results.filter(r => r.status === 'fulfilled').length === 1, `3.${i}: not exactly one household created`)
    const n = Number((await P.query(`select count(*) from public.household_members where user_id = $1 and status = 'active'`, [u])).rows[0].count)
    check(n === 1, `3.${i}: user active in ${n} households`)
  }

  // 4. Both members insert 50 rows each, concurrently; the total is exact.
  {
    const { hid, owner, token } = await householdWithInvite()
    const partner = await newUser()
    await asUser(P, partner, c => c.query(`select mp_household_accept_invite($1, 'Partner')`, [token]))
    const memberOf = async uid => (await asUser(P, uid, c => c.query(`select mp_household_current() ->> 'member_id' as m`))).rows[0].m
    const [mo, mp] = [await memberOf(owner), await memberOf(partner)]
    const amounts = Array.from({ length: 100 }, (_, i) => (i % 7) * 100 + 0.01 * (i % 13) + 1)
    const run = (client, uid, member, list) => (async () => {
      for (const a of list) {
        await asUser(client, uid, c => c.query(
          `insert into household_transactions (household_id, type, amount, txn_date, paid_by_member_id)
           values ($1, 'expense', $2, current_date, $3)`, [hid, a, member]))
      }
    })()
    await Promise.all([run(X, owner, mo, amounts.slice(0, 50)), run(Y, partner, mp, amounts.slice(50))])
    const { rows } = await P.query(`select count(*)::int as n, sum(amount)::text as s from public.household_transactions where household_id = $1`, [hid])
    const expected = (Math.round(amounts.reduce((s, a) => s + Math.round(a * 100), 0)) / 100).toFixed(2)
    check(rows[0].n === 100, `4: ${rows[0].n} rows, expected 100`)
    check(rows[0].s === expected, `4: total ${rows[0].s}, expected ${expected}`)
  }

  console.log(failures === 0 ? 'HOUSEHOLD RACE CHECKS PASSED' : `${failures} FAILURE(S)`)
} finally {
  for (const c of [X, Y, P]) { try { await c.query('rollback') } catch { /* not in a transaction */ } }
  await cleanup()
  await P.end(); await X.end(); await Y.end()
}
process.exit(failures === 0 ? 0 : 1)
