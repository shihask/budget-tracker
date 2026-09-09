import { describe, it, expect } from 'vitest'
import {
  normalizeMasterName,
  isValidMasterName,
  findDuplicateMaster,
  searchMasters,
  sortMasters,
  masterInitials,
  duplicateMasterMessage,
  masterById,
  masterTransactions,
  masterPaid,
  masterReceived,
  masterActivity,
  isMasterTaggable,
  isMasterInflow,
  ensurePersonMaster,
  matchMasterByName,
} from '@/lib/masters'
import { MASTER_TYPES } from '@/types'
import type { Master, MasterType, Transaction } from '@/types'

const m = (name: string, type: MasterType, over: Partial<Master> = {}): Master => ({
  id: name + '-' + type,
  name,
  // Mirrors the DB's generated column: trim only, NOT the client's fuller
  // normalization. Fixtures that fake this as fully-normalized would hide the
  // very gap the two-layer contract accepts.
  display_name: name.trim(),
  type,
  category_id: null,
  phone: null,
  photo_url: null,
  notes: null,
  ...over,
})

describe('normalizeMasterName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeMasterName('  Rahul   Menon ')).toBe('Rahul Menon')
    expect(normalizeMasterName('Rahul')).toBe('Rahul')
  })

  it('reduces a whitespace-only name to empty', () => {
    expect(normalizeMasterName('   ')).toBe('')
    expect(normalizeMasterName('\t\n')).toBe('')
  })
})

describe('isValidMasterName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(isValidMasterName('')).toBe(false)
    expect(isValidMasterName('   ')).toBe(false)
  })

  it('accepts anything with a visible character', () => {
    expect(isValidMasterName('R')).toBe(true)
    expect(isValidMasterName('  Rahul  ')).toBe(true)
  })
})

describe('findDuplicateMaster', () => {
  const existing = [m('Rahul', MASTER_TYPES.PERSON), m('Zomato', MASTER_TYPES.MERCHANT)]

  it('matches case-insensitively within the same type', () => {
    expect(findDuplicateMaster(existing, 'rahul', MASTER_TYPES.PERSON)?.name).toBe('Rahul')
    expect(findDuplicateMaster(existing, 'RAHUL', MASTER_TYPES.PERSON)?.name).toBe('Rahul')
  })

  it('treats surrounding whitespace as the same name', () => {
    expect(findDuplicateMaster(existing, '  Rahul  ', MASTER_TYPES.PERSON)?.name).toBe('Rahul')
  })

  it('allows the same name under a different type', () => {
    expect(findDuplicateMaster(existing, 'Rahul', MASTER_TYPES.MERCHANT)).toBeNull()
    expect(findDuplicateMaster(existing, 'Zomato', MASTER_TYPES.PERSON)).toBeNull()
  })

  it('excludes the row being edited, so a master is never its own duplicate', () => {
    const rahul = existing[0]
    expect(findDuplicateMaster(existing, 'Rahul', MASTER_TYPES.PERSON, rahul.id)).toBeNull()
    // …but a different row with that name still collides.
    expect(findDuplicateMaster(existing, 'Rahul', MASTER_TYPES.PERSON, 'someone-else')?.id).toBe(rahul.id)
  })

  it('never reports a duplicate for an empty name', () => {
    expect(findDuplicateMaster(existing, '   ', MASTER_TYPES.PERSON)).toBeNull()
  })
})

describe('searchMasters', () => {
  const list = [
    m('Rahul', MASTER_TYPES.PERSON, { phone: '9876543210' }),
    m('Zomato', MASTER_TYPES.MERCHANT),
    m('Lulu Hypermarket', MASTER_TYPES.MERCHANT, { phone: '9847000000' }),
  ]

  it('matches on name, case-insensitively', () => {
    expect(searchMasters(list, 'rah').map(x => x.name)).toEqual(['Rahul'])
    expect(searchMasters(list, 'zom').map(x => x.name)).toEqual(['Zomato'])
    expect(searchMasters(list, 'hyper').map(x => x.name)).toEqual(['Lulu Hypermarket'])
  })

  it('matches a person by phone', () => {
    expect(searchMasters(list, '9876').map(x => x.name)).toEqual(['Rahul'])
  })

  it('never matches a merchant by phone, even when it has one', () => {
    expect(searchMasters(list, '9847')).toEqual([])
  })

  it('returns everything for an empty query', () => {
    expect(searchMasters(list, '')).toHaveLength(3)
    expect(searchMasters(list, '   ')).toHaveLength(3)
  })
})

