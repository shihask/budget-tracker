import { describe, it, expect } from 'vitest'
import {
  computeSettlement, allocate, planTransfers, verifyPlan, toPaise, KITTY_ID,
  type SettlementComputation, type Position, type Transfer,
} from '../settlement'
import { legacySettlement } from './legacySettlement'
import type { ProjectMember, ProjectTransaction } from '../../types'

// ── Fixture helpers (amounts in rupees, like the database) ───────────────

const member = (name: string, order: number, share_ratio = 1, is_active = true): ProjectMember => ({
  id: name.toLowerCase(), project_id: 'p', name, email: null, share_ratio, display_order: order, is_active, created_at: '',
})
const crew = (...names: string[]) => names.map((n, i) => member(n, i))
let seq = 0
const contrib = (amount: number, who: string | null): ProjectTransaction => ({
  id: `c${seq++}`, project_id: 'p', member_id: who?.toLowerCase() ?? null, transaction_type: 'contribution', amount,
  description: null, category: null, notes: null, transaction_date: '2026-11-18', display_order: 0, created_at: '',
})
const spend = (amount: number, who: string | null = null): ProjectTransaction => ({ ...contrib(amount, who), id: `e${seq++}`, transaction_type: 'expense' })

const rupees = (p: number) => p / 100
const nets = (r: SettlementComputation) => Object.fromEntries(r.participants.map(p => [p.name, rupees(p.net)]))
const plan = (r: SettlementComputation) => r.transfers.map(t => `${t.from.name}→${t.to.name} ${rupees(t.amount)}`)
const sumNets = (r: SettlementComputation) => r.participants.reduce((s, p) => s + p.net, 0)
const nonZero = (r: SettlementComputation) => r.participants.filter(p => p.net !== 0).length
const ABCD = () => crew('A', 'B', 'C', 'D')

function expectBalanced(r: SettlementComputation) {
  expect(r.balanced).toBe(true)
  expect(sumNets(r)).toBe(0)
  expect(r.transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero(r) - 1))
  for (const p of r.participants.filter(x => x.kind === 'member')) expect(p.putIn + p.paidPersonally - p.share).toBe(p.net)
  const kitty = r.participants.find(x => x.kind === 'kitty')!
  expect(kitty.net).toBe(0 - r.kitty.balance || 0)
}

// ── Money parsing ────────────────────────────────────────────────────────

describe('toPaise', () => {
  it('accepts finite non-negative amounts with ≤ 2 decimals', () => {
    expect(toPaise(0)).toBe(0)
    expect(toPaise(10467.08)).toBe(1046708)
    expect(toPaise(0.1 + 0.2)).toBe(30)
  })
  it('rejects everything else', () => {
    for (const bad of [-1, NaN, Infinity, 10.005, '12', null, undefined]) expect(toPaise(bad)).toBeNull()
  })
})

// ── Signed largest-remainder allocation ──────────────────────────────────

describe('allocate', () => {
  it('splits exactly, extra paise to the earliest on ties', () => {
    expect(allocate(100000, [1, 1, 1])).toEqual([33334, 33333, 33333])
    expect(allocate(2184708, [1, 1, 1, 1, 1, 1, 1])).toEqual([312102, 312101, 312101, 312101, 312101, 312101, 312101])
  })
  it('negative totals: same rule on |S|, then the sign', () => {
    expect(allocate(-100000, [1, 1, 1])).toEqual([-33334, -33333, -33333])
    expect(allocate(-5, [2, 1])).toEqual([-3, -2])
    expect(allocate(-80000, [2, 1])).toEqual([-53333, -26667])
  })
  it('largest remainder beats position', () => {
    expect(allocate(5, [2, 1])).toEqual([3, 2])
  })
  it('decimal ratios, zero weights, zero total', () => {
    expect(allocate(100, [1.5, 1])).toEqual([60, 40])
    expect(allocate(101, [1, 0, 1])).toEqual([51, 0, 50])
    expect(allocate(0, [1, 2])).toEqual([0, 0])
  })
  it('always sums exactly (random)', () => {
    let s = 7
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let i = 0; i < 300; i++) {
      const total = Math.round((rnd() - 0.5) * 1e8)
      const w = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => [0, 1, 2, 1.5, 3, 0.25][Math.floor(rnd() * 6)])
      if (!w.some(x => x > 0)) w[0] = 1
      expect(allocate(total, w).reduce((a, b) => a + b, 0)).toBe(total)
    }
  })
  it('refuses zero total weight', () => {
    expect(() => allocate(100, [0, 0])).toThrow()
  })
})

