// Race test for mp_purge_stale_guests (supabase/migrations/20261016000002_guest_mode.sql).
//
// LOCAL DATABASE ONLY — `supabase start`, then:
//   npm i --no-save pg
//   node scripts/test-guest-purge-race.mjs postgresql://postgres:postgres@127.0.0.1:54322/postgres
//
// Refuses any URL that isn't localhost. Uses two connections to interleave a
// guest being saved (GoTrue's UPDATE of auth.users) with the purge, and checks
// that a permanent or recently active user is never deleted. Test users are
// created with fixed-prefix ids and removed at the end.

import pg from 'pg'

const url = process.argv[2]
if (!url || !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
  console.error('Usage: node scripts/test-guest-purge-race.mjs <local postgres url>  (localhost only)')
  process.exit(2)
}

const A = new pg.Client({ connectionString: url })   // plays GoTrue saving the guest / adding a row
const B = new pg.Client({ connectionString: url })   // plays the cron purge
await A.connect(); await B.connect()

const PREFIX = '00000000-0000-4000-c000-'
let seq = 0
const newId = () => PREFIX + String(++seq).padStart(12, '0')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failures = 0
const check = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg) } }

async function staleGuest() {
  const id = newId()
  await A.query(
    `insert into auth.users (id, is_anonymous, aud, role, created_at, updated_at, last_sign_in_at)
     values ($1, true, 'authenticated', 'authenticated', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days')`, [id])
  await A.query(`insert into public.accounts (id, user_id, name, type, created_at) values (gen_random_uuid(), $1, 'Cash', 'cash', now() - interval '40 days')`, [id])
  return id
}
const exists = async id => (await A.query('select 1 from auth.users where id = $1', [id])).rowCount === 1

async function cleanup() {
  await A.query(`delete from auth.users where id::text like $1`, [PREFIX + '%'])
}

try {
  await cleanup()

  // 1. A is saving the guest (row locked, not committed): the purge skips it.
  {
    const g = await staleGuest()
    await A.query('begin')
    await A.query(`update auth.users set is_anonymous = false, email = $2 where id = $1`, [g, `race-${g.slice(-4)}@example.invalid`])
    const t0 = Date.now()
    await B.query('select public.mp_purge_stale_guests(500)')
    check(Date.now() - t0 < 5000, '1: purge waited on the locked row instead of skipping it')
    await A.query('commit')
    check(await exists(g), '1: guest being saved was deleted')
  }

  // 2. B purges first and holds its transaction: A's save then finds no row.
  //    Only possible for a guest idle 30+ days; the save must fail cleanly.
  {
    const g = await staleGuest()
    await B.query('begin')
    const { rows } = await B.query('select public.mp_purge_stale_guests(500) as n')
    check(rows[0].n >= 1, '2: purge did not take the stale guest')
    const save = A.query(`update auth.users set is_anonymous = false, email = $2 where id = $1`, [g, `race2-${g.slice(-4)}@example.invalid`])
    await sleep(300)
    await B.query('commit')
    const res = await save
    check(res.rowCount === 0, '2: save updated a row that was being purged')
    check(!(await exists(g)), '2: half-state — purged guest still present')
  }

  // 3. A fresh transaction committed just before the purge keeps the guest.
  {
    const g = await staleGuest()
    const acc = (await A.query('select id from public.accounts where user_id = $1', [g])).rows[0].id
    await A.query(`insert into public.transactions (user_id, amount, description, from_account_id, transaction_type, transaction_date)
                   values ($1, 10, 'tea', $2, 'expense', current_date)`, [g, acc])
    await B.query('select public.mp_purge_stale_guests(500)')
    check(await exists(g), '3: guest with a fresh transaction was deleted')
  }

  // 4. 100 random interleavings of 1 and 3; a saved or active user is never deleted.
  for (let i = 0; i < 100; i++) {
    const g = await staleGuest()
    const mode = i % 2 === 0 ? 'save' : 'activity'
    const delay = Math.floor(Math.random() * 20)
    const acc = (await A.query('select id from public.accounts where user_id = $1', [g])).rows[0].id
    const writer = (async () => {
      await sleep(delay)
      if (mode === 'save') {
        await A.query('begin')
        const r = await A.query(`update auth.users set is_anonymous = false, email = $2 where id = $1`, [g, `r${i}-${g.slice(-4)}@example.invalid`])
        await sleep(Math.floor(Math.random() * 20))
        await A.query('commit')
        return r.rowCount === 1
      }
      const r = await A.query(`insert into public.transactions (user_id, amount, description, from_account_id, transaction_type, transaction_date)
                               select $1, 10, 'tea', $2, 'expense', current_date where exists (select 1 from auth.users where id = $1)`, [g, acc])
      return r.rowCount === 1
    })()
    await sleep(Math.floor(Math.random() * 20))
    await B.query('select public.mp_purge_stale_guests(500)')
    const wrote = await writer.catch(() => false)
    // If the write landed, the user must still exist. If the purge won first,
    // the write must not have landed (no orphan, no half-upgraded user).
    if (wrote) check(await exists(g), `4.${i} (${mode}): a user whose write succeeded was deleted`)
  }

  console.log(failures === 0 ? 'GUEST PURGE RACE CHECKS PASSED' : `${failures} FAILURE(S)`)
} finally {
  try { await A.query('rollback') } catch { /* not in a transaction */ }
  try { await B.query('rollback') } catch { /* not in a transaction */ }
  await cleanup()
  await A.end(); await B.end()
}
process.exit(failures === 0 ? 0 : 1)