describe('sortMasters', () => {
  it('sorts alphabetically, ignoring case', () => {
    const list = [m('zomato', MASTER_TYPES.MERCHANT), m('Amazon', MASTER_TYPES.MERCHANT), m('lulu', MASTER_TYPES.MERCHANT)]
    expect(sortMasters(list).map(x => x.name)).toEqual(['Amazon', 'lulu', 'zomato'])
  })

  it('does not mutate the input array', () => {
    const list = [m('Zomato', MASTER_TYPES.MERCHANT), m('Amazon', MASTER_TYPES.MERCHANT)]
    sortMasters(list)
    expect(list.map(x => x.name)).toEqual(['Zomato', 'Amazon'])
  })
})

describe('masterInitials', () => {
  it('takes the first letter of a single word', () => {
    expect(masterInitials('Rahul')).toBe('R')
  })

  it('takes the first letter of the first two words', () => {
    expect(masterInitials('Lulu Hypermarket')).toBe('LH')
  })

  it('caps at two characters', () => {
    expect(masterInitials('A B C')).toBe('AB')
  })

  // The next two look alike but exercise different halves of the rule, so a
  // refactor cannot collapse them into one pass without failing here.
  it('skips a symbol that is a whole word', () => {
    expect(masterInitials('@ Rahul')).toBe('R')
  })

  it('strips a symbol that only prefixes a word, keeping the letter behind it', () => {
    expect(masterInitials('#Lulu Mart')).toBe('LM')
  })

  it('counts digits, which are alphanumeric', () => {
    expect(masterInitials('123 Store')).toBe('1S')
  })

  it('returns empty when nothing survives, so the caller can render a fallback', () => {
    expect(masterInitials('@@@')).toBe('')
    expect(masterInitials('   ')).toBe('')
  })
})

describe('duplicateMasterMessage', () => {
  it('names the type and the normalized name', () => {
    expect(duplicateMasterMessage('  Rahul ', MASTER_TYPES.PERSON))
      .toBe('A person named Rahul already exists.')
    expect(duplicateMasterMessage('Zomato', MASTER_TYPES.MERCHANT))
      .toBe('A merchant named Zomato already exists.')
  })
})

// ── Transaction linking (v1.61) ──────────────────────────────────────────────

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  transaction_date: '2026-09-01',
  description: 'Lulu',
  amount: 100,
  transaction_type: 'expense',
  category_id: 'cat-1',
  from_account_id: 'acc-1',
  to_account_id: null,
  notes: null,
  created_at: '2026-09-01',
  ...over,
})

describe('masterById', () => {
  const list = [m('Rahul', MASTER_TYPES.PERSON)]

  it('resolves a known id', () => {
    expect(masterById(list, 'Rahul-person')?.name).toBe('Rahul')
  })

  it('returns null for null/undefined rather than throwing', () => {
    expect(masterById(list, null)).toBeNull()
    expect(masterById(list, undefined)).toBeNull()
  })

  it('returns null for a soft-deleted master, which is NOT loaded into state', () => {
    // The tag survives on the transaction while the master is filtered out by
    // `deleted_at IS NULL`. Callers must render nothing, never "Unknown".
    expect(masterById(list, 'deleted-master-id')).toBeNull()
  })
})

describe('masterTransactions', () => {
  const txns = [
    tx({ id: 'a', master_id: 'lulu', transaction_date: '2026-09-01' }),
    tx({ id: 'b', master_id: 'lulu', transaction_date: '2026-09-05' }),
    tx({ id: 'c', master_id: 'zomato' }),
    tx({ id: 'd' }),
  ]

  it('returns only that master, newest first', () => {
    expect(masterTransactions(txns, 'lulu').map(t => t.id)).toEqual(['b', 'a'])
  })

  it('ignores income rows — a master total is about spending', () => {
    const withIncome = [...txns, tx({ id: 'e', master_id: 'lulu', transaction_type: 'income' })]
    expect(masterTransactions(withIncome, 'lulu').map(t => t.id)).toEqual(['b', 'a'])
  })
})

