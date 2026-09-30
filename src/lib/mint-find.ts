/**
 * Mint "find" — locate specific transactions from a chat message, with no AI.
 *
 * parse → search → rank → card. The model never sees the rows and never words
 * the answer; the only thing a later AI turn receives is the card's one-line
 * summary.
 *
 * ONE DEFINITION OF A FILTER. Date, account, category, amount and the
 * system-row exclusion live only in `transactionFilters.ts`: this module builds
 * a `TransactionFilterState`, runs `filterAndSortTransactions`, and only then
 * ranks by text. `rankFindMatches` never checks a structured field. The
 * Transactions page ("View all") runs the same function on the same state, so
 * the two can't disagree about what matched.
 */
import {
  DEFAULT_TXN_FILTERS, filterAndSortTransactions, mergeLoadedWins,
  type TransactionFilterState,
} from '@/lib/transactionFilters'
import { groupSplitTransactions, type TransactionGroup } from '@/lib/splitGroups'
import { parsePeriod } from '@/lib/mintActions/period'
import type { SearchTransactionsFn } from '@/hooks/useTransactionSearch'
import type { AppState, Transaction } from '@/types'

/** Rows the card lists before "View all". */
export const FIND_SHOWN = 5

/** Words that never identify a transaction: grammar, the find phrasing itself,
 *  and generic money words. A word here is removed before the search word is
 *  chosen, so it can never be what the database is asked for — `%payment%`
 *  would drag in half the ledger. */
export const FIND_STOPWORDS = new Set([
  // grammar
  'the', 'a', 'an', 'my', 'me', 'i', 'to', 'at', 'on', 'in', 'for', 'with', 'from', 'of', 'and', 'or',
  'is', 'it', 'by', 'up', 'do', 'am', 'be', 'so', 'no', 'us', 'we', 'he', 'she', 'go', 'ok', 'hi', 'as', 'if',
  'was', 'is', 'it', 'its', 'that', 'this', 'what', 'where', 'which', 'did', 'do', 'does', 'can', 'you',
  'please', 'any', 'all', 'some', 'when', 'last', 'time', 'ago', 'by', 'about', 'there', 'have', 'had',
  // the find phrasing
  'find', 'search', 'look', 'lookup', 'up', 'locate', 'show', 'list', 'see', 'get', 'got',
  // generic money words
  'pay', 'paid', 'payment', 'payments', 'spend', 'spent', 'spending', 'money', 'cash', 'send', 'sent',
  'transfer', 'transferred', 'buy', 'bought', 'purchase', 'purchased', 'order', 'ordered',
  'transaction', 'transactions', 'txn', 'txns', 'expense', 'expenses', 'bill', 'bills', 'shop',
  'amount', 'rupees', 'rupee', 'rs', 'inr', 'entry', 'entries', 'record', 'records',
])

/** True when the message asks to locate transactions rather than total them.
 *  Deliberately narrow: "how much did I spend on food" stays with CFO/AI. */
