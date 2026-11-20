import { describe, it, expect } from 'vitest'
import { computeSettlement, verifyPlan, KITTY_ID, type SettlementComputation, type Position } from '../settlement'
import { computeSettlement as computeSettlementV111 } from './settlementV111'
import { normalizeSharedBy, resolveSharedBy, sharedByCount, sharedByText } from '../sharedBy'
import { notes } from '../settlementCopy'
import type { ProjectMember, ProjectTransaction } from '../../types'

const member = (name: string, order: number, share_ratio = 1, is_active = true): ProjectMember => ({
  id: name.toLowerCase(), project_id: 'p', name, email: null, share_ratio, display_order: order, is_active, created_at: '',
})
let seq = 0
const contrib = (amount: number, who: string | null): ProjectTransaction => ({
  id: `c${seq++}`, project_id: 'p', member_id: who?.toLowerCase() ?? null, transaction_type: 'contribution', amount,
  description: null, category: null, notes: null, transaction_date: '2026-11-18', display_order: 0, created_at: '',
})
const spend = (amount: number, who: string | null = null, sharedBy?: unknown, description: string | null = null): ProjectTransaction => ({
  ...contrib(amount, who), id: `e${seq++}`, transaction_type: 'expense', description,
  ...(sharedBy === undefined ? {} : { shared_by: sharedBy as string[] }),
})
const shares = (r: SettlementComputation) => Object.fromEntries(r.participants.filter(p => p.kind === 'member').map(p => [p.name, p.share / 100]))
const nets = (r: SettlementComputation) => Object.fromEntries(r.participants.map(p => [p.name, p.net / 100]))
/** Without the v1.113 payment fields (each checked to be zero first), for parity with older engines. */
function withoutPaymentFields(r: SettlementComputation) {
  expect(r.paymentCount).toBe(0)
  expect([r.kitty.paidOut, r.kitty.toppedUp, ...r.participants.map(p => p.settled)].every(v => v === 0)).toBe(true)
  const rest: Partial<SettlementComputation> = { ...r }
  delete rest.paymentCount
  const kitty: Partial<SettlementComputation['kitty']> = { ...r.kitty }
  delete kitty.paidOut
  delete kitty.toppedUp
  const participants = r.participants.map(p => { const q: Partial<typeof p> = { ...p }; delete q.settled; return q })
  return { ...rest, kitty, participants }
}
const ABCD = () => ['A', 'B', 'C', 'D'].map((n, i) => member(n, i))

function expectBalanced(r: SettlementComputation) {
  expect(r.balanced).toBe(true)
  expect(r.participants.reduce((s, p) => s + p.net, 0)).toBe(0)
  const positions: Position[] = r.participants.map((p, i) => ({ party: { kind: p.kind, id: p.id, name: p.name }, order: i, amount: p.net }))
  expect(verifyPlan(positions, r.transfers).ok).toBe(true)
  // Σ shares = all expenses − group money, whatever the groups.
  const sumShares = r.participants.reduce((s, p) => s + p.share, 0)
  expect(sumShares).toBe(r.totals.expenses - r.totals.groupMoney)
}

// ── Parity: all-NULL ledgers settle exactly as v1.111.0 ───────────────────

describe('parity with v1.111.0 (every expense is Everyone)', () => {
  it('500 random ledgers give identical results', () => {
    let s = 112
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    for (let i = 0; i < 500; i++) {
      const members = Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, k) =>
        member(`M${k}`, Math.floor(rnd() * 3), pick([0, 1, 1, 1, 2, 1.5]), rnd() > 0.2))
      const who = () => (rnd() < 0.25 ? null : pick(members).name)
      const txns = Array.from({ length: Math.floor(rnd() * 25) }, () =>
        rnd() < 0.4 ? contrib(Math.round(rnd() * 500000) / 100, who()) : spend(Math.round(rnd() * 500000) / 100, who()))
      const inflows = rnd() < 0.2 ? Math.round(rnd() * 300000) / 100 : 0
      expect(withoutPaymentFields(computeSettlement(members, txns, { kittyInflows: inflows }))).toEqual(computeSettlementV111(members, txns, { kittyInflows: inflows }))
    }
  })
  it('an explicit shared_by: null is still Everyone', () => {
    const t = [contrib(1000, 'A'), spend(800, null, null), spend(300, 'B')]
    expect(withoutPaymentFields(computeSettlement(ABCD(), t))).toEqual(computeSettlementV111(ABCD(), t))
  })
})

// ── Explicit groups ───────────────────────────────────────────────────────

