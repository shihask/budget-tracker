import { describe, it, expect } from 'vitest'
import {
  readQueue, writeQueue, updateQueue, queueKey, isNetworkError, captureEntryTime, buildQueueItem,
  toPendingTransaction, reconcileQueue, applyQueuedDeltas, removeQueuedFromState, describeQueueError,
  type QueuedTransaction, type BalanceSnapshot,
} from '../offline-queue'
import { txDeltas } from '../transaction-deltas'
import type { Account, Category, CreditCard, NewTransactionInput, Transaction } from '@/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

class MemoryStore {
  data = new Map<string, string>()
  failWrites = false
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { if (this.failWrites) throw new Error('QuotaExceededError'); this.data.set(k, v) }
  removeItem(k: string) { if (this.failWrites) throw new Error('QuotaExceededError'); this.data.delete(k) }
}

const acct = (id: string, name: string, bal: number) => ({ id, name, current_balance: bal }) as Account
const card = (id: string, name: string, bal: number) => ({ id, name, current_balance: bal }) as CreditCard
const cat = (id: string, name: string) => ({ id, name, group_name: 'Food' }) as Category

const CASH = acct('cash', 'Cash', 1000)
const BANK = acct('bank', 'Federal Bank', 5000)
const VISA = card('visa', 'Visa', 300)
const FOOD = cat('food', 'Groceries')
const CARD_IDS = new Set(['visa'])

const base = (txns: Transaction[] = []): BalanceSnapshot => ({ accounts: [CASH, BANK], credit_cards: [VISA], transactions: txns })

const expense = (amount: number, from = 'cash', extra: Partial<NewTransactionInput> = {}): NewTransactionInput => ({
  transaction_date: '2026-09-29', description: 'Coffee', amount, transaction_type: 'expense',
  category_id: 'food', from_account_id: from, ...extra,
})

function item(id: string, form: NewTransactionInput, syncState: 'offline' | 'uncertain' = 'offline'): QueuedTransaction {
  return buildQueueItem({
    id, form, deltas: txDeltas(form, CARD_IDS), now: new Date(2026, 8, 29, 10, 5), syncState,
    accounts: [CASH, BANK], cards: [VISA], categories: [FOOD],
  })
}

const bal = (s: BalanceSnapshot, id: string) =>
  (s.accounts.find(a => a.id === id) ?? s.credit_cards.find(c => c.id === id))!.current_balance

// ── Storage ─────────────────────────────────────────────────────────────────

describe('queue storage', () => {
  it('enqueue, read, remove', () => {
    const store = new MemoryStore()
    const a = item('U1', expense(200))
    expect(writeQueue('userA', [a], store)).toBe(true)
    expect(readQueue('userA', store).map(q => q.id)).toEqual(['U1'])
    updateQueue('userA', q => q.filter(x => x.id !== 'U1'), store)
    expect(readQueue('userA', store)).toEqual([])
    expect(store.data.has(queueKey('userA'))).toBe(false) // empty queue removes the key
  })

  it('isolates users', () => {
    const store = new MemoryStore()
    writeQueue('userA', [item('U1', expense(200))], store)
    expect(readQueue('userB', store)).toEqual([])
    expect(readQueue('userA', store)).toHaveLength(1)
  })

  it('corrupt JSON reads as empty and never throws', () => {
    const store = new MemoryStore()
    store.data.set(queueKey('userA'), '{not json')
    expect(readQueue('userA', store)).toEqual([])
    store.data.set(queueKey('userA'), JSON.stringify([{ junk: true }, item('U1', expense(1))]))
    expect(readQueue('userA', store).map(q => q.id)).toEqual(['U1'])
  })

  it('empty or missing storage', () => {
    expect(readQueue('userA', new MemoryStore())).toEqual([])
    expect(readQueue('userA', null)).toEqual([])
    expect(writeQueue('userA', [], null)).toBe(false)
  })

  it('a failed write reports failure instead of pretending it saved', () => {
    const store = new MemoryStore()
    store.failWrites = true
    expect(writeQueue('userA', [item('U1', expense(200))], store)).toBe(false)
    expect(updateQueue('userA', q => [...q, item('U2', expense(5))], store).ok).toBe(false)
    expect(readQueue('userA', store)).toEqual([])
  })

  it('updateQueue reads storage, not a stale copy (another tab removed U1)', () => {
    const store = new MemoryStore()
    writeQueue('userA', [item('U1', expense(1)), item('U2', expense(2))], store)
    writeQueue('userA', [item('U2', expense(2))], store) // "tab B" saved U1
    const { queue } = updateQueue('userA', q => [...q, item('U3', expense(3))], store)
    expect(queue.map(q => q.id)).toEqual(['U2', 'U3'])
  })
})

// ── Network errors ──────────────────────────────────────────────────────────

