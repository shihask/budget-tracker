import { describe, it, expect } from 'vitest'
import { dedupeParsedRows, reviewSortPriority, sortForReview, isDailyImportLimitError, type DedupableRow, type StatementFieldConfidence } from './pure'
import type { PromotionAction } from '@/features/aa-sync/lib/dedup'

function row(overrides: Partial<DedupableRow> = {}): DedupableRow {
  return { date: '2026-07-10', amount: 500, direction: 'expense', description: 'DAYA DISCOUNT HYPER PHARMA', ...overrides }
}

describe('dedupeParsedRows', () => {
  it('collapses exact repeats (overlapping screenshots re-capturing the same row)', () => {
    const rows = [row(), row()]
    expect(dedupeParsedRows(rows)).toHaveLength(1)
  })

  it('is case/punctuation-insensitive on description when collapsing', () => {
    const rows = [row({ description: 'Daya Discount Hyper Pharma' }), row({ description: 'daya discount, hyper-pharma!' })]
    expect(dedupeParsedRows(rows)).toHaveLength(1)
  })

  it('keeps rows that differ by amount', () => {
    const rows = [row({ amount: 500 }), row({ amount: 501 })]
    expect(dedupeParsedRows(rows)).toHaveLength(2)
  })

  it('keeps rows that differ by date', () => {
    const rows = [row({ date: '2026-07-10' }), row({ date: '2026-07-11' })]
    expect(dedupeParsedRows(rows)).toHaveLength(2)
  })

  it('keeps rows that differ by direction (a debit and credit of the same amount/day are not the same row)', () => {
    const rows = [row({ direction: 'expense' }), row({ direction: 'income' })]
    expect(dedupeParsedRows(rows)).toHaveLength(2)
  })

  it('treats null/empty descriptions as equal to each other, not to a real description', () => {
    const rows = [row({ description: null }), row({ description: '' }), row({ description: 'Real Merchant' })]
    expect(dedupeParsedRows(rows)).toHaveLength(2)
  })

  it('preserves the first occurrence order', () => {
    const first = row({ description: 'first' })
    const dup = row({ description: 'first' })
    expect(dedupeParsedRows([first, dup])[0]).toBe(first)
  })
})

describe('reviewSortPriority', () => {
  const allHigh: StatementFieldConfidence = { description: 'high', amount: 'high', date: 'high', category: 'high' }
  const oneLow: StatementFieldConfidence = { description: 'low', amount: 'high', date: 'high', category: 'high' }

  it('puts ambiguous dedup matches first', () => {
    expect(reviewSortPriority('review', allHigh)).toBe(0)
  })

  it('puts confident matches second, ahead of any new row', () => {
    expect(reviewSortPriority('merge', allHigh)).toBe(1)
    expect(reviewSortPriority('merge', oneLow)).toBe(1)
  })

  it('puts low-confidence new rows ahead of high-confidence new rows (hardest decisions first, easiest last)', () => {
    const low = reviewSortPriority('insert', oneLow)
    const high = reviewSortPriority('insert', allHigh)
    expect(low).toBeLessThan(high)
  })
})

describe('sortForReview', () => {
  const allHigh: StatementFieldConfidence = { description: 'high', amount: 'high', date: 'high', category: 'high' }
  const oneLow: StatementFieldConfidence = { description: 'low', amount: 'high', date: 'high', category: 'high' }

  it('orders needs-attention -> matches -> low-confidence new -> high-confidence new', () => {
    const rows: { id: string; action: PromotionAction; fc: StatementFieldConfidence }[] = [
      { id: 'high-new', action: 'insert', fc: allHigh },
      { id: 'merge', action: 'merge', fc: allHigh },
      { id: 'review', action: 'review', fc: allHigh },
      { id: 'low-new', action: 'insert', fc: oneLow },
    ]
    const sorted = sortForReview(rows, r => r.action, r => r.fc)
    expect(sorted.map(r => r.id)).toEqual(['review', 'merge', 'low-new', 'high-new'])
  })

  it('is stable for rows with equal priority', () => {
    const rows = [
      { id: 'a', action: 'insert' as PromotionAction, fc: allHigh },
      { id: 'b', action: 'insert' as PromotionAction, fc: allHigh },
    ]
    const sorted = sortForReview(rows, r => r.action, r => r.fc)
    expect(sorted.map(r => r.id)).toEqual(['a', 'b'])
  })
})

describe('isDailyImportLimitError', () => {
  it('matches the real PostgREST failure shape for the daily cap', () => {
    expect(isDailyImportLimitError({
      code: 'PT429',
      details: 'import_batches created since UTC midnight: 8 of 8',
      hint: 'Resets at 00:00 UTC, the same moment the daily AI scan limit resets.',
      message: 'You have already started 8 statement imports today. You can import more after midnight UTC.',
    })).toBe(true)
  })

  it('ignores other PostgREST error codes', () => {
    expect(isDailyImportLimitError({ code: '23505' })).toBe(false)
    expect(isDailyImportLimitError({ code: 'PGRST116' })).toBe(false)
  })

  it('is safe on nullish input', () => {
    expect(isDailyImportLimitError(null)).toBe(false)
    expect(isDailyImportLimitError(undefined)).toBe(false)
  })

  // supabase-js only constructs a PostgrestError under .throwOnError(), so the
  // value actually thrown is a plain object. These two guard against anyone
  // "simplifying" the predicate into an instanceof check or a message match.
  it('does not match a bare string or an Error carrying the code as text', () => {
    expect(isDailyImportLimitError('PT429')).toBe(false)
    expect(isDailyImportLimitError(new Error('PT429'))).toBe(false)
  })
})
