import { describe, expect, it } from 'vitest'
import { isGuest, isLaterDay } from './guest'

describe('isGuest', () => {
  it('is true only for an anonymous user', () => {
    expect(isGuest({ is_anonymous: true })).toBe(true)
  })

  it('is false for a permanent user, a missing flag or no user', () => {
    expect(isGuest({ is_anonymous: false })).toBe(false)
    expect(isGuest({ is_anonymous: undefined })).toBe(false)
    expect(isGuest({})).toBe(false)
    expect(isGuest(null)).toBe(false)
    expect(isGuest(undefined)).toBe(false)
  })
})

describe('isLaterDay', () => {
  it('is true only for a valid earlier local date', () => {
    expect(isLaterDay('2026-10-15', '2026-10-16')).toBe(true)
    expect(isLaterDay('2026-10-16', '2026-10-16')).toBe(false)
    expect(isLaterDay(null, '2026-10-16')).toBe(false)
    expect(isLaterDay('garbage', '2026-10-16')).toBe(false)
  })
})