describe('masterPaid', () => {
  it('sums a single expense', () => {
    expect(masterPaid([tx({ master_id: 'lulu', amount: 250 })], 'lulu')).toBe(250)
  })

  it('returns 0 for an unknown master', () => {
    expect(masterPaid([tx({ master_id: 'lulu', amount: 250 })], 'nobody')).toBe(0)
  })

  it('ignores income rows', () => {
    const txns = [
      tx({ id: 'a', master_id: 'rahul', amount: 250 }),
      tx({ id: 'b', master_id: 'rahul', amount: 900, transaction_type: 'income' }),
    ]
    expect(masterPaid(txns, 'rahul')).toBe(250)
  })

  it('nets a reimbursement against the expense it repays', () => {
    const txns = [
      tx({ id: 'exp', master_id: 'zomato', amount: 500 }),
      tx({ id: 'rec', transaction_type: 'income', amount: 200, reimbursement_for: 'exp' }),
    ]
    expect(masterPaid(txns, 'zomato')).toBe(300)
  })

  // ── The counting invariant ──
  it('sums both legs of a split to the original total, not one leg', () => {
    const legs = [
      tx({ id: 'leg1', master_id: 'lulu', amount: 250, split_group_id: 'g1', category_id: 'food' }),
      tx({ id: 'leg2', master_id: 'lulu', amount: 158, split_group_id: 'g1', category_id: 'drinks' }),
    ]
    expect(masterPaid(legs, 'lulu')).toBe(408)
  })

  it('does NOT de-duplicate legs that share a description and date', () => {
    // The exact shape a future reader might mistake for a double-count and
    // "fix" by de-duplicating — which would silently report 250.
    const legs = [
      tx({ id: 'leg1', master_id: 'lulu', amount: 250, description: 'Lulu', transaction_date: '2026-09-01', split_group_id: 'g1' }),
      tx({ id: 'leg2', master_id: 'lulu', amount: 158, description: 'Lulu', transaction_date: '2026-09-01', split_group_id: 'g1' }),
    ]
    expect(masterPaid(legs, 'lulu')).toBe(408)
  })
})

describe('matchMasterByName', () => {
  const list = [
    m('Zomato', MASTER_TYPES.MERCHANT),
    m('Rahul', MASTER_TYPES.PERSON),
  ]

  it('matches a merchant by exact name', () => {
    expect(matchMasterByName(list, 'Zomato')?.id).toBe('Zomato-merchant')
  })

  it('ignores case and surrounding whitespace, as the AI output varies', () => {
    expect(matchMasterByName(list, '  ZOMATO ')?.id).toBe('Zomato-merchant')
    expect(matchMasterByName(list, 'zomato')?.id).toBe('Zomato-merchant')
  })

  it('falls through to people when no merchant matches', () => {
    expect(matchMasterByName(list, 'rahul')?.id).toBe('Rahul-person')
  })

  it('prefers the merchant when both types share a name', () => {
    const both = [...list, m('Zomato', MASTER_TYPES.PERSON)]
    expect(matchMasterByName(both, 'Zomato')?.type).toBe(MASTER_TYPES.MERCHANT)
  })

  it('returns null rather than guessing on a partial name', () => {
    // "Daya Discount Hyper Pharma" must NOT link to a person called "Daya":
    // a wrong tag attributes spending to the wrong entity, which is worse than
    // no tag at all.
    const withDaya = [...list, m('Daya', MASTER_TYPES.PERSON)]
    expect(matchMasterByName(withDaya, 'Daya Discount Hyper Pharma')).toBeNull()
  })

  it('handles null/undefined/empty input', () => {
    expect(matchMasterByName(list, null)).toBeNull()
    expect(matchMasterByName(list, undefined)).toBeNull()
    expect(matchMasterByName(list, '   ')).toBeNull()
  })
})

