import { describe, it, expect } from 'vitest'
import { scoreDedupCandidates, type DedupCandidateEvent } from './dedup'
import type { Transaction } from '@/types'

// "TOWARDS RD" narration below is the real (repetitive, synthetic) text
// captured live from Setu sandbox in Phase 0 — see
// scripts/aa-discovery-spike/samples/rd-session.json — not a made-up fixture.

type CandidateRow = Pick<Transaction, 'id' | 'description' | 'amount' | 'transaction_date' | 'transaction_type'>

function candidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: 'c1',
    description: 'TOWARDS RD',
    amount: 5000,
    transaction_date: '2026-07-10',
    transaction_type: 'expense',
    ...overrides,
  }
}

describe('scoreDedupCandidates', () => {
  it('inserts when there are no candidates in the window', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-10', description: 'TOWARDS RD' }
    const decision = scoreDedupCandidates(event, [])
    expect(decision.action).toBe('insert')
    expect(decision.confidence).toBe(1)
  })

  it('merges same-day, same-narration candidates (high confidence)', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-10', description: 'TOWARDS RD' }
    const decision = scoreDedupCandidates(event, [candidate()])
    expect(decision.action).toBe('merge')
    expect(decision.matchedTransactionId).toBe('c1')
    expect(decision.confidence).toBeGreaterThan(0.9)
  })

  it('never auto-merges on amount/date alone — same day, no narration overlap → review', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-10', description: null }
    const decision = scoreDedupCandidates(event, [candidate({ description: 'SALARY CREDIT' })])
    expect(decision.action).toBe('review')
  })

  it('forces descScore to 0 when the candidate description is empty, not just null', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-10', description: 'TOWARDS RD' }
    const decision = scoreDedupCandidates(event, [candidate({ description: '' })])
    expect(decision.action).toBe('review')
  })

  it('scores partial narration overlap one day apart as medium confidence review', () => {
    const event: DedupCandidateEvent = { amount: 250, date: '2026-07-11', description: 'zomato order chennai' }
    const decision = scoreDedupCandidates(event, [candidate({ id: 'c2', amount: 250, transaction_date: '2026-07-10', description: 'ZOMATO ORDER' })])
    expect(decision.action).toBe('review')
    expect(decision.matchedTransactionId).toBe('c2')
  })

  it('inserts when the best candidate scores below the medium threshold', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-12', description: 'completely unrelated text' }
    const decision = scoreDedupCandidates(event, [candidate({ transaction_date: '2026-07-10', description: 'TOWARDS RD' })])
    expect(decision.action).toBe('insert')
  })

  it('downgrades an otherwise-HIGH match to review when two candidates tie', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-10', description: 'TOWARDS RD' }
    const decision = scoreDedupCandidates(event, [candidate({ id: 'c1' }), candidate({ id: 'c2' })])
    expect(decision.action).toBe('review')
    expect(decision.explanation.some(line => line.toLowerCase().includes('ambiguous'))).toBe(true)
  })

  it('is deterministic — identical inputs always produce identical decisions', () => {
    const event: DedupCandidateEvent = { amount: 5000, date: '2026-07-10', description: 'TOWARDS RD' }
    const candidates = [candidate({ id: 'c1' }), candidate({ id: 'c2', description: 'SALARY CREDIT', transaction_date: '2026-07-09' })]
    const first = scoreDedupCandidates(event, candidates)
    const second = scoreDedupCandidates(event, candidates)
    expect(second).toEqual(first)
  })
})
