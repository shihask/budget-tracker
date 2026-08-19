// How the Mint AI usage percentage is presented. Pure and separate from the
// component so the thresholds can be tested at their boundaries without
// mounting anything — the repo has no mocking infrastructure and this needs
// none.
//
// The percentage itself is always computed server-side (mp_ai_usage_today) from
// tokens, never from the request count and never client-side. This module only
// decides how a number that already exists should look and read.

export type UsageTone = 'normal' | 'warn' | 'full'

export interface UsagePresentation {
  tone: UsageTone
  /** Sub-line under the bar. Empty string means render nothing. */
  message: string
}

/**
 * @param pct       server-computed, already clamped to 0-100
 * @param enforcing whether the token budget currently BLOCKS requests. Reported
 *                  by the server; the client must not infer it. While
 *                  measuring, reaching 100% must not claim Mint has stopped —
 *                  it hasn't.
 */
export function usageTone(pct: number, enforcing: boolean): UsagePresentation {
  if (pct >= 100) {
    return {
      tone: 'full',
      message: enforcing
        ? "Mint's daily AI limit has been reached. Your AI usage resets tomorrow."
        : "You've reached today's recommended AI usage. Mint will continue working.",
    }
  }
  if (pct >= 90) return { tone: 'warn', message: "You've used most of today's recommended AI usage." }
  if (pct >= 70) return { tone: 'warn', message: '' }
  return { tone: 'normal', message: '' }
}
