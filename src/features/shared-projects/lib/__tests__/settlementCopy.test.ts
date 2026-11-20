import { describe, it, expect } from 'vitest'
import { computeSettlement } from '../settlement'
import { breakdownLine, kittyLine, summaryLines, equation, headline, notes, shareText, transferHint } from '../settlementCopy'
import type { ProjectMember, ProjectTransaction } from '../../types'

const member = (name: string, order: number, share_ratio = 1, is_active = true): ProjectMember => ({
  id: name.toLowerCase(), project_id: 'p', name, email: null, share_ratio, display_order: order, is_active, created_at: '',
})
let n = 0
const contrib = (amount: number, who: string | null): ProjectTransaction => ({
  id: `t${n++}`, project_id: 'p', member_id: who?.toLowerCase() ?? null, transaction_type: 'contribution', amount,
  description: null, category: null, notes: null, transaction_date: '2026-11-18', display_order: 0, created_at: '',
})
const spend = (amount: number, who: string | null = null): ProjectTransaction => ({ ...contrib(amount, who), transaction_type: 'expense' })
const four = ['A', 'B', 'C', 'D'].map((x, i) => member(x, i))
const byName = (d: ReturnType<typeof computeSettlement>, name: string) => d.participants.find(p => p.name === name)!

/** Parse "₹1,234.56" amounts out of a sentence and check the arithmetic the words claim. */
const amounts = (s: string) => [...s.matchAll(/₹([\d,]+(?:\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, '')))

describe('breakdownLine', () => {
  const d = computeSettlement(four, [contrib(4000, 'A'), contrib(3000, 'B'), contrib(3000, 'C'), spend(9000), spend(2000, 'D'), spend(1000, 'A')])

  it('is generated from the participant\'s values and adds up', () => {
    expect(breakdownLine(byName(d, 'A'))).toBe('₹4,000 put in kitty + ₹1,000 paid personally − ₹3,000 share of spending = gets back ₹2,000')
    expect(breakdownLine(byName(d, 'D'))).toBe('₹2,000 paid personally − ₹3,000 share of spending = owes ₹1,000')
    expect(breakdownLine(byName(d, 'B'))).toBe('₹3,000 put in kitty − ₹3,000 share of spending = even')
  })

  it('a member who put nothing in', () => {
    const e = computeSettlement(four, [spend(4000, 'A')])
    expect(breakdownLine(byName(e, 'B'))).toBe('Nothing put in − ₹1,000 share of spending = owes ₹1,000')
  })

  it('surplus reads as money returned, never a negative expense — and still adds up with personal spend', () => {
    const e = computeSettlement([member('A', 0), member('B', 1)], [contrib(1000, 'A'), spend(1000), spend(500, 'B')], { kittyInflows: 3000 })
    const a = breakdownLine(byName(e, 'A')), b = breakdownLine(byName(e, 'B'))
    expect(a).toBe('₹1,000 put in kitty + ₹750 share of surplus returned = gets back ₹1,750')
    expect(b).toBe('₹500 paid personally + ₹750 share of surplus returned = gets back ₹1,250')
    for (const s of [a, b]) {
      expect(s).not.toMatch(/−\s*₹[\d,.]+ share/)
      const [x, y, total] = amounts(s)
      expect(x + y).toBeCloseTo(total, 2)
    }
  })

  it('inactive member: claims kept, no share', () => {
    const m = [member('A', 0, 2), member('B', 1), member('Ira', 2, 1, false)]
    const e = computeSettlement(m, [contrib(2000, 'A'), contrib(1000, 'B'), contrib(1000, 'Ira'), spend(3500), spend(300, 'Ira'), spend(400, 'B')])
    expect(breakdownLine(byName(e, 'Ira'))).toBe('₹1,000 put in kitty + ₹300 paid personally · inactive, so no share of spending = gets back ₹1,300')
  })

  it('every member line in a random-ish ledger reconciles to its net', () => {
    const m = [member('A', 0, 2), member('B', 1, 1.5), member('C', 2)]
    const e = computeSettlement(m, [contrib(1234.56, 'A'), contrib(99.99, 'C'), contrib(500, null), spend(2222.22), spend(333.33, 'B'), spend(10.01, 'C')])
    for (const p of e.participants.filter(x => x.kind === 'member')) {
      const s = breakdownLine(p)
      const sign = s.includes('owes') ? -1 : 1
      const credits = (p.putIn + p.paidPersonally) / 100
      const share = p.share / 100
      const all = amounts(s)
      expect(credits - share).toBeCloseTo(s.includes('even') ? 0 : sign * all[all.length - 1], 2)
    }
  })
})

describe('summary, equation, headline', () => {
  it('kitty money is never counted as members paying', () => {
    const d = computeSettlement(four, [contrib(4000, 'A'), contrib(3000, 'B'), contrib(3000, 'C'), spend(9000), spend(2000, 'D'), spend(1000, 'A')])
    expect(summaryLines(d).map(l => [l.label, l.amount])).toEqual([['Members pay', 100000], ['From kitty balance', 100000], ['Members receive', 200000]])
    expect(equation(d)).toBe('₹1,000 from members + ₹1,000 from kitty = ₹2,000 received')
    expect(headline(d)).toBe('2 payments settle this trip')
    expect(kittyLine(d)).toBe('₹10,000 put in by members − ₹9,000 paid from kitty = balance ₹1,000')
  })

  it('overspent kitty: top-up line and an explanation', () => {
    const d = computeSettlement([member('A', 0), member('B', 1)], [contrib(2000, 'A'), contrib(2000, 'B'), spend(4500)])
    expect(summaryLines(d).map(l => l.label)).toEqual(['Members pay', 'Kitty top-up needed'])
    expect(equation(d)).toBe('₹500 from members = ₹500 kitty top-up')
    expect(notes(d)[0].text).toMatch(/^The kitty's balance is −₹500\. It paid out more than it received, so it needs ₹500 topped up/)
    expect(kittyLine(d)).toBe('₹4,000 put in by members − ₹4,500 paid from kitty = balance −₹500')
  })

  it('headlines for each state', () => {
    expect(headline(computeSettlement(four, []))).toBe('Nothing spent yet')
    expect(headline(computeSettlement(four, ['A', 'B', 'C', 'D'].map(x => contrib(100, x)).concat(spend(400))))).toBe('Everyone is even')
    expect(headline(computeSettlement([member('I', 0, 1, false)], [spend(100, 'I')]))).toBe("Settlement couldn't be verified")
  })
})

describe('notes', () => {
  it('unassigned contributions in plain words', () => {
    const d = computeSettlement([member('A', 0), member('B', 1)], [contrib(2000, null), contrib(2000, 'A'), spend(4000)])
    expect(notes(d).map(x => x.text)).toContain("₹2,000 is group money: from outside the group (a sponsor, refund or cashback) or from people no longer in this group. It lowers everyone's share and isn't credited to any member.")
  })
  it('no sharers and invalid data are warnings', () => {
    expect(notes(computeSettlement([member('I', 0, 1, false)], [spend(100, 'I')]))[0]).toMatchObject({ tone: 'warn' })
    expect(notes(computeSettlement([member('A', 0), member('B', 1)], [spend(NaN, 'A')]))[0].text).toMatch(/^Some amounts/)
  })
  it('surplus note', () => {
    const d = computeSettlement([member('A', 0), member('B', 1)], [spend(200, 'A')], { kittyInflows: 1000 })
    expect(notes(d).map(x => x.text)).toContain("Group money is more than the trip's spending. The extra ₹800 is returned to members by their share.")
  })
})

describe('shareText and hints', () => {
  it('describes only a verified plan', () => {
    const d = computeSettlement(four, [contrib(4000, 'A'), contrib(3000, 'B'), contrib(3000, 'C'), spend(9000), spend(2000, 'D'), spend(1000, 'A')])
    expect(shareText(d, 'Ooty')).toBe([
      'Ooty — settlement',
      'Kitty → A: ₹1,000 (from the kitty balance)',
      'D → A: ₹1,000',
      'Balanced: ₹1,000 from members + ₹1,000 from kitty = ₹2,000 received',
      'Worked out in MoneyPlant',
    ].join('\n'))
    expect(shareText(computeSettlement([member('I', 0, 1, false)], [spend(100, 'I')]), 'X')).toBe("X — settlement\nSettlement couldn't be verified yet.")
    expect(transferHint(d.transfers[0])).toBe('Suggested payment from the kitty balance')
    expect(transferHint(d.transfers[1])).toBeNull()
  })
})
