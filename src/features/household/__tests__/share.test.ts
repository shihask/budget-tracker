import { describe, it, expect } from 'vitest'
import { canShareRecorded, matchHouseholdCategory, shareBlock, sharedNote } from '../lib/share'
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

describe('canShareRecorded', () => {
  const row = { transaction_type: 'expense', reimbursement_for: null, split_group_id: null, pending_sync: false }
  it('offers plain recorded expenses and income', () => {
    expect(canShareRecorded(row)).toBe(true)
    expect(canShareRecorded({ ...row, transaction_type: 'income' })).toBe(true)
  })
  it('never offers transfers, card payments, reimbursements, split legs or unsynced rows', () => {
    expect(canShareRecorded({ ...row, transaction_type: 'transfer' })).toBe(false)
    expect(canShareRecorded({ ...row, transaction_type: 'credit_card_payment' })).toBe(false)
    expect(canShareRecorded({ ...row, transaction_type: 'opening_balance' })).toBe(false)
    expect(canShareRecorded({ ...row, transaction_type: 'income', reimbursement_for: 'x' })).toBe(false)
    expect(canShareRecorded({ ...row, split_group_id: 'g' })).toBe(false)
    expect(canShareRecorded({ ...row, pending_sync: true })).toBe(false)
  })
})
