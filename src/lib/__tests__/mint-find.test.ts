import { describe, it, expect, vi } from 'vitest'
import {
  classifyFindIntent, parseFindQuery, parseFindAmount, findTokens, pickSearchToken, FIND_STOPWORDS,
  rankFindMatches, tiedAtTop, findIn, executeFind, findCountText, viewAllShowsCount,
} from '@/lib/mint-find'
import { amountBounds, filterAndSortTransactions, DEFAULT_TXN_FILTERS } from '@/lib/transactionFilters'
import type { AppState, Transaction, Category } from '@/types'

const tx = (p: Partial<Transaction>): Transaction => ({
  id: 'x', user_id: 'u', transaction_date: '2026-09-01', description: '', amount: 100,
  transaction_type: 'expense', category_id: null, from_account_id: 'a1', to_account_id: null,
  notes: '', created_at: '2026-09-01T00:00:00Z', ...p,
} as Transaction)

const cat = (id: string, name: string, group_name = 'Lifestyle') => ({ id, name, group_name } as Category)
const state = {
  accounts: [{ id: 'hdfc', name: 'HDFC', is_active: true }, { id: 'cash', name: 'Cash', is_active: true }],
  credit_cards: [],
  categories: [cat('food', 'Food'), cat('salary', 'Salary', 'Income')],
} as unknown as Pick<AppState, 'accounts' | 'credit_cards' | 'categories'>
const NOW = new Date(2026, 8, 30)  // 30 Sep 2026, local

describe('classifyFindIntent', () => {
  it.each([
    'find swiggy in august', 'search tea', 'look up the plumber', 'when did I pay the plumber',
    "when did i buy shoes", 'last time I paid rent', 'show me transactions for amazon',
    'when did I last pay the plumber',
  ])('fires on "%s"', q => expect(classifyFindIntent(q)).toBe(true))

  it.each([
    'how much did I spend on food', 'what changed since last time', 'show my balances',
    'tea 20', 'how am i doing',
  ])('does not fire on "%s"', q => expect(classifyFindIntent(q)).toBe(false))
})

describe('parseFindQuery', () => {
  it('"when did I pay the plumber" → plumber, all time, latest emphasis', () => {
    const q = parseFindQuery('when did I pay the plumber', state, null, NOW)
    expect(q.tokens).toEqual(['plumber'])
    expect(q.filters.search).toBe('plumber')
    expect(q.emphasis).toBe('latest')
    expect(q.filters.dateFrom).toBe('')
    expect(q.label).toBe('plumber · all time')
  })

  it('never sends a stopword to the database: "find plumber payment" → plumber', () => {
    const q = parseFindQuery('find plumber payment', state, null, NOW)
    expect(q.tokens).toEqual(['plumber'])
    expect(q.filters.search).toBe('plumber')
  })

  it('"find food last month" → category filter + dates, no text search', () => {
    const q = parseFindQuery('find food last month', state, null, NOW)
    expect(q.filters.category).toBe('food')
    expect(q.filters.search).toBe('')
    expect(q.filters.dateFrom).toBe('2026-08-01')
    expect(q.filters.dateTo).toBe('2026-08-31')
    expect(q.alternate?.tokens).toEqual(['food'])
    expect(q.alternate?.filters.category).toBe('all')
  })

  it('"find payment" has nothing to search', () => {
    expect(parseFindQuery('find payment', state, null, NOW).empty).toBe(true)
  })

  it('"search tea hdfc last week" → token, account, week', () => {
    const q = parseFindQuery('search tea hdfc last week', state, null, NOW)
    expect(q.tokens).toEqual(['tea'])
    expect(q.filters.account).toBe('hdfc')
    expect(q.filters.dateFrom).toBe('2026-09-21')
    expect(q.filters.dateTo).toBe('2026-09-27')
  })

  it('"find swiggy in august" → local month bounds (not UTC Jul 31)', () => {
    const q = parseFindQuery('find swiggy in august', state, null, NOW)
    expect(q.filters.dateFrom).toBe('2026-08-01')
    expect(q.filters.dateTo).toBe('2026-08-31')
  })

  it('a day with a month is a date, never an amount', () => {
    const q = parseFindQuery('find swiggy on 12 august', state, null, NOW)
    expect(q.filters.amount).toBeNull()
    expect(q.filters.dateFrom).toBe('2026-08-12')
    expect(q.filters.dateTo).toBe('2026-08-12')
  })

  it('"find 450" → amount only; "find 450 in 2025" keeps both', () => {
    const a = parseFindQuery('find 450', state, null, NOW)
    expect(a.filters.amount).toBe(450)
    expect(a.tokens).toEqual([])
    expect(a.empty).toBe(false)
    const b = parseFindQuery('find 450 in 2025', state, null, NOW)
    expect(b.filters.amount).toBe(450)
    expect(b.filters.dateFrom).toBe('2025-01-01')
    expect(b.filters.dateTo).toBe('2025-12-31')
  })

  it('"find ₹2025" is money, not a year', () => {
    const q = parseFindQuery('find ₹2025', state, null, NOW)
    expect(q.filters.amount).toBe(2025)
    expect(q.filters.dateFrom).toBe('')
  })
})

