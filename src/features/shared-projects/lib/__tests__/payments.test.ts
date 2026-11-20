import { describe, it, expect } from 'vitest'
import { computeSettlement, verifyPlan, type SettlementComputation, type Position } from '../settlement'
import { computeSettlement as computeSettlementV112 } from './settlementV112'
import { breakdownLine, kittyLine, headline, notes, shareText } from '../settlementCopy'
import { kittyBreakdown } from '../overview'
import { calcProjectSummary } from '../calculations'
import { resultTotals, transactionKind, describeTransaction, filterTransactions, NO_FILTERS, deleteLabel } from '../transactions'
import { removalImpact } from '../members'
import type { Project, ProjectMember, ProjectTransaction } from '../../types'

const member = (name: string, order: number, share_ratio = 1, is_active = true): ProjectMember => ({
  id: name.toLowerCase(), project_id: 'p', name, email: null, share_ratio, display_order: order, is_active, created_at: '',
})
const ABCD = () => ['A', 'B', 'C', 'D'].map((n, i) => member(n, i))
let seq = 0
const base = (type: ProjectTransaction['transaction_type'], amount: number, who: string | null): ProjectTransaction => ({
  id: `t${seq++}`, project_id: 'p', member_id: who?.toLowerCase() ?? null, transaction_type: type, amount,
  description: null, category: null, notes: null, transaction_date: '2026-11-21', display_order: 0, created_at: '',
})
const contrib = (a: number, who: string | null) => base('contribution', a, who)
const spend = (a: number, who: string | null = null) => base('expense', a, who)
/** A recorded payment. null = the kitty. */
const pay = (a: number, from: string | null, to: string | null): ProjectTransaction =>
  ({ ...base('settlement', a, from), to_member_id: to?.toLowerCase() ?? null })

const nets = (r: SettlementComputation) => Object.fromEntries(r.participants.map(p => [p.name, p.net / 100]))
const plan = (r: SettlementComputation) => r.transfers.map(t => `${t.from.name}→${t.to.name} ${t.amount / 100}`)
function expectBalanced(r: SettlementComputation) {
  expect(r.balanced).toBe(true)
  expect(r.participants.reduce((s, p) => s + p.net, 0)).toBe(0)
  const positions: Position[] = r.participants.map((p, i) => ({ party: { kind: p.kind, id: p.id, name: p.name }, order: i, amount: p.net }))
  expect(verifyPlan(positions, r.transfers).ok).toBe(true)
  expect(r.transfers.length).toBeLessThanOrEqual(Math.max(0, r.participants.filter(p => p.net !== 0).length - 1))
  // Never a circular pair X→Y and Y→X in one plan.
  const pairs = new Set(r.transfers.map(t => `${t.from.kind}:${t.from.id}>${t.to.kind}:${t.to.id}`))
  for (const t of r.transfers) expect(pairs.has(`${t.to.kind}:${t.to.id}>${t.from.kind}:${t.from.id}`)).toBe(false)
  for (const p of r.participants.filter(x => x.kind === 'member')) expect(p.putIn + p.paidPersonally - p.share + p.settled).toBe(p.net)
}

// Trip: A put in 4,000, B and C 3,000, kitty spent 9,000; D paid 2,000, A paid 1,000 personally.
// Before payments: A +2,000 · D −1,000 · kitty holds 1,000 → plan Kitty→A 1,000, D→A 1,000.
const trip = () => [contrib(4000, 'A'), contrib(3000, 'B'), contrib(3000, 'C'), spend(9000), spend(2000, 'D'), spend(1000, 'A')]

