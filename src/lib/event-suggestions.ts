import type { AppState, Category, LifeEvent, Master, Transaction } from '@/types'
import { MASTER_TYPES } from '@/types'
import { isSystemTx, catById } from '@/lib/data'
import { forSpendAnalytics, spendAmount } from '@/lib/reimbursements'
import type { AnalyticsTransaction } from '@/lib/reimbursements'
import { DEFAULT_EVENT_ICON, isEventIconKey } from '@/features/events/lib/eventIcons'
import type { EventIconKey } from '@/features/events/lib/eventIcons'

// ── Life Event suggestions ──────────────────────────────────────────────────
// Notices a real-life occasion ("tea ooty trip", "lunch ooty trip", …) in
// untagged spending and proposes it as an event. Everything here is pure: no
// storage, no network. useEventSuggestion owns the cache, the novelty fetch and
// the AI call; this module decides what counts as a signal and what a
// suggestion looks like. Nothing is ever linked from here — the user confirms
// every row in LinkExpensesSheet.

/** How far back untagged spending is considered. Long enough for a honeymoon or
 *  a month-long house shift, short enough that last quarter's trip is history. */
export const SUGGESTION_WINDOW_DAYS = 30
/** A shared phrase only triggers AI when its expenses fall within this span —
 *  tighter than the pool, because an occasion is concentrated in time. */
export const AI_SIGNAL_SPAN_DAYS = 21
/** A phrase seen in this lookback is a habit ("chai", "swiggy"), not an occasion.
 *  Bounded rather than all-time so the yearly Ooty trip is still suggested. */
export const NOVELTY_LOOKBACK_DAYS = 90
/** Local (no-AI) suggestions only: three ₹12 chais are not an event. AI may
 *  still propose a smaller occasion — it sees what the words mean. */
export const MIN_LOCAL_EVENT_TOTAL = 500
/** A cluster where this share of rows is one shop is shopping, not an occasion. */
export const MERCHANT_SHARE_REJECT = 0.7
/** Caps the pool, and with it the AI prompt size. */
export const MAX_AI_ROWS = 60

/** Local suggestions need three rows — two coinciding words is too weak to show
 *  a card for without AI's reading of them. */
const MIN_LOCAL_EXPENSES = 3
/** Two rows sharing a new phrase is enough to be worth asking AI about. */
const MIN_SIGNAL_EXPENSES = 2
/** An occasion spans categories (food, fuel, tickets); a habit usually doesn't. */
const MIN_LOCAL_CATEGORIES = 2
/** Burst: this many expenses in BURST_SPAN_DAYS, at BURST_MULTIPLIER× a normal day. */
const BURST_MIN_EXPENSES = 3
const BURST_SPAN_DAYS = 5
const BURST_MULTIPLIER = 3
/** Phrases are 1–3 words: "ooty", "ooty trip", "goa beach trip". */
const MAX_PHRASE_WORDS = 3
const MIN_TOKEN_LENGTH = 3
/** The card lists at most this many matched labels. */
const MAX_MATCHED_LABELS = 4
/** AI answers below this are not shown. */
export const MIN_AI_CONFIDENCE = 60
export const MAX_EVENT_NAME_LENGTH = 40

export const STOPWORDS = new Set([
  'for', 'at', 'to', 'the', 'and', 'in', 'on', 'of', 'with', 'via', 'from', 'into', 'by',
])

/** Venue words that sit in FRONT of a shop's name: "Hotel Maharaja". */
const VENUE_PREFIXES = new Set(['hotel', 'restaurant', 'cafe', 'bakery', 'medical', 'pharmacy'])
/** Store words that FOLLOW a shop's name: "Lulu Hypermarket". */
const STORE_SUFFIXES = new Set(['hypermarket', 'supermarket', 'mart', 'store', 'bakery'])
/** Skipped when looking for the first meaningful word of a description. */
export const GENERIC_MERCHANT_PREFIXES = new Set([...VENUE_PREFIXES, ...STORE_SUFFIXES])

const DAY_MS = 86_400_000

/** Day number for a YYYY-MM-DD string — timezone-free, so spans are exact. */
const dayIndex = (isoDate: string): number =>
  Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY_MS)
