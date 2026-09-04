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
  masterSpent,
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

describe('masterSpent', () => {
  it('sums a single expense', () => {
    expect(masterSpent([tx({ master_id: 'lulu', amount: 250 })], 'lulu')).toBe(250)
  })

  it('returns 0 for an unknown master', () => {
    expect(masterSpent([tx({ master_id: 'lulu', amount: 250 })], 'nobody')).toBe(0)
  })

  it('ignores income rows', () => {
    const txns = [
      tx({ id: 'a', master_id: 'rahul', amount: 250 }),
      tx({ id: 'b', master_id: 'rahul', amount: 900, transaction_type: 'income' }),
    ]
    expect(masterSpent(txns, 'rahul')).toBe(250)
  })

  it('nets a reimbursement against the expense it repays', () => {
    const txns = [
      tx({ id: 'exp', master_id: 'zomato', amount: 500 }),
      tx({ id: 'rec', transaction_type: 'income', amount: 200, reimbursement_for: 'exp' }),
    ]
    expect(masterSpent(txns, 'zomato')).toBe(300)
  })

  // ── The counting invariant ──
  it('sums both legs of a split to the original total, not one leg', () => {
    const legs = [
      tx({ id: 'leg1', master_id: 'lulu', amount: 250, split_group_id: 'g1', category_id: 'food' }),
      tx({ id: 'leg2', master_id: 'lulu', amount: 158, split_group_id: 'g1', category_id: 'drinks' }),
    ]
    expect(masterSpent(legs, 'lulu')).toBe(408)
  })

  it('does NOT de-duplicate legs that share a description and date', () => {
    // The exact shape a future reader might mistake for a double-count and
    // "fix" by de-duplicating — which would silently report 250.
    const legs = [
      tx({ id: 'leg1', master_id: 'lulu', amount: 250, description: 'Lulu', transaction_date: '2026-09-01', split_group_id: 'g1' }),
      tx({ id: 'leg2', master_id: 'lulu', amount: 158, description: 'Lulu', transaction_date: '2026-09-01', split_group_id: 'g1' }),
    ]
    expect(masterSpent(legs, 'lulu')).toBe(408)
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
