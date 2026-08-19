import { describe, it, expect } from 'vitest'
import { usageTone } from './aiUsage'

describe('usageTone', () => {
  it('is quiet below 70%', () => {
    for (const pct of [0, 23, 69]) {
      expect(usageTone(pct, false)).toEqual({ tone: 'normal', message: '' })
    }
  })

  it('warns visually but silently from 70 to 89', () => {
    for (const pct of [70, 89]) {
      expect(usageTone(pct, false)).toEqual({ tone: 'warn', message: '' })
    }
  })

  it('adds copy from 90 to 99', () => {
    for (const pct of [90, 99]) {
      const { tone, message } = usageTone(pct, false)
      expect(tone).toBe('warn')
      expect(message).toBe("You've used most of today's recommended AI usage.")
    }
  })

  // The whole point of the measuring phase: the token budget does not block
  // yet, so 100% must not claim Mint has stopped when it plainly hasn't.
  it('at 100% while measuring, says Mint keeps working', () => {
    const { tone, message } = usageTone(100, false)
    expect(tone).toBe('full')
    expect(message).toBe("You've reached today's recommended AI usage. Mint will continue working.")
  })

  it('at 100% while enforcing, says the limit is reached', () => {
    const { tone, message } = usageTone(100, true)
    expect(tone).toBe('full')
    expect(message).toBe("Mint's daily AI limit has been reached. Your AI usage resets tomorrow.")
  })

  // Only the 100% copy is phase-dependent — below that the two phases are
  // indistinguishable to the user, which is what lets enforcement be switched
  // on without any UI change.
  it('is identical in both phases below 100%', () => {
    for (const pct of [0, 69, 70, 89, 90, 99]) {
      expect(usageTone(pct, false)).toEqual(usageTone(pct, true))
    }
  })

  it('treats anything above 100 as full (server clamps, but do not rely on it)', () => {
    expect(usageTone(140, false).tone).toBe('full')
  })
})
