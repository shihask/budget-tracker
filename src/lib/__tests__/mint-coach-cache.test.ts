import { describe, it, expect, beforeEach } from 'vitest'
import { loadCachedCoach, loadPreviousDaySummary, saveCachedCoach, COACH_CACHE_VERSION } from '@/lib/mint-coach-cache'

// ─── In-memory localStorage polyfill (vitest's default 'node' env has no window/localStorage) ──
// Same pattern as challenge-freeze.qa.test.ts, which covers challenge-snapshot.ts — the file
// this cache module's dateStr+fingerprint convention mirrors.
function makeMemoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
  }
}
type MemoryStorage = ReturnType<typeof makeMemoryStorage>
const g = globalThis as unknown as { localStorage: MemoryStorage }
g.localStorage = makeMemoryStorage()

const USER = 'user-1'

beforeEach(() => {
  g.localStorage.clear()
})

describe('mint-coach-cache', () => {
  it('loadCachedCoach returns null when nothing has been saved', () => {
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-1')).toBeNull()
  })

  it('round-trips a save/load with matching dateStr and fingerprint', () => {
    saveCachedCoach(USER, '2026-08-06', 'fp-1', 'Todays coaching text.')
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-1')).toBe('Todays coaching text.')
  })

  it('misses when the fingerprint differs, even on the same day', () => {
    saveCachedCoach(USER, '2026-08-06', 'fp-1', 'Morning text.')
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-2')).toBeNull()
  })

  it('misses when the dateStr differs, even with the same fingerprint', () => {
    saveCachedCoach(USER, '2026-08-06', 'fp-1', 'Yesterdays text.')
    expect(loadCachedCoach(USER, '2026-08-07', 'fp-1')).toBeNull()
  })

  it('is scoped per user — one user cannot read another user\'s cached coach text', () => {
    saveCachedCoach('user-a', '2026-08-06', 'fp-1', 'A\'s text.')
    expect(loadCachedCoach('user-b', '2026-08-06', 'fp-1')).toBeNull()
  })

  it('a later save for a new fingerprint overwrites the earlier same-day entry', () => {
    saveCachedCoach(USER, '2026-08-06', 'fp-1', 'Morning text.')
    saveCachedCoach(USER, '2026-08-06', 'fp-2', 'Evening text.')
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-1')).toBeNull()
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-2')).toBe('Evening text.')
  })

  it('degrades to null on malformed JSON instead of throwing', () => {
    g.localStorage.setItem(`mp_mint_coach_${USER}`, '{not valid json')
    expect(() => loadCachedCoach(USER, '2026-08-06', 'fp-1')).not.toThrow()
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-1')).toBeNull()
  })

  it('degrades to null on a version mismatch', () => {
    g.localStorage.setItem(`mp_mint_coach_${USER}`, JSON.stringify({
      version: COACH_CACHE_VERSION + 1, dateStr: '2026-08-06', fingerprint: 'fp-1', text: 'stale shape',
    }))
    expect(loadCachedCoach(USER, '2026-08-06', 'fp-1')).toBeNull()
  })

  it('degrades gracefully when localStorage itself throws (quota exceeded, private mode, etc.)', () => {
    const throwing: MemoryStorage = {
      getItem: () => { throw new Error('quota exceeded') },
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => {},
      clear: () => {},
    }
    const original = g.localStorage
    g.localStorage = throwing
    try {
      expect(() => saveCachedCoach(USER, '2026-08-06', 'fp-1', 'text')).not.toThrow()
      expect(() => loadCachedCoach(USER, '2026-08-06', 'fp-1')).not.toThrow()
      expect(loadCachedCoach(USER, '2026-08-06', 'fp-1')).toBeNull()
    } finally {
      g.localStorage = original
    }
  })

  describe('loadPreviousDaySummary', () => {
    it('returns null when nothing has been saved', () => {
      expect(loadPreviousDaySummary(USER, '2026-08-06')).toBeNull()
    })

    it('returns the cached text when its dateStr is strictly before today', () => {
      saveCachedCoach(USER, '2026-08-05', 'fp-1', 'Yesterdays note.')
      expect(loadPreviousDaySummary(USER, '2026-08-06')).toBe('Yesterdays note.')
    })

    it('returns null when the cached entry is from today (not yet "previous")', () => {
      saveCachedCoach(USER, '2026-08-06', 'fp-1', 'Todays note.')
      expect(loadPreviousDaySummary(USER, '2026-08-06')).toBeNull()
    })

    it('finds the last real entry across a multi-day gap (app not opened for a few days)', () => {
      saveCachedCoach(USER, '2026-08-01', 'fp-1', 'Five days ago note.')
      expect(loadPreviousDaySummary(USER, '2026-08-06')).toBe('Five days ago note.')
    })

    it('ignores fingerprint entirely — ordering by date is all that matters here', () => {
      saveCachedCoach(USER, '2026-08-05', 'fp-anything', 'Yesterdays note.')
      expect(loadPreviousDaySummary(USER, '2026-08-06')).toBe('Yesterdays note.')
    })
  })
})