describe('recording payments', () => {
  it('before any payment', () => {
    const r = computeSettlement(ABCD(), trip())
    expect(plan(r)).toEqual(['Kitty→A 1000', 'D→A 1000'])
    expect(r.paymentCount).toBe(0)
  })
  it('member → member reduces the payer\'s debt and the recipient\'s claim', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(1000, 'D', 'A')])
    expectBalanced(r)
    expect(nets(r)).toEqual({ A: 1000, B: 0, C: 0, D: 0, Kitty: -1000 })
    expect(plan(r)).toEqual(['Kitty→A 1000'])
    expect(r.participants.find(p => p.name === 'D')!.settled).toBe(100000)
    expect(r.participants.find(p => p.name === 'A')!.settled).toBe(-100000)
  })
  it('kitty → member reduces kitty cash and the recipient\'s claim', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(1000, null, 'A')])
    expectBalanced(r)
    expect(r.kitty).toMatchObject({ balance: 0, paidOut: 100000, toppedUp: 0 })
    expect(nets(r)).toEqual({ A: 1000, B: 0, C: 0, D: -1000, Kitty: 0 })
    expect(plan(r)).toEqual(['D→A 1000'])
  })
  it('paying the whole plan → everyone even, trip settled, kitty empty', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(1000, null, 'A'), pay(1000, 'D', 'A')])
    expectBalanced(r)
    expect(r.transfers).toEqual([])
    expect(Object.values(nets(r)).every(v => v === 0)).toBe(true)
    expect(r.kitty.balance).toBe(0)
    expect(r.paymentCount).toBe(2)
    expect(headline(r)).toBe('Everyone is even · Trip settled')
    expect(shareText(r, 'Ooty')).toBe('Ooty — settlement\nEveryone is even. Trip settled.')
  })
  it('member → kitty (a top-up) raises kitty cash and the payer\'s position', () => {
    const t = [contrib(2000, 'A'), contrib(2000, 'B'), spend(4500)] // kitty overspent by 500
    const m = [member('A', 0), member('B', 1)]
    const r = computeSettlement(m, [...t, pay(250, 'A', null)])
    expectBalanced(r)
    expect(r.kitty).toMatchObject({ balance: -25000, toppedUp: 25000 })
    expect(nets(r)).toEqual({ A: 0, B: -250, Kitty: 250 })
    expect(plan(r)).toEqual(['B→Kitty 250'])
  })
  it('partial payment applies only the recorded amount', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(400, 'D', 'A')])
    expectBalanced(r)
    expect(nets(r)).toMatchObject({ A: 1600, D: -600 })
    expect(plan(r)).toEqual(['Kitty→A 1000', 'D→A 600'])
  })
  it('overpayment reverses direction without duplicates or circles', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(1500, 'D', 'A')]) // D owed 1,000
    expectBalanced(r)
    expect(nets(r)).toMatchObject({ A: 500, D: 500, Kitty: -1000 })
    expect(plan(r)).toEqual(['Kitty→A 500', 'Kitty→D 500'])
    const two = computeSettlement([member('A', 0), member('B', 1)], [spend(2000, 'A'), pay(1500, 'B', 'A')]) // B owed 1,000
    expectBalanced(two)
    expect(plan(two)).toEqual(['A→B 500'])
  })
  it('undo restores the exact previous state', () => {
    const before = computeSettlement(ABCD(), trip())
    const withPay = [...trip(), pay(700, 'D', 'A')]
    expect(computeSettlement(ABCD(), withPay)).not.toEqual(before)
    const undone = withPay.filter(t => t.transaction_type !== 'settlement')
    expect(computeSettlement(ABCD(), undone)).toEqual(before)
  })
  it('kitty paying out more than it holds goes negative and asks for a top-up', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(1500, null, 'A')]) // kitty held 1,000
    expectBalanced(r)
    expect(r.kitty.balance).toBe(-50000)
    expect(nets(r)).toMatchObject({ A: 500, D: -1000, Kitty: 500 })
    expect(plan(r)).toEqual(['D→Kitty 500', 'D→A 500'])
    expect(notes(r).map(n => n.text)).toContain("The kitty's balance is −₹500. Settlement payments from the kitty were more than it held, so it needs ₹500 topped up.")
  })
  it('inactive members can pay and receive', () => {
    const m = [member('A', 0), member('B', 1), member('Ira', 2, 1, false)]
    const t = [contrib(1000, 'Ira'), spend(1000, 'A'), spend(500)] // Ira owed 1,000 − share 0
    const before = computeSettlement(m, t)
    expect(nets(before).Ira).toBe(1000)
    const r = computeSettlement(m, [...t, pay(1000, 'B', 'Ira')])
    expectBalanced(r)
    expect(nets(r).Ira).toBe(0)
  })
})