// ── Scenario table (proposal §6) ─────────────────────────────────────────

describe('scenarios', () => {
  it('1. kitty fully spent, no personal → everyone even', () => {
    const r = computeSettlement(ABCD(), [...['A', 'B', 'C', 'D'].map(n => contrib(2500, n)), spend(10000)])
    expectBalanced(r)
    expect(r.transfers).toEqual([])
  })
  it('2. kitty fully spent + personal', () => {
    const r = computeSettlement(ABCD(), [...['A', 'B', 'C', 'D'].map(n => contrib(2500, n)), spend(10000), spend(2000, 'D')])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: -500, B: -500, C: -500, D: 1500, Kitty: 0 })
    expect(plan(r)).toEqual(['A→D 500', 'B→D 500', 'C→D 500'])
  })
  it('3. kitty partly spent → kitty pays first', () => {
    const r = computeSettlement(ABCD(), [contrib(4000, 'A'), contrib(3000, 'B'), contrib(3000, 'C'), spend(9000), spend(2000, 'D'), spend(1000, 'A')])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: 2000, B: 0, C: 0, D: -1000, Kitty: -1000 })
    expect(plan(r)).toEqual(['Kitty→A 1000', 'D→A 1000'])
    expect(r.reconciliation).toEqual({ membersPay: 100000, kittyPays: 100000, kittyOwed: 0, membersReceive: 200000 })
  })
  it('4. leftover kitty reimburses', () => {
    const r = computeSettlement(ABCD(), [...['A', 'B', 'C', 'D'].map(n => contrib(2500, n)), spend(8000), spend(1200, 'B')])
    expectBalanced(r)
    expect(plan(r)).toEqual(['Kitty→B 1400', 'Kitty→A 200', 'Kitty→C 200', 'Kitty→D 200'])
  })
  it('5. leftover with no personal spend returns unspent contributions', () => {
    const r = computeSettlement(ABCD(), [...['A', 'B', 'C', 'D'].map(n => contrib(2500, n)), spend(9000)])
    expectBalanced(r)
    expect(plan(r)).toEqual(['Kitty→A 250', 'Kitty→B 250', 'Kitty→C 250', 'Kitty→D 250'])
  })
  it('6. share ratios with leftover', () => {
    const m = [member('A', 0, 2), member('B', 1), member('C', 2)]
    const r = computeSettlement(m, [contrib(5000, 'A'), contrib(2500, 'B'), contrib(2500, 'C'), spend(8000), spend(1200, 'C')])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: 400, B: 200, C: 1400, Kitty: -2000 })
    expect(plan(r)).toEqual(['Kitty→C 1400', 'Kitty→A 400', 'Kitty→B 200'])
  })
  it('7/8. unequal contributions, a non-contributor', () => {
    const r = computeSettlement(ABCD(), [contrib(6000, 'A'), contrib(3000, 'B'), contrib(1000, 'C'), spend(10000)])
    expectBalanced(r)
    expect(plan(r)).toEqual(['D→A 2500', 'C→A 1000', 'C→B 500'])
  })
  it('9. all personal', () => {
    const r = computeSettlement(ABCD(), [spend(3000, 'A'), spend(1000, 'B')])
    expectBalanced(r)
    expect(plan(r)).toEqual(['C→A 1000', 'D→A 1000'])
  })
  it('10. nothing recorded', () => {
    const r = computeSettlement(ABCD(), [])
    expectBalanced(r)
    expect(r.transfers).toEqual([])
    expect(r.totals.expenses).toBe(0)
  })
  it('11. contributions only — balanced (the UI shows "nothing spent yet" instead of this plan)', () => {
    const r = computeSettlement(ABCD(), ['A', 'B', 'C', 'D'].map(n => contrib(2500, n)))
    expectBalanced(r)
    expect(r.kitty.balance).toBe(1000000)
  })
  it('12. removed member\'s contribution is group money → everyone even, kitty matches cash', () => {
    const r = computeSettlement(crew('A', 'B', 'C'), [contrib(2000, null), contrib(2000, 'A'), contrib(2000, 'B'), contrib(2000, 'C'), spend(8000)])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: 0, B: 0, C: 0, Kitty: 0 })
    expect(r.kitty).toEqual({ balance: 0, unassigned: 200000, inflows: 0 })
    expect(r.issues).toContainEqual({ kind: 'unassigned_contributions', amount: 200000 })
  })
  it('12b. mixed: attributed + unassigned + inflow + kitty + personal', () => {
    const r = computeSettlement(crew('A', 'B', 'C'),
      [contrib(3000, 'A'), contrib(2000, 'B'), contrib(1500, null), spend(6000), spend(1800, 'C'), spend(600, 'A')],
      { kittyInflows: 500 })
    expectBalanced(r)
    expect(r.totals).toEqual({ expenses: 840000, groupMoney: 200000, sharedCost: 640000 })
    expect(r.participants.map(p => p.share)).toEqual([213334, 213333, 213333, 0])
    expect(nets(r)).toEqual({ A: 1466.66, B: -133.33, C: -333.33, Kitty: -1000 })
    expect(plan(r)).toEqual(['Kitty→A 1000', 'C→A 333.33', 'B→A 133.33'])
  })
  it('12c. inactive member keeps her claims, ratio 0', () => {
    const m = [member('A', 0, 2), member('B', 1), member('Ira', 2, 1, false)]
    const r = computeSettlement(m, [contrib(2000, 'A'), contrib(1000, 'B'), contrib(1000, 'Ira'), spend(3500), spend(300, 'Ira'), spend(400, 'B')])
    expectBalanced(r)
    expect(r.participants.find(p => p.name === 'Ira')!.share).toBe(0)
    expect(nets(r)).toEqual({ A: -800, B: 0, Ira: 1300, Kitty: -500 })
    expect(plan(r)).toEqual(['Kitty→Ira 500', 'A→Ira 800'])
  })
  it('12d. no one can share → unbalanced, cost reported, no plan', () => {
    const r = computeSettlement([member('Ira', 0, 1, false)], [contrib(1000, 'Ira'), spend(800), spend(500, 'Ira')])
    expect(r.balanced).toBe(false)
    expect(r.issues).toContainEqual({ kind: 'no_sharers', amount: 130000 })
    expect(r.transfers).toEqual([])
    expect(nets(r)).toEqual({ Ira: 1500, Kitty: -200 })
  })
  it('13. inactive member is owed', () => {
    const m = [member('A', 0), member('B', 1), member('Ira', 2, 1, false)]
    const r = computeSettlement(m, [contrib(1000, 'A'), contrib(1000, 'B'), contrib(1000, 'Ira'), spend(3000), spend(500, 'Ira')])
    expectBalanced(r)
    expect(plan(r)).toEqual(['A→Ira 750', 'B→Ira 750'])
  })
  it('14. future inflow lowers everyone\'s share', () => {
    const r = computeSettlement(ABCD(), [...['A', 'B', 'C', 'D'].map(n => contrib(2500, n)), spend(9000), spend(1000, 'D')], { kittyInflows: 2000 })
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: 500, B: 500, C: 500, D: 1500, Kitty: -3000 })
    expect(plan(r)).toEqual(['Kitty→D 1500', 'Kitty→A 500', 'Kitty→B 500', 'Kitty→C 500'])
  })
  it('15. paise rounding balances exactly', () => {
    const r = computeSettlement(crew('A', 'B', 'C'), [spend(1000, 'A')])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: 666.66, B: -333.33, C: -333.33, Kitty: 0 })
    expect(plan(r)).toEqual(['B→A 333.33', 'C→A 333.33'])
  })
  it('overspent kitty is owed a top-up', () => {
    const r = computeSettlement(crew('A', 'B'), [contrib(2000, 'A'), contrib(2000, 'B'), spend(4500)])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: -250, B: -250, Kitty: 500 })
    expect(plan(r)).toEqual(['A→Kitty 250', 'B→Kitty 250'])
    expect(r.issues).toContainEqual({ kind: 'kitty_overspent', amount: 50000 })
    expect(r.reconciliation.kittyOwed).toBe(50000)
  })
  it('a contribution from an unknown member id counts as unassigned', () => {
    const r = computeSettlement(crew('A', 'B'), [contrib(500, 'Ghost'), spend(500, 'A')])
    expectBalanced(r)
    expect(r.kitty.unassigned).toBe(50000)
  })
})

