import { describe, it, expect } from 'vitest'
import { calcMemberSummaries, calcSettlement } from '../calculations'
import { buildMemberRows, settlementStatus, moneyLine, removalImpact } from '../members'
import type { Project, ProjectMember, ProjectTransaction } from '../../types'

const project = (target = 0): Project => ({
  id: 'p', owner_user_id: 'u', name: 'Trip', description: null, notes: null, target_amount: target, currency: 'INR',
  status: 'active', share_code: null, is_public: false, shared_at: null, share_views: 0, created_at: '', updated_at: '',
})
const member = (id: string, name: string, share_ratio = 1, is_active = true): ProjectMember => ({
  id, project_id: 'p', name, email: null, share_ratio, display_order: 0, is_active, created_at: '',
})
let n = 0
const tx = (type: 'contribution' | 'expense', amount: number, member_id: string | null): ProjectTransaction => ({
  id: `t${n++}`, project_id: 'p', member_id, transaction_type: type, amount, description: null, category: null,
  notes: null, transaction_date: '2026-11-18', display_order: 0, created_at: '',
})

const a = member('a', 'Arjun'), b = member('b', 'Bilal', 2), c = member('c', 'Chitra'), gone = member('g', 'Gone', 1, false)

function rows(members: ProjectMember[], txns: ProjectTransaction[], target = 0) {
  const p = project(target)
  return buildMemberRows(members, calcMemberSummaries(p, members, txns), calcSettlement(members, txns), txns, target)
}

describe('buildMemberRows', () => {
  const txns = [tx('contribution', 3000, 'a'), tx('expense', 1200, 'b'), tx('expense', 4800, null), tx('expense', 300, 'g')]

  it('reads amounts from the existing summaries', () => {
    const r = rows([a, b, c, gone], txns)
    expect(r.map(x => [x.member.id, x.putInKitty, x.paidPersonally])).toEqual([
      ['a', 3000, 0], ['b', 0, 1200], ['c', 0, 0], ['g', 0, 0],
    ])
  })

  it('settlement net equals calcSettlement for every active member', () => {
    const members = [a, b, c, gone]
    const s = calcSettlement(members, txns)
    const r = rows(members, txns)
    for (const x of r.filter(x => !x.inactive)) {
      const expected = s.creditors.find(k => k.memberId === x.member.id)?.netCredit
        ?? -(s.debtors.find(k => k.memberId === x.member.id)?.netDebt ?? 0)
      expect(x.net).toBeCloseTo(expected, 2)
    }
  })

  it('inactive members have no settlement status but keep their transaction count', () => {
    const g = rows([a, b, c, gone], txns).find(x => x.member.id === 'g')!
    expect(g).toMatchObject({ inactive: true, net: null, txnCount: 1 })
  })

  it('no status without expenses, or with fewer than two active members', () => {
    expect(rows([a, b], [tx('contribution', 500, 'a')]).every(x => x.net === null)).toBe(true)
    expect(rows([a, gone], [tx('expense', 500, 'a')]).every(x => x.net === null)).toBe(true)
  })

  it('a member absent from creditors and debtors is even (0)', () => {
    const r = rows([a, c], [tx('expense', 100, 'a'), tx('expense', 100, 'c')])
    expect(r.map(x => x.net)).toEqual([0, 0])
  })

  it('estimated share only with a target', () => {
    expect(rows([a, b], txns)[0].estShare).toBeNull()
    expect(rows([a, b], txns, 3000).map(x => x.estShare)).toEqual([1000, 2000])
  })
})

describe('settlementStatus', () => {
  it('labels', () => {
    expect(settlementStatus(879)).toEqual({ label: 'Gets back ₹879', tone: 'good' })
    expect(settlementStatus(-3121.01)).toEqual({ label: 'Owes ₹3,121.01', tone: 'ink' })
    expect(settlementStatus(0.004)).toEqual({ label: 'Even', tone: 'muted' })
  })
})

describe('moneyLine', () => {
  it('drops zero parts', () => {
    expect(moneyLine({ putInKitty: 2000, paidPersonally: 1200 })).toBe('₹2,000 put in kitty · ₹1,200 paid personally')
    expect(moneyLine({ putInKitty: 0, paidPersonally: 200 })).toBe('₹200 paid personally')
    expect(moneyLine({ putInKitty: 0, paidPersonally: 0 })).toBe('Nothing recorded yet')
  })
})

describe('removalImpact', () => {
  it('counts what a delete would orphan', () => {
    const txns = [tx('contribution', 2000, 'a'), tx('expense', 980, 'a'), tx('expense', 220.5, 'a'), tx('expense', 50, null)]
    expect(removalImpact('a', txns)).toEqual({ count: 3, contributed: 2000, paidPersonally: 1200.5 })
    expect(removalImpact('c', txns)).toEqual({ count: 0, contributed: 0, paidPersonally: 0 })
  })
})
