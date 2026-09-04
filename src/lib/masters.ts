import { MASTER_TYPES } from '@/types'
import type { Master, MasterType } from '@/types'

/** UX normalization: trim, and collapse inner runs of whitespace so
 *  "Rahul    Menon" is stored as "Rahul Menon".
 *
 *  This is STRICTLY WIDER than the database's `display_name` generated column,
 *  which only trims. The DB is the integrity backstop against a writer that
 *  skips this function; this is the app's own tidy-up. If a second writer ever
 *  appears (an import, a script), route it through here rather than widening
 *  the generated column — `regexp_replace` is a worse thing to depend on inside
 *  an index than one shared client function. */
export function normalizeMasterName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Drives the save button's disabled state. A name of only spaces is not a name. */
export function isValidMasterName(raw: string): boolean {
  return normalizeMasterName(raw).length > 0
}

/** Case-insensitive, and scoped to a single type — "Rahul" the person and
 *  "Rahul" the merchant are different entities, which is why the DB's unique
 *  index includes `type`.
 *
 *  `excludeId` is load-bearing, and is the client mirror of the `AND id <> NEW.id`
 *  in mp_validate_reimbursement: without it, opening Rahul in the edit sheet and
 *  pressing Save reports "Rahul already exists" against Rahul himself. */
export function findDuplicateMaster(
  masters: Master[],
  name: string,
  type: MasterType,
  excludeId?: string | null,
): Master | null {
  const needle = normalizeMasterName(name).toLowerCase()
  if (!needle) return null
  return masters.find(m =>
    m.id !== excludeId &&
    m.type === type &&
    normalizeMasterName(m.name).toLowerCase() === needle
  ) ?? null
}

/** Name always; phone only for people. Merchants have no phone in practice, but
 *  saying so explicitly means the rule survives a merchant that somehow has one
 *  rather than depending on the data staying clean. */
export function searchMasters(masters: Master[], query: string): Master[] {
  const q = normalizeMasterName(query).toLowerCase()
  if (!q) return masters
  return masters.filter(m => {
    if (normalizeMasterName(m.name).toLowerCase().includes(q)) return true
    if (m.type !== MASTER_TYPES.PERSON) return false
    return (m.phone ?? '').toLowerCase().includes(q)
  })
}

/** Alphabetical, case- and accent-insensitive. Returns a new array; never sorts
 *  the caller's (state) array in place. */
export function sortMasters(masters: Master[]): Master[] {
  return [...masters].sort((a, b) =>
    normalizeMasterName(a.name).localeCompare(normalizeMasterName(b.name), undefined, { sensitivity: 'base' })
  )
}

/** Up to two characters for the avatar, from the first two words that contain
 *  anything alphanumeric.
 *
 *  Leading non-alphanumerics are stripped from each word, and words that strip
 *  to nothing are dropped entirely. Those two rules look the same but produce
 *  different results and both matter:
 *    "@ Rahul"     -> "R"   the "@" is a whole word, so it is skipped
 *    "#Lulu Mart"  -> "LM"  the "#" only prefixes a word, so the L behind it is kept
 *  Returns '' when nothing survives ("@@@"); the caller renders a fallback. */
export function masterInitials(name: string): string {
  return normalizeMasterName(name)
    .split(' ')
    .map(word => word.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('')
}

/** Person green / merchant blue. Components must never hardcode these hexes.
 *
 *  Keyed by MasterType so adding a third type is a compile error everywhere it
 *  matters rather than a silent `undefined` background. `solid` is the avatar
 *  text and type-pill color, `soft` the avatar fill — the `1F` alpha suffix
 *  matches how makeColors derives goodSoft/accentSoft in src/lib/tokens.ts.
 *  Fixed in both themes, like credit-card-colors.ts. */
export const MASTER_ACCENTS: Record<MasterType, { solid: string; soft: string }> = {
  [MASTER_TYPES.PERSON]: { solid: '#10B981', soft: '#10B9811F' },
  [MASTER_TYPES.MERCHANT]: { solid: '#3B82F6', soft: '#3B82F61F' },
}

/** "Person" / "Merchant" — the singular label shown on a row and the detail pill. */
export const MASTER_TYPE_LABEL: Record<MasterType, string> = {
  [MASTER_TYPES.PERSON]: 'Person',
  [MASTER_TYPES.MERCHANT]: 'Merchant',
}

/** The plural, for tab labels and empty states ("No merchants yet"). */
export const MASTER_TYPE_PLURAL: Record<MasterType, string> = {
  [MASTER_TYPES.PERSON]: 'People',
  [MASTER_TYPES.MERCHANT]: 'Merchants',
}

/** The duplicate message the spec asks for: "A person named Rahul already exists." */
export function duplicateMasterMessage(name: string, type: MasterType): string {
  return `A ${MASTER_TYPE_LABEL[type].toLowerCase()} named ${normalizeMasterName(name)} already exists.`
}