describe('payments never change spending', () => {
  it('expenses, contributions, group money, shares, put-in and paid-personally are untouched', () => {
    const a = computeSettlement(ABCD(), trip())
    const b = computeSettlement(ABCD(), [...trip(), pay(1000, null, 'A'), pay(300, 'D', 'B'), pay(50, 'C', null)])
    expect(b.totals).toEqual(a.totals)
    expect(b.kitty.unassigned).toBe(a.kitty.unassigned)
    for (const k of ['putIn', 'paidPersonally', 'share'] as const) {
      expect(b.participants.map(p => p[k])).toEqual(a.participants.map(p => p[k]))
    }
  })
  it('project summary, Overview spending and result totals ignore payments', () => {
    const project: Project = { id: 'p', owner_user_id: 'u', name: 'T', description: null, notes: null, target_amount: 0, currency: 'INR', status: 'active', share_code: null, is_public: false, shared_at: null, share_views: 0, created_at: '', updated_at: '' }
    const m = ABCD()
    const t = trip().map(x => ({ ...x, member: m.find(y => y.id === x.member_id) }))
    const withPay = [...t, { ...pay(1000, null, 'A'), to_member: m[0] }, { ...pay(200, 'D', null), member: m[3] }]
    expect(calcProjectSummary(project, m, withPay)).toEqual(calcProjectSummary(project, m, t))
    const k = kittyBreakdown(calcProjectSummary(project, m, withPay), withPay)
    expect(k.fundSpent).toBe(9000)
    expect(k).toMatchObject({ settledOut: 1000, settledIn: 200, fundRemaining: 1000 - 1000 + 200 })
    expect(resultTotals(withPay)).toMatchObject({ expenses: 12000, contributions: 10000, payments: 1200 })
  })
})

describe('invalid payments block settlement', () => {
  const blocked = (r: SettlementComputation, reason: string) => {
    expect(r.balanced).toBe(false)
    expect(r.transfers).toEqual([])
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: 'invalid_payment', reason }))
  }
  it('a party from another project (or unknown) — project-scoped', () => {
    blocked(computeSettlement(ABCD(), [...trip(), pay(100, 'D', 'other-project-member')]), 'unknown_party')
    blocked(computeSettlement(ABCD(), [...trip(), pay(100, 'stranger', 'A')]), 'unknown_party')
  })
  it('kitty → kitty, or to oneself', () => {
    blocked(computeSettlement(ABCD(), [...trip(), pay(100, null, null)]), 'same_party')
    blocked(computeSettlement(ABCD(), [...trip(), pay(100, 'A', 'A')]), 'same_party')
  })
  it('zero, negative, non-finite, too many decimals, beyond safe integers', () => {
    for (const bad of [0, -5, NaN, Infinity, 10.005, Number.MAX_SAFE_INTEGER]) {
      blocked(computeSettlement(ABCD(), [...trip(), pay(bad, 'D', 'A')]), 'amount')
    }
  })
  it('an unknown transaction type is never guessed', () => {
    const odd = { ...spend(100, 'A'), transaction_type: 'refund' } as unknown as ProjectTransaction
    blocked(computeSettlement(ABCD(), [...trip(), odd]), 'unknown_type')
  })
})

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

describe('parity with v1.112 (no payments)', () => {
  it('500 random ledgers settle exactly as before', () => {
    let s = 113
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    for (let i = 0; i < 500; i++) {
      const members = Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, k) =>
        member(`M${k}`, Math.floor(rnd() * 3), pick([0, 1, 1, 2, 1.5]), rnd() > 0.2))
      const ids = members.map(m => m.id)
      const txns = Array.from({ length: Math.floor(rnd() * 20) }, () => {
        const t = rnd() < 0.4 ? contrib(Math.round(rnd() * 300000) / 100, rnd() < 0.2 ? null : pick(members).name)
          : spend(Math.round(rnd() * 300000) / 100, rnd() < 0.3 ? null : pick(members).name)
        if (t.transaction_type === 'expense' && rnd() < 0.3) t.shared_by = ids.filter(() => rnd() < 0.6).concat(pick(ids))
        return t
      })
      const r = computeSettlement(members, txns)
      expect(withoutPaymentFields(r)).toEqual(computeSettlementV112(members, txns))
    }
  })
})

