import { describe, it, expect } from 'vitest'
import {
  normalizeMasterName,
  isValidMasterName,
  findDuplicateMaster,
  searchMasters,
  sortMasters,
  masterInitials,
  duplicateMasterMessage,
} from '@/lib/masters'
import { MASTER_TYPES } from '@/types'
import type { Master, MasterType } from '@/types'

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
