/* ============================================================================
   Routes Mint's core money questions to a deterministic CFO card.
   Anything that doesn't clearly match returns null and keeps the free-form AI
   path — a plan, a "why", a story or advice is the model's job, not a card's.
   ============================================================================ */

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

export type CfoIntentKind = CfoIntent['kind']

// Intents answered entirely from local numbers — no AI request, no quota.
export const LOCAL_ONLY_INTENTS: ReadonlySet<CfoIntentKind> = new Set(['liquid', 'balances', 'changed'])

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

export function classifyCfoIntent(text: string): CfoIntent | null {
  const q = text.toLowerCase().replace(/[’']/g, "'").trim()

  if (/\bafford\b/.test(q)) return { kind: 'afford', amount: parseAmount(q) }
  if (/what('s| has| have)? changed|since (my |the )?last (check|time)|what moved/.test(q)) return { kind: 'changed' }

  if (ADVICE_WORDS.test(q)) return null

  if (/funding gap|cash needed|how much (do|will) i need|short(fall)? before|need before (my )?(salary|payday|income)/.test(q)) return { kind: 'gap' }
  if (/(payments?|bills?|dues?|emis?)\b.{0,20}\b(coming|upcoming|due)|upcoming (payments?|bills?|dues?)|what('s| is| are) due/.test(q)) return { kind: 'upcoming' }
  if (/\b(show|list|see)\b.{0,30}\bbalances?\b|balances? (across|in|of) (all )?(my )?accounts|account balances/.test(q)) return { kind: 'balances' }
  if (/how much (money |cash )?do i (actually |really )?have|liquid (cash|balance)|cash in hand/.test(q)) return { kind: 'liquid' }
  if (/free (money|cash)|after (my )?emergency fund|safe to spend|spendable/.test(q)) return { kind: 'free' }
  if (/how much (have|did) i spen[dt]|spent this (week|month)|spending this week|weekly (spend|spending)\b/.test(q)) return { kind: 'weekly' }
  if (/financial (status|state|health|position|situation|summary|snapshot)|current (status|situation|position)|how am i doing|analy[sz]e my (finances|financial|money)|complete (financial )?summary|cash flow snapshot/.test(q)) return { kind: 'status' }

  return null
}
