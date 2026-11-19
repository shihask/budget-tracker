import type { ColorTokens } from '@/lib/tokens'
import type { SettlementTone } from '../../lib/members'

/** Column template shared by the wide header and rows. */
export const WIDE_COLUMNS = '32px minmax(0, 1fr) 120px 130px 140px 16px'

export function toneColor(c: ColorTokens, tone: SettlementTone) {
  return tone === 'good' ? c.good : tone === 'ink' ? c.ink : c.muted
}

/** Supabase errors are plain objects with a message, not Error instances. */
export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'object' && e && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'Something went wrong. Try again.'
}
