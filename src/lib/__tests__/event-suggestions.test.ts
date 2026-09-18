import { describe, it, expect, beforeEach } from 'vitest'
import {
  tokenize, eventSlug, findPhraseClusters, clusterDisplayPhrase, isNovel,
  firstMeaningfulToken, isMerchantCluster, baselineDailySpend, suggestionPool,
  suggestionFingerprint, detectEventSignals, hasEventSignal, signalRows,
  validateAiResult, isSuppressed, matchExistingEvent, shiftIso, MAX_AI_ROWS,
} from '@/lib/event-suggestions'
import type { HistoryRow } from '@/lib/event-suggestions'
import type { Category, LifeEvent, Master, Transaction } from '@/types'

const TODAY = '2026-09-18'

const categories: Category[] = [
  { id: 'food', name: 'Food', group_name: 'Lifestyle' },
  { id: 'fuel', name: 'Fuel', group_name: 'Lifestyle' },
  { id: 'fun', name: 'Entertainment', group_name: 'Lifestyle' },
  { id: 'travel', name: 'Travel', group_name: 'Lifestyle' },
  { id: 'stay', name: 'Stay', group_name: 'Lifestyle' },
  { id: 'medical', name: 'Medical', group_name: 'Essential' },
  { id: 'gift', name: 'Gifts', group_name: 'Lifestyle' },
  { id: 'groceries', name: 'Groceries', group_name: 'Essential' },
  { id: 'adj', name: 'Balance Adjustment', group_name: 'Adjustment' },
]

let seq = 0
beforeEach(() => { seq = 0 })

const tx = (description: string, date: string, amount: number, category_id = 'food', over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  transaction_date: date,
  description,
  amount,
  transaction_type: 'expense',
  category_id,
  from_account_id: 'acc-1',
  to_account_id: null,
  notes: null,
  created_at: `${date}T10:00:00Z`,
  ...over,
})

const ev = (name: string, over: Partial<LifeEvent> = {}): LifeEvent => ({
  id: `ev-${name}`, name, icon: 'plane', target_amount: null,
  start_date: null, end_date: null, excluded_from_budget: true,
  default_category_id: null, default_account_id: null, status: 'active',
  ...over,
})

const merchant = (id: string, name: string): Master => ({
  id, name, display_name: name, type: 'merchant',
  category_id: null, phone: null, photo_url: null, notes: null,
})

/** `days` of ordinary history ending the day before `before`, one row a day. */
const dailyHistory = (before: string, days: number, amount: number, description = 'groceries'): HistoryRow[] =>
  Array.from({ length: days }, (_, i) => ({
    id: `h${i}`, description, transaction_date: shiftIso(before, -(i + 1)), amount, category_id: 'groceries',
  }))

const detect = (transactions: Transaction[], opts: { history?: HistoryRow[]; masters?: Master[]; events?: LifeEvent[] } = {}) => {
  const pool = suggestionPool({ transactions, categories }, TODAY)
  return detectEventSignals({
    pool,
    history: opts.history ?? [],
    categories,
    masters: opts.masters ?? [],
    events: opts.events ?? [],
  })
}

const ootyTrip = () => [
  tx('100 for tea ooty trip', '2026-09-12', 100, 'food'),
  tx('lunch ooty trip', '2026-09-12', 500, 'food'),
  tx('1200 petrole ooty trip', '2026-09-13', 1200, 'fuel'),
  tx('ooty trip entry fee', '2026-09-14', 200, 'fun'),
]

// ── Positive ────────────────────────────────────────────────────────────────