export function classifyFindIntent(text: string): boolean {
  const q = text.toLowerCase().replace(/[’']/g, "'")
  return /\b(find|search|look ?up|locate)\b/.test(q)
    || /\b(when did i|last time i)\s+(last\s+)?(pay|paid|buy|bought|get|got|spend|spent|send|sent|transfer|transferred|order|ordered)\b/.test(q)
    || /\bshow (me )?(my |the |all )?(transactions?|payments?|expenses?) (for|at|to|on|with|from)\b/.test(q)
}

/** Words to match against descriptions: everything left once stopwords, digits,
 *  punctuation and single letters are gone. Two letters stay ("ac", "tv") —
 *  the 2-letter grammar words are stopwords. Shared with edit/delete. */
export function findTokens(text: string): string[] {
  const words = text.toLowerCase().replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !/^\d/.test(w) && !FIND_STOPWORDS.has(w))
  return [...new Set(words)]
}

/** Tokens in the order they're sent to the database: longest first (most
 *  selective). The first is the one search; the rest only widen a search that
 *  found no row containing every word. Never a stopword — those are gone. */
const byLength = (tokens: string[]): string[] => [...tokens].sort((a, b) => b.length - a.length)

/** The one word sent to the database, or null. */
export const pickSearchToken = (tokens: string[]): string | null => byLength(tokens)[0] ?? null

/** Extra words a widened search may try: "netflix subscription" searched as
 *  `%subscription%` misses rows called just "Netflix". Bounded so a long
 *  message can't fan out into many queries. */
export const WIDEN_MAX_TOKENS = 2

const AMOUNT_RE = /(₹|\brs\.?\s*|\binr\s*)?(?<![\p{L}\d])(\d[\d,]*(?:\.\d{1,2})?)\s*(k|lakhs?|lacs?)?(?![\p{L}\d])/giu

/** The money amount in `text`, to the paisa, and the text it was read from.
 *  A ₹/rs-marked number wins over a bare one. */
export function parseFindAmount(text: string): { amount: number; matched: string } | null {
  let best: { amount: number; matched: string; marked: boolean } | null = null
  for (const m of text.matchAll(AMOUNT_RE)) {
    const n = parseFloat(m[2].replace(/,/g, ''))
    if (!(n > 0)) continue
    const unit = (m[3] ?? '').toLowerCase()
    const mult = unit === 'k' ? 1_000 : unit ? 100_000 : 1
    const amount = Math.round(n * mult * 100) / 100
    const marked = !!m[1]
    if (!best || (marked && !best.marked)) best = { amount, matched: m[0], marked }
  }
  return best && { amount: best.amount, matched: best.matched }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, 'u')

/** Longest name that appears as whole word(s) in `q`. */
function longestNamed<T extends { name: string }>(q: string, items: T[]): T | null {
  return items
    .filter(it => it.name.trim().length > 1 && wordRe(it.name).test(q))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null
}

export interface FindQuery {
  /** Server + client filters. `search` is the single database word (or ''). */
  filters: TransactionFilterState
  /** Every word a description must contain (AND); ANY-token is the fallback. */
  tokens: string[]
  /** "when did I…" — the card shows the newest match on its own. */
  emphasis: 'latest' | null
  label: string
  /** Nothing to look for: no word, amount, account, category or period. */
  empty: boolean
  /** A category name also reads as a description word ("find tea" when tea is
   *  logged under Food). Tried when the category reading finds nothing. */
  alternate: FindQuery | null
}

function describe(tokens: string[], extra: (string | null | undefined)[], periodLabel: string | null): string {
  return [tokens.join(' ') || null, ...extra, periodLabel ?? 'all time'].filter(Boolean).join(' · ')
}

export function parseFindQuery(
  text: string,
  state: Pick<AppState, 'accounts' | 'credit_cards' | 'categories'>,
  cycleStart: Date | null | undefined,
  now: Date = new Date(),
): FindQuery {
  let q = ` ${text.toLowerCase().replace(/[’']/g, "'")} `
  const emphasis = /\b(when did i|last time i|when was)\b/.test(q) ? 'latest' : null

  const period = parsePeriod(q, cycleStart, now)
  if (period) q = q.replace(period.matched, ' ')

  const accounts = [...state.accounts.filter(a => a.is_active), ...(state.credit_cards ?? [])]
  const account = longestNamed(q, accounts)
  if (account) q = q.replace(wordRe(account.name), '$1 ')

  const category = longestNamed(q, state.categories)
  if (category) q = q.replace(wordRe(category.name), '$1 ')

  const amt = parseFindAmount(q)
  if (amt) q = q.replace(amt.matched, ' ')

  const tokens = findTokens(q)
  const filters: TransactionFilterState = {
    ...DEFAULT_TXN_FILTERS,
    search: pickSearchToken(tokens) ?? '',
    account: account?.id ?? 'all',
    category: category?.id ?? 'all',
    dateFrom: period?.dateFrom ?? '',
    dateTo: period?.dateTo ?? '',
    amount: amt?.amount ?? null,
  }
  const amountLabel = amt ? `₹${amt.amount.toLocaleString('en-IN')}` : null
  const periodLabel = period?.label ?? null

  const empty = tokens.length === 0 && !amt && !account && !category && !period

  // Retry reading the category name as a description word instead.
  const catTokens = category ? findTokens(category.name) : []
  const alternate: FindQuery | null = category && catTokens.length > 0
    ? (() => {
        const altTokens = [...new Set([...tokens, ...catTokens])]
        return {
          filters: { ...filters, category: 'all', search: pickSearchToken(altTokens) ?? '' },
          tokens: altTokens, emphasis, empty: false, alternate: null,
          label: describe(altTokens, [account?.name, amountLabel], periodLabel),
        }
      })()
    : null

  return {
    filters, tokens, emphasis, empty, alternate,
    label: describe(tokens, [category?.name, account?.name, amountLabel], periodLabel),
  }
}

export interface RankedMatch { t: Transaction; score: number }

/** Text matching and ranking ONLY — structured filters have already run.
 *  Every token must appear in the description (AND); if none does, any token
 *  counts and the result is `fuzzy`. Exact description first, then token hits;
 *  ties keep the input order (newest first). */
export function rankFindMatches(rows: Transaction[], tokens: string[]): { matches: RankedMatch[]; fuzzy: boolean } {
  if (tokens.length === 0) return { matches: rows.map(t => ({ t, score: 0 })), fuzzy: false }
  const phrase = tokens.join(' ')
  const whole = tokens.map(w => wordRe(w))
  const scored = rows.map(t => {
    const desc = t.description.toLowerCase()
    const hits = tokens.filter(w => desc.includes(w)).length
    // A whole-word hit outranks one inside another word: "ac" → "AC repair" before "Snacks".
    const wholeHits = whole.filter(re => re.test(desc)).length
    return { t, hits, score: hits * 2 + wholeHits + (desc.trim() === phrase ? 5 : 0) }
  })
  const strict = scored.filter(s => s.hits === tokens.length)
  const pool = strict.length > 0 ? strict : scored.filter(s => s.hits > 0)
  const fuzzy = strict.length === 0 && pool.length > 0
  const matches = pool
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map(({ s }) => ({ t: s.t, score: s.score }))
  return { matches, fuzzy }
}

/** The matches sharing the best score — more than one means "which one?". */
export const tiedAtTop = (matches: RankedMatch[]): Transaction[] =>
  matches.length === 0 ? [] : matches.filter(m => m.score === matches[0].score).map(m => m.t)

/**
 * How `total` may be shown:
 *  - complete  — exact: everything was loaded, or the database answered under the cap
 *  - truncated — the database stopped at SEARCH_MAX_ROWS, so `total` is a lower bound
 *  - local     — offline/failed: matches in the loaded window only
 */
export type FindStatus = 'complete' | 'truncated' | 'local'

export interface FindOutcome {
  /** Ranked matches, collapsed so a split payment is one entry. */
  groups: TransactionGroup[]
  /** Ranked matches as raw rows (for edit/delete, which act on a row). */
  matches: RankedMatch[]
  /** Entries after split collapse — what the user would see listed. */
  total: number
  status: FindStatus
  fuzzy: boolean
  /** The query that produced this (the alternate, if the first found nothing). */
  query: FindQuery
}

/** Filter (the shared definition) → rank → collapse splits. Collapsing follows
 *  the Transactions page: not under an account filter, where a ₹30,000 group
 *  would be shown against an account that paid ₹10,000 of it. */
export function findIn(rows: Transaction[], categories: AppState['categories'], query: FindQuery, status: FindStatus): FindOutcome {
  const filtered = filterAndSortTransactions(rows, categories, { ...query.filters, search: '' }, 'date_desc')
  const { matches, fuzzy } = rankFindMatches(filtered, query.tokens)
  const groups = groupSplitTransactions(matches.map(m => m.t), rows, { collapse: query.filters.account === 'all' })
  return { groups, matches, total: groups.length, status, fuzzy, query }
}

/**
 * Loaded ∪ database, the same way the Transactions page searches. Everything
 * structured goes to the server; the text part is the single `filters.search`
 * word (a superset of the AND match), then the shared filter and ranking run
 * over the merged rows. Offline or failed → the loaded window, labelled.
 */
export async function executeFind(
  query: FindQuery,
  loaded: Transaction[],
  categories: AppState['categories'],
  allLoaded: boolean,
  search: SearchTransactionsFn | undefined,
): Promise<FindOutcome> {
  const run = async (qy: FindQuery): Promise<FindOutcome> => {
    if (allLoaded) return findIn(loaded, categories, qy, 'complete')
    if (!search) return findIn(loaded, categories, qy, 'local')
    try {
      const r = await search({ ...qy.filters, showSystemTxns: true }, null)
      let rows = mergeLoadedWins(loaded, r.rows)
      let truncated = r.truncated
      let out = findIn(rows, categories, qy, truncated ? 'truncated' : 'complete')
      // No row has every word. Any row that did would contain the first word
      // too, so it would be here — this is certain, not a guess. Widen with the
      // other words so "closest" is drawn from the full history, not the window.
      const extra = byLength(qy.tokens).slice(1, 1 + WIDEN_MAX_TOKENS)
      if ((out.total === 0 || out.fuzzy) && extra.length > 0) {
        const more = await Promise.all(extra.map(w => search({ ...qy.filters, search: w, showSystemTxns: true }, null)))
        for (const m of more) { rows = mergeLoadedWins(rows, m.rows); truncated ||= m.truncated }
        out = findIn(rows, categories, qy, truncated ? 'truncated' : 'complete')
      }
      return out
    } catch (err) {
      console.error('Mint find: search failed', err)
      return findIn(loaded, categories, qy, 'local')
    }
  }
  const first = await run(query)
  if (first.total > 0 || !query.alternate) return first
  const second = await run(query.alternate)
  return second.total > 0 ? second : first
}

/** The query edit/delete use to locate a row: the words of the named
 *  description, plus the amount when one was given. Null when there's nothing
 *  to match on. */
export function rowQuery(description: string, amount: number | null): FindQuery | null {
  const tokens = findTokens(description)
  if (tokens.length === 0 && amount == null) return null
  const amountLabel = amount != null ? `₹${amount.toLocaleString('en-IN')}` : null
  return {
    filters: { ...DEFAULT_TXN_FILTERS, search: pickSearchToken(tokens) ?? '', amount },
    tokens, emphasis: null, empty: false, alternate: null,
    label: [tokens.join(' ') || null, amountLabel].filter(Boolean).join(' · '),
  }
}

/** Kinds edit/delete can act on — the chat's edit prompt only rewrites these. */
const EDITABLE: ReadonlySet<Transaction['transaction_type']> = new Set(['expense', 'income'])

/** The rows edit/delete should offer: editable kinds only, best score first.
 *  One row → confirm it; several tied at the top → ask which. Split legs stay
 *  separate, because edit and delete act on one row. */
export function editCandidates(o: FindOutcome): Transaction[] {
  return tiedAtTop(o.matches.filter(m => EDITABLE.has(m.t.transaction_type)))
}

/** A "which one?" outcome listing exactly `rows`, uncollapsed. */
export function pickOutcome(o: FindOutcome, rows: Transaction[]): FindOutcome {
  const groups = groupSplitTransactions(rows, rows, { collapse: false })
  return { ...o, groups, matches: rows.map(t => ({ t, score: 0 })), total: groups.length, fuzzy: false }
}

const plural = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'match' : 'matches'}`

/** The card's count — the only place the count contract turns into words. */
export function findCountText(total: number, status: FindStatus, loadedCount: number): string {
  if (status === 'truncated') return `${total.toLocaleString('en-IN')}+ matches`
  if (status === 'local') return `${plural(total)} in your latest ${loadedCount.toLocaleString('en-IN')}`
  return plural(total)
}

/** "View all N" may name N only when the Transactions page will list exactly
 *  that set: one search word (the page filters by one substring) and a strict
 *  match (the page has no ANY-token fallback). */
export const viewAllShowsCount = (o: FindOutcome): boolean =>
  o.status === 'complete' && !o.fuzzy && o.query.tokens.length <= 1

/** One-line summary — the only part of a find that reaches a later AI turn. */
export function findSummary(o: FindOutcome): string {
  if (o.total === 0) return `No transactions found for ${o.query.label}.`
  const shown = o.groups.slice(0, 3).map(g =>
    `${g.primary.description} ₹${g.total.toLocaleString('en-IN')} on ${g.primary.transaction_date}`).join(', ')
  const count = o.status === 'truncated' ? `${o.total.toLocaleString('en-IN')}+ matches` : plural(o.total)
  return `Found ${count} for ${o.query.label}: ${shown}${o.total > 3 ? ', …' : ''}.`
}
