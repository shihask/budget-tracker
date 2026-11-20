import { describe, it, expect } from 'vitest'
import { calcMemberSummaries, calcSettlement } from '../calculations'
import { buildMemberRows, settlementStatus, moneyLine, removalImpact, LOADED_ROWS_CAP } from '../members'
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
      ['a', 3000, 0], ['b', 0, 1200], ['c', 0, 0], ['g', 0, 300], // inactive: still credited (from the engine)
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

  it('inactive members keep their amounts, settlement status and transaction count (v1.111.0)', () => {
    const g = rows([a, b, c, gone], txns).find(x => x.member.id === 'g')!
    // 'g' paid ₹300 personally and shares no costs → gets it back.
    expect(g).toMatchObject({ inactive: true, paidPersonally: 300, txnCount: 1, net: 300 })
  })

  it('no status without expenses, or for a solo member', () => {
    expect(rows([a, b], [tx('contribution', 500, 'a')]).every(x => x.net === null)).toBe(true)
    expect(rows([a], [tx('expense', 500, 'a')]).every(x => x.net === null)).toBe(true)
  })

  // v1.108.0: eligibility comes from the engine's `balanced`, not "≥ 2 active".
  it('1 active + 1 inactive is a valid settlement: both get a status from the engine', () => {
    const ira = member('i', 'Ira', 1, false)
    const txns = [tx('contribution', 1000, 'i'), tx('expense', 600, null), tx('expense', 400, 'a')]
    const r = rows([a, ira], txns)
    const s = calcSettlement([a, ira], txns)
    expect(s.balanced).toBe(true)
    expect(r.find(x => x.member.id === 'a')!.net).toBe(-s.debtors.find(d => d.memberId === 'a')!.netDebt)
    expect(r.find(x => x.member.id === 'i')!.net).toBe(s.creditors.find(c => c.memberId === 'i')!.netCredit)
  })

  describe('member lifecycle: marking inactive instead of deleting', () => {
    const kabeer = member('k', 'Kabeer')
    const txns = [
      tx('contribution', 2000, 'a'), tx('contribution', 2000, 'b'), tx('contribution', 2000, 'k'),
      tx('expense', 4500, null), tx('expense', 1200, 'k'),
    ]
    const inactive = { ...kabeer, is_active: false }

    it('contributions and personal payments stay credited to the inactive member', () => {
      const k = rows([a, b, inactive], txns).find(x => x.member.id === 'k')!
      expect(k).toMatchObject({ inactive: true, putInKitty: 2000, paidPersonally: 1200, txnCount: 2 })
    })

    it('an inactive member shares no costs, so can be owed money', () => {
      const s = calcSettlement([a, b, inactive], txns)
      expect(s.balanced).toBe(true)
      // put in 2,000 + paid 1,200, share 0 → gets back 3,200
      expect(rows([a, b, inactive], txns).find(x => x.member.id === 'k')!.net).toBe(3200)
    })

    it('an inactive member who put nothing in is never charged a share', () => {
      const z = member('z', 'Zed', 1, false)
      const r = rows([a, b, z], [tx('expense', 1000, 'a')]) // shared by A (×1) and Bilal (×2) only
      expect(r.find(x => x.member.id === 'z')!.net).toBe(0)
      expect(r.find(x => x.member.id === 'a')!.net).toBe(666.67)
    })

    it('rule A: an inactive member can be owed or even, but never owes (share is 0)', () => {
      // net = put in + paid personally − 0. Inputs are never negative, so net ≥ 0 — even when
      // the kitty is overspent, the top-up falls on members who share costs.
      const z = { ...member('z', 'Zed'), is_active: false }
      for (const t of [
        [tx('contribution', 500, 'a'), tx('expense', 800, null)],                 // kitty overspent
        [tx('contribution', 700, 'z'), tx('expense', 2000, 'a')],                 // Zed put money in
        [tx('expense', 900, 'z'), tx('expense', 300, null), tx('contribution', 300, 'b')], // Zed paid personally
      ]) {
        expect(calcSettlement([a, b, z], t).balanced).toBe(true)
        expect(rows([a, b, z], t).find(x => x.member.id === 'z')!.net).toBeGreaterThanOrEqual(0)
      }
    })

    it('marking inactive never orphans rows: nothing becomes group money or kitty spend', () => {
      const before = calcSettlement([a, b, kabeer], txns).detail!
      const after = calcSettlement([a, b, inactive], txns).detail!
      expect(after.kitty).toEqual(before.kitty)            // no new "unassigned" money
      expect(after.totals.expenses).toBe(before.totals.expenses)
      expect(after.kitty.unassigned).toBe(0)
    })

    it('making them active again restores their share', () => {
      const again = rows([a, b, kabeer], txns).find(x => x.member.id === 'k')!
      expect(again.inactive).toBe(false)
      // Ratios A ×1, Bilal ×2, Kabeer ×1 → Kabeer's share of ₹5,700 is ₹1,425; net 3,200 − 1,425.
      expect(calcSettlement([a, b, kabeer], txns).detail!.participants.find(p => p.id === 'k')!.share).toBe(142500)
      expect(again.net).toBe(1775)
    })

    it('a member with no transactions has zero impact, so deleting is harmless', () => {
      expect(removalImpact('nobody', txns)).toMatchObject({ count: 0, contributed: 0, paidPersonally: 0 })
    })
  })

  it('no_sharers (only inactive members) → no status for anyone', () => {
    const i1 = member('i1', 'Ira', 1, false), i2 = member('i2', 'Joe', 1, false)
    const txns = [tx('expense', 500, 'i1')]
    expect(calcSettlement([i1, i2], txns).balanced).toBe(false)
    expect(rows([i1, i2], txns).every(x => x.net === null)).toBe(true)
  })

  it('the kitty never appears as a member', () => {
    const txns = [tx('contribution', 3000, 'a'), tx('expense', 1000, null), tx('expense', 500, 'b')]
    const s = calcSettlement([a, b], txns)
    expect([...s.creditors, ...s.debtors].some(x => x.memberId === 'kitty')).toBe(false)
    expect(rows([a, b], txns).map(x => x.member.id)).toEqual(['a', 'b'])
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
    expect(removalImpact('a', txns)).toEqual({ count: 3, contributed: 2000, paidPersonally: 1200.5, payments: 0, atLeast: false })
    expect(removalImpact('c', txns)).toEqual({ count: 0, contributed: 0, paidPersonally: 0, payments: 0, atLeast: false })
  })
  it('sums several contribution rows; zero contributions stay zero', () => {
    const txns = [tx('contribution', 1500, 'a'), tx('contribution', 500, 'a'), tx('expense', 300, 'b')]
    expect(removalImpact('a', txns)).toMatchObject({ count: 2, contributed: 2000, paidPersonally: 0 })
    expect(removalImpact('b', txns)).toMatchObject({ count: 1, contributed: 0, paidPersonally: 300 })
  })
  it('flags a lower bound when the loaded list hits the row cap', () => {
    const many = Array.from({ length: LOADED_ROWS_CAP }, () => tx('expense', 1, 'a'))
    expect(removalImpact('a', many).atLeast).toBe(true)
  })
  it('matches the deletion rule: every row with this member_id, contributions and expenses alike', () => {
    const txns = [tx('contribution', 100, 'a'), tx('expense', 40, 'a'), tx('contribution', 7, 'b'), tx('expense', 9, null)]
    const after = txns.map(t => (t.member_id === 'a' ? { ...t, member_id: null } : t)) // ON DELETE SET NULL
    const orphaned = after.filter((t, i) => t.member_id === null && txns[i].member_id === 'a')
    expect(removalImpact('a', txns).count).toBe(orphaned.length)
  })
})