describe('isNetworkError', () => {
  it('offline is a network error', () => expect(isNetworkError(new Error('anything'), false)).toBe(true))
  it('Chrome', () => expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' }, true)).toBe(true))
  it('Safari', () => expect(isNetworkError(new TypeError('Load failed'), true)).toBe(true))
  it('Firefox', () => expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'), true)).toBe(true))
  it.each(['23503', '42501', 'PT409', 'PT422'])('%s is a real server answer', code => {
    expect(isNetworkError({ code, message: 'Failed to fetch' }, true)).toBe(false)
    expect(isNetworkError({ code, message: 'x' }, false)).toBe(false)
  })
  it('other messages are not network errors', () => expect(isNetworkError(new Error('boom'), true)).toBe(false))
})

// ── Time ────────────────────────────────────────────────────────────────────

describe('time capture', () => {
  it('keeps an explicitly chosen time', () => {
    expect(captureEntryTime(expense(1, 'cash', { transaction_time: '08:30' }), new Date(2026, 8, 29, 18, 0)).transaction_time).toBe('08:30')
  })
  it('stores the local entry time when none was chosen', () => {
    expect(captureEntryTime(expense(1), new Date(2026, 8, 29, 10, 5)).transaction_time).toBe('10:05')
  })
  it('survives a reload: the stored item keeps its entry time, not the sync time', () => {
    const store = new MemoryStore()
    writeQueue('u', [item('U1', expense(200))], store)
    const [reloaded] = readQueue('u', store)
    expect(reloaded.form.transaction_time).toBe('10:05')
    expect(toPendingTransaction(reloaded, [FOOD]).transaction_time).toBe('10:05')
  })
})

// ── Deltas ──────────────────────────────────────────────────────────────────

describe('applyQueuedDeltas — one model for every kind', () => {
  it('expense debits the account', () => {
    expect(bal(applyQueuedDeltas(base(), [item('U1', expense(200))], [FOOD]), 'cash')).toBe(800)
  })
  it('income credits the account', () => {
    expect(bal(applyQueuedDeltas(base(), [item('U1', expense(300, 'cash', { transaction_type: 'income' }))], [FOOD]), 'cash')).toBe(1300)
  })
  it('transfer moves between accounts', () => {
    const s = applyQueuedDeltas(base(), [item('U1', expense(400, 'cash', { transaction_type: 'transfer', to_account_id: 'bank', category_id: null }))], [FOOD])
    expect(bal(s, 'cash')).toBe(600)
    expect(bal(s, 'bank')).toBe(5400)
  })
  it('credit-card expense raises the outstanding, touches no account', () => {
    const q = item('U1', expense(250, 'visa'))
    expect(q.deltas.fromAccountId).toBeNull()
    const s = applyQueuedDeltas(base(), [q], [FOOD])
    expect(bal(s, 'visa')).toBe(550)
    expect(bal(s, 'cash')).toBe(1000)
    expect(s.transactions[0].credit_card_id).toBe('visa')
  })
  it('multiple items each count once', () => {
    const s = applyQueuedDeltas(base(), [item('U1', expense(200)), item('U2', expense(50)), item('U3', expense(100, 'bank'))], [FOOD])
    expect(bal(s, 'cash')).toBe(750)
    expect(bal(s, 'bank')).toBe(4900)
    expect(s.transactions.filter(t => t.pending_sync)).toHaveLength(3)
  })
  it('pending rows carry the display flag and the joined category', () => {
    const [row] = applyQueuedDeltas(base(), [item('U1', expense(200))], [FOOD]).transactions
    expect(row).toMatchObject({ id: 'U1', pending_sync: true, category: FOOD, from_account_id: 'cash' })
  })
  it('removeQueuedFromState reverses exactly one item', () => {
    const q = item('U1', expense(200))
    const shown = applyQueuedDeltas(base(), [q], [FOOD])
    const back = removeQueuedFromState(shown, q)
    expect(bal(back, 'cash')).toBe(1000)
    expect(back.transactions.some(t => t.id === 'U1')).toBe(false)
  })
})

// ── The invariant: each queued delta appears EXACTLY ONCE ───────────────────

describe('invariant — delta exactly once', () => {
  it('Test 1 — offline item, server snapshot without it: applied once', () => {
    const q = item('U1', expense(200))
    const { remaining } = reconcileQueue([q], new Set())
    expect(bal(applyQueuedDeltas(base(), remaining, [FOOD]), 'cash')).toBe(800)
  })

  it('Test 2 — uncertain, already on the server: dropped, NOT applied (₹800, never ₹600)', () => {
    // Server committed U1 (Cash 1000 → 800) but the response was lost.
    const serverSnapshot: BalanceSnapshot = { accounts: [{ ...CASH, current_balance: 800 }, BANK], credit_cards: [VISA], transactions: [] }
    const q = item('U1', expense(200), 'uncertain')
    const { remaining, alreadySaved } = reconcileQueue([q], new Set(['U1']))
    expect(alreadySaved.map(x => x.id)).toEqual(['U1'])
    expect(bal(applyQueuedDeltas(serverSnapshot, remaining, [FOOD]), 'cash')).toBe(800)
  })

  it('Test 3 — uncertain, not on the server: kept and applied once', () => {
    const q = item('U1', expense(200), 'uncertain')
    const { remaining } = reconcileQueue([q], new Set())
    expect(remaining).toHaveLength(1)
    expect(bal(applyQueuedDeltas(base(), remaining, [FOOD]), 'cash')).toBe(800)
  })

  it('Test 4 — mixed queue', () => {
    // Server already has U2 (its ₹50 is in the snapshot: 1000 − 50 = 950).
    const serverSnapshot: BalanceSnapshot = { accounts: [{ ...CASH, current_balance: 950 }, BANK], credit_cards: [VISA], transactions: [] }
    const queue = [item('U1', expense(200)), item('U2', expense(50), 'uncertain'), item('U3', expense(100), 'uncertain')]
    const { remaining, alreadySaved } = reconcileQueue(queue, new Set(['U2']))
    expect(alreadySaved.map(q => q.id)).toEqual(['U2'])
    expect(remaining.map(q => q.id)).toEqual(['U1', 'U3'])
    expect(bal(applyQueuedDeltas(serverSnapshot, remaining, [FOOD]), 'cash')).toBe(650) // 950 − 200 − 100
  })

  it('Test 5 — deterministic: same base + same queue = same result, never accumulated', () => {
    const b = base()
    const queue = [item('U1', expense(200)), item('U2', expense(300, 'cash', { transaction_type: 'income' }))]
    const once = applyQueuedDeltas(b, queue, [FOOD])
    const twice = applyQueuedDeltas(b, queue, [FOOD])
    expect(twice).toEqual(once)
    expect(bal(once, 'cash')).toBe(1100)
    expect(bal(b, 'cash')).toBe(1000) // the base is never mutated
  })

  it('offline: no lookup possible, an uncertain item is kept and applied once (cache is not proof)', () => {
    const q = item('U1', expense(200), 'uncertain')
    // Even if a cached list happens to contain U1, offline reconcile changes nothing…
    const { remaining } = reconcileQueue([q], null)
    expect(remaining).toEqual([q])
    // …and the overlay shows it once, as a pending row (never a duplicate row).
    const cachedRow = { id: 'U1', transaction_date: '2026-09-29', created_at: '2026-09-29T04:35:00Z' } as Transaction
    const s = applyQueuedDeltas(base([cachedRow]), remaining, [FOOD])
    expect(bal(s, 'cash')).toBe(800)
    expect(s.transactions.filter(t => t.id === 'U1')).toHaveLength(1)
    expect(s.transactions[0].pending_sync).toBe(true)
  })
})

// ── Error wording ───────────────────────────────────────────────────────────

describe('describeQueueError', () => {
  const present = (accounts: string[], cards: string[], cats: string[]) =>
    ({ accountIds: new Set(accounts), cardIds: new Set(cards), categoryIds: new Set(cats) })
  const failed = (q: QueuedTransaction, code: string): QueuedTransaction => ({ ...q, error: { code, message: 'server said no' } })

  it('23503 names the missing account', () => {
    const q = failed(item('U1', expense(200, 'bank')), '23503')
    expect(describeQueueError(q, present(['cash'], ['visa'], ['food']))!.reason).toBe('The account "Federal Bank" no longer exists.')
  })
  it('23503 names a missing destination account', () => {
    const q = failed(item('U1', expense(200, 'cash', { transaction_type: 'transfer', to_account_id: 'bank', category_id: null })), '23503')
    expect(describeQueueError(q, present(['cash'], [], []))!.reason).toBe('The destination account "Federal Bank" no longer exists.')
  })
  it('23503 names a missing category', () => {
    const q = failed(item('U1', expense(200)), '23503')
    expect(describeQueueError(q, present(['cash', 'bank'], ['visa'], []))!.reason).toBe('The category "Groceries" no longer exists.')
  })
  it('42501 / PT409 say it was rejected', () => {
    for (const code of ['42501', 'PT409']) {
      expect(describeQueueError(failed(item('U1', expense(1)), code), present([], [], []))!.reason).toBe('This transaction was rejected by the server.')
    }
  })
  it('other errors show the server message and what to do', () => {
    const e = describeQueueError(failed(item('U1', expense(1)), 'P0001'), present([], [], []))!
    expect(e.reason).toBe('server said no')
    expect(e.consequence).toMatch(/won't be saved unless you remove it/)
  })
  it('no error, no text', () => expect(describeQueueError(item('U1', expense(1)), present([], [], []))).toBeNull())
})
