import type { Transaction } from '@/types'
import { round2 } from '@/lib/utils'

/**
 * Expense reimbursement — money you get back for something you already paid for.
 *
 * A reimbursement is an ordinary `income` row carrying `reimbursement_for`. The
 * money really did land in the account, so balances, cash flow, net worth and
 * account history read it raw and must NEVER use this module. What changes is the
 * analytics reading: the row stops counting as income, and its amount subtracts
 * from the expense it points at.
 *
 * Every total here is DERIVED by summing linked rows — nothing is stored — so
 * linking, unlinking, editing and deleting are all correct on the next render.
 *
 * Same discipline line as `countsTowardBudget` in ./events.ts.
 */

/** An analytics-only view of a row. `amount` is ALWAYS the untouched database
 *  value; the derived figures sit alongside it, so exports, the AI context,
 *  drill-downs and any future audit log keep seeing one source of truth. */
export type AnalyticsTransaction = Transaction & {
  /** === amount. Present only when something was recovered. */
  gross_amount?: number
  reimbursed_amount?: number
  /** max(0, amount - reimbursed_amount). Read it through `spendAmount`. */
  net_amount?: number
}

export const isReimbursement = (t: Transaction): boolean => !!t.reimbursement_for

/** The one accessor every spend sum reads. On a raw row it is just `t.amount`, so
 *  it is safe anywhere — and greppable when auditing coverage. */
export const spendAmount = (t: AnalyticsTransaction): number => t.net_amount ?? t.amount

// ── Split groups ────────────────────────────────────────────────────────────
// A split expense is N ordinary rows sharing a split_group_id, with no parent row.
// Excluding split legs would make a ₹300-Axis + ₹108-Cash gift unreimbursable — a
// real and common case — so the GROUP is the unit of reimbursement.
//
// The link is stored on the group's ANCHOR leg. That rule is an implementation
// detail of this module and must not leak: callers pass whatever the user picked
// and go through the two resolvers below, so a future split refactor can move the
// anchor without invalidating stored links.

const groupLegs = (t: Transaction, txns: Transaction[]): Transaction[] => {
  if (!t.split_group_id) return [t]
  const legs = txns.filter(x => x.split_group_id === t.split_group_id)
  return legs.length ? legs : [t]
}

/** Earliest leg, tie-broken by id. Mirrored by `mp_reanchor_reimbursements`. */
const anchorOf = (legs: Transaction[]): Transaction =>
  legs.reduce((a, b) => {
    const byDate = (a.created_at ?? '').localeCompare(b.created_at ?? '')
    return byDate !== 0 ? (byDate < 0 ? a : b) : (a.id < b.id ? a : b)
  })

/** The row id a new link should be written to. For a split group this is the
 *  anchor leg; for an ordinary expense it is the row itself. */
export const resolveReimbursementTarget = (picked: Transaction, txns: Transaction[]): string =>
  anchorOf(groupLegs(picked, txns)).id

/** The inverse: the expense a stored link refers to, as its full set of legs
 *  (one row for an ordinary expense). Every UI that renders "Reimburses: …" goes
 *  through this rather than looking up the raw id, which is what lets the anchor
 *  move without breaking anything. */
export const resolveReimbursedExpense = (t: Transaction, txns: Transaction[]): Transaction[] => {
  if (!t.reimbursement_for) return []
  const target = txns.find(x => x.id === t.reimbursement_for)
  return target ? groupLegs(target, txns) : []
}

// ── Derived totals ──────────────────────────────────────────────────────────

/** Recovered-per-leg, built once per `derive()` rather than re-scanning the
 *  ledger for every row.
 *
 *  Keyed by leg id: a split group's recovery is distributed across its legs in
 *  proportion to each leg's share, so a per-account breakdown still balances and
 *  the legs still sum to the group's net. */
