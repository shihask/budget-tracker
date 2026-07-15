import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/types'

// Not derived from an existing constant — there's no prior "how many days
// apart can two entries of the same transaction be" tunable in this
// codebase to tie to. Provisional starting point (Phase 0 flagged real bank
// narration quality/timing as unvalidated); score + matched fields are
// stored in review_context on every decision (see scoreDedupCandidates) so
// this can be recalibrated once real usage data exists.
export const DEDUP_WINDOW_DAYS = 2

export type PromotionAction = 'insert' | 'merge' | 'review'

// The abstraction boundary between "how did we decide" (scoring, below) and
// "what should the RPC do" (mp_finalize_sync_event's p_outcome). Nothing
// downstream of this needs to know about scores, dates, or narrations —
// only this decision. Keeps a future AI-based scorer, a different
// provider's scoring, or a manual override interchangeable, since they'd
// all just need to produce this same shape.
export interface PromotionDecision {
  action: PromotionAction
  confidence: number // 0-1, normalized from the raw score
  matchedTransactionId?: string // set when action is 'merge' or 'review'
  explanation: string[] // human-readable reasons; feeds review_context / the review sheet's "why" text
}

export interface DedupCandidateEvent {
  amount: number
  date: string // YYYY-MM-DD
  description: string | null
  direction: 'income' | 'expense'
}

type CandidateRow = Pick<Transaction, 'id' | 'description' | 'amount' | 'transaction_date' | 'transaction_type'>

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const diffMs = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()
  return Math.round(diffMs / 86_400_000)
}

// Candidate pool is always a fresh server-side query, never state.transactions
// (paginated to the most recent 200 rows — see Phase 1b plan) or it would
// silently miss older manual transactions and false-negative into dupes.
//
// Filtering to transaction_type = event.direction is load-bearing, not
// incidental: without it, a refund (income) can share the exact amount and
// similar narration as the original charge (expense) it's refunding — a
// realistic collision, not a hypothetical one — and would otherwise be a
// same-amount, same-window, narration-overlapping "match" across two
// genuinely different economic events. Direction must match before any
// scoring happens; this doubles as excluding transfer/system-type rows,
// since neither is ever 'income' or 'expense'.
export async function fetchDedupCandidates(
  userId: string,
  accountId: string,
  event: DedupCandidateEvent
): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, description, amount, transaction_date, transaction_type')
    .eq('user_id', userId)
    .eq('from_account_id', accountId)
    .is('sync_event_id', null)
    .eq('amount', event.amount)
    .eq('transaction_type', event.direction)
    .gte('transaction_date', addDays(event.date, -DEDUP_WINDOW_DAYS))
    .lte('transaction_date', addDays(event.date, DEDUP_WINDOW_DAYS))

  if (error) throw error

  return data ?? []
}

// Deliberately its own word-normalization, not a reuse of
// findCategoryMatches's (lowercase + split on whitespace only, no
// punctuation stripping) — bank narrations routinely contain slashes/
// hyphens ("UPI/1234/PAYTM/xxx") that would otherwise glue into one token.
function normalizeWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
  )
}

// Empty/missing description on either side must force 0, not skip scoring
// — same-amount-same-day alone (dateScore only, max 40) can never on its
// own reach the merge threshold (55).
function descriptionScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  const wordsA = normalizeWords(a)
  const wordsB = normalizeWords(b)
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) if (wordsB.has(w)) intersection++
  const union = wordsA.size + wordsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function dateScore(daysApart: number): number {
  const diff = Math.abs(daysApart)
  if (diff === 0) return 40
  if (diff === 1) return 25
  if (diff === 2) return 10
  return 0
}

const MAX_SCORE = 80 // dateScore (max 40) + descScore (max 40)
const HIGH_THRESHOLD = 55
const MEDIUM_THRESHOLD = 25
// Two candidates this close are indistinguishable enough that auto-merging
// the nominal winner risks merging into the wrong one — downgrade to
// review rather than guess. Only ever downgrades a would-be merge; a
// low-scoring top candidate with a close runner-up is still just 'insert'.
const TIE_EPSILON = 5

interface ScoredCandidate {
  id: string
  transactionDate: string
  dateScore: number
  descScore: number
  total: number
}

// Pure function — the promotion pipeline's determinism invariant: given the
// same immutable sync_event, the same account mapping, and the same
// candidate pool, this must return the same PromotionDecision every time.
// That's what makes replaying a sync_event against raw_payload safe if
// scoring logic changes later.
export function scoreDedupCandidates(event: DedupCandidateEvent, candidates: CandidateRow[]): PromotionDecision {
  if (candidates.length === 0) {
    return { action: 'insert', confidence: 1, explanation: ['no candidate transactions in the dedup window'] }
  }

  const scored: ScoredCandidate[] = candidates
    .map(c => {
      const dScore = dateScore(daysBetween(event.date, c.transaction_date))
      const wScore = descriptionScore(event.description, c.description) * 40
      return { id: c.id, transactionDate: c.transaction_date, dateScore: dScore, descScore: wScore, total: dScore + wScore }
    })
    .sort((a, b) => b.total - a.total)

  const top = scored[0]
  const runnerUp = scored[1] as ScoredCandidate | undefined
  const confidence = Math.min(1, top.total / MAX_SCORE)
  const wouldMerge = top.total >= HIGH_THRESHOLD
  const isAmbiguous = wouldMerge && runnerUp !== undefined && top.total - runnerUp.total <= TIE_EPSILON

  const explanation = [
    `date diff ${daysBetween(event.date, top.transactionDate)} day(s) → ${top.dateScore} pts`,
    `description overlap → ${top.descScore.toFixed(1)} pts`,
    `total score ${top.total.toFixed(1)} / ${MAX_SCORE}`,
  ]

  if (wouldMerge && !isAmbiguous) {
    return { action: 'merge', confidence, matchedTransactionId: top.id, explanation }
  }

  if (isAmbiguous) {
    return {
      action: 'review',
      confidence,
      matchedTransactionId: top.id,
      explanation: [...explanation, `runner-up scored within ${TIE_EPSILON} pts (${runnerUp!.total.toFixed(1)}) — ambiguous`],
    }
  }

  if (top.total >= MEDIUM_THRESHOLD) {
    return { action: 'review', confidence, matchedTransactionId: top.id, explanation }
  }

  return { action: 'insert', confidence: 1 - confidence, explanation }
}
