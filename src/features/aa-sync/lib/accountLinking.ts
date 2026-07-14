import type { Account } from '@/types'

export interface AccountLinkSuggestion {
  accountId: string
  reason: string
}

// maskedAccNumber is verified live (Phase 0 sandbox captures, e.g.
// "XXXXXXXXXXXXXXXXaf56") as uppercase 'X' padding followed by a lowercase
// alphanumeric suffix — that trailing run is the real matching signal.
function trailingSuffix(maskedAccNumber: string): string {
  const match = maskedAccNumber.match(/[^X]+$/)
  return match ? match[0].toLowerCase() : ''
}

function normalizeAccountName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '')
}

// 2-signal heuristic, not 3 — fipID is always the literal "FIP-ID" sandbox
// placeholder (confirmed in _shared/aa-normalize.ts output and Phase 0's own
// Unknowns), so bank name isn't actually an available matching signal here.
// Hard filter to type === 'bank' first, then does the masked suffix appear
// as a substring of the account's (normalized) name? No hit → the caller
// auto-creates directly, no synthetic third signal to fall back on.
export function suggestAccountLink(
  maskedAccNumber: string,
  candidates: Pick<Account, 'id' | 'name' | 'type'>[]
): AccountLinkSuggestion | null {
  const suffix = trailingSuffix(maskedAccNumber)
  if (!suffix) return null

  const match = candidates.find(a => a.type === 'bank' && normalizeAccountName(a.name).includes(suffix))
  if (!match) return null

  return { accountId: match.id, reason: `account name contains masked suffix "${suffix}"` }
}

// Default name for an auto-created account — includes the masked suffix so
// a future reconnect's suggestAccountLink has something to match against,
// mitigating Phase 0's untested "identifier stability across reconnects"
// Unknown instead of silently creating a duplicate account next time.
export function defaultAccountName(maskedAccNumber: string): string {
  const suffix = trailingSuffix(maskedAccNumber)
  return suffix ? `Bank account ···${suffix}` : 'Bank account'
}
