/* ============================================================================
   Routes Mint's core money questions to a deterministic CFO card.
   Anything that doesn't clearly match returns null and keeps the free-form AI
   path — a plan, a "why", a story or advice is the model's job, not a card's.
   ============================================================================ */

import { localIso } from '@/lib/utils'

export type CfoIntent =
  | { kind: 'status' }
  | { kind: 'gap' }
  | { kind: 'liquid' }
  | { kind: 'balances' }
  | { kind: 'upcoming' }
  | { kind: 'free' }
  | { kind: 'weekly' }
  | { kind: 'changed' }
  | { kind: 'afford'; amount: number | null }
  | { kind: 'balanceOn'; date: string }

export type CfoIntentKind = CfoIntent['kind']

// Intents answered entirely from local numbers — no AI request, no quota.
export const LOCAL_ONLY_INTENTS: ReadonlySet<CfoIntentKind> = new Set(['liquid', 'balances', 'changed', 'balanceOn'])

// Requests for advice, plans or explanations belong to the free-form coach.
const ADVICE_WORDS = /\b(plan|recover|recovery|tips?|ways?|why|story|advice|help me|how (can|do|should) i|reduce|cut|save|saving up|compare|breakdown)\b/

// "8000", "8,000", "₹8,000", "8k", "1.5 lakh". A ₹/Rs-marked number wins;
// otherwise the largest — "an iPhone 15 for 80000" means 80,000, not 15.
export function parseAmount(text: string): number | null {
  const found: { value: number; marked: boolean }[] = []
  for (const m of text.toLowerCase().matchAll(/(₹|rs\.?\s|inr\s)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l)?\b/g)) {
    const n = parseFloat(m[2].replace(/,/g, ''))
    if (!(n > 0)) continue
    const unit = m[3] ?? ''
    const mult = unit === 'k' || unit === 'thousand' ? 1_000 : unit ? 100_000 : 1
    found.push({ value: Math.round(n * mult), marked: !!m[1] })
  }
  if (found.length === 0) return null
  const marked = found.find(f => f.marked)
  return marked ? marked.value : Math.max(...found.map(f => f.value))
}

/* ── Dates: "5 Dec", "december 5th", "5/12", "tomorrow", "next month", Manglish ── */

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s*-?\\s*${MONTH}\\.?(?:,?\\s*(\\d{4}))?`)
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s*(\\d{4}))?`)
// Day first, as written in India. Never "." — "1.5 lakh" is not 1 May.
const NUMERIC = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/

// A year-less date this far in the past means next year ("5 Jan", asked in December).
const PAST_ROLLOVER_DAYS = 60

function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
}

// Same day next month, clamped: 31 Jan → 28/29 Feb.
function addMonthClamped(base: Date, n: number): Date {
  const last = new Date(base.getFullYear(), base.getMonth() + n + 1, 0).getDate()
  return new Date(base.getFullYear(), base.getMonth() + n, Math.min(base.getDate(), last))
}

function calendarDate(y: number | null, m: number, dd: number, today: Date): Date | null {
  if (m < 0 || m > 11 || dd < 1) return null
  const year = y ?? today.getFullYear()
  if (dd > new Date(year, m + 1, 0).getDate()) return null
  const date = new Date(year, m, dd)
  if (y == null && date < addDays(today, -PAST_ROLLOVER_DAYS)) return calendarDate(year + 1, m, dd, today)
  return date
}

function fullYear(s: string | undefined): number | null {
  if (!s) return null
  return s.length === 2 ? 2000 + Number(s) : Number(s)
}

