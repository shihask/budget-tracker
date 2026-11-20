import { fmt, round2 } from '@/lib/utils'
import type { ProjectTransaction } from '../types'

// Display-only helpers for the Transactions tab. They read the ledger exactly as
// stored; nothing here feeds calculations.ts or settlement.

/**
 * How a row reads. 'group-money' is a contribution with no member behind it — money
 * from outside the group (a sponsor, refund, cashback) or from a member who was
 * removed. Settlement treats both the same way: it lowers everyone's share.
 */
export type TransactionKind = 'expense-member' | 'expense-kitty' | 'contribution' | 'group-money' | 'settlement'

export function transactionKind(t: ProjectTransaction): TransactionKind {
  // `member` is attached only for members that still exist — the same rule the
  // settlement engine uses to decide what counts as group money.
  if (t.transaction_type === 'contribution') return t.member ? 'contribution' : 'group-money'
  if (t.transaction_type === 'settlement') return 'settlement'
  return t.member_id == null ? 'expense-kitty' : 'expense-member'
}

/** A settlement payment's two sides. NULL = the kitty; an id that isn't loaded = a removed member. */
export function paymentParties(t: ProjectTransaction): { from: string; to: string } {
  const side = (id: string | null | undefined, m: { name: string } | undefined) =>
    id == null ? 'Kitty' : (m?.name ?? 'Removed member')
  return { from: side(t.member_id, t.member), to: side(t.to_member_id, t.to_member) }
}

export const PAYMENT_LABEL = 'Settlement payment'

export const GROUP_MONEY_LABEL = 'Group money'
export const GROUP_MONEY_SOURCE = 'From outside the group'

export interface TransactionView {
  kind: TransactionKind
  title: string
  /** Free-text category, expenses only. */
  category: string | null
  /** Category for the row's second line — null when the title already is the category. */
  subtitleCategory: string | null
  /** "Kabeer" for personal expenses and contributions; null when paid from the kitty. */
  memberName: string | null
  /** +1 adds to the kitty, −1 is spend, 0 = a settlement payment (moves money between two parties). */
  sign: 1 | -1 | 0
}

export function describeTransaction(t: ProjectTransaction): TransactionView {
  const kind = transactionKind(t)
  if (kind === 'contribution') {
    return { kind, title: t.member!.name, category: null, subtitleCategory: null, memberName: t.member!.name, sign: 1 }
  }
  if (kind === 'settlement') {
    const { from, to } = paymentParties(t)
    return { kind, title: `${from} → ${to}`, category: null, subtitleCategory: null, memberName: from, sign: 0 }
  }
  if (kind === 'group-money') {
    return { kind, title: GROUP_MONEY_LABEL, category: null, subtitleCategory: null, memberName: null, sign: 1 }
  }
  return {
    kind,
    title: t.description || t.category || 'Expense',
    category: t.category || null,
    subtitleCategory: t.description ? (t.category || null) : null,
    memberName: kind === 'expense-member' ? (t.member?.name || 'Unknown') : null,
    sign: -1,
  }
}

// ── Filtering ───────────────────────────────────────────────────────────

export type TypeFilter = 'all' | 'expense' | 'contribution' | 'settlement'
export const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
  { id: 'contribution', label: 'Contributions' },
  // Shown only when the project has payments.
  { id: 'settlement', label: 'Payments' },
]

/** 'all', 'kitty' (expenses paid from the Project Fund), 'outside' (group money), or a member id. */
export type PaidByFilter = 'all' | 'kitty' | 'outside' | string

export interface TransactionFilters {
  type: TypeFilter
  paidBy: PaidByFilter
  query: string
}

export const NO_FILTERS: TransactionFilters = { type: 'all', paidBy: 'all', query: '' }

export function hasActiveFilters(f: TransactionFilters): boolean {
  return f.type !== 'all' || f.paidBy !== 'all' || f.query.trim() !== ''
}

export function matchesType(t: ProjectTransaction, type: TypeFilter): boolean {
  return type === 'all' || t.transaction_type === type
}