describe('positive detection', () => {
  it('suggests the Ooty trip from the original example', () => {
    const d = detect(ootyTrip())
    expect(d.local).toMatchObject({
      source: 'local',
      name: 'Ooty Trip',
      icon: 'plane',
      total: 2000,
      startDate: '2026-09-12',
      endDate: '2026-09-14',
      matchedLabels: ['Tea', 'Lunch', 'Petrole', 'Entry Fee'],
      defaultCategoryId: 'food',
      defaultAccountId: 'acc-1',
    })
    expect(d.local!.txIds).toHaveLength(4)
    expect(hasEventSignal(d)).toBe(true)
  })

  it('suggests the Kodai trip exactly as it was entered on the test account', () => {
    const d = detect([
      tx('tea and snacks - Kodai trip', TODAY, 100, 'food'),
      tx('Diesel - Kodai trip', TODAY, 2000, 'fuel'),
      tx('Food - Kodai trip', TODAY, 200, 'food'),
      tx('Boating ticket - Kodai trip', TODAY, 100, 'fun'),
      tx('coffee', '2026-07-17', 500, 'food'),
    ], { history: [{ id: 'h', description: 'Petrol', transaction_date: '2026-06-24', amount: 1000 }] })
    expect(d.local).toMatchObject({ name: 'Kodai Trip', total: 2400, icon: 'plane' })
    expect(d.local!.txIds).toHaveLength(4)
  })

  it('names the cluster from the longest phrase used by half its rows', () => {
    const d = detect([
      tx('Tea Ooty Trip', '2026-09-12', 100, 'food'),
      tx('Lunch Ooty Trip', '2026-09-12', 500, 'food'),
      tx('Petrol Ooty', '2026-09-13', 1200, 'fuel'),
      tx('Ooty Entry Fee', '2026-09-14', 200, 'fun'),
    ])
    expect(d.local?.name).toBe('Ooty Trip')
    expect(d.local?.txIds).toHaveLength(4)
  })

  it('suggests a Goa trip whose rows share a phrase', () => {
    const d = detect([
      tx('Goa trip hotel', '2026-09-05', 4000, 'stay'),
      tx('Goa trip fuel', '2026-09-06', 900, 'fuel'),
      tx('Goa trip food', '2026-09-07', 1100, 'food'),
    ])
    expect(d.local?.name).toBe('Goa Trip')
    expect(d.local?.total).toBe(6000)
  })

  it('switches to link mode for an existing event, whatever its casing', () => {
    const existing = ev('OOTY TRIP')
    const d = detect(ootyTrip(), { events: [existing] })
    expect(d.local?.existingEventId).toBe(existing.id)
    expect(d.local?.name).toBe('OOTY TRIP')
  })

  it('suggests the yearly Ooty trip again after 6 months', () => {
    const history: HistoryRow[] = [
      { id: 'old1', description: 'tea ooty trip', transaction_date: '2026-03-10', amount: 100 },
      { id: 'old2', description: 'hotel ooty trip', transaction_date: '2026-03-11', amount: 3000 },
    ]
    expect(detect(ootyTrip(), { history }).local?.name).toBe('Ooty Trip')
  })

  it('treats a hospital stay as a burst for AI, never a local suggestion', () => {
    const rows = [
      tx('City hospital admission', '2026-09-15', 8000, 'medical'),
      tx('Pharmacy', '2026-09-16', 1200, 'medical'),
      tx('MRI scan', '2026-09-17', 3500, 'medical'),
    ]
    const d = detect(rows, { history: dailyHistory('2026-09-15', 120, 300) })
    expect(d.local).toBeNull()
    expect(d.burst?.map(t => t.id).sort()).toEqual(rows.map(t => t.id).sort())
    expect(hasEventSignal(d)).toBe(true)
  })

  it('treats a wedding as a burst for AI, never a local suggestion', () => {
    const d = detect([
      tx('Wedding gift', '2026-09-10', 5000, 'gift'),
      tx('Bus to Thrissur', '2026-09-10', 600, 'travel'),
      tx('Dinner', '2026-09-11', 400, 'food'),
    ], { history: dailyHistory('2026-09-10', 120, 300) })
    expect(d.local).toBeNull()
    expect(d.burst).toHaveLength(3)
  })

  it('sends a Goa trip without a shared phrase to AI as a burst', () => {
    const d = detect([
      tx('Goa trip', '2026-09-05', 4000, 'travel'),
      tx('Hotel', '2026-09-06', 3000, 'stay'),
      tx('Fuel', '2026-09-06', 900, 'fuel'),
      tx('Food', '2026-09-07', 1100, 'food'),
    ], { history: dailyHistory('2026-09-05', 120, 300) })
    expect(d.local).toBeNull()
    expect(d.burst).toHaveLength(4)
  })
})

// ── Negative ────────────────────────────────────────────────────────────────

