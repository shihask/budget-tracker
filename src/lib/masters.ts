import { MASTER_TYPES } from '@/types'
import { forSpendAnalytics, spendAmount } from '@/lib/reimbursements'
import type { Master, MasterType, Transaction } from '@/types'

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

/** Match an AI-extracted merchant/payee name against the directory.
 *
 *  The receipt extractor's `description` IS the merchant name — the Edge Function
 *  prompt asks for "short, customer-friendly merchant/payee name … the store name
 *  at the top (e.g. 'DMart', not 'DMART RETAIL LTD. STORE 0054')" and then returns
 *  it as both fields (`merchant: validDescription`). So matching on the cleaned
 *  description is matching on the merchant, and no Edge Function change is needed.
 *
 *  Exact after normalization, never fuzzy. A wrong tag is worse than no tag: a
 *  word-overlap match would happily link "Daya Discount Hyper Pharma" to a person
 *  called "Daya", quietly attributing spending to the wrong entity. Missing a
 *  match just leaves the field empty, which the user can see and fix.
 *
 *  Searches BOTH types — a receipt can name a merchant, but money handed to a
 *  person shows their name just the same. Merchants win ties because a receipt
 *  naming both is far more likely to mean the shop. */
export function matchMasterByName(masters: Master[], name: string | null | undefined): Master | null {
  if (!name) return null
  return findDuplicateMaster(masters, name, MASTER_TYPES.MERCHANT)
    ?? findDuplicateMaster(masters, name, MASTER_TYPES.PERSON)
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

/** Resolve a transaction's master_id for display. Returns null for an id that
 *  resolves to nothing — which is the NORMAL case for a soft-deleted master,
 *  since `masters` is loaded with `deleted_at IS NULL` while the tag survives on
 *  the transaction. Callers render nothing, never "Unknown". */
export function masterById(masters: Master[], id: string | null | undefined): Master | null {
  if (!id) return null
  return masters.find(m => m.id === id) ?? null
}

/** Expenses tagged to one master, newest first. */
export const masterTransactions = (transactions: Transaction[], masterId: string): Transaction[] =>
  transactions
    .filter(t => t.master_id === masterId && t.transaction_type === 'expense')
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))

/** What this master has cost, net of anything reimbursed against those expenses —
 *  if a colleague paid back half the Zomato order, Zomato did not cost the full
 *  amount. `amount` is what left the account; `spendAmount` is what it cost.
 *
 *  THE COUNTING INVARIANT — do not "optimise" this away:
 *  This sums stored transaction rows EXACTLY ONCE. Split legs are independent
 *  expense rows whose amounts already partition the original total, so summing
 *  them yields that total: a ₹408 bill split ₹250 Food + ₹158 Drinks is two rows
 *  adding to ₹408, which is correct. No grouping or de-duplication by
 *  description, date, split_group_id, or any notion of a "parent" row is
 *  performed, and none must be added — there is no parent row to group by, and
 *  collapsing look-alike rows would silently report ₹250. split_group_id exists
 *  to EDIT legs together, never to collapse them for totals.
 *
 *  Reimbursement netting composes safely: recovery on a split group is
 *  distributed across legs proportionally, so each leg's spendAmount already
 *  carries its share.
 *
 *  Takes a transaction LIST, not AppState, so the same function can run over rows
 *  fetched from the database — state.transactions holds only the most recent 200,
 *  which would silently undercount a long-lived merchant. */
export const masterSpent = (transactions: Transaction[], masterId: string): number =>
  forSpendAnalytics(transactions)
    .filter(t => t.master_id === masterId && t.transaction_type === 'expense')
    .reduce((s, t) => s + spendAmount(t), 0)
