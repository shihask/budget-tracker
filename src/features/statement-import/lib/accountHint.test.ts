import { describe, it, expect } from 'vitest'
import { resolveImportedAccountHint, type AccountHint } from './accountHint'
import type { Account } from '@/types'

function account(overrides: Partial<Account> = {}): Pick<Account, 'id' | 'name' | 'type'> {
  return { id: 'a1', name: 'Axis Savings', type: 'bank', ...overrides }
}

function hint(overrides: Partial<AccountHint> = {}): AccountHint {
  return { raw: 'Axis XX87', bank_name: 'Axis', masked_number: 'XX87', ...overrides }
}

describe('resolveImportedAccountHint', () => {
  it('matches on bank name + masked suffix together', () => {
    const candidates = [account({ id: 'a1', name: 'Axis Savings ···87' }), account({ id: 'a2', name: 'Federal Bank' })]
    const result = resolveImportedAccountHint(hint(), candidates)
    expect(result?.accountId).toBe('a1')
    expect(result?.reason).toContain('bank name')
    expect(result?.reason).toContain('masked suffix')
  })

  it('matches on masked suffix alone when bank name is missing', () => {
    const candidates = [account({ id: 'a1', name: 'My Salary Account 87' })]
    const result = resolveImportedAccountHint(hint({ bank_name: null }), candidates)
    expect(result?.accountId).toBe('a1')
  })

  it('matches on bank name alone when masked number is missing', () => {
    const candidates = [account({ id: 'a1', name: 'Axis Current Account' })]
    const result = resolveImportedAccountHint(hint({ masked_number: null }), candidates)
    expect(result?.accountId).toBe('a1')
  })

  it('returns null when nothing matches', () => {
    const candidates = [account({ id: 'a1', name: 'Federal Bank' }), account({ id: 'a2', name: 'HDFC Bank' })]
    expect(resolveImportedAccountHint(hint(), candidates)).toBeNull()
  })

  it('returns null on an ambiguous tie between two equally-scored candidates', () => {
    const candidates = [account({ id: 'a1', name: 'Axis Savings' }), account({ id: 'a2', name: 'Axis Current' })]
    // Only bank name matches both equally (suffix "87" appears in neither) — a tie, don't guess.
    expect(resolveImportedAccountHint(hint(), candidates)).toBeNull()
  })

  it('prefers the candidate matching both signals over one matching only one', () => {
    const candidates = [account({ id: 'a1', name: 'Axis Current' }), account({ id: 'a2', name: 'Axis Savings ···87' })]
    const result = resolveImportedAccountHint(hint(), candidates)
    expect(result?.accountId).toBe('a2')
  })

  it('ignores non-bank accounts (credit cards, cash, wallet)', () => {
    const candidates = [account({ id: 'a1', name: 'Axis Savings ···87', type: 'credit_card' })]
    expect(resolveImportedAccountHint(hint(), candidates)).toBeNull()
  })

  it('returns null when there is no hint at all', () => {
    expect(resolveImportedAccountHint(null, [account()])).toBeNull()
  })

  it('returns null when the hint has no usable signal', () => {
    expect(resolveImportedAccountHint({ raw: 'something', bank_name: null, masked_number: null }, [account()])).toBeNull()
  })

  it('returns null against an empty candidate list', () => {
    expect(resolveImportedAccountHint(hint(), [])).toBeNull()
  })
})