describe('explicit groups', () => {
  it('split only among the selected, mixed with Everyone', () => {
    const r = computeSettlement(ABCD(), [
      ...['A', 'B', 'C', 'D'].map(n => contrib(100, n)),
      spend(900, 'A', ['a', 'b', 'c'], 'Dinner'), // D skipped dinner
      spend(400),                                // resort, everyone
    ])
    expectBalanced(r)
    expect(shares(r)).toEqual({ A: 400, B: 400, C: 400, D: 100 })
    expect(nets(r)).toEqual({ A: 600, B: -300, C: -300, D: 0, Kitty: 0 })
  })
  it('unequal ratios and an odd paisa use the same exact allocation', () => {
    const m = [member('A', 0, 2), member('B', 1), member('C', 2)]
    const r = computeSettlement(m, [spend(100.01, 'C', ['a', 'b'])])
    expectBalanced(r)
    expect(r.participants.slice(0, 3).map(p => p.share)).toEqual([6667, 3334, 0])
  })
  it('duplicated ids get single weight', () => {
    const r = computeSettlement(ABCD(), [spend(300, 'A', ['a', 'b', 'b', 'b'])])
    expectBalanced(r)
    expect(shares(r)).toEqual({ A: 150, B: 150, C: 0, D: 0 })
  })
  it('order of ids does not matter (display order decides ties)', () => {
    const a = computeSettlement(ABCD(), [spend(100, 'A', ['c', 'a', 'b'])])
    const b = computeSettlement(ABCD(), [spend(100, 'A', ['b', 'c', 'a'])])
    expect(a).toEqual(b)
    expect(a.participants.slice(0, 3).map(p => p.share)).toEqual([3334, 3333, 3333])
  })
})

// ── Inactive members ──────────────────────────────────────────────────────

describe('inactive members', () => {
  const crew = () => [...ABCD(), member('Ira', 4, 1, false)]
  it('excluded from Everyone, charged when explicitly selected (and can then owe)', () => {
    const r = computeSettlement(crew(), [contrib(500, 'A'), spend(300), spend(200, null, ['a', 'ira'])])
    expectBalanced(r)
    expect(shares(r)).toEqual({ A: 175, B: 75, C: 75, D: 75, Ira: 100 })
    expect(nets(r).Ira).toBe(-100)
    expect(r.participants.find(p => p.name === 'Ira')!.active).toBe(false) // never reactivated
  })
  it('left midway: kept active and excluded from later expenses', () => {
    const r = computeSettlement(ABCD(), [
      ...['A', 'B', 'C', 'D'].map(n => contrib(1000, n)),
      spend(2000),                               // days 1–2: everyone
      spend(1500, null, ['a', 'b', 'c']),        // day 3: D left
    ])
    expectBalanced(r)
    expect(shares(r)).toEqual({ A: 1000, B: 1000, C: 1000, D: 500 })
    expect(nets(r)).toEqual({ A: 0, B: 0, C: 0, D: 500, Kitty: -500 })
  })
  it('caution pinned: marking them inactive afterwards also drops them from earlier Everyone expenses', () => {
    const m = [...ABCD().slice(0, 3), member('D', 3, 1, false)]
    const r = computeSettlement(m, [...['A', 'B', 'C', 'D'].map(n => contrib(1000, n)), spend(2000), spend(1500, null, ['a', 'b', 'c'])])
    expect(shares(r).D).toBe(0) // why the guidance is "keep them active"
  })
})

// ── Group money and the kitty are unchanged ───────────────────────────────

describe('group money and kitty', () => {
  it('group money lowers the Everyone pool only', () => {
    const r = computeSettlement(['A', 'B', 'C'].map((n, i) => member(n, i)), [
      contrib(300, null),                 // sponsor
      spend(600),                         // everyone: (600 − 300) / 3
      spend(300, 'A', ['a']),             // A's own
    ])
    expectBalanced(r)
    expect(shares(r)).toEqual({ A: 400, B: 100, C: 100 })
    expect(r.kitty.balance).toBe(300 * 100 - 600 * 100)
  })
})

// ── Invalid groups block settlement ───────────────────────────────────────