describe('property: random payments', () => {
  it('stay balanced, verified, deterministic, without circles', () => {
    let s = 2113
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
    for (let i = 0; i < 500; i++) {
      const members = Array.from({ length: 2 + Math.floor(rnd() * 5) }, (_, k) => member(`M${k}`, k, pick([1, 1, 2]), rnd() > 0.15))
      const names = members.map(m => m.name)
      const txns: ProjectTransaction[] = Array.from({ length: Math.floor(rnd() * 15) }, () =>
        rnd() < 0.4 ? contrib(Math.round(rnd() * 200000) / 100, pick(names)) : spend(Math.round(rnd() * 200000) / 100, rnd() < 0.4 ? null : pick(names)))
      for (let j = Math.floor(rnd() * 5); j > 0; j--) {
        const from = rnd() < 0.2 ? null : pick(names)
        let to: string | null = rnd() < 0.2 ? null : pick(names)
        if (to === from) to = from === null ? names[0] : null
        txns.push(pay(Math.round(1 + rnd() * 100000) / 100, from, to))
      }
      const r = computeSettlement(members, txns)
      if (!r.balanced) { expect(r.transfers).toEqual([]); continue }
      expectBalanced(r)
      expect(computeSettlement([...members].reverse(), [...txns].reverse())).toEqual(r)
    }
  })
})

describe('display helpers', () => {
  const m = ABCD()
  const p = { ...pay(1000, 'D', 'A'), member: m[3], to_member: m[0] }
  it('a payment row reads "D → A" and is its own kind', () => {
    expect(transactionKind(p)).toBe('settlement')
    expect(describeTransaction(p)).toMatchObject({ title: 'D → A', sign: 0 })
    expect(describeTransaction({ ...pay(5, null, 'B'), to_member: m[1] }).title).toBe('Kitty → B')
    expect(describeTransaction({ ...pay(5, 'C', 'zz'), member: m[2] }).title).toBe('C → Removed member')
    expect(deleteLabel(p)).toBe('Undo this payment: D → A (₹1,000)? Settlement will go back to how it was before it.')
  })
  it('Payments filter and member filter (either side)', () => {
    const list = [...trip(), p]
    expect(filterTransactions(list, { ...NO_FILTERS, type: 'settlement' }).map(t => t.id)).toEqual([p.id])
    expect(filterTransactions(list, { ...NO_FILTERS, paidBy: 'a' }).some(t => t.id === p.id)).toBe(true)
    expect(filterTransactions(list, { ...NO_FILTERS, paidBy: 'd' }).some(t => t.id === p.id)).toBe(true)
  })
  it('breakdown and kitty lines mention payments, and still add up', () => {
    const r = computeSettlement(ABCD(), [...trip(), pay(400, 'D', 'A'), pay(1000, null, 'A')])
    expect(breakdownLine(r.participants.find(x => x.name === 'D')!)).toBe('₹2,000 paid personally − ₹3,000 share of spending + ₹400 already paid in settlement = owes ₹600')
    expect(breakdownLine(r.participants.find(x => x.name === 'A')!)).toBe('₹4,000 put in kitty + ₹1,000 paid personally − ₹3,000 share of spending − ₹1,400 already received in settlement = gets back ₹600')
    expect(kittyLine(r)).toBe('₹10,000 put in by members − ₹9,000 paid from kitty − ₹1,000 paid out in settlement = balance ₹0')
  })
  it('removalImpact counts payments on either side', () => {
    const t = [...trip(), pay(100, 'D', 'A'), pay(50, null, 'A')]
    expect(removalImpact('a', t).payments).toBe(2)
    expect(removalImpact('d', t).payments).toBe(1)
    expect(removalImpact('b', t).payments).toBe(0)
  })
})