// ── Surplus: group money exceeds spending (S < 0) ────────────────────────

describe('surplus', () => {
  it('returns the surplus by share, with personal expenses', () => {
    const r = computeSettlement(crew('A', 'B'), [contrib(1000, 'A'), spend(1000), spend(500, 'B')], { kittyInflows: 3000 })
    expectBalanced(r)
    expect(r.totals.sharedCost).toBe(-150000)
    expect(r.participants.map(p => p.share)).toEqual([-75000, -75000, 0])
    expect(nets(r)).toEqual({ A: 1750, B: 1250, Kitty: -3000 })
    expect(plan(r)).toEqual(['Kitty→A 1750', 'Kitty→B 1250'])
  })
  it('unequal ratios and an odd paisa', () => {
    const m = [member('A', 0, 2), member('B', 1)]
    const r = computeSettlement(m, [spend(200, 'A')], { kittyInflows: 1000 })
    expectBalanced(r)
    expect(r.participants.map(p => p.share)).toEqual([-53333, -26667, 0])
    expect(nets(r)).toEqual({ A: 733.33, B: 266.67, Kitty: -1000 })
    expect(plan(r)).toEqual(['Kitty→A 733.33', 'Kitty→B 266.67'])
  })
})

// ── Payment plan ordering ────────────────────────────────────────────────