describe('invalid groups', () => {
  const blocked = (r: SettlementComputation) => { expect(r.balanced).toBe(false); expect(r.transfers).toEqual([]) }
  it('foreign / deleted ids only → none_valid (never Everyone)', () => {
    const r = computeSettlement(ABCD(), [spend(500, 'A', ['other-project-member'], 'Dinner')])
    blocked(r)
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'invalid_participants', reason: 'none_valid', description: 'Dinner' }))
  })
  it('some ids deleted → informational note, split among the rest', () => {
    const r = computeSettlement(ABCD(), [spend(300, 'A', ['a', 'gone', 'b'])])
    expectBalanced(r)
    expect(shares(r)).toEqual({ A: 150, B: 150, C: 0, D: 0 })
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'deleted_participants', count: 1 }))
  })
  it('empty array, non-array, non-string elements → malformed', () => {
    for (const bad of [[], 'a', [1], [''], [null]]) {
      const r = computeSettlement(ABCD(), [spend(100, 'A', bad)])
      blocked(r)
      expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'invalid_participants', reason: 'malformed' }))
    }
  })
  it('selected members with combined ratio 0 → zero_ratio', () => {
    const m = [member('A', 0), member('Z', 1, 0)]
    const r = computeSettlement(m, [spend(100, 'A', ['z'])])
    blocked(r)
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'invalid_participants', reason: 'zero_ratio' }))
  })
  it('a selected inactive member with an invalid ratio → invalid_ratio', () => {
    const m = [member('A', 0), member('Ira', 1, NaN, false)]
    const r = computeSettlement(m, [spend(100, 'A', ['a', 'ira'])])
    blocked(r)
    expect(r.issues).toContainEqual({ kind: 'invalid_ratio', memberId: 'ira', value: NaN })
  })
  it('copy names the expense and the fix', () => {
    const r = computeSettlement(ABCD(), [spend(500, 'A', ['nobody'], 'Dinner')])
    expect(notes(r)[0]).toEqual({ tone: 'warn', text: '"Dinner" (Wed, 18 Nov) has no one left to share it. Edit who shared it to settle up.' })
    const d = computeSettlement(ABCD(), [spend(300, 'A', ['a', 'gone'])])
    expect(notes(d).map(x => x.text)).toContain("An expense (Wed, 18 Nov): 1 person who shared it is no longer in this project, so it's split among the rest.")
  })
})

// ── Property: random groups ───────────────────────────────────────────────

describe('property: 500 random ledgers with random groups', () => {
  it('balanced ones settle exactly; blocked ones carry a reason and no plan; deterministic', () => {
    let s = 2026
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    for (let i = 0; i < 500; i++) {
      const members = Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, k) =>
        member(`M${k}`, Math.floor(rnd() * 3), pick([0, 1, 1, 2, 1.5]), rnd() > 0.2))
      const ids = members.map(m => m.id)
      const group = () => {
        const g = ids.filter(() => rnd() < 0.5)
        if (rnd() < 0.05) g.push('ghost')
        return g.length ? g : [pick(ids)]
      }
      const txns = Array.from({ length: Math.floor(rnd() * 20) }, () =>
        rnd() < 0.35 ? contrib(Math.round(rnd() * 300000) / 100, rnd() < 0.2 ? null : pick(members).name)
          : spend(Math.round(rnd() * 300000) / 100, rnd() < 0.3 ? null : pick(members).name, rnd() < 0.5 ? group() : undefined))
      const r = computeSettlement(members, txns)
      if (r.balanced) {
        expectBalanced(r)
        expect(r.transfers.length).toBeLessThanOrEqual(Math.max(0, r.participants.filter(p => p.net !== 0).length - 1))
      } else {
        expect(r.transfers).toEqual([])
        expect(r.issues.some(x => ['no_sharers', 'invalid_participants', 'invalid_ratio'].includes(x.kind))).toBe(true)
      }
      expect(computeSettlement([...members].reverse(), [...txns].reverse())).toEqual({ ...r, issues: expect.anything() })
    }
  })
})

// ── Pure helpers ──────────────────────────────────────────────────────────

describe('sharedBy helpers', () => {
  const m = [...ABCD(), member('Ira', 4, 1, false)]
  it('normalize: exactly everyone active → NULL; otherwise ids in display order', () => {
    expect(normalizeSharedBy(['d', 'c', 'b', 'a'], m)).toBeNull()
    expect(normalizeSharedBy(['c', 'a'], m)).toEqual(['a', 'c'])
    expect(normalizeSharedBy(['a', 'b', 'c', 'd', 'ira'], m)).toEqual(['a', 'b', 'c', 'd', 'ira'])
    expect(normalizeSharedBy(['a', 'a', 'unknown'], m)).toEqual(['a'])
    expect(normalizeSharedBy([], m)).toEqual([])
  })
  it('resolve, count and text', () => {
    expect(resolveSharedBy(null, m)).toMatchObject({ everyone: true })
    const r = resolveSharedBy(['ira', 'a', 'gone', 'a'], m)
    expect(r).toMatchObject({ everyone: false, removed: 1, malformed: false })
    expect(r.people.map(p => p.id)).toEqual(['a', 'ira'])
    expect(sharedByText(r)).toBe('A, Ira (inactive) + 1 removed member')
    expect(sharedByText(resolveSharedBy(['gone'], m))).toBe('1 removed member')
    expect(sharedByText(resolveSharedBy([], m))).toBe("Couldn't read who shared this")
    expect(sharedByCount(spend(10, 'A', ['a', 'b', 'b']), m)).toBe(2)
    expect(sharedByCount(spend(10, 'A', ['a', 'gone']), m)).toBe(1) // matches the detail sheet
    expect(sharedByCount(spend(10, 'A'), m)).toBeNull()
    expect(sharedByCount(contrib(10, 'A'), m)).toBeNull()
  })
  it('kitty id never collides', () => expect(KITTY_ID).toBe('kitty'))
})