describe('search token', () => {
  it('is never a stopword', () => {
    for (const w of FIND_STOPWORDS) {
      expect(pickSearchToken(findTokens(`find ${w}`))).toBeNull()
      expect(pickSearchToken(findTokens(`find ${w} plumber ${w}`))).toBe('plumber')
    }
  })
  it('is the longest token', () => {
    expect(pickSearchToken(['tea', 'ooty', 'boating'])).toBe('boating')
  })
})

describe('parseFindAmount / amountBounds', () => {
  it('reads to the paisa and prefers a ₹-marked number', () => {
    expect(parseFindAmount('450.50')?.amount).toBe(450.5)
    expect(parseFindAmount('1.2k')?.amount).toBe(1200)
    expect(parseFindAmount('1,200')?.amount).toBe(1200)
    expect(parseFindAmount('3 teas ₹60')?.amount).toBe(60)
  })

  it('450 and 450.00 and a float-stored 449.999999 are the same money', () => {
    const rows = [tx({ id: 'a', amount: 450 }), tx({ id: 'b', amount: 449.999999 }), tx({ id: 'c', amount: 450.01 })]
    const hit = (x: number) => filterAndSortTransactions(rows, [], { ...DEFAULT_TXN_FILTERS, amount: x }, 'date_desc').map(t => t.id).sort()
    expect(hit(450)).toEqual(['a', 'b'])
    expect(hit(450.0)).toEqual(['a', 'b'])
    expect(hit(450.01)).toEqual(['c'])
  })

  it('bounds are half a paisa either side', () => {
    const [lo, hi] = amountBounds(450)
    expect(lo).toBeCloseTo(449.995, 6)
    expect(hi).toBeCloseTo(450.005, 6)
    expect(449.9951 >= lo && 449.9951 < hi).toBe(true)
    expect(450.0051 >= lo && 450.0051 < hi).toBe(false)
  })
})

describe('rankFindMatches', () => {
  const rows = [
    tx({ id: '1', description: 'Plumber repair', transaction_date: '2026-08-12' }),
    tx({ id: '2', description: 'Plumber', transaction_date: '2026-03-14' }),
    tx({ id: '3', description: 'Repair shop', transaction_date: '2026-02-01' }),
  ]

  it('requires every token (AND) before falling back', () => {
    const r = rankFindMatches(rows, ['plumber', 'repair'])
    expect(r.matches.map(m => m.t.id)).toEqual(['1'])
    expect(r.fuzzy).toBe(false)
  })

  it('falls back to any token, flagged fuzzy', () => {
    const r = rankFindMatches(rows, ['plumber', 'leak'])
    expect(r.matches.map(m => m.t.id)).toEqual(['1', '2'])
    expect(r.fuzzy).toBe(true)
  })

  it('exact description beats newer partial', () => {
    const r = rankFindMatches(rows, ['plumber'])
    expect(r.matches.map(m => m.t.id)).toEqual(['2', '1'])
  })

  it('a whole-word hit outranks one inside another word', () => {
    const r = rankFindMatches([
      tx({ id: 'snack', description: 'Snacks', transaction_date: '2026-09-20' }),
      tx({ id: 'ac', description: 'AC repair', transaction_date: '2026-05-01' }),
    ], ['ac'])
    expect(r.matches.map(m => m.t.id)).toEqual(['ac', 'snack'])
  })

  it('three identical rows tie at the top', () => {
    const teas = [1, 2, 3].map(i => tx({ id: `t${i}`, description: 'Tea', amount: 20 }))
    expect(tiedAtTop(rankFindMatches(teas, ['tea']).matches)).toHaveLength(3)
  })
})