describe('negative detection', () => {
  it('ignores a daily chai habit', () => {
    const d = detect([
      tx('chai', '2026-09-15', 15, 'food'),
      tx('chai', '2026-09-16', 15, 'food'),
      tx('chai', '2026-09-17', 15, 'food'),
    ], { history: dailyHistory('2026-09-15', 120, 15, 'chai') })
    expect(d.local).toBeNull()
    expect(hasEventSignal(d)).toBe(false)
  })

  it('ignores Swiggy orders seen in the last 90 days', () => {
    const d = detect([
      tx('Swiggy lunch', '2026-09-15', 300, 'food'),
      tx('Swiggy dinner', '2026-09-16', 450, 'food'),
      tx('Swiggy groceries', '2026-09-17', 800, 'groceries'),
    ], { history: [{ id: 'h', description: 'swiggy dinner', transaction_date: '2026-08-20', amount: 400 }] })
    expect(d.local).toBeNull()
    expect(d.phraseSignals).toEqual([])
  })

  it('ignores monthly rent', () => {
    const d = detect([tx('Rent', '2026-09-01', 15000, 'groceries')],
      { history: [{ id: 'h', description: 'rent', transaction_date: '2026-08-01', amount: 15000 }] })
    expect(d.local).toBeNull()
    expect(hasEventSignal(d)).toBe(false)
  })

  it('needs three expenses for a local suggestion, but two can signal AI', () => {
    const d = detect([
      tx('tea ooty trip', '2026-09-12', 300, 'food'),
      tx('petrol ooty trip', '2026-09-12', 1200, 'fuel'),
    ])
    expect(d.local).toBeNull()
    expect(d.phraseSignals.map(c => c.phrase)).toEqual(['ooty trip'])
  })

  it('leaves split legs out of the pool', () => {
    const rows = ootyTrip()
    rows[0].split_group_id = 'g1'
    rows[1].split_group_id = 'g1'
    expect(detect(rows).local).toBeNull()
  })

  it('leaves already-tagged and system rows out of the pool', () => {
    const rows = [
      ...ootyTrip(),
      tx('ooty trip hotel', '2026-09-13', 3000, 'stay', { event_id: 'ev-x' }),
      tx('ooty trip fix', '2026-09-13', 50, 'adj'),
    ]
    expect(detect(rows).local?.txIds).toHaveLength(4)
  })

  it('rejects a Lulu shopping cluster', () => {
    const d = detect([
      tx('Lulu Hypermarket', '2026-09-14', 2000, 'groceries'),
      tx('Lulu Petrol', '2026-09-14', 1000, 'fuel'),
      tx('Lulu Food Court', '2026-09-14', 500, 'food'),
    ])
    expect(d.local).toBeNull()
    expect(d.phraseSignals).toEqual([])
  })

  it('does not treat ₹36 of chai as a burst', () => {
    const d = detect([
      tx('chai', '2026-09-17', 12, 'food'),
      tx('chai', '2026-09-17', 12, 'food'),
      tx('chai', '2026-09-17', 12, 'food'),
    ], { history: dailyHistory('2026-09-17', 120, 0) })
    expect(d.burst).toBeNull()
    expect(d.local).toBeNull()
  })

  it('does not call ordinary spending a burst when history is too short to know', () => {
    const d = detect([
      tx('Groceries', '2026-09-15', 1500, 'groceries'),
      tx('Petrol', '2026-09-16', 1000, 'fuel'),
      tx('Dinner out', '2026-09-17', 800, 'food'),
    ], { history: dailyHistory('2026-09-15', 20, 300) })
    expect(d.burst).toBeNull()
  })

  it('ignores a single-category novel phrase, so a new user’s chai never asks AI', () => {
    const d = detect([
      tx('masala chai', '2026-09-15', 20, 'food'),
      tx('masala chai', '2026-09-16', 20, 'food'),
    ])
    expect(hasEventSignal(d)).toBe(false)
  })
})

// ── Utilities ───────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('drops digits, stopwords and short tokens', () => {
    expect(tokenize('100 for Tea at Ooty-Trip UPI/4521 by me')).toEqual(['tea', 'ooty', 'trip', 'upi'])
  })

  it('keeps words with combining marks whole', () => {
    expect(tokenize('ഊട്ടി യാത്ര')).toEqual(['ഊട്ടി', 'യാത്ര'])
  })
})

describe('findPhraseClusters', () => {
  it('keeps the longest phrase for the same set of rows', () => {
    const clusters = findPhraseClusters(suggestionPool({ transactions: ootyTrip(), categories }, TODAY))
    expect(clusters[0].phrase).toBe('ooty trip')
    expect(clusters.map(c => c.phrase)).not.toContain('ooty')
    expect(clusters.map(c => c.phrase)).not.toContain('trip')
  })

  it('names from a longer phrase only when half the rows use it', () => {
    const pool = suggestionPool({ transactions: [
      tx('Ooty hotel', '2026-09-12', 1, 'stay'),
      tx('Ooty boating', '2026-09-12', 1, 'fun'),
      tx('Tea ooty trip', '2026-09-13', 1, 'food'),
    ], categories }, TODAY)
    const cluster = findPhraseClusters(pool).find(c => c.phrase === 'ooty')!
    expect(clusterDisplayPhrase(cluster)).toBe('ooty')
  })
})

