// FROZEN copy of lib/settlement.ts as shipped in v1.112.0 (before settlement payments).
// Used only by the parity test. Do not change.
import type { ProjectMember, ProjectTransaction } from '../../types'

// ── Settlement engine: pool accounting (model C) ─────────────────────────
//
// Everything is integer paise. Notation:
//   C_i  member i's contributions        P_i  expenses member i paid personally
//   C_u  contributions with no member    K    expenses with no member (paid from the kitty)
//   E    all expenses = K + ΣP_i         I    kittyInflows (non-member money; 0 today)
//   G    group money = C_u + I           S    shared cost = E − G
//   share_i = alloc(S, r_i)             r_i = share_ratio if active, else 0
//   net_i   = C_i + P_i − share_i       (+ gets back, − owes)
//   B       = ΣC_i + G − K              kitty ledger balance
//   net_K   = −B                        (kitty pays its balance out, or is owed when B < 0)
// Invariant: Σ net_i + net_K = ΣC_i + ΣP_i − E + G − (ΣC_i + G − K) = ΣP_i + K − E = 0.
//
// The engine never produces a payment plan it can't verify: invalid inputs, no one to
// share the cost, or any failed invariant → balanced: false, issues, no transfers.

export const KITTY_ID = 'kitty'

export type SettlementIssue =
  | { kind: 'invalid_amount'; transactionId?: string; value: unknown }
  | { kind: 'invalid_ratio'; memberId: string; value: unknown }
  | { kind: 'no_sharers'; amount: number }
  | { kind: 'invariant_failed'; detail: string }
  // An expense's "Shared by" group can't be split: no valid member left, members whose
  // ratios sum to 0, or unreadable data. Blocking — never charged to everyone instead.
  | { kind: 'invalid_participants'; reason: 'none_valid' | 'zero_ratio' | 'malformed'; transactionId: string; description: string | null; date: string }
  // Some ids in a group are not members of this project (deleted, or foreign); the rest share it.
  | { kind: 'deleted_participants'; count: number; transactionId: string; description: string | null; date: string }
  // Informational — they explain the result but don't make it unbalanced.
  | { kind: 'unassigned_contributions'; amount: number }
  | { kind: 'kitty_overspent'; amount: number }

const BLOCKING: SettlementIssue['kind'][] = ['invalid_amount', 'invalid_ratio', 'no_sharers', 'invariant_failed', 'invalid_participants']
export const isBlocking = (i: SettlementIssue) => BLOCKING.includes(i.kind)

export interface PartyRef {
  kind: 'member' | 'kitty'
  id: string
  name: string
}

export interface SettlementParticipant extends PartyRef {
  active: boolean
  /** Paise. Contributions credited to this member (0 for the kitty). */
  putIn: number
  /** Paise. Expenses this member paid from their own pocket (0 for the kitty). */
  paidPersonally: number
  /** Paise. Their slice of the shared cost S — negative when group money exceeds spending. */
  share: number
  /** Paise. + gets back, − owes. For the kitty: −balance. */
  net: number
}

export interface Transfer {
  from: PartyRef
  to: PartyRef
  /** Paise, always > 0. */
  amount: number
}

export interface SettlementComputation {
  balanced: boolean
  /** Members in display order, then the kitty. */
  participants: SettlementParticipant[]
  kitty: {
    /** Ledger balance B (paise). Not who holds the cash — MoneyPlant doesn't know that. */
    balance: number
    /** Contributions with no member (paise), treated as group money. */
    unassigned: number
    inflows: number
  }
  totals: { expenses: number; groupMoney: number; sharedCost: number }
  transfers: Transfer[]
  reconciliation: { membersPay: number; kittyPays: number; kittyOwed: number; membersReceive: number }
  issues: SettlementIssue[]
}

export interface SettlementOptions {
  /** Non-member money that reached the kitty (refunds, cashback). Rupees. 0 until that feature exists. */
  kittyInflows?: number
}

// ── Money and ratio parsing ──────────────────────────────────────────────

/** Rupees → integer paise. null when not a finite, non-negative amount with ≤ 2 decimals. */
export function toPaise(x: unknown): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return null
  const p = x * 100
  const r = Math.round(p)
  return Math.abs(p - r) < 1e-6 && Number.isSafeInteger(r) ? r : null
}