/** The first date the text names, as a local ISO day, plus the words that named it. */
export function parseForecastDate(text: string, now: Date = new Date()): { iso: string; matched: string } | null {
  const q = text.toLowerCase()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hit = (date: Date | null, matched: string) => date ? { iso: localIso(date), matched } : null

  let m = q.match(DAY_MONTH)
  if (m) return hit(calendarDate(fullYear(m[3]), MONTHS.indexOf(m[2].slice(0, 3)), Number(m[1]), today), m[0])
  m = q.match(MONTH_DAY)
  if (m) return hit(calendarDate(fullYear(m[3]), MONTHS.indexOf(m[1].slice(0, 3)), Number(m[2]), today), m[0])
  m = q.match(NUMERIC)
  if (m) return hit(calendarDate(fullYear(m[3]), Number(m[2]) - 1, Number(m[1]), today), m[0])

  m = q.match(/\b(day after tomorrow|mattannal|mattanal)\b/)
  if (m) return hit(addDays(today, 2), m[0])
  m = q.match(/\b(tomorrow|tmrw|naale|nale)\b/)
  if (m) return hit(addDays(today, 1), m[0])
  m = q.match(/\b(today|tonight|innu)\b/)
  if (m) return hit(today, m[0])
  m = q.match(/\b(?:in\s+(\d{1,3})\s+(days?|weeks?)|(\d{1,3})\s+(days?|weeks?)\s+(?:later|from now|kazhinj\w*))\b/)
  if (m) {
    const n = Number(m[1] ?? m[3])
    return hit(addDays(today, /^week/.test(m[2] ?? m[4]) ? n * 7 : n), m[0])
  }
  m = q.match(/\b(end of next month|next month[- ]end)\b/)
  if (m) return hit(new Date(today.getFullYear(), today.getMonth() + 2, 0), m[0])
  m = q.match(/\b(end of (?:the |this )?month|(?:this )?month[- ]end|maasa(?:m)? ?avasanam)\b/)
  if (m) return hit(new Date(today.getFullYear(), today.getMonth() + 1, 0), m[0])
  m = q.match(/\b(?:next|adutha|aduttha)\s+(?:month|maasam|masam)(?:\s+(?:this|same|ee|e)\s+(?:date|day|divasam))?\b/)
  if (m) return hit(addMonthClamped(today, 1), m[0])
  m = q.match(/\b(?:next|adutha|aduttha)\s+(?:week|aazhcha|azhcha)\b/)
  if (m) return hit(addDays(today, 7), m[0])
  return null
}

// Filler around a lone date: "by 5 december", "and on 10 dec?", "what about tomorrow".
const DATE_FILLER = /\b(by|on|at|for|till|until|upto|up to|and|what|about|how|then|ee)\b|[?.,!]/g

/** A message that is ONLY a date — the follow-up "5 December" after a balance-on-date answer. */
export function parseBareForecastDate(text: string, now: Date = new Date()): string | null {
  const found = parseForecastDate(text, now)
  if (!found) return null
  const rest = text.toLowerCase().replace(found.matched, ' ').replace(DATE_FILLER, ' ').trim()
  return rest ? null : found.iso
}

// "how much will I have", "balance on", Manglish "ethra … undavum", "kayyil".
const BALANCE_ON_WORDS = /\b(how much|ethra|etra)\b.{0,40}\b(have|left|remain\w*|balance|cash|money|panam|paisa|undavum|undakum|undaavum|kaanum|kanum|baaki|bakki)\b|\b(will|would) i (still )?have\b|\bi'?ll (still )?have\b|\b(balance|forecast)\b.{0,15}\b(on|by|at|for|till|until)\b|\b(undavum|undakum|undaavum|kayyil|kaiyil|kaiyyil|baaki|bakki)\b/
// Spending, payments and the past are other questions ("how much money did I spend on 5 Nov").
const NOT_BALANCE_ON_WORDS = /\b(spen[dt]|spending|paid|pay|payments?|earn\w*|received|did)\b/

export function classifyCfoIntent(text: string, now: Date = new Date()): CfoIntent | null {
  const q = text.toLowerCase().replace(/[’']/g, "'").trim()

  if (/\bafford\b/.test(q)) return { kind: 'afford', amount: parseAmount(q) }
  if (/what('s| has| have)? changed|since (my |the )?last (check|time)|what moved/.test(q)) return { kind: 'changed' }

  if (ADVICE_WORDS.test(q)) return null

  if (BALANCE_ON_WORDS.test(q) && !NOT_BALANCE_ON_WORDS.test(q)) {
    const on = parseForecastDate(q, now)
    if (on) return { kind: 'balanceOn', date: on.iso }
  }

  if (/funding gap|cash needed|how much (do|will) i need|short(fall)? before|need before (my )?(salary|payday|income)/.test(q)) return { kind: 'gap' }
  if (/(payments?|bills?|dues?|emis?)\b.{0,20}\b(coming|upcoming|due)|upcoming (payments?|bills?|dues?)|what('s| is| are) due/.test(q)) return { kind: 'upcoming' }
  if (/\b(show|list|see)\b.{0,30}\bbalances?\b|balances? (across|in|of) (all )?(my )?accounts|account balances/.test(q)) return { kind: 'balances' }
  if (/how much (money |cash )?do i (actually |really )?have|liquid (cash|balance)|cash in hand/.test(q)) return { kind: 'liquid' }
  if (/free (money|cash)|after (my )?emergency fund|safe to spend|spendable/.test(q)) return { kind: 'free' }
  if (/how much (have|did) i spen[dt]|spent this (week|month)|spending this week|weekly (spend|spending)\b/.test(q)) return { kind: 'weekly' }
  if (/financial (status|state|health|position|situation|summary|snapshot)|current (status|situation|position)|how am i doing|analy[sz]e my (finances|financial|money)|complete (financial )?summary|cash flow snapshot/.test(q)) return { kind: 'status' }

  return null
}