describe('eventSlug', () => {
  it('normalises case, spacing and punctuation', () => {
    for (const name of ['Ooty Trip', 'ooty trip', 'OOTY TRIP', '  Ooty   Trip ', 'Ooty-Trip!']) {
      expect(eventSlug(name)).toBe('ooty-trip')
    }
  })

  it('matches only live events', () => {
    expect(matchExistingEvent('ooty trip', [ev('Ooty Trip', { status: 'archived' })])).toBeNull()
    expect(matchExistingEvent('ooty trip', [ev('Ooty Trip', { status: 'completed' })])?.name).toBe('Ooty Trip')
  })
})

describe('suggestionFingerprint', () => {
  const row = (description: string) => ({ id: 'a', transaction_date: '2026-09-12', description })

  it('ignores casing', () => {
    expect(suggestionFingerprint([row('Tea Ooty Trip')])).toBe(suggestionFingerprint([row('TEA OOTY TRIP')]))
    expect(suggestionFingerprint([row('Tea Ooty Trip')])).toBe('a:2026-09-12:tea ooty trip')
  })

  it('changes when the words change', () => {
    expect(suggestionFingerprint([row('Tea Ooty Trip')])).not.toBe(suggestionFingerprint([row('Coffee Ooty Trip')]))
  })
})

describe('isNovel', () => {
  const at = (description: string, transaction_date: string): HistoryRow => ({ id: description, description, transaction_date })

  it('matches whole tokens, not substrings', () => {
    expect(isNovel('goa', '2026-09-12', [at('Goal savings transfer', '2026-08-01')])).toBe(true)
    expect(isNovel('ooty', '2026-09-12', [at('Ootyhill Restaurant', '2026-08-01')])).toBe(true)
    expect(isNovel('trip', '2026-09-12', [at('Business trip reimbursement', '2026-08-01')])).toBe(false)
  })

  it('only looks back 90 days from the cluster start', () => {
    expect(isNovel('ooty trip', '2026-09-12', [at('ooty trip', '2026-07-20')])).toBe(false)
    expect(isNovel('ooty trip', '2026-09-12', [at('ooty trip', '2026-06-01')])).toBe(true)
    expect(isNovel('ooty trip', '2026-09-12', [at('ooty trip', '2026-09-13')])).toBe(true)
  })
})

describe('merchant rejection', () => {
  it('skips generic prefixes to find the meaningful word', () => {
    expect(firstMeaningfulToken('Hotel Maharaja')).toBe('maharaja')
    expect(firstMeaningfulToken('Lulu Hypermarket')).toBe('lulu')
    expect(firstMeaningfulToken('Medical Trust')).toBe('trust')
  })

  it('A: rejects when most rows share a merchant master', () => {
    const lulu = merchant('m1', 'Lulu Mall')
    const rows = [
      tx('Weekly shop', '2026-09-14', 1, 'groceries', { master_id: 'm1' }),
      tx('Snacks', '2026-09-14', 1, 'food', { master_id: 'm1' }),
      tx('Top-up', '2026-09-14', 1, 'fuel', { master_id: 'm1' }),
    ]
    expect(isMerchantCluster(rows, 'weekly', [lulu])).toBe(true)
  })

  it('B: rejects a phrase that is a merchant name', () => {
    expect(isMerchantCluster([tx('Lulu', '2026-09-14', 1)], 'lulu', [merchant('m1', 'LULU')])).toBe(true)
  })

  it('C: rejects a shared leading word written as a shop', () => {
    const rows = [tx('Lulu Hypermarket', '2026-09-14', 1), tx('Lulu Petrol', '2026-09-14', 1), tx('Lulu Food Court', '2026-09-14', 1)]
    expect(isMerchantCluster(rows, 'lulu', [])).toBe(true)
  })

  it('C: keeps a trip whose descriptions lead with the place', () => {
    const rows = [tx('Ooty entry fee', '2026-09-14', 1), tx('Ooty boating', '2026-09-14', 1), tx('Ooty hotel', '2026-09-14', 1)]
    expect(isMerchantCluster(rows, 'ooty', [])).toBe(false)
  })
})