function matchesPaidBy(t: ProjectTransaction, paidBy: PaidByFilter): boolean {
  if (paidBy === 'all') return true
  if (paidBy === 'kitty') return transactionKind(t) === 'expense-kitty'
  if (paidBy === 'outside') return transactionKind(t) === 'group-money'
  // A payment involves the member on either side.
  return t.member_id === paidBy || (t.transaction_type === 'settlement' && t.to_member_id === paidBy)
}

function matchesQuery(t: ProjectTransaction, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const groupWords = transactionKind(t) === 'group-money' ? `${GROUP_MONEY_LABEL} ${GROUP_MONEY_SOURCE}` : null
  const paymentWords = t.transaction_type === 'settlement' ? `${PAYMENT_LABEL} ${paymentParties(t).from} ${paymentParties(t).to}` : null
  const text = [t.description, t.category, t.notes, t.member?.name, groupWords, paymentWords]
    .filter(Boolean).join(' ').toLowerCase()
  if (text.includes(q)) return true
  // "980", "9,700" and "₹9700" all find ₹9,700.
  const digits = q.replace(/[₹,\s]/g, '')
  return /^\d+(\.\d+)?$/.test(digits) && String(t.amount).includes(digits)
}

export function filterTransactions(txns: ProjectTransaction[], f: TransactionFilters): ProjectTransaction[] {
  return txns.filter(t => matchesType(t, f.type) && matchesPaidBy(t, f.paidBy) && matchesQuery(t, f.query))
}

// ── Grouping and totals ─────────────────────────────────────────────────

/** Newest day first; within a day, newest entry first — the order the tab has always used. */
export function sortTransactions(txns: ProjectTransaction[]): ProjectTransaction[] {
  return [...txns].sort((a, b) =>
    b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
}

export interface DayGroup {
  date: string
  items: ProjectTransaction[]
  /** That day's expenses (kitty + personal). */
  spent: number
}

export function groupByDay(txns: ProjectTransaction[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const t of sortTransactions(txns)) {
    let g = groups[groups.length - 1]
    if (!g || g.date !== t.transaction_date) {
      g = { date: t.transaction_date, items: [], spent: 0 }
      groups.push(g)
    }
    g.items.push(t)
    if (t.transaction_type === 'expense') g.spent = round2(g.spent + t.amount)
  }
  return groups
}

export interface ResultTotals {
  count: number
  expenses: number
  contributions: number
  /** Settlement payments — never counted as spending or contributions. */
  payments: number
}

export function resultTotals(txns: ProjectTransaction[]): ResultTotals {
  let expenses = 0
  let contributions = 0
  let payments = 0
  for (const t of txns) {
    if (t.transaction_type === 'expense') expenses += t.amount
    else if (t.transaction_type === 'contribution') contributions += t.amount
    else if (t.transaction_type === 'settlement') payments += t.amount
  }
  return { count: txns.length, expenses: round2(expenses), contributions: round2(contributions), payments: round2(payments) }
}

// ── Labels ──────────────────────────────────────────────────────────────

export function deleteLabel(t: ProjectTransaction): string {
  const amount = fmt(t.amount)
  if (t.transaction_type === 'settlement') {
    const { from, to } = paymentParties(t)
    return `Undo this payment: ${from} → ${to} (${amount})? Settlement will go back to how it was before it.`
  }
  if (t.transaction_type === 'contribution') {
    return t.member ? `Delete ${t.member.name}'s contribution (${amount})?` : `Delete this group money (${amount})?`
  }
  return t.description ? `Delete expense "${t.description}" (${amount})?` : `Delete this expense (${amount})?`
}

const parseDay = (isoDate: string) => new Date(isoDate + 'T00:00:00')

/** "Mon, 18 Nov" — with the year only when it isn't the current one. */
export function formatDayHeader(isoDate: string, today: Date = new Date()): string {
  const d = parseDay(isoDate)
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** "Mon, 18 Nov 2026" */
export function formatLongDate(isoDate: string): string {
  return parseDay(isoDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