const pos = (name: string, amount: number, order: number, kind: 'member' | 'kitty' = 'member'): Position => ({
  party: { kind, id: kind === 'kitty' ? KITTY_ID : name.toLowerCase(), name }, order, amount,
})
const show = (ts: Transfer[]) => ts.map(t => `${t.from.name}→${t.to.name} ${t.amount}`)
const settleCheck = (ps: Position[], ts: Transfer[]) => {
  expect(verifyPlan(ps, ts).ok).toBe(true)
  expect(ts.length).toBeLessThanOrEqual(ps.filter(p => p.amount !== 0).length - 1)
}

describe('planTransfers', () => {
  it('exact pairs first', () => {
    const ps = [pos('A', -700, 0), pos('B', -300, 1), pos('C', 500, 2), pos('D', 300, 3), pos('E', 200, 4)]
    const ts = planTransfers(ps)
    expect(show(ts)[0]).toBe('B→D 300')
    settleCheck(ps, ts)
  })
  it('kitty first when it pays', () => {
    const ps = [pos('A', -1000, 0), pos('B', 2000, 1), pos('Kitty', -1000, 2, 'kitty')]
    expect(show(planTransfers(ps))).toEqual(['Kitty→B 1000', 'A→B 1000'])
  })
  it('kitty first when it is owed', () => {
    const ps = [pos('A', -300, 0), pos('B', -200, 1), pos('C', 100, 2), pos('Kitty', 400, 3, 'kitty')]
    const ts = planTransfers(ps)
    expect(show(ts)[0]).toBe('A→Kitty 300')
    settleCheck(ps, ts)
  })
  it('identical balances follow display order', () => {
    const ps = [pos('A', -100, 0), pos('B', -100, 1), pos('C', 100, 2), pos('D', 100, 3)]
    expect(show(planTransfers(ps))).toEqual(['A→C 100', 'B→D 100'])
  })
  it('zero positions never appear', () => {
    const ps = [pos('A', -100, 0), pos('Z', 0, 1), pos('B', 100, 2)]
    const ts = planTransfers(ps)
    expect(ts.some(t => t.from.name === 'Z' || t.to.name === 'Z')).toBe(false)
    expect(ts.every(t => t.amount > 0)).toBe(true)
  })
  it('deterministic under reordering', () => {
    const ps = [pos('A', -7001, 0), pos('B', -2999, 1), pos('C', 4000, 2), pos('D', 4000, 3), pos('E', 2000, 4), pos('Kitty', 0, 5, 'kitty')]
    const a = show(planTransfers(ps))
    expect(show(planTransfers([...ps].reverse()))).toEqual(a)
    expect(show(planTransfers([ps[3], ps[0], ps[5], ps[2], ps[4], ps[1]]))).toEqual(a)
  })
})

