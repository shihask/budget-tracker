import { describe, it, expect } from 'vitest'
import { matchHouseholdCategory, shareBlock, sharedNote } from '../lib/share'
import type { HouseholdCategory } from '../types'

const cat = (id: string, name: string, kind: 'expense' | 'income', is_archived = false): HouseholdCategory =>
  ({ id, household_id: 'h', name, kind, icon: 'tag', is_archived })

const CATS = [
  cat('g', 'Groceries', 'expense'),
  cat('s', 'Salary', 'income'),
  cat('old', 'Pet Care', 'expense', true),
  cat('gi', 'Groceries', 'income'),
]

describe('shareBlock', () => {
  const base = { txType: 'expense', reimbursing: false, split: false, offline: false }
  it('allows plain expenses and income', () => {
    expect(shareBlock(base)).toBeNull()
    expect(shareBlock({ ...base, txType: 'income' })).toBeNull()
  })
  it('blocks transfers, reimbursements, splits and offline', () => {
    expect(shareBlock({ ...base, txType: 'transfer' })).toBe('type')
    expect(shareBlock({ ...base, txType: 'credit_card_payment' })).toBe('type')
    expect(shareBlock({ ...base, txType: 'income', reimbursing: true })).toBe('reimbursement')
    expect(shareBlock({ ...base, split: true })).toBe('split')
    expect(shareBlock({ ...base, offline: true })).toBe('offline')
  })
})

describe('matchHouseholdCategory', () => {
  it('matches by name, ignoring case and spaces, within the same kind', () => {
    expect(matchHouseholdCategory(' groceries ', 'expense', CATS)).toBe('g')
    expect(matchHouseholdCategory('Groceries', 'income', CATS)).toBe('gi')
    expect(matchHouseholdCategory('Salary', 'income', CATS)).toBe('s')
  })
  it('never guesses: no match, wrong kind, archived or no name → null', () => {
    expect(matchHouseholdCategory('Tea & Snacks', 'expense', CATS)).toBeNull()
    expect(matchHouseholdCategory('Salary', 'expense', CATS)).toBeNull()
    expect(matchHouseholdCategory('Pet Care', 'expense', CATS)).toBeNull()
    expect(matchHouseholdCategory(null, 'expense', CATS)).toBeNull()
    expect(matchHouseholdCategory('', 'expense', CATS)).toBeNull()
  })
})

describe('sharedNote', () => {
  it('is trimmed and capped at 120 characters, like the database', () => {
    expect(sharedNote('  Big Basket  ')).toBe('Big Basket')
    expect(sharedNote('x'.repeat(150))).toHaveLength(120)
  })
})