const isoFromIndex = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10)
export const shiftIso = (isoDate: string, days: number): string => isoFromIndex(dayIndex(isoDate) + days)

// ── Text normalisation ──────────────────────────────────────────────────────

/** Lowercase words, split on anything that isn't a letter (so digits and UPI
 *  references fall away), minus stopwords and very short tokens. Letters
 *  include combining marks so Malayalam or Hindi words stay whole. */
export function tokenize(description: string | null | undefined): string[] {
  return (description ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter(w => w.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(w))
}

/** Every contiguous 1–3 word phrase in a token list. */
export function phrasesOf(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (let n = 1; n <= MAX_PHRASE_WORDS; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(' '))
  }
  return out
}

/** "  Ooty  Trip " → "ooty-trip". The one comparison key for event names and
 *  merchant names, so case and spacing never create a duplicate. */
export function eventSlug(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('-')
}

const titleCase = (s: string): string =>
  s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const wordCount = (phrase: string): number => phrase.split(' ').length

// ── Pool ────────────────────────────────────────────────────────────────────

/** Untagged, unsplit, non-system expenses from the last SUGGESTION_WINDOW_DAYS,
 *  newest first, capped at MAX_AI_ROWS. Reimbursed expenses carry their net
 *  amount, so a suggested total matches what the event will show. */
export function suggestionPool(
  state: Pick<AppState, 'transactions' | 'categories'>,
  today: string,
): AnalyticsTransaction[] {
  const catMap = catById(state.categories)
  const from = shiftIso(today, -(SUGGESTION_WINDOW_DAYS - 1))
  return forSpendAnalytics(state.transactions)
    .filter(t =>
      t.transaction_type === 'expense' &&
      !t.event_id &&
      // Split legs can't be tagged individually — same rule as LinkExpensesSheet.
      !t.split_group_id &&
      !isSystemTx(t, catMap) &&
      t.transaction_date >= from && t.transaction_date <= today)
    .sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date) ||
      (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, MAX_AI_ROWS)
}

/** Each row contributes `id:date:normalised tokens`. Recasing a description
 *  keeps the fingerprint; changing its words invalidates it. */
export function suggestionFingerprint(rows: Pick<Transaction, 'id' | 'transaction_date' | 'description'>[]): string {
  return rows
    .map(t => `${t.id}:${t.transaction_date}:${tokenize(t.description).join(' ')}`)
    .sort()
    .join('|')
}

// ── Phrase clusters ─────────────────────────────────────────────────────────

export interface PhraseCluster {
  phrase: string
  txIds: string[]
  transactions: AnalyticsTransaction[]
}

/** Groups the pool by shared 1–3 word phrase. When several phrases cover the
 *  exact same rows, the longest wins — "ooty trip" over "ooty" and "trip".
 *  Sorted by size, then phrase length, then alphabetically, so it's deterministic. */
export function findPhraseClusters(pool: AnalyticsTransaction[]): PhraseCluster[] {
  const byPhrase = new Map<string, AnalyticsTransaction[]>()
  for (const t of pool) {
    for (const p of phrasesOf(tokenize(t.description))) {
      const list = byPhrase.get(p)
      if (list) list.push(t); else byPhrase.set(p, [t])
    }
  }
  const bySet = new Map<string, PhraseCluster>()
  for (const [phrase, txs] of byPhrase) {
    if (txs.length < MIN_SIGNAL_EXPENSES) continue
    const txIds = txs.map(t => t.id).sort()
    const key = txIds.join(',')
    const cur = bySet.get(key)
    if (!cur || isBetterPhrase(phrase, cur.phrase)) bySet.set(key, { phrase, txIds, transactions: txs })
  }
  return [...bySet.values()].sort((a, b) =>
    b.txIds.length - a.txIds.length ||
    wordCount(b.phrase) - wordCount(a.phrase) ||
    a.phrase.localeCompare(b.phrase))
}

/** More words wins, then more characters, then alphabetical — deterministic. */
const isBetterPhrase = (candidate: string, current: string): boolean =>
  (wordCount(candidate) - wordCount(current) ||
   candidate.length - current.length ||
   current.localeCompare(candidate)) > 0