const MAX_RATIO_DECIMALS = 6

function decimals(x: number): number {
  const s = String(x)
  if (s.includes('e')) return MAX_RATIO_DECIMALS
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : Math.min(s.length - dot - 1, MAX_RATIO_DECIMALS)
}

// ── Signed largest-remainder allocation ──────────────────────────────────

/**
 * Split `total` paise (may be negative) across weights so the parts sum to `total`
 * exactly. Weights are scaled to integers; the leftover paise go to the largest
 * fractional remainders, ties to the earlier position. Requires Σ weights > 0.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total)) throw new Error('allocate: total must be integer paise')
  const k = Math.max(0, ...weights.map(decimals))
  const scale = 10 ** k
  const w = weights.map(x => BigInt(Math.round(x * scale)))
  const R = w.reduce((s, x) => s + x, 0n)
  if (R <= 0n) throw new Error('allocate: weights must sum to more than zero')
  if (total === 0) return weights.map(() => 0)

  const T = BigInt(Math.abs(total))
  const base = w.map(x => (T * x) / R)
  const rem = w.map(x => (T * x) % R)
  let leftover = T - base.reduce((s, x) => s + x, 0n)
  const order = w.map((_, i) => i).sort((a, b) => (rem[b] > rem[a] ? 1 : rem[b] < rem[a] ? -1 : a - b))
  for (const i of order) {
    if (leftover === 0n) break
    base[i] += 1n
    leftover -= 1n
  }
  const sign = total < 0 ? -1 : 1
  return base.map(x => (x === 0n ? 0 : sign * Number(x)))
}

// ── Payment plan ─────────────────────────────────────────────────────────

export interface Position { party: PartyRef; order: number; amount: number }

/** Total order: larger amount first, then the kitty, then display order. */
function compare(a: Position, b: Position, amountA: number, amountB: number): number {
  if (amountA !== amountB) return amountB - amountA
  if (a.party.kind !== b.party.kind) return a.party.kind === 'kitty' ? -1 : 1
  return a.order - b.order
}

/**
 * Settle signed positions (+ receives, − pays; must sum to 0) with at most
 * (non-zero positions − 1) transfers. Each step: an exact pair if one exists,
 * otherwise the kitty if it still has a position, otherwise largest payer → largest
 * receiver. Every step zeroes at least one side, so all positions end at exactly 0.
 */
export function planTransfers(positions: Position[]): Transfer[] {
  const payers = positions.filter(p => p.amount < 0).map(p => ({ ...p, left: -p.amount }))
  const receivers = positions.filter(p => p.amount > 0).map(p => ({ ...p, left: p.amount }))
  const transfers: Transfer[] = []
  const live = <T extends { left: number }>(xs: T[]) => xs.filter(x => x.left > 0)
  const byLargest = <T extends Position & { left: number }>(xs: T[]) => [...xs].sort((a, b) => compare(a, b, a.left, b.left))

  for (;;) {
    const P = byLargest(live(payers))
    const Q = byLargest(live(receivers))
    if (P.length === 0 || Q.length === 0) break

    let pick: [typeof P[number], typeof Q[number]] | null = null
    // 1. Exact pair — zeroes both sides in one transfer.
    for (const p of P) {
      const q = Q.find(x => x.left === p.left)
      if (q) { pick = [p, q]; break }
    }
    // 2. Kitty first, in whichever role it has.
    if (!pick) {
      const kp = P.find(x => x.party.kind === 'kitty')
      const kq = Q.find(x => x.party.kind === 'kitty')
      if (kp) pick = [kp, Q[0]]
      else if (kq) pick = [P[0], kq]
    }
    // 3. Largest payer → largest receiver.
    if (!pick) pick = [P[0], Q[0]]

    const [p, q] = pick
    const t = Math.min(p.left, q.left)
    transfers.push({ from: p.party, to: q.party, amount: t })
    p.left -= t
    q.left -= t
  }
  return transfers
}

// ── Engine ───────────────────────────────────────────────────────────────

