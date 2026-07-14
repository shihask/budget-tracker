import { describe, it, expect } from 'vitest'
import { suggestAccountLink, defaultAccountName } from './accountLinking'
import type { Account } from '@/types'

// maskedAccNumber values below ("...af56", "...0b03") are the real strings
// captured live from Setu sandbox in Phase 0 — see
// scripts/aa-discovery-spike/samples/rd-session.json /
// fi-data-b424274b-manual.json — not made-up fixtures.

function account(overrides: Partial<Account> = {}): Pick<Account, 'id' | 'name' | 'type'> {
  return { id: 'acc1', name: 'HDFC Bank', type: 'bank', ...overrides }
}

describe('suggestAccountLink', () => {
  it('suggests a bank account whose name contains the masked suffix', () => {
    const suggestion = suggestAccountLink('XXXXXXXXXXXXXXXXaf56', [account({ name: 'HDFC Bank af56' })])
    expect(suggestion?.accountId).toBe('acc1')
  })

  it('is case-insensitive and ignores whitespace in the account name', () => {
    const suggestion = suggestAccountLink('XXXXXXXXXXXXXXXX0b03', [account({ name: 'SBI  0B03  Savings' })])
    expect(suggestion?.accountId).toBe('acc1')
  })

  it('returns null when no account name contains the suffix', () => {
    const suggestion = suggestAccountLink('XXXXXXXXXXXXXXXXaf56', [account({ name: 'HDFC Bank' })])
    expect(suggestion).toBeNull()
  })

  it('excludes non-bank accounts even if the name matches (hard type filter)', () => {
    const suggestion = suggestAccountLink('XXXXXXXXXXXXXXXXaf56', [account({ name: 'Wallet af56', type: 'wallet' })])
    expect(suggestion).toBeNull()
  })

  it('returns null when the masked number has no real suffix', () => {
    const suggestion = suggestAccountLink('XXXXXXXXXXXXXXXXXXXX', [account({ name: 'HDFC Bank' })])
    expect(suggestion).toBeNull()
  })
})

describe('defaultAccountName', () => {
  it('includes the masked suffix so a future reconnect can match against it', () => {
    expect(defaultAccountName('XXXXXXXXXXXXXXXX0b03')).toBe('Bank account ···0b03')
  })

  it('falls back to a plain name when there is no real suffix', () => {
    expect(defaultAccountName('XXXXXXXXXXXXXXXXXXXX')).toBe('Bank account')
  })
})