export const reimbursedTotals = (txns: Transaction[]): Map<string, number> => {
  const byTarget = new Map<string, number>()
  for (const t of txns) {
    if (!t.reimbursement_for) continue
    byTarget.set(t.reimbursement_for, (byTarget.get(t.reimbursement_for) ?? 0) + t.amount)
  }

  const out = new Map<string, number>()
  if (byTarget.size === 0) return out

  const byId = new Map(txns.map(t => [t.id, t]))
  for (const [targetId, recovered] of byTarget) {
    const target = byId.get(targetId)
    if (!target) continue                       // link dangles; nothing to net off
    const legs = groupLegs(target, txns)

    if (legs.length === 1) {
      out.set(target.id, (out.get(target.id) ?? 0) + recovered)
      continue
    }

    // Proportional split, with the remainder landing on the last leg so the
    // parts always add back up to `recovered` exactly.
    const total = legs.reduce((s, l) => s + l.amount, 0)
    if (total <= 0) continue
    let assigned = 0
    legs.forEach((leg, i) => {
      const share = i === legs.length - 1
        ? round2(recovered - assigned)
        : round2((leg.amount / total) * recovered)
      assigned = round2(assigned + share)
      out.set(leg.id, (out.get(leg.id) ?? 0) + share)
    })
  }
  return out
}

/** What can still be recovered against an expense — drives the picker, the
 *  prefilled amount and the inline validation. Group-aware and clamped at zero,
 *  so no caller hand-rolls `amount - reimbursed`. */
export const remainingReimbursable = (
  expense: Transaction,
  txns: Transaction[],
  totals?: Map<string, number>,
): number => {
  const t = totals ?? reimbursedTotals(txns)
  const legs = groupLegs(expense, txns)
  const total = legs.reduce((s, l) => s + l.amount, 0)
  const recovered = legs.reduce((s, l) => s + (t.get(l.id) ?? 0), 0)
  return Math.max(0, round2(total - recovered))
}

/** Gross / recovered / net for one expense (or split group), for the breakdown UI. */
export const reimbursementSummary = (
  expense: Transaction,
  txns: Transaction[],
  totals?: Map<string, number>,
): { gross: number; reimbursed: number; net: number } => {
  const t = totals ?? reimbursedTotals(txns)
  const legs = groupLegs(expense, txns)
  const gross = round2(legs.reduce((s, l) => s + l.amount, 0))
  const reimbursed = round2(legs.reduce((s, l) => s + (t.get(l.id) ?? 0), 0))
  return { gross, reimbursed, net: Math.max(0, round2(gross - reimbursed)) }
}

/** The reimbursements linked to one expense (or split group), newest first. */
export const reimbursementsFor = (expense: Transaction, txns: Transaction[]): Transaction[] => {
  const ids = new Set(groupLegs(expense, txns).map(l => l.id))
  return txns
    .filter(t => t.reimbursement_for && ids.has(t.reimbursement_for))
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
}

// ── The analytics view ──────────────────────────────────────────────────────

/** The list spend analytics should use. Drops reimbursement rows entirely and
 *  annotates reimbursed expenses with net/gross/reimbursed.
 *
 *  `amount` is deliberately NOT rewritten — read the net through `spendAmount`.
 *
 *  Netting is expense-DATED: an August expense refunded in September shows August
 *  as ₹8. That is the accounting-correct reading (the refund corrects the original
 *  spend), and it is what makes a category total honest. The September arrival is
 *  not hidden — account history and the cash-flow forecast read raw transactions,
 *  so the +₹400 still lands on Sep 2 there.
 *
 *  Balances, cash flow, net worth, account history and CSV export must NEVER call
 *  this: the money really did move, in both directions. */
export const forSpendAnalytics = (txns: Transaction[]): AnalyticsTransaction[] => {
  const totals = reimbursedTotals(txns)
  const out: AnalyticsTransaction[] = []
  for (const t of txns) {
    if (t.reimbursement_for) continue            // never spend, never income
    const recovered = totals.get(t.id)
    if (!recovered) { out.push(t); continue }
    out.push({
      ...t,
      gross_amount: t.amount,
      reimbursed_amount: recovered,
      net_amount: Math.max(0, round2(t.amount - recovered)),
    })
  }
  return out
}
