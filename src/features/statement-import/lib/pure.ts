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

// Raised by the trg_import_batches_daily_limit trigger. PostgREST maps a
// PTxyz sqlstate to HTTP xyz and echoes the code verbatim in the JSON body.
export const DAILY_IMPORT_LIMIT_ERRCODE = 'PT429'

// supabase-js hands PostgREST failures back as a PLAIN object
// ({ code, details, hint, message }) — a PostgrestError instance is only
// constructed under .throwOnError(). So this takes `unknown` and duck-types
// rather than narrowing on a class.
//
// Matches on the code, never on message text: the message is user-facing copy
// living in 20260818000001_import_batches_daily_limit.sql and will get
// reworded, and PT429 is the only thing in the schema that raises it.
export function isDailyImportLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === DAILY_IMPORT_LIMIT_ERRCODE
  )
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