describe('executeFind', () => {
  const loaded = [tx({ id: 'new', description: 'Chai', transaction_date: '2026-09-29' })]
  const q = parseFindQuery('when did I pay the plumber', state, null, NOW)

  it('reaches past the loaded window', async () => {
    const search = vi.fn().mockResolvedValue({ rows: [tx({ id: 'old', description: 'Plumber', transaction_date: '2025-01-05' })], truncated: false })
    const o = await executeFind(q, loaded, state.categories, false, search)
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ search: 'plumber', showSystemTxns: true }), null)
    expect(o.groups.map(g => g.primary.id)).toEqual(['old'])
    expect(o.status).toBe('complete')
  })

  it('does not query when everything is loaded', async () => {
    const search = vi.fn()
    const o = await executeFind(q, loaded, state.categories, true, search)
    expect(search).not.toHaveBeenCalled()
    expect(o.status).toBe('complete')
  })

  it('offline → the loaded window, labelled local', async () => {
    const search = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const o = await executeFind(q, loaded, state.categories, false, search)
    expect(o.status).toBe('local')
    expect(o.total).toBe(0)
  })

  it('widens with the other words only when no row has every word', async () => {
    const nq = parseFindQuery('find my netflix subscription', state, null, NOW)
    expect(nq.filters.search).toBe('subscription')
    const search = vi.fn(async (f: { search: string }) => ({
      rows: f.search === 'netflix' ? [tx({ id: 'n', description: 'Netflix', transaction_date: '2025-02-01' })] : [],
      truncated: false,
    }))
    const o = await executeFind(nq, [], state.categories, false, search)
    expect(search.mock.calls.map(c => c[0].search)).toEqual(['subscription', 'netflix'])
    expect(o.groups.map(g => g.primary.id)).toEqual(['n'])
    expect(o.fuzzy).toBe(true)

    const strict = vi.fn().mockResolvedValue({ rows: [tx({ id: 's', description: 'Netflix subscription' })], truncated: false })
    await executeFind(nq, [], state.categories, false, strict)
    expect(strict).toHaveBeenCalledTimes(1)
  })

  it('a capped answer is a lower bound', async () => {
    const search = vi.fn().mockResolvedValue({ rows: [tx({ id: 'p', description: 'Plumber' })], truncated: true })
    const o = await executeFind(q, [], state.categories, false, search)
    expect(o.status).toBe('truncated')
  })

  it('tries the category word as a description when the category finds nothing', async () => {
    const rows = [tx({ id: 'f', description: 'Food court', category_id: null })]
    const fq = parseFindQuery('find food', state, null, NOW)
    const o = await executeFind(fq, rows, state.categories, true, undefined)
    expect(o.groups.map(g => g.primary.id)).toEqual(['f'])
  })

  it('hides system rows and collapses a split into one entry', () => {
    const rows = [
      tx({ id: 'l1', description: 'Gift', amount: 300, split_group_id: 'g' }),
      tx({ id: 'l2', description: 'Gift', amount: 108, split_group_id: 'g', from_account_id: 'cash' }),
      tx({ id: 'sys', description: 'Gift', transaction_type: 'balance_adjustment' }),
    ]
    const o = findIn(rows, [], parseFindQuery('find gift', state, null, NOW), 'complete')
    expect(o.total).toBe(1)
    expect(o.groups[0].total).toBe(408)
  })
})

describe('count contract', () => {
  it('words each status', () => {
    expect(findCountText(1, 'complete', 200)).toBe('1 match')
    expect(findCountText(3, 'complete', 200)).toBe('3 matches')
    expect(findCountText(5000, 'truncated', 200)).toBe('5,000+ matches')
    expect(findCountText(3, 'local', 200)).toBe('3 matches in your latest 200')
  })

  it('names N on "View all" only for one strict word', () => {
    const base = findIn([tx({ description: 'Swiggy' })], [], parseFindQuery('find swiggy', state, null, NOW), 'complete')
    expect(viewAllShowsCount(base)).toBe(true)
    const two = findIn([tx({ description: 'Ooty tea' })], [], parseFindQuery('find ooty tea', state, null, NOW), 'complete')
    expect(viewAllShowsCount(two)).toBe(false)
    expect(viewAllShowsCount({ ...base, status: 'truncated' })).toBe(false)
  })
})