describe('baselineDailySpend', () => {
  it('uses the median, so one big purchase does not inflate it', () => {
    const history = dailyHistory('2026-09-10', 120, 300)
    history.push({ id: 'laptop', description: 'laptop', transaction_date: '2026-08-01', amount: 90000 })
    expect(baselineDailySpend(history, '2026-09-10')).toBe(300)
  })

  it('is unknown when history does not reach 90 days back', () => {
    expect(baselineDailySpend(dailyHistory('2026-09-10', 30, 300), '2026-09-10')).toBeNull()
  })
})

describe('validateAiResult', () => {
  const rows = () => suggestionPool({ transactions: ootyTrip(), categories }, TODAY)
  const ok = { is_event: true, name: 'Ooty Trip', icon: 'plane', indices: [0, 1, 2, 3], confidence: 85 }

  it('maps indices back to rows', () => {
    const sent = rows()
    const v = validateAiResult(ok, sent)
    expect(v?.transactions.map(t => t.id)).toEqual(sent.map(t => t.id))
    expect(v?.icon).toBe('plane')
  })

  it('drops duplicate, invalid and already-tagged indices', () => {
    const sent = rows()
    sent[1] = { ...sent[1], event_id: 'ev-x' }
    const v = validateAiResult({ ...ok, indices: [0, 0, 1, 2, 99, -1, 1.5, 'x'] }, sent)
    expect(v?.transactions.map(t => t.id)).toEqual([sent[0].id, sent[2].id])
  })

  it('accepts the shapes small models actually write', () => {
    const sent = rows()
    expect(validateAiResult({ ...ok, confidence: 0.9 }, sent)).not.toBeNull()
    expect(validateAiResult({ ...ok, confidence: '85' }, sent)).not.toBeNull()
    expect(validateAiResult({ ...ok, is_event: 'true' }, sent)).not.toBeNull()
    expect(validateAiResult({ ...ok, indices: ['0', '2'] }, sent)?.transactions).toHaveLength(2)
    expect(validateAiResult({ ...ok, confidence: 0.4 }, sent)).toBeNull()
    expect(validateAiResult({ ...ok, confidence: 'high' }, sent)).toBeNull()
  })

  it('rejects fewer than two expenses, low confidence, bad names and non-events', () => {
    expect(validateAiResult({ ...ok, indices: [0] }, rows())).toBeNull()
    expect(validateAiResult({ ...ok, confidence: 59 }, rows())).toBeNull()
    expect(validateAiResult({ ...ok, name: '   ' }, rows())).toBeNull()
    expect(validateAiResult({ ...ok, name: 'x'.repeat(41) }, rows())).toBeNull()
    expect(validateAiResult({ ...ok, is_event: false }, rows())).toBeNull()
    expect(validateAiResult(null, rows())).toBeNull()
  })

  it('falls back to the default icon for an unknown one', () => {
    expect(validateAiResult({ ...ok, icon: 'rocket' }, rows())?.icon).toBe('ring')
  })
})

describe('isSuppressed', () => {
  it('stays hidden while at least half its rows were dismissed', () => {
    const dismissed = new Set(['a', 'b', 'c', 'd'])
    expect(isSuppressed({ txIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, dismissed)).toBe(true)
    expect(isSuppressed({ txIds: ['a', 'x', 'y', 'z', 'w'] }, dismissed)).toBe(false)
  })
})

describe('pool and signal rows', () => {
  it('caps the pool at MAX_AI_ROWS, newest first', () => {
    const many = Array.from({ length: 80 }, (_, i) => tx(`item ${i}`, shiftIso(TODAY, -(i % 29)), 10))
    const pool = suggestionPool({ transactions: many, categories }, TODAY)
    expect(pool).toHaveLength(MAX_AI_ROWS)
    expect(pool[0].transaction_date >= pool[pool.length - 1].transaction_date).toBe(true)
  })

  it('includes a day-28 expense and excludes a day-31 one', () => {
    const pool = suggestionPool({ transactions: [
      tx('in', shiftIso(TODAY, -28), 10), tx('out', shiftIso(TODAY, -31), 10),
    ], categories }, TODAY)
    expect(pool.map(t => t.description)).toEqual(['in'])
  })

  it('keys the AI signal on the signal rows only', () => {
    const trip = ootyTrip()
    const d1 = detect(trip)
    const d2 = detect([...trip, tx('coffee', TODAY, 50, 'food')])
    expect(suggestionFingerprint(signalRows(d2))).toBe(suggestionFingerprint(signalRows(d1)))
    expect(signalRows(d2).map(t => t.description)).not.toContain('coffee')
  })
})
