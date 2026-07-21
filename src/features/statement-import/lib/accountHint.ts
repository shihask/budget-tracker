import type { Account } from '@/types'

export interface AccountHint {
  raw: string | null
  bank_name: string | null
  masked_number: string | null
}

export interface ResolvedAccountHint {
  accountId: string
  reason: string
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Statement/UPI-app exports commonly show a masked account number as "XX87" /
// "XXXX1234" — X-padding followed by the real trailing digits, the only part
// that actually distinguishes one account from another. Written standalone
// rather than reusing aa-sync's suggestAccountLink, which is tailored to
// Account Aggregator's specific masked-number convention and (per its own
// comments) deliberately ignores bank name since AA's sandbox data doesn't
// provide a usable one — statement imports often DO get a real, readable
// bank name (e.g. SuperMoney's "Axis" column), worth using here.
function trailingDigits(masked: string): string {
  const match = masked.match(/[^Xx]+$/)
  return match ? normalize(match[0]) : ''
}

// Only has Account.name to match against today (no structured bank_name/
// masked_number/IFSC on the account record) — text-matches the hint against
// the display name. If Account ever gains those structured fields, extend
// the scoring below to prefer them; the signature here doesn't need to
// change, since callers already pass full Account objects that would carry
// any new fields for free.
export function resolveImportedAccountHint(
  hint: AccountHint | null,
  candidates: Pick<Account, 'id' | 'name' | 'type'>[]
): ResolvedAccountHint | null {
  if (!hint) return null

  const bank = hint.bank_name ? normalize(hint.bank_name) : ''
  const suffix = hint.masked_number ? trailingDigits(hint.masked_number) : ''
  if (!bank && !suffix) return null

  const scored = candidates
    .filter(a => a.type === 'bank')
    .map(a => {
      const name = normalize(a.name)
      const bankMatch = bank.length > 0 && name.includes(bank)
      const suffixMatch = suffix.length > 0 && name.includes(suffix)
      return { account: a, score: (bankMatch ? 1 : 0) + (suffixMatch ? 1 : 0), bankMatch, suffixMatch }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  const top = scored[0]
  const runnerUp = scored[1]
  // Two candidates scored identically — not enough signal to pick between
  // them confidently (e.g. bank name alone matches two accounts at the same
  // bank), so don't guess.
  if (runnerUp && runnerUp.score === top.score) return null

  const signals = [top.bankMatch && 'bank name', top.suffixMatch && 'masked suffix'].filter(Boolean)
  return { accountId: top.account.id, reason: `${signals.join(' + ')} match` }
}