describe('isMasterTaggable', () => {
  it('covers exactly the two types that name a counterparty', () => {
    expect(isMasterTaggable('expense')).toBe(true)
    expect(isMasterTaggable('income')).toBe(true)
  })

  it('excludes a transfer — it moves money between accounts you already own', () => {
    expect(isMasterTaggable('transfer')).toBe(false)
  })

  it('covers both sides of a loan — every borrowing row is about one named person', () => {
    expect(isMasterTaggable('borrowing')).toBe(true)
    expect(isMasterTaggable('borrowing_repayment')).toBe(true)
  })

  it('excludes the system types the user never names a counterparty for', () => {
    expect(isMasterTaggable('opening_balance')).toBe(false)
    expect(isMasterTaggable('balance_adjustment')).toBe(false)
    expect(isMasterTaggable('credit_card_payment')).toBe(false)
  })
})

describe('masterActivity', () => {
  it('returns money out AND money in, newest first', () => {
    const txns = [
      tx({ id: 'paid', master_id: 'rahul', transaction_date: '2026-09-01' }),
      tx({ id: 'got', master_id: 'rahul', transaction_date: '2026-09-05', transaction_type: 'income' }),
      tx({ id: 'other', master_id: 'zomato' }),
    ]
    expect(masterActivity(txns, 'rahul').map(t => t.id)).toEqual(['got', 'paid'])
  })

  it('keeps a reimbursement visible even though masterReceived drops it — the money did arrive', () => {
    const txns = [
      tx({ id: 'exp', master_id: 'rahul', amount: 500 }),
      tx({ id: 'rec', master_id: 'rahul', amount: 200, transaction_type: 'income', reimbursement_for: 'exp' }),
    ]
    expect(masterActivity(txns, 'rahul').map(t => t.id).sort()).toEqual(['exp', 'rec'])
  })

  it('excludes a transfer that somehow carries a master', () => {
    const txns = [tx({ id: 't', master_id: 'rahul', transaction_type: 'transfer' })]
    expect(masterActivity(txns, 'rahul')).toEqual([])
  })
})

describe('masterReceived', () => {
  it('sums income tagged to that master', () => {
    const txns = [
      tx({ id: 'a', master_id: 'rahul', amount: 900, transaction_type: 'income' }),
      tx({ id: 'b', master_id: 'rahul', amount: 100, transaction_type: 'income' }),
      tx({ id: 'c', master_id: 'rahul', amount: 250 }),
    ]
    expect(masterReceived(txns, 'rahul')).toBe(1000)
  })

  it('excludes a reimbursement — masterPaid already netted it off the paid side', () => {
    const txns = [
      tx({ id: 'exp', master_id: 'rahul', amount: 500 }),
      tx({ id: 'rec', master_id: 'rahul', amount: 200, transaction_type: 'income', reimbursement_for: 'exp' }),
    ]
    // The ₹200 shows up once, as a smaller bill — never twice.
    expect(masterPaid(txns, 'rahul')).toBe(300)
    expect(masterReceived(txns, 'rahul')).toBe(0)
  })

  it('returns 0 for an unknown master', () => {
    expect(masterReceived([tx({ master_id: 'rahul', transaction_type: 'income', amount: 900 })], 'nobody')).toBe(0)
  })
})