/** The name to show for a cluster: the longest phrase that contains the
 *  cluster's phrase and appears in at least half its rows. "Petrol Ooty",
 *  "Ooty Entry Fee", "Tea Ooty Trip", "Lunch Ooty Trip" cluster on "ooty", and
 *  are named "Ooty Trip". */
export function clusterDisplayPhrase(cluster: PhraseCluster): string {
  const counts = new Map<string, number>()
  for (const t of cluster.transactions) {
    for (const p of phrasesOf(tokenize(t.description))) {
      if ((` ${p} `).includes(` ${cluster.phrase} `)) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
  }
  let best = cluster.phrase
  for (const [p, n] of counts) {
    if (n * 2 < cluster.transactions.length) continue
    if (wordCount(p) > wordCount(best) || (wordCount(p) === wordCount(best) && p.length > best.length)) best = p
  }
  return best
}

// ── Novelty ─────────────────────────────────────────────────────────────────

export interface HistoryRow {
  id: string
  description: string | null
  transaction_date: string
  amount?: number
  category_id?: string | null
  event_id?: string | null
}

/** True when `phrase` appears in no expense during the NOVELTY_LOOKBACK_DAYS
 *  before `clusterStart`. Both sides go through the same tokenizer, so "goa"
 *  never matches "goal" and "ooty" never matches "ootyhill". */
export function isNovel(phrase: string, clusterStart: string, history: HistoryRow[]): boolean {
  const from = shiftIso(clusterStart, -NOVELTY_LOOKBACK_DAYS)
  for (const r of history) {
    if (r.transaction_date < from || r.transaction_date >= clusterStart) continue
    if (phrasesOf(tokenize(r.description)).has(phrase)) return false
  }
  return true
}

// ── Merchant rejection ──────────────────────────────────────────────────────

/** First word of a description that isn't a generic venue/store word:
 *  "Hotel Maharaja" → maharaja, "Medical Trust" → trust. */
export function firstMeaningfulToken(description: string | null | undefined): string | null {
  return tokenize(description).find(w => !GENERIC_MERCHANT_PREFIXES.has(w)) ?? null
}

/** True when the cluster is shopping at one merchant, checked in priority order:
 *  A. ≥70% of rows share one merchant master;
 *  B. the phrase is a merchant master's name;
 *  C. ≥70% of rows share a first meaningful word AND somewhere in the cluster
 *     that word is written as a shop — "Lulu Hypermarket", "Hotel Maharaja".
 *
 *  C needs that second clause because a place leads a description just as
 *  often as a shop does: "Ooty entry fee", "Ooty boating", "Ooty hotel" share
 *  "ooty", and that is exactly the trip this feature exists to find. */
export function isMerchantCluster(
  transactions: Pick<Transaction, 'description' | 'master_id'>[],
  phrase: string,
  masters: Master[],
): boolean {
  const n = transactions.length
  if (n === 0) return false
  const merchants = masters.filter(m => m.type === MASTER_TYPES.MERCHANT)

  // A
  const merchantIds = new Set(merchants.map(m => m.id))
  const byMaster = new Map<string, number>()
  for (const t of transactions) {
    if (t.master_id && merchantIds.has(t.master_id)) byMaster.set(t.master_id, (byMaster.get(t.master_id) ?? 0) + 1)
  }
  for (const count of byMaster.values()) if (count / n >= MERCHANT_SHARE_REJECT) return true

  // B
  const phraseSlug = eventSlug(phrase)
  if (merchants.some(m => eventSlug(m.display_name ?? m.name) === phraseSlug)) return true

  // C
  const byFirst = new Map<string, number>()
  for (const t of transactions) {
    const w = firstMeaningfulToken(t.description)
    if (w) byFirst.set(w, (byFirst.get(w) ?? 0) + 1)
  }
  for (const [word, count] of byFirst) {
    if (count / n < MERCHANT_SHARE_REJECT) continue
    const writtenAsShop = transactions.some(t => {
      const tokens = tokenize(t.description)
      return tokens.some((w, i) => w === word &&
        (STORE_SUFFIXES.has(tokens[i + 1] ?? '') || VENUE_PREFIXES.has(tokens[i - 1] ?? '')))
    })
    if (writtenAsShop) return true
  }
  return false
}

// ── Burst ───────────────────────────────────────────────────────────────────

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Median daily spend over the NOVELTY_LOOKBACK_DAYS before `before`, counting
 *  zero-spend days. Median rather than mean so one laptop purchase doesn't make
 *  every later week look ordinary.
 *
 *  null when history doesn't reach back that far: a day we know nothing about
 *  is not a zero-spend day, and treating it as one would make every ₹500 week
 *  of a new user's spending look like a burst. */
export function baselineDailySpend(history: HistoryRow[], before: string): number | null {
  const from = shiftIso(before, -NOVELTY_LOOKBACK_DAYS)
  if (!history.some(r => r.transaction_date <= from)) return null
  const byDay = new Map<string, number>()
  for (const r of history) {
    if (r.event_id || r.transaction_date < from || r.transaction_date >= before) continue
    byDay.set(r.transaction_date, (byDay.get(r.transaction_date) ?? 0) + (r.amount ?? 0))
  }
  const days: number[] = []
  for (let i = NOVELTY_LOOKBACK_DAYS; i >= 1; i--) days.push(byDay.get(shiftIso(before, -i)) ?? 0)
  return median(days)
}

/** The heaviest BURST_SPAN_DAYS window in the pool that has ≥3 expenses, at
 *  least ₹MIN_LOCAL_EVENT_TOTAL, and at least BURST_MULTIPLIER× the baseline
 *  day. Catches hospital stays and weddings, whose rows share no words. Only
 *  ever used to decide whether to ask AI — never shown on its own. */
export function findBurst(pool: AnalyticsTransaction[], baseline: number): AnalyticsTransaction[] | null {
  const rows = [...pool].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
  let best: AnalyticsTransaction[] | null = null
  let bestTotal = 0
  let lo = 0
  let total = 0
  for (let hi = 0; hi < rows.length; hi++) {
    total += spendAmount(rows[hi])
    while (dayIndex(rows[hi].transaction_date) - dayIndex(rows[lo].transaction_date) >= BURST_SPAN_DAYS) {
      total -= spendAmount(rows[lo])
      lo++
    }
    const count = hi - lo + 1
    if (count >= BURST_MIN_EXPENSES &&
        total >= MIN_LOCAL_EVENT_TOTAL &&
        total >= BURST_MULTIPLIER * baseline &&
        total > bestTotal) {
      best = rows.slice(lo, hi + 1)
      bestTotal = total
    }
  }
  return best
}

// ── Suggestion ──────────────────────────────────────────────────────────────

export interface EventSuggestion {
  source: 'ai' | 'local'
  name: string
  icon: EventIconKey
  txIds: string[]
  total: number
  startDate: string
  endDate: string
  matchedLabels: string[]
  defaultCategoryId?: string
  defaultAccountId?: string
  existingEventId?: string
}

/** Matches a live (non-archived) event by slug, so "OOTY TRIP" finds "Ooty Trip". */
export function matchExistingEvent(name: string, events: LifeEvent[]): LifeEvent | null {
  const slug = eventSlug(name)
  if (!slug) return null
  return events.find(e => e.status !== 'archived' && eventSlug(e.name) === slug) ?? null
}

const ICON_WORDS: [EventIconKey, string[]][] = [
  ['ring', ['wedding', 'marriage', 'engagement', 'nikah', 'reception', 'kalyanam']],
  ['hospital', ['hospital', 'surgery', 'clinic', 'admission', 'delivery', 'treatment']],
  ['house', ['house', 'home', 'shifting', 'shift', 'renovation', 'construction', 'housewarming']],
  ['party', ['birthday', 'party', 'festival', 'onam', 'diwali', 'eid', 'christmas', 'function', 'celebration']],
  ['baby', ['baby', 'naming', 'baptism']],
  ['graduation', ['college', 'graduation', 'school', 'exam', 'convocation']],
  ['car', ['car', 'bike', 'vehicle']],
  ['plane', ['trip', 'tour', 'travel', 'vacation', 'holiday', 'journey', 'honeymoon', 'flight']],
]

/** Icon from the words of a name; DEFAULT_EVENT_ICON when nothing matches. */
export function guessEventIcon(name: string): EventIconKey {
  const words = new Set(tokenize(name))
  for (const [icon, list] of ICON_WORDS) if (list.some(w => words.has(w))) return icon
  return DEFAULT_EVENT_ICON
}

const mostFrequent = (values: (string | null | undefined)[]): string | undefined => {
  const counts = new Map<string, number>()
  let best: string | undefined
  let bestCount = 0
  for (const v of values) {
    if (!v) continue
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (n > bestCount) { best = v; bestCount = n }
  }
  return best
}

/** What each row was, with the event's own words removed: "tea ooty trip" in
 *  "Ooty Trip" → "Tea". Falls back to the category name, then deduplicates. */
export function matchedLabels(
  transactions: Pick<Transaction, 'description' | 'category_id' | 'transaction_date'>[],
  eventName: string,
  categories: Category[],
): string[] {
  const eventWords = new Set(tokenize(eventName))
  const catMap = catById(categories)
  const out: string[] = []
  const seen = new Set<string>()
  const rows = [...transactions].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
  for (const t of rows) {
    const rest = tokenize(t.description).filter(w => !eventWords.has(w)).join(' ')
    const label = rest ? titleCase(rest) : catMap[t.category_id ?? '']?.name
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    out.push(label)
    if (out.length === MAX_MATCHED_LABELS) break
  }
  return out
}

export function buildSuggestion(
  source: EventSuggestion['source'],
  name: string,
  icon: EventIconKey,
  transactions: AnalyticsTransaction[],
  categories: Category[],
  events: LifeEvent[],
): EventSuggestion {
  const dates = transactions.map(t => t.transaction_date).sort()
  const existing = matchExistingEvent(name, events)
  return {
    source,
    // An existing event's own spelling wins, so the card says what the list says.
    name: existing?.name ?? name,
    icon: existing && isEventIconKey(existing.icon) ? existing.icon : icon,
    txIds: transactions.map(t => t.id),
    total: transactions.reduce((s, t) => s + spendAmount(t), 0),
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    matchedLabels: matchedLabels(transactions, name, categories),
    defaultCategoryId: mostFrequent(transactions.map(t => t.category_id)),
    defaultAccountId: mostFrequent(transactions.map(t => t.from_account_id)),
    existingEventId: existing?.id,
  }
}

// ── Detection ───────────────────────────────────────────────────────────────

export interface DetectionInput {
  pool: AnalyticsTransaction[]
  /** Expenses to judge novelty and the burst baseline against — loaded rows
   *  plus anything the hook fetched to reach NOVELTY_LOOKBACK_DAYS back. */
  history: HistoryRow[]
  categories: Category[]
  masters: Master[]
  events: LifeEvent[]
}

export interface Detection {
  /** Novel, non-merchant phrase clusters of ≥2 rows across ≥2 categories, within AI_SIGNAL_SPAN_DAYS. */
  phraseSignals: PhraseCluster[]
  /** Rows of the heaviest spending burst, or null. */
  burst: AnalyticsTransaction[] | null
  /** The no-AI suggestion, phrase-based only. */
  local: EventSuggestion | null
}

const spanDays = (txs: Pick<Transaction, 'transaction_date'>[]): number => {
  const days = txs.map(t => dayIndex(t.transaction_date))
  return Math.max(...days) - Math.min(...days) + 1
}

export function detectEventSignals({ pool, history, categories, masters, events }: DetectionInput): Detection {
  const categorySlugs = new Set(categories.map(c => eventSlug(c.name)))
  const eligible = findPhraseClusters(pool).filter(c => {
    const start = c.transactions.reduce((m, t) => t.transaction_date < m ? t.transaction_date : m, c.transactions[0].transaction_date)
    return isNovel(c.phrase, start, history) && !isMerchantCluster(c.transactions, c.phrase, masters)
  })

  const spansCategories = (c: PhraseCluster) =>
    new Set(c.transactions.map(t => t.category_id ?? '')).size >= MIN_LOCAL_CATEGORIES

  // Category spread is required here too, not only for local suggestions: a new
  // user has no history, so every phrase is novel, and without it each chai they
  // log would change the signal and re-ask AI about a habit.
  const phraseSignals = eligible.filter(c => spanDays(c.transactions) <= AI_SIGNAL_SPAN_DAYS && spansCategories(c))

  const localCluster = eligible.find(c =>
    c.transactions.length >= MIN_LOCAL_EXPENSES &&
    spansCategories(c) &&
    c.transactions.reduce((s, t) => s + spendAmount(t), 0) >= MIN_LOCAL_EVENT_TOTAL &&
    !categorySlugs.has(eventSlug(c.phrase)))

  let local: EventSuggestion | null = null
  if (localCluster) {
    const name = titleCase(clusterDisplayPhrase(localCluster))
    local = buildSuggestion('local', name, guessEventIcon(name), localCluster.transactions, categories, events)
  }

  const poolStart = pool.reduce((m, t) => t.transaction_date < m ? t.transaction_date : m, pool[0]?.transaction_date ?? '')
  const baseline = pool.length ? baselineDailySpend(history, poolStart) : null
  const burst = baseline === null ? null : findBurst(pool, baseline)

  return { phraseSignals, burst, local }
}

export const hasEventSignal = (d: Detection): boolean => d.phraseSignals.length > 0 || d.burst !== null

/** The rows that make up the signal. The AI cache is keyed on these rather than
 *  the whole pool, so a coffee bought today doesn't re-ask AI about last
 *  week's trip — only a change to the signal itself does. */
export function signalRows(d: Detection): AnalyticsTransaction[] {
  const byId = new Map<string, AnalyticsTransaction>()
  for (const c of d.phraseSignals) for (const t of c.transactions) byId.set(t.id, t)
  for (const t of d.burst ?? []) byId.set(t.id, t)
  return [...byId.values()]
}

// ── AI result ───────────────────────────────────────────────────────────────

export interface AiEventDetection {
  is_event?: unknown
  name?: unknown
  icon?: unknown
  indices?: unknown
  confidence?: unknown
}

export interface ValidatedAiEvent {
  name: string
  icon: EventIconKey
  transactions: AnalyticsTransaction[]
}

/** A number, or a numeric string; NaN for anything else. */
const toNumber = (v: unknown): number =>
  typeof v === 'number' ? v
  : typeof v === 'string' && v.trim() !== '' ? Number(v)
  : NaN

/** AI output is untrusted. Indices are mapped back to the rows that were sent;
 *  duplicates, out-of-range and already-tagged rows are dropped. Returns null
 *  unless it's a confident, named occasion over at least two real expenses. */
export function validateAiResult(raw: AiEventDetection | null | undefined, sentRows: AnalyticsTransaction[]): ValidatedAiEvent | null {
  if (!raw || (raw.is_event !== true && raw.is_event !== 'true')) return null
  // Small models write confidence as 85, "85" or 0.85 interchangeably — a strict
  // integer check silently turned real answers into "not an event".
  let confidence = toNumber(raw.confidence)
  if (confidence > 0 && confidence <= 1) confidence *= 100
  if (!(confidence >= MIN_AI_CONFIDENCE)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name || name.length > MAX_EVENT_NAME_LENGTH) return null
  if (!Array.isArray(raw.indices)) return null

  const picked = new Map<string, AnalyticsTransaction>()
  for (const rawIndex of raw.indices) {
    const i = toNumber(rawIndex)
    if (!Number.isInteger(i)) continue
    const t = sentRows[i]
    if (!t || t.event_id || picked.has(t.id)) continue
    picked.set(t.id, t)
  }
  if (picked.size < MIN_SIGNAL_EXPENSES) return null

  return {
    name,
    icon: isEventIconKey(raw.icon) ? raw.icon : DEFAULT_EVENT_ICON,
    transactions: [...picked.values()],
  }
}

// ── Dismissal ───────────────────────────────────────────────────────────────

/** Hidden when at least half its rows were in a dismissed suggestion. By id,
 *  not name — AI may call the same trip "Ooty Trip" one day and "Trip to Ooty"
 *  the next — and by majority, so a trip that continues after "Not an event"
 *  stays dismissed. */
export function isSuppressed(s: Pick<EventSuggestion, 'txIds'>, dismissed: Set<string>): boolean {
  if (s.txIds.length === 0) return true
  const hits = s.txIds.filter(id => dismissed.has(id)).length
  return hits * 2 >= s.txIds.length
}
