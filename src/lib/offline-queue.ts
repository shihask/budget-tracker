import type { Account, Category, CreditCard, NewTransactionInput, Transaction } from '@/types'
import { applyDeltas, type TxDeltas } from './transaction-deltas'
import { localTime } from './utils'

/** Offline transaction entry — the queue.
 *
 *  THE QUEUE IS THE ONLY SOURCE OF TRUTH for "not yet on the server".
 *  `Transaction.pending_sync` is derived from it for display and nothing else.
 *
 *  syncState:
 *   - 'offline'   — this client has never sent the transaction. Its delta is
 *                   locally owned until a successful save or reconciliation.
 *   - 'uncertain' — a request was sent and failed with a network error. The
 *                   server MAY have committed it; only an online lookup by id
 *                   decides. A stale offline cache is never proof.
 *
 *  The id is generated once, at entry, and is the final server id
 *  (mp_execute_transaction's p_id) — which is what makes every retry safe.
 *
 *  Invariant: each queued transaction's balance delta appears EXACTLY ONCE in
 *  the displayed state. Displayed = applyQueuedDeltas(snapshot, reconciled queue),
 *  always computed from a fresh snapshot, never layered onto an adjusted one. */

export type SyncState = 'offline' | 'uncertain'

export interface QueueError {
  code: string
  message: string
}

export interface QueuedTransaction {
  id: string
  /** transaction_time is always set (see captureEntryTime). */
  form: NewTransactionInput
  /** Computed once at entry, so the overlay and the replay can never disagree. */
  deltas: TxDeltas
  /** Names at entry time — the account may be gone by the time an error is shown. */
  labels: { account: string; toAccount?: string; category?: string }
  queuedAt: string
  syncState: SyncState
  error?: QueueError
}

// ── Storage ──────────────────────────────────────────────────────────────────

const KEY_PREFIX = 'mp_offline_queue_'
export const queueKey = (uid: string) => `${KEY_PREFIX}${uid}`

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStore(): KeyValueStore | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function isQueuedTransaction(v: unknown): v is QueuedTransaction {
  if (!v || typeof v !== 'object') return false
  const q = v as Partial<QueuedTransaction>
  return typeof q.id === 'string'
    && !!q.form && typeof q.form === 'object'
    && !!q.deltas && typeof q.deltas === 'object'
    && typeof q.queuedAt === 'string'
    && (q.syncState === 'offline' || q.syncState === 'uncertain')
}

/** Never throws. Corrupt or unreadable storage reads as an empty queue. */
export function readQueue(uid: string, store: KeyValueStore | null = defaultStore()): QueuedTransaction[] {
  if (!store || !uid) return []
  try {
    const raw = store.getItem(queueKey(uid))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isQueuedTransaction) : []
  } catch {
    return []
  }
}

/** Never throws. Returns false when the write failed (quota, private mode) —
 *  callers must NOT treat the transaction as saved on this device then. */
export function writeQueue(uid: string, queue: QueuedTransaction[], store: KeyValueStore | null = defaultStore()): boolean {
  if (!store || !uid) return false
  try {
    if (queue.length === 0) store.removeItem(queueKey(uid))
    else store.setItem(queueKey(uid), JSON.stringify(queue))
    return true
  } catch {
    return false
  }
}

/** Read-modify-write against storage, never against an in-memory copy: another
 *  tab may have saved (and removed) items since this one last read. */
export function updateQueue(
  uid: string,
  fn: (q: QueuedTransaction[]) => QueuedTransaction[],
  store: KeyValueStore | null = defaultStore(),
): { ok: boolean; queue: QueuedTransaction[] } {
  const next = fn(readQueue(uid, store))
  return { ok: writeQueue(uid, next, store), queue: next }
}

// ── Classification ───────────────────────────────────────────────────────────

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true
}

const NETWORK_MESSAGE = /failed to fetch|load failed|networkerror/i

/** True when the request never got a server answer. A Postgres/PostgREST error
 *  code (23503, 42501, PT409, PT422 …) is a real answer, so never a network error. */
export function isNetworkError(err: unknown, online: boolean = isOnline()): boolean {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  if (typeof e.code === 'string' && e.code !== '') return false
  if (!online) return true
  return typeof e.message === 'string' && NETWORK_MESSAGE.test(e.message)
}

export function toQueueError(err: unknown): QueueError {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  return {
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : String(err),
  }
}

// ── Building queue items ─────────────────────────────────────────────────────

/** A queued row is saved hours later, so created_at (the save time) would be
 *  wrong for "when did this happen". Always store a time: the user's choice, or
 *  the local time at entry. A 10:05 coffee saved at 6 pm still reads 10:05. */
export function captureEntryTime(form: NewTransactionInput, now: Date): NewTransactionInput {
  return form.transaction_time ? form : { ...form, transaction_time: localTime(now) }
}

export function buildQueueItem(args: {
  id: string
  form: NewTransactionInput
  deltas: TxDeltas
  now: Date
  syncState: SyncState
  accounts: Pick<Account, 'id' | 'name'>[]
  cards: Pick<CreditCard, 'id' | 'name'>[]
  categories: Pick<Category, 'id' | 'name'>[]
}): QueuedTransaction {
  const { id, deltas, now, syncState, accounts, cards, categories } = args
  const form = captureEntryTime(args.form, now)
  const nameOf = (rowId: string | null | undefined) =>
    rowId ? (accounts.find(a => a.id === rowId)?.name ?? cards.find(c => c.id === rowId)?.name) : undefined
  return {
    id,
    form,
    deltas,
    labels: {
      account: nameOf(form.from_account_id) ?? '',
      toAccount: nameOf(deltas.toAccountId),
      category: form.category_id ? categories.find(c => c.id === form.category_id)?.name : undefined,
    },
    queuedAt: now.toISOString(),
    syncState,
  }
}

