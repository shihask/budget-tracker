import { fmt, round2 } from '@/lib/utils'
import type { SplitLegInput, Transaction } from '@/types'

/**
 * Presentation-layer grouping for split payments.
 *
 * A split expense is stored as N ordinary single-account rows sharing a
 * `split_group_id` — there is no parent row and no stored group total. This
 * collapses those rows back into one entry for display, and is the only place
 * that knows splits exist; every financial calculation keeps seeing plain
 * per-account expenses.
 */
export interface TransactionGroup {
  key: string
  /** The rows this entry renders — one for an ordinary transaction. */
  legs: Transaction[]
  /** Drives sort position, date header and description. */
  primary: Transaction
  /** Sum of `legs`, i.e. what this entry displays. */
  total: number
  isSplit: boolean
  /** Legs in the whole group, even ones the current filter hides. */
  groupSize: number
  /** Total of the whole group, even ones the current filter hides. */
  groupTotal: number
}

const sum = (txns: Transaction[]) => txns.reduce((s, t) => s + t.amount, 0)

function ordinary(t: Transaction): TransactionGroup {
  return { key: t.id, legs: [t], primary: t, total: t.amount, isSplit: false, groupSize: 1, groupTotal: t.amount }
}

function indexByGroup(txns: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>()
  for (const t of txns) {
    if (!t.split_group_id) continue
    const legs = map.get(t.split_group_id)
    if (legs) legs.push(t)
    else map.set(t.split_group_id, [t])
  }
  return map
}

/**
 * @param visible  the rows to render — output of `filterAndSortTransactions`.
 * @param all      the unfiltered set, used only for group metadata. Load-bearing:
 *                 under an account filter `visible` holds a single ₹10,000 leg, and
 *                 the delete prompt and group-edit route still have to know it
 *                 belongs to a two-leg ₹30,000 group.
 * @param opts.collapse  false when an account filter is active — collapsing then
 *                 would show a ₹30,000 card while filtered to an account that only
 *                 paid ₹10,000 of it.
 *
 * Must run on the COMPLETE filtered set, before any pagination/slicing: a group
 * whose legs straddle a row limit would otherwise render one orphaned leg.
 */
export function groupSplitTransactions(
  visible: Transaction[],
  all: Transaction[],
  opts: { collapse: boolean },
): TransactionGroup[] {
  const wholeGroups = indexByGroup(all)
  const visibleGroups = indexByGroup(visible)

  const out: TransactionGroup[] = []
  const emitted = new Set<string>()

  for (const t of visible) {
    // Ordinary rows are never grouped with each other. Every pre-split row shares a
    // null split_group_id, so keying on it would collapse the whole ledger into one card.
    if (!t.split_group_id) {
      out.push(ordinary(t))
      continue
    }

    const whole = wholeGroups.get(t.split_group_id) ?? [t]
    const groupTotal = sum(whole)

    if (!opts.collapse) {
      out.push({
        key: t.id, legs: [t], primary: t, total: t.amount,
        isSplit: true, groupSize: whole.length, groupTotal,
      })
      continue
    }

    if (emitted.has(t.split_group_id)) continue
    emitted.add(t.split_group_id)

    // `primary` is the first leg encountered, so the group takes that leg's position —
    // which keeps grouping correct under amount_desc, where legs aren't adjacent.
    const legs = visibleGroups.get(t.split_group_id) ?? [t]
    out.push({
      key: t.split_group_id, legs, primary: t, total: sum(legs),
      isSplit: true, groupSize: whole.length, groupTotal,
    })
  }

  return out
}

/** Unassigned amount. Zero means the legs balance and the split can be saved. */
export function splitRemainder(legs: SplitLegInput[], total: number): number {
  return round2(total - legs.reduce((s, l) => s + (l.amount || 0), 0))
}

/**
 * Why the split can't be saved yet, or `ok` when it's ready.
 *
 * This is the single source of truth for client-side split validity: `isSplitValid`
 * is derived from it, so the hint the user reads can never claim everything is fine
 * while the save button stays disabled. (It did, once: legs of 30000/0 against a
 * 30000 total balance to zero, so a remainder-only check said "All assigned" while
 * the zero-amount leg kept saving blocked.)
 *
 * The server enforces the same rules for real — this half exists to explain them.
 */
export function splitHint(legs: SplitLegInput[], total: number): { text: string; ok: boolean } {
  // Before an amount is typed there is nothing useful to say, and "All assigned"
  // for zero legs against a zero total would read as a lie.
  if (total <= 0) return { text: '', ok: false }
  if (legs.length < 2) return { text: 'A split needs at least 2 payments', ok: false }

  const remainder = splitRemainder(legs, total)
  if (remainder > 0) return { text: `${fmt(remainder)} left to assign`, ok: false }
  if (remainder < 0) return { text: `${fmt(Math.abs(remainder))} over`, ok: false }

  if (legs.some(l => l.amount <= 0)) return { text: 'Every payment needs an amount', ok: false }
  if (legs.some(l => !l.accountId)) return { text: 'Choose an account for every payment', ok: false }
  if (new Set(legs.map(l => l.accountId)).size !== legs.length) {
    return { text: 'Each payment needs a different account', ok: false }
  }
  return { text: 'All assigned', ok: true }
}

/** Invariant 1 (legs sum to the total) plus invariant 2 (at least two legs). */
export function isSplitValid(legs: SplitLegInput[], total: number): boolean {
  return splitHint(legs, total).ok
}

/** All rows belonging to `t`'s split group, or just `t` when it isn't a split. */
export function splitGroupLegs(t: Transaction, all: Transaction[]): Transaction[] {
  if (!t.split_group_id) return [t]
  const legs = all.filter(x => x.split_group_id === t.split_group_id)
  return legs.length ? legs : [t]
}