// ── Validation and the invariant gate ───────────────────────────────────

describe('validation', () => {
  it('invalid amounts block the plan', () => {
    for (const bad of [NaN, -5, 10.005]) {
      const r = computeSettlement(crew('A', 'B'), [spend(bad, 'A'), spend(100, 'B')])
      expect(r.balanced).toBe(false)
      expect(r.issues.some(i => i.kind === 'invalid_amount')).toBe(true)
      expect(r.transfers).toEqual([])
    }
  })
  it('invalid kittyInflows blocks the plan', () => {
    const r = computeSettlement(crew('A', 'B'), [spend(100, 'A')], { kittyInflows: -1 })
    expect(r.balanced).toBe(false)
    expect(r.transfers).toEqual([])
  })
  it('an invalid ratio on an active member blocks the plan', () => {
    const m = [member('A', 0, NaN), member('B', 1)]
    const r = computeSettlement(m, [spend(100, 'A')])
    expect(r.issues).toContainEqual({ kind: 'invalid_ratio', memberId: 'a', value: NaN })
    expect(r.transfers).toEqual([])
  })
})

describe('verifyPlan rejects every broken invariant', () => {
  const ps = [pos('A', -100, 0), pos('B', 100, 1)]
  const t = (amount: number, from = ps[0].party, to = ps[1].party): Transfer => ({ from, to, amount })
  it.each([
    ['non-integer position', [pos('A', -100.5, 0), pos('B', 100.5, 1)], [t(100)]],
    ['not summing to zero', [pos('A', -100, 0), pos('B', 90, 1)], [t(90)]],
    ['zero transfer', ps, [t(0), t(100)]],
    ['totals differ', ps, [t(60)]],
    ['not zero after transfers', ps, [t(60), { from: ps[1].party, to: ps[0].party, amount: 40 }]],
    ['unknown party', ps, [t(100, ps[0].party, { kind: 'member', id: 'x', name: 'X' })]],
  ])('%s', (_, positions, transfers) => {
    expect(verifyPlan(positions as Position[], transfers as Transfer[]).ok).toBe(false)
  })
  it('a breakdown that does not add up', () => {
    const bad = [{ kind: 'member' as const, id: 'a', name: 'A', active: true, putIn: 100, paidPersonally: 0, share: 50, net: 60 }]
    expect(verifyPlan(ps, [t(100)], bad).ok).toBe(false)
  })
})

// ── Property test ────────────────────────────────────────────────────────

describe('property: 500 random ledgers', () => {
  it('balance to zero, settle everyone exactly, stay within n − 1, deterministic', () => {
    let s = 20261119
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    for (let i = 0; i < 500; i++) {
      const members = Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, k) =>
        member(`M${k}`, Math.floor(rnd() * 3), pick([0, 1, 1, 1, 2, 1.5]), rnd() > 0.2))
      const who = () => (rnd() < 0.25 ? null : rnd() < 0.05 ? 'ghost' : pick(members).name)
      const txns = Array.from({ length: Math.floor(rnd() * 25) }, () =>
        (rnd() < 0.4 ? contrib : spend)(Math.round(rnd() * 500000) / 100, who()))
      const inflows = rnd() < 0.2 ? Math.round(rnd() * 300000) / 100 : 0
      const r = computeSettlement(members, txns, { kittyInflows: inflows })

      if (!r.balanced) {
        expect(r.issues.some(x => x.kind === 'no_sharers')).toBe(true)
        expect(r.transfers).toEqual([])
        continue
      }
      expectBalanced(r)
      const positions = r.participants.map((p, k) => pos(p.name, p.net, k, p.kind))
      expect(verifyPlan(positions, r.transfers).ok).toBe(true)
      const again = computeSettlement([...members].reverse(), [...txns].reverse(), { kittyInflows: inflows })
      expect(plan(again)).toEqual(plan(r))
      expect(nets(again)).toEqual(nets(r))
    }
  })
})

// ── Regression: legacy vs new on representative project shapes ──────────

