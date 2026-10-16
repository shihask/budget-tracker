import { describe, expect, it } from 'vitest'
import { isGuest } from './guest'

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
