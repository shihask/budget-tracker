// Reads every fixture under fixtures/ and generates SQL that inserts them as
// real sync_events rows (plus any scenario.existing_transaction) against a
// given, already-linked sync_connections row — standing in for what a real
// AA webhook would have written, so useSyncPromotion never knows the
// difference. See scripts/aa-test-data/README.md for the full flow.
//
// Mirrors this repo's set_config('request.jwt.claims', ...) RLS-simulation
// pattern (used throughout Phase 1b's own live RPC verification) rather than
// a real sign-in flow — no credentials to manage.
//
// Usage: node insert-fixtures.mjs --connection-id <sync_connections.id> [--confirm]
//
// Without --confirm this is a dry run: resolves the connection, lists every
// fixture that would be inserted, and stops. Nothing is written to the
// database until --confirm is passed explicitly and separately — unlike the
// rest of this session's disposable-synthetic-UUID test data, this script is
// meant to be rerun against whatever connection you point it at, including
// potentially a real one, so it should never write by accident.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

function parseArgs() {
  const args = process.argv.slice(2)
  const idIdx = args.indexOf('--connection-id')
  const connectionId = idIdx >= 0 ? args[idIdx + 1] : null
  const confirm = args.includes('--confirm')
  if (!connectionId) {
    console.error('Usage: node insert-fixtures.mjs --connection-id <sync_connections.id> [--confirm]')
    process.exit(1)
  }
  return { connectionId, confirm }
}

function loadFixtures() {
  const files = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) files.push(full)
    }
  }
  walk(FIXTURES_DIR)
  return files.sort().map(f => ({ relPath: path.relative(FIXTURES_DIR, f), fixture: JSON.parse(readFileSync(f, 'utf8')) }))
}

function runSql(sql) {
  const tmp = path.join(os.tmpdir(), `aa-fixture-resolve-${Date.now()}.sql`)
  writeFileSync(tmp, sql)
  const out = execSync(`npx --yes supabase db query --linked --file "${tmp}"`, { encoding: 'utf8' })
  const jsonStart = out.indexOf('{')
  if (jsonStart === -1) throw new Error(`Unexpected supabase db query output:\n${out}`)
  return JSON.parse(out.slice(jsonStart))
}

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

function sqlJson(v) {
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
}

function main() {
  const { connectionId, confirm } = parseArgs()
  const fixtures = loadFixtures()

  console.log(`Resolving connection ${connectionId}...`)
  const resolved = runSql(`
    SELECT sc.user_id, sc.provider_connection_id, sc.status,
           (SELECT ac.provider_account_id FROM account_connections ac
            WHERE ac.provider_connection_id = sc.provider_connection_id LIMIT 1) AS provider_account_id
    FROM sync_connections sc WHERE sc.id = '${connectionId}';
  `)
  const row = resolved.rows?.[0]
  if (!row) {
    console.error(`No sync_connections row found for id ${connectionId}`)
    process.exit(1)
  }
  if (!row.provider_account_id) {
    console.error(`Connection ${connectionId} has no linked account yet (no account_connections row) — link it via "Confirm accounts" in the app first, then rerun.`)
    process.exit(1)
  }

  console.log(`  user_id=${row.user_id}`)
  console.log(`  status=${row.status}`)
  console.log(`  provider_connection_id=${row.provider_connection_id}`)
  console.log(`  provider_account_id=${row.provider_account_id}`)
  console.log(`\nFixtures (${fixtures.length}):`)
  for (const { relPath, fixture } of fixtures) {
    console.log(`  - ${fixture.id} (${relPath}) → expect ${fixture.expectation.promotion_action}`)
  }

  if (!confirm) {
    console.log('\nDry run only — pass --confirm to generate the insert SQL.')
    return
  }

  const lines = [`SELECT set_config('request.jwt.claims', json_build_object('sub', '${row.user_id}')::text, true);`]

  for (const { fixture } of fixtures) {
    const s = fixture.scenario
    if (s.existing_transaction) {
      const et = s.existing_transaction
      lines.push(
        `INSERT INTO transactions (user_id, transaction_date, description, amount, transaction_type, from_account_id, notes) VALUES ` +
        `('${row.user_id}', ${sqlStr(et.transaction_date)}, ${sqlStr(et.description)}, ${et.amount}, ${sqlStr(et.transaction_type)}, ` +
        `(SELECT account_id FROM account_connections WHERE provider_connection_id = ${sqlStr(row.provider_connection_id)} LIMIT 1), '');`
      )
    }
    lines.push(
      `INSERT INTO sync_events (user_id, connection_id, provider, provider_connection_id, provider_account_id, provider_event_id, event_type, raw_payload, provider_metadata, status) VALUES ` +
      `('${row.user_id}', '${connectionId}', 'aa', ${sqlStr(row.provider_connection_id)}, ${sqlStr(row.provider_account_id)}, ${sqlStr(s.provider_event_id)}, ` +
      `'transaction', ${sqlJson(s.raw_payload)}, ${sqlJson(s.provider_metadata)}, 'pending');`
    )
  }

  const outPath = path.join(os.tmpdir(), `aa-fixtures-insert-${Date.now()}.sql`)
  writeFileSync(outPath, lines.join('\n\n') + '\n')
  console.log(`\nSQL written to: ${outPath}`)
  console.log(`Run it with:\n  npx --yes supabase db query --linked --file "${outPath}"`)
}

main()