/** The row as the rest of the app sees it — same columns the server would return. */
export function toPendingTransaction(q: QueuedTransaction, categories: Category[]): Transaction {
  const f = q.form
  return {
    id: q.id,
    transaction_date: f.transaction_date,
    description: f.description,
    amount: f.amount,
    transaction_type: f.transaction_type,
    category_id: f.category_id ?? null,
    from_account_id: q.deltas.fromAccountId,
    to_account_id: q.deltas.toAccountId,
    credit_card_id: q.deltas.creditCardId,
    notes: '',
    created_at: q.queuedAt,
    transaction_time: f.transaction_time ?? null,
    borrowing_id: f.borrowing_id ?? null,
    is_credit: f.is_credit ?? null,
    event_id: f.event_id ?? null,
    master_id: f.master_id ?? null,
    category: f.category_id ? categories.find(c => c.id === f.category_id) : undefined,
    pending_sync: true,
  }
}

// ── Reconcile, then overlay ──────────────────────────────────────────────────

/** Drops queued items the server already has. `serverIds` is the result of an
 *  online lookup by id; `null` means offline — nothing can be proven, so
 *  nothing changes (a cached list is never proof that an uncertain save landed). */
export function reconcileQueue(
  queue: QueuedTransaction[],
  serverIds: ReadonlySet<string> | null,
): { remaining: QueuedTransaction[]; alreadySaved: QueuedTransaction[] } {
  if (!serverIds) return { remaining: queue, alreadySaved: [] }
  const remaining: QueuedTransaction[] = []
  const alreadySaved: QueuedTransaction[] = []
  for (const q of queue) (serverIds.has(q.id) ? alreadySaved : remaining).push(q)
  return { remaining, alreadySaved }
}

export interface BalanceSnapshot {
  accounts: Account[]
  credit_cards: CreditCard[]
  transactions: Transaction[]
}

const newestFirst = (a: Transaction, b: Transaction) =>
  a.transaction_date !== b.transaction_date
    ? (a.transaction_date < b.transaction_date ? 1 : -1)
    : (a.created_at < b.created_at ? 1 : -1)

/** Pure and deterministic: the same snapshot and queue always give the same
 *  result, and each item's delta is added exactly once. Call it on a FRESH
 *  snapshot (server or cache) — never on state that already has the overlay. */
export function applyQueuedDeltas(
  base: BalanceSnapshot,
  queue: QueuedTransaction[],
  categories: Category[],
): BalanceSnapshot {
  if (queue.length === 0) return base
  let accounts = base.accounts
  let cards = base.credit_cards
  for (const q of queue) {
    const next = applyDeltas(accounts, cards, q.deltas, 1)
    accounts = next.accounts
    cards = next.cards
  }
  const queued = new Set(queue.map(q => q.id))
  const transactions = [
    ...queue.map(q => toPendingTransaction(q, categories)),
    ...base.transactions.filter(t => !queued.has(t.id)),
  ].sort(newestFirst)
  return { accounts, credit_cards: cards, transactions }
}

/** Reverses ONE item's overlay on the displayed state (discarding a local-only
 *  item). The counterpart of adding one item right after it was queued. */
export function removeQueuedFromState(
  state: BalanceSnapshot,
  q: QueuedTransaction,
): BalanceSnapshot {
  const { accounts, cards } = applyDeltas(state.accounts, state.credit_cards, q.deltas, -1)
  return { accounts, credit_cards: cards, transactions: state.transactions.filter(t => t.id !== q.id) }
}

// ── Error wording for the review sheet ───────────────────────────────────────

export interface QueueErrorText {
  reason: string
  consequence: string
}

const WONT_SAVE = "This transaction won't be saved unless you remove it."

/** Spec'd wording: say WHAT is missing, by name, and what the user can do. */
export function describeQueueError(
  q: QueuedTransaction,
  present: { accountIds: ReadonlySet<string>; cardIds: ReadonlySet<string>; categoryIds: ReadonlySet<string> },
): QueueErrorText | null {
  if (!q.error) return null
  const { code, message } = q.error
  if (code === '23503') {
    const source = q.deltas.fromAccountId ?? q.deltas.creditCardId
    const sourceGone = !!source && !present.accountIds.has(source) && !present.cardIds.has(source)
    if (sourceGone) {
      const kind = q.deltas.creditCardId ? 'credit card' : 'account'
      return { reason: `The ${kind} "${q.labels.account}" no longer exists.`, consequence: WONT_SAVE }
    }
    if (q.deltas.toAccountId && !present.accountIds.has(q.deltas.toAccountId)) {
      return { reason: `The destination account "${q.labels.toAccount ?? ''}" no longer exists.`, consequence: WONT_SAVE }
    }
    if (q.form.category_id && !present.categoryIds.has(q.form.category_id)) {
      return { reason: `The category "${q.labels.category ?? ''}" no longer exists.`, consequence: WONT_SAVE }
    }
    return { reason: 'Something this transaction uses no longer exists.', consequence: WONT_SAVE }
  }
  if (code === '42501' || code === 'PT409') {
    return { reason: 'This transaction was rejected by the server.', consequence: "It won't be saved unless you remove it." }
  }
  return { reason: message || 'The server could not save this transaction.', consequence: WONT_SAVE }
}
