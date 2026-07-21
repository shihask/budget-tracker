import type { PromotionAction } from '@/features/aa-sync/lib/dedup'
import type { FieldConfidence } from '@/lib/statementExtract'

export interface DedupableRow {
  date: string | null
  amount: number | null
  direction: 'income' | 'expense'
  description: string | null
}

// Replace-with-space (not empty string), same as aa-sync dedup.ts's own
// normalizeWords — bank/UPI narrations routinely glue words together with
// slashes/hyphens ("UPI/1234/PAYTM" or "hyper-pharma"), and dropping the
// separator entirely without a space would merge them into one token.
function normalizeDescription(desc: string | null): string {
  return (desc ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

// Collapses exact repeats produced by overlapping screenshots (a user
// scrolling and re-capturing the same rows) — runs BEFORE the "does this
// already exist in MoneyPlant" dedup check, which compares against real
// transactions, not against other rows freshly parsed in the same batch.
export function dedupeParsedRows<T extends DedupableRow>(rows: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const row of rows) {
    const key = `${row.date ?? ''}|${row.amount ?? ''}|${row.direction}|${normalizeDescription(row.description)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}

export interface StatementFieldConfidence {
  description: FieldConfidence
  amount: FieldConfidence
  date: FieldConfidence
  category: FieldConfidence
}

function hasAnyLowConfidence(fc: StatementFieldConfidence): boolean {
  return fc.description === 'low' || fc.amount === 'low' || fc.date === 'low' || fc.category === 'low'
}

// Hardest decisions first, easiest last: ambiguous dedup matches that need a
// real judgment call, then confident matches (likely just "Use Existing"),
// then new rows the AI wasn't fully sure about, then new rows that are safe
// to add quickly — so a user clears the items needing attention while fresh
// and finishes with the straightforward ones.
export function reviewSortPriority(action: PromotionAction, fieldConfidence: StatementFieldConfidence): number {
  if (action === 'review') return 0
  if (action === 'merge') return 1
  return hasAnyLowConfidence(fieldConfidence) ? 2 : 3
}

export function sortForReview<T>(
  rows: T[],
  getAction: (row: T) => PromotionAction,
  getFieldConfidence: (row: T) => StatementFieldConfidence
): T[] {
  return [...rows]
    .map((row, index) => ({ row, index, priority: reviewSortPriority(getAction(row), getFieldConfidence(row)) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(x => x.row)
}
