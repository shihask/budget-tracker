import { describe, it, expect } from 'vitest'
import { parseOpenScreen } from '@/lib/open-screen'

describe('parseOpenScreen', () => {
  it('reads a known screen from a relative push url', () => {
    expect(parseOpenScreen('/?open=commitments')).toBe('commitments')
    expect(parseOpenScreen('/?open=analytics-weeks')).toBe('analytics-weeks')
  })

  it('reads it from a full url with other params', () => {
    expect(parseOpenScreen('https://moneyplant.online/?utm_campaign=x&open=reflection')).toBe('reflection')
  })

  it('returns null for the plain dashboard url, an unknown key or nothing', () => {
    expect(parseOpenScreen('/')).toBeNull()
    expect(parseOpenScreen('/?open=something-new')).toBeNull()
    expect(parseOpenScreen(undefined)).toBeNull()
  })
})