const memberOrder = (a: ProjectMember, b: ProjectMember) =>
  (a.display_order - b.display_order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function computeSettlement(
  members: ProjectMember[],
  transactions: ProjectTransaction[],
  opts: SettlementOptions = {},
): SettlementComputation {
  const issues: SettlementIssue[] = []
  const sorted = [...members].sort(memberOrder)
  const known = new Map(sorted.map(m => [m.id, m]))

  // Ratios: only active members share, and their ratio must be a finite number ≥ 0.
  const weights = sorted.map(m => {
    if (!m.is_active) return 0
    if (typeof m.share_ratio !== 'number' || !Number.isFinite(m.share_ratio) || m.share_ratio < 0) {
      issues.push({ kind: 'invalid_ratio', memberId: m.id, value: m.share_ratio })
      return 0
    }
    return m.share_ratio
  })

  const inflows = toPaise(opts.kittyInflows ?? 0)
  if (inflows === null) issues.push({ kind: 'invalid_amount', value: opts.kittyInflows })

  const putIn = new Map<string, number>()
  const paid = new Map<string, number>()
  let unassigned = 0, kittyPaid = 0, expenses = 0
  // Expenses with shared_by NULL go into the "everyone" pool (exactly the pre-v1.112 rule);
  // expenses with an explicit group are split on their own.
  let everyoneExpenses = 0
  const explicit: { t: ProjectTransaction; paise: number }[] = []
  for (const t of transactions) {
    const p = toPaise(t.amount)
    if (p === null) { issues.push({ kind: 'invalid_amount', transactionId: t.id, value: t.amount }); continue }
    const owner = t.member_id && known.has(t.member_id) ? t.member_id : null
    if (t.transaction_type === 'contribution') {
      if (owner) putIn.set(owner, (putIn.get(owner) ?? 0) + p)
      else unassigned += p
    } else {
      expenses += p
      if (owner) paid.set(owner, (paid.get(owner) ?? 0) + p)
      else kittyPaid += p
      if (t.shared_by == null) everyoneExpenses += p
      else explicit.push({ t, paise: p })
    }
  }

  const groupMoney = unassigned + (inflows ?? 0)
  // Everyone pool: group money lowers it, shared by active members by ratio. With no
  // explicit expenses this is the same S as before v1.112, through the same call.
  const poolCost = everyoneExpenses - groupMoney
  const sharedCost = expenses - groupMoney
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  let shares = sorted.map(() => 0)
  if (totalWeight > 0) shares = allocate(poolCost, weights)
  else if (poolCost !== 0) issues.push({ kind: 'no_sharers', amount: poolCost })

  // Explicit groups: resolved only against this project's members, deduplicated, in display
  // order; active or inactive alike. Never falls back to everyone.
  const indexOf = new Map(sorted.map((m, i) => [m.id, i]))
  for (const { t, paise } of explicit) {
    const where = { transactionId: t.id, description: t.description ?? null, date: t.transaction_date }
    const raw: unknown = t.shared_by
    if (!Array.isArray(raw) || raw.length === 0 || raw.some(x => typeof x !== 'string' || x === '')) {
      issues.push({ kind: 'invalid_participants', reason: 'malformed', ...where })
      continue
    }
    const ids = [...new Set(raw as string[])]
    const valid = ids.filter(id => known.has(id))
    if (valid.length === 0) {
      issues.push({ kind: 'invalid_participants', reason: 'none_valid', ...where })
      continue
    }
    if (valid.length < ids.length) issues.push({ kind: 'deleted_participants', count: ids.length - valid.length, ...where })

    const group = valid.map(id => indexOf.get(id)!).sort((a, b) => a - b)
    let badRatio = false
    const groupWeights = group.map(i => {
      const r = sorted[i].share_ratio
      if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) {
        if (!issues.some(x => x.kind === 'invalid_ratio' && x.memberId === sorted[i].id)) {
          issues.push({ kind: 'invalid_ratio', memberId: sorted[i].id, value: r })
        }
        badRatio = true
        return 0
      }
      return r
    })
    if (badRatio) continue
    if (groupWeights.reduce((s, w) => s + w, 0) <= 0) {
      issues.push({ kind: 'invalid_participants', reason: 'zero_ratio', ...where })
      continue
    }
    allocate(paise, groupWeights).forEach((part, k) => { shares[group[k]] += part })
  }

  const memberParticipants: SettlementParticipant[] = sorted.map((m, i) => {
    const pi = putIn.get(m.id) ?? 0, pp = paid.get(m.id) ?? 0
    return {
      kind: 'member', id: m.id, name: m.name, active: m.is_active,
      putIn: pi, paidPersonally: pp, share: shares[i], net: pi + pp - shares[i] || 0,
    }
  })
  const attributed = memberParticipants.reduce((s, p) => s + p.putIn, 0)
  const balance = attributed + groupMoney - kittyPaid
  const kittyParticipant: SettlementParticipant = {
    kind: 'kitty', id: KITTY_ID, name: 'Kitty', active: true,
    putIn: 0, paidPersonally: 0, share: 0, net: 0 - balance || 0,
  }
  const participants = [...memberParticipants, kittyParticipant]

  if (unassigned > 0) issues.push({ kind: 'unassigned_contributions', amount: unassigned })
  if (balance < 0) issues.push({ kind: 'kitty_overspent', amount: -balance })

  const result = (transfers: Transfer[], extra: SettlementIssue[] = []): SettlementComputation => {
    const all = [...issues, ...extra]
    const balanced = !all.some(isBlocking)
    const plan = balanced ? transfers : []
    const sum = (f: (t: Transfer) => boolean) => plan.filter(f).reduce((s, t) => s + t.amount, 0)
    return {
      balanced,
      participants,
      kitty: { balance, unassigned, inflows: inflows ?? 0 },
      totals: { expenses, groupMoney, sharedCost },
      transfers: plan,
      reconciliation: {
        membersPay: sum(t => t.from.kind === 'member'),
        kittyPays: sum(t => t.from.kind === 'kitty'),
        kittyOwed: sum(t => t.to.kind === 'kitty'),
        membersReceive: sum(t => t.to.kind === 'member'),
      },
      issues: all,
    }
  }

  if (issues.some(isBlocking)) return result([])

  const positions: Position[] = participants.map((p, i) => ({
    party: { kind: p.kind, id: p.id, name: p.name }, order: i, amount: p.net,
  }))
  const gate = verifyPlan(positions, planTransfers(positions), participants)
  return gate.ok ? result(gate.transfers) : result([], [{ kind: 'invariant_failed', detail: gate.detail }])
}

