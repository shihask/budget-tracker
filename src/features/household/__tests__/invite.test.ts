import { describe, it, expect } from 'vitest'
import {
  PENDING_INVITE_KEY, PENDING_INVITE_TTL_MS, buildInviteLink, clearPendingInvite, isInviteToken,
  parseInviteHash, pendingInviteFragment, readPendingInvite, savePendingInvite,
} from '../lib/invite'
import { householdErrorMessage } from '../lib/errors'

const TOKEN = 'Ab3_-'.repeat(8) + 'xyz'   // 43 base64url chars

function memoryStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    raw: m,
  }
}

describe('invite tokens', () => {
  it('accepts only 43 base64url characters', () => {
    expect(TOKEN).toHaveLength(43)
    expect(isInviteToken(TOKEN)).toBe(true)
    for (const bad of [TOKEN.slice(1), TOKEN + 'a', TOKEN.replace('A', '+'), TOKEN.replace('A', '='), '', null, 42]) {
      expect(isInviteToken(bad)).toBe(false)
    }
  })

  it('puts the token in the fragment, never the query string', () => {
    const link = buildInviteLink('https://moneyplant.online', TOKEN)
    expect(link).toBe(`https://moneyplant.online/#household_invite=${TOKEN}`)
    expect(new URL(link).search).toBe('')
  })

  it('parses only an exact, well-formed fragment', () => {
    expect(parseInviteHash(`#household_invite=${TOKEN}`)).toBe(TOKEN)
    expect(parseInviteHash(`#household_invite=${TOKEN}&x=1`)).toBeNull()
    expect(parseInviteHash(`#household_invite=short`)).toBeNull()
    expect(parseInviteHash(`#access_token=${TOKEN}`)).toBeNull()
    expect(parseInviteHash('')).toBeNull()
  })
})

describe('pending invite storage', () => {
  it('round-trips a token, then clears it', () => {
    const s = memoryStore()
    savePendingInvite(TOKEN, 1000, s)
    expect(readPendingInvite(2000, s)).toBe(TOKEN)
    clearPendingInvite(s)
    expect(readPendingInvite(2000, s)).toBeNull()
  })

  it('drops an entry older than the TTL', () => {
    const s = memoryStore()
    savePendingInvite(TOKEN, 0, s)
    expect(readPendingInvite(PENDING_INVITE_TTL_MS - 1, s)).toBe(TOKEN)
    expect(readPendingInvite(PENDING_INVITE_TTL_MS, s)).toBeNull()
    expect(s.raw.has(PENDING_INVITE_KEY)).toBe(false)
  })

  it('removes malformed entries and never stores a malformed token', () => {
    const s = memoryStore()
    s.setItem(PENDING_INVITE_KEY, 'not json')
    expect(readPendingInvite(0, s)).toBeNull()
    expect(s.raw.has(PENDING_INVITE_KEY)).toBe(false)
    s.setItem(PENDING_INVITE_KEY, JSON.stringify({ token: 'short', savedAt: 0 }))
    expect(readPendingInvite(0, s)).toBeNull()
    savePendingInvite('short', 0, s)
    expect(s.raw.has(PENDING_INVITE_KEY)).toBe(false)
  })

  it('treats a savedAt in the future (clock change) as invalid', () => {
    const s = memoryStore()
    savePendingInvite(TOKEN, 10_000, s)
    expect(readPendingInvite(0, s)).toBeNull()
  })

  it('rebuilds the fragment for handing the page to another browser', () => {
    const s = memoryStore()
    expect(pendingInviteFragment(0, s)).toBe('')
    savePendingInvite(TOKEN, 0, s)
    expect(pendingInviteFragment(1, s)).toBe(`#household_invite=${TOKEN}`)
    expect(parseInviteHash(pendingInviteFragment(1, s))).toBe(TOKEN)
  })

  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(() => savePendingInvite(TOKEN, 0, blocked)).not.toThrow()
    expect(readPendingInvite(0, blocked)).toBeNull()
    expect(() => clearPendingInvite(blocked)).not.toThrow()
  })
})

describe('error messages', () => {
  it('shows the server message for PTxxx, a generic line otherwise, and never the request', () => {
    expect(householdErrorMessage({ code: 'PT422', message: 'This invite link is no longer valid. Ask for a new one.' }))
      .toBe('This invite link is no longer valid. Ask for a new one.')
    expect(householdErrorMessage({ code: 'PT403', message: 'guest_not_allowed' })).toBe('Save your account to use Household.')
    expect(householdErrorMessage({ code: '23503', message: `insert ... ${TOKEN}` })).not.toContain(TOKEN)
    expect(householdErrorMessage({ code: 'XX000', message: `boom ${TOKEN}` })).not.toContain(TOKEN)
    expect(householdErrorMessage(new TypeError('Failed to fetch'))).toMatch(/connection/)
  })
})