describe('ensurePersonMaster', () => {
  const rahul = m('Rahul', MASTER_TYPES.PERSON)

  it('reuses an existing person, case- and whitespace-insensitively', async () => {
    let calls = 0
    const found = await ensurePersonMaster([rahul], '  rahul  ', async () => { calls++; return undefined })
    expect(found).toBe(rahul)
    expect(calls).toBe(0)
  })

  it('does not reuse a MERCHANT of the same name — uniqueness is per type', async () => {
    const created = m('Rahul', MASTER_TYPES.PERSON)
    const res = await ensurePersonMaster([m('Rahul', MASTER_TYPES.MERCHANT)], 'Rahul', async () => created)
    expect(res).toBe(created)
  })

  it('creates a person from a new name, normalized', async () => {
    let sent: { name: string; type: MasterType } | null = null
    const created = m('Rahul Menon', MASTER_TYPES.PERSON)
    const res = await ensurePersonMaster([], '  Rahul   Menon ', async form => { sent = form; return created })
    expect(sent).toMatchObject({ name: 'Rahul Menon', type: MASTER_TYPES.PERSON })
    expect(res).toBe(created)
  })

  it('ignores an empty name rather than creating a blank person', async () => {
    let calls = 0
    expect(await ensurePersonMaster([], '   ', async () => { calls++; return undefined })).toBeNull()
    expect(calls).toBe(0)
  })

  it('swallows a failure — directory upkeep must never fail the save it rides on', async () => {
    await expect(
      ensurePersonMaster([], 'Rahul', async () => { throw new Error('23505') })
    ).resolves.toBeNull()
  })
})

describe('isMasterInflow', () => {
  it('reads the fixed-direction types off the type alone', () => {
    expect(isMasterInflow(tx({ transaction_type: 'income' }))).toBe(true)
    expect(isMasterInflow(tx({ transaction_type: 'expense' }))).toBe(false)
  })

  // The whole reason this helper exists: 'borrowing' is money out when you lent
  // and money in when you borrowed, so the type cannot decide.
  it('reads a loan off is_credit, not the type', () => {
    expect(isMasterInflow(tx({ transaction_type: 'borrowing', is_credit: true }))).toBe(true)
    expect(isMasterInflow(tx({ transaction_type: 'borrowing', is_credit: false }))).toBe(false)
    expect(isMasterInflow(tx({ transaction_type: 'borrowing_repayment', is_credit: true }))).toBe(true)
    expect(isMasterInflow(tx({ transaction_type: 'borrowing_repayment', is_credit: false }))).toBe(false)
  })

  it('treats a loan with no is_credit as money out rather than guessing', () => {
    expect(isMasterInflow(tx({ transaction_type: 'borrowing' }))).toBe(false)
  })
})

describe('masters across a whole lend-and-repay cycle', () => {
  // You lend Rahul ₹5,000; he repays ₹2,000; you also buy him lunch for ₹300.
  const cycle = [
    tx({ id: 'lent', master_id: 'rahul', amount: 5000, transaction_type: 'borrowing', is_credit: false, transaction_date: '2026-09-01' }),
    tx({ id: 'repaid', master_id: 'rahul', amount: 2000, transaction_type: 'borrowing_repayment', is_credit: true, transaction_date: '2026-09-10' }),
    tx({ id: 'lunch', master_id: 'rahul', amount: 300, transaction_type: 'expense', transaction_date: '2026-09-05' }),
  ]

  it('counts money lent and money spent on the same out side', () => {
    expect(masterPaid(cycle, 'rahul')).toBe(5300)
  })

  it('counts a repayment received as money in', () => {
    expect(masterReceived(cycle, 'rahul')).toBe(2000)
  })

  it('never nets the two — a ₹5,000 loan fully repaid is not ₹0 of activity', () => {
    const settled = [
      tx({ id: 'lent', master_id: 'rahul', amount: 5000, transaction_type: 'borrowing', is_credit: false }),
      tx({ id: 'back', master_id: 'rahul', amount: 5000, transaction_type: 'borrowing_repayment', is_credit: true }),
    ]
    expect(masterPaid(settled, 'rahul')).toBe(5000)
    expect(masterReceived(settled, 'rahul')).toBe(5000)
  })

  it('lists the whole cycle newest first', () => {
    expect(masterActivity(cycle, 'rahul').map(t => t.id)).toEqual(['repaid', 'lunch', 'lent'])
  })

  it('counts money you borrowed as money in, and repaying it as money out', () => {
    const owed = [
      tx({ id: 'got', master_id: 'meera', amount: 4000, transaction_type: 'borrowing', is_credit: true }),
      tx({ id: 'paid', master_id: 'meera', amount: 1000, transaction_type: 'borrowing_repayment', is_credit: false }),
    ]
    expect(masterReceived(owed, 'meera')).toBe(4000)
    expect(masterPaid(owed, 'meera')).toBe(1000)
  })
})