/**
 * The final gate. Exported so tests can feed it a bad plan; the engine runs it on
 * every computation and refuses to return instructions that fail it.
 */
export function verifyPlan(
  positions: Position[],
  transfers: Transfer[],
  participants: SettlementParticipant[] = [],
): { ok: true; transfers: Transfer[] } | { ok: false; detail: string } {
  for (const p of participants) {
    for (const v of [p.putIn, p.paidPersonally, p.share, p.net]) {
      if (!Number.isSafeInteger(v)) return { ok: false, detail: `non-integer paise for ${p.id}` }
    }
    // Members' nets are their breakdown; the kitty's net is −balance by definition.
    if (p.kind === 'member' && p.putIn + p.paidPersonally - p.share !== p.net) return { ok: false, detail: `breakdown mismatch for ${p.id}` }
  }
  if (!positions.every(p => Number.isSafeInteger(p.amount))) return { ok: false, detail: 'non-integer position' }
  if (positions.reduce((s, p) => s + p.amount, 0) !== 0) return { ok: false, detail: 'positions do not sum to zero' }
  if (!transfers.every(t => Number.isSafeInteger(t.amount) && t.amount > 0)) return { ok: false, detail: 'non-positive transfer' }
  const paid = transfers.reduce((s, t) => s + t.amount, 0)
  const expected = positions.reduce((s, p) => s + Math.max(0, p.amount), 0)
  if (paid !== expected) return { ok: false, detail: 'payer and receiver totals differ' }
  const left = new Map(positions.map(p => [`${p.party.kind}:${p.party.id}`, p.amount]))
  for (const t of transfers) {
    const f = `${t.from.kind}:${t.from.id}`, r = `${t.to.kind}:${t.to.id}`
    if (!left.has(f) || !left.has(r)) return { ok: false, detail: 'transfer to an unknown party' }
    left.set(f, left.get(f)! + t.amount)
    left.set(r, left.get(r)! - t.amount)
  }
  if ([...left.values()].some(v => v !== 0)) return { ok: false, detail: 'positions not zero after transfers' }
  return { ok: true, transfers }
}
