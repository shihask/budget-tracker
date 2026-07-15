// Compares every fixture's expectation against what actually happened in the
// database after useSyncPromotion processed it (open the app with Track AA
// Sync on between insert-fixtures.mjs and this script — see README.md).
//
// Usage: node verify-fixtures.mjs
// Exit code is non-zero if anything fails, so this is usable as a real
// regression gate, not just a report.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

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
  return files.sort().map(f => JSON.parse(readFileSync(f, 'utf8')))
}

function runSql(sql) {
  const tmp = path.join(os.tmpdir(), `aa-fixture-verify-${Date.now()}.sql`)
  writeFileSync(tmp, sql)
  const out = execSync(`npx --yes supabase db query --linked --file "${tmp}"`, { encoding: 'utf8' })
  const jsonStart = out.indexOf('{')
  if (jsonStart === -1) throw new Error(`Unexpected supabase db query output:\n${out}`)
  return JSON.parse(out.slice(jsonStart))
}

function main() {
  const fixtures = loadFixtures()

  const result = runSql(`
    SELECT se.provider_event_id, se.status, se.promotion_action,
           t.description AS merged_description, c.group_name AS category_group
    FROM sync_events se
    LEFT JOIN transactions t ON t.sync_event_id = se.id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE se.provider_event_id LIKE 'fixture-%';
  `)
  const byEventId = new Map((result.rows ?? []).map(r => [r.provider_event_id, r]))

  let failed = 0
  console.log(`${'id'.padEnd(28)} ${'expected'.padEnd(14)} ${'actual'.padEnd(14)} result`)
  console.log('-'.repeat(70))

  for (const fixture of fixtures) {
    const actual = byEventId.get(fixture.scenario.provider_event_id)
    const exp = fixture.expectation
    const problems = []

    if (!actual) {
      problems.push('no sync_events row found — did you run insert-fixtures.mjs and let the app process it?')
    } else {
      if (actual.promotion_action !== exp.promotion_action) {
        problems.push(`promotion_action: expected "${exp.promotion_action}", got "${actual.promotion_action ?? 'null'}" (status=${actual.status})`)
      }
      if (exp.merged_into_description !== null && actual.merged_description !== exp.merged_into_description) {
        problems.push(`merged into "${actual.merged_description ?? 'null'}", expected "${exp.merged_into_description}"`)
      }
      if (exp.category_group !== null && actual.category_group !== exp.category_group) {
        problems.push(`category_group: expected "${exp.category_group}", got "${actual.category_group ?? 'null'}"`)
      }
    }

    const pass = problems.length === 0
    if (!pass) failed++
    console.log(`${fixture.id.padEnd(28)} ${exp.promotion_action.padEnd(14)} ${(actual?.promotion_action ?? '—').padEnd(14)} ${pass ? 'PASS' : 'FAIL'}`)
    for (const p of problems) console.log(`    ${p}`)
  }

  console.log('-'.repeat(70))
  console.log(`${fixtures.length - failed}/${fixtures.length} passed`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