describe('regression vs the legacy calcSettlement', () => {
  const totals = (creditors: { netCredit: number }[], debtors: { netDebt: number }[]) => ({
    receive: Math.round(creditors.reduce((s, c) => s + c.netCredit, 0) * 100) / 100,
    pay: Math.round(debtors.reduce((s, d) => s + d.netDebt, 0) * 100) / 100,
  })

  it('R1 Wayanad (kitty fully used): old was off by ₹0.01; new balances, only Muneer moves a paisa', () => {
    const m = crew('Muneer', 'Kabeer', 'Jasi', 'Safvan', 'Noushad', 'Shihas', 'Mukeeth')
    const t = [
      ...['Muneer', 'Kabeer', 'Jasi', 'Safvan'].map(n => contrib(2000, n)), contrib(1700, 'Noushad'),
      spend(200, 'Shihas'), spend(980, 'Kabeer'), spend(220, 'Kabeer'), spend(280, 'Muneer'), spend(10467.08, 'Safvan'), spend(9700),
    ]
    const old = legacySettlement(m, t)
    expect(totals(old.creditors, old.debtors)).toEqual({ receive: 9425.06, pay: 9425.05 })
    const r = computeSettlement(m, t)
    expectBalanced(r)
    expect(nets(r)).toEqual({ Muneer: -841.02, Kabeer: 78.99, Jasi: -1121.01, Safvan: 9346.07, Noushad: -1421.01, Shihas: -2921.01, Mukeeth: -3121.01, Kitty: 0 })
  })
  it('R2 kitty leftover: old left ₹1,000 unexplained; new pays it from the kitty', () => {
    const m = ABCD()
    const t = [contrib(4000, 'A'), contrib(3000, 'B'), contrib(3000, 'C'), spend(9000), spend(2000, 'D'), spend(1000, 'A')]
    const old = legacySettlement(m, t)
    expect(totals(old.creditors, old.debtors)).toEqual({ receive: 2000, pay: 1000 })
    expect(old.settlements.map(s => `${s.fromMemberName}→${s.toMemberName} ${s.amount}`)).toEqual(['D→A 1000'])
    expect(plan(computeSettlement(m, t))).toEqual(['Kitty→A 1000', 'D→A 1000'])
  })
  it('R3 inactive member: old had a debt with no creditor; new pays her', () => {
    const m = [member('A', 0, 2), member('B', 1), member('Ira', 2, 1, false)]
    const t = [contrib(2000, 'A'), contrib(1000, 'B'), contrib(1000, 'Ira'), spend(3500), spend(300, 'Ira'), spend(400, 'B')]
    const old = legacySettlement(m, t)
    expect(old.creditors).toEqual([])
    expect(old.debtors.map(d => d.netDebt)).toEqual([800])
    expect(old.settlements).toEqual([])
    expect(plan(computeSettlement(m, t))).toEqual(['Kitty→Ira 500', 'A→Ira 800'])
  })
  it('R4 removed member\'s contribution: old had three debts to nobody; new is even', () => {
    const m = crew('A', 'B', 'C')
    const t = [contrib(2000, null), contrib(2000, 'A'), contrib(2000, 'B'), contrib(2000, 'C'), spend(8000)]
    const old = legacySettlement(m, t)
    expect(old.creditors).toEqual([])
    expect(old.debtors.map(d => d.netDebt)).toEqual([666.67, 666.67, 666.67])
    const r = computeSettlement(m, t)
    expect(r.transfers).toEqual([])
    expect(nets(r)).toEqual({ A: 0, B: 0, C: 0, Kitty: 0 })
  })
  it('parity: active-only, empty kitty → member nets within ₹0.01 of legacy', () => {
    const m = crew('A', 'B', 'C')
    const t = [contrib(1000, 'A'), contrib(500, 'B'), spend(1500), spend(733.33, 'C'), spend(100.01, 'A')]
    const old = legacySettlement(m, t)
    const oldNet = new Map([...old.creditors.map(c => [c.memberName, c.netCredit] as const), ...old.debtors.map(d => [d.memberName, -d.netDebt] as const)])
    for (const p of computeSettlement(m, t).participants.filter(p => p.kind === 'member')) {
      expect(Math.abs(rupees(p.net) - (oldNet.get(p.name) ?? 0))).toBeLessThanOrEqual(0.0100001)
    }
  })
})
