import { describe, it, expect } from 'vitest'
import { cycleMonthName, isFirstReview, emptyReflection } from '../lib/kakeibo'
import { introSeen, markIntroSeen } from '../lib/intro'
import { PILLARS, PILLAR_PLAIN, PILLAR_EXAMPLES, PILLAR_HINT } from '../lib/pillars'

const rec = (start: string, end: string | null, status: 'completed' | 'skipped' | null = null) =>
  ({ ...emptyReflection(start), cycle_end: end, review_status: status })

describe('cycleMonthName — the month a salary cycle is about', () => {
  it('names the month of the midpoint', () => {
    expect(cycleMonthName(rec('2026-10-01', '2026-10-31'))).toBe('October')
    expect(cycleMonthName(rec('2026-09-28', '2026-10-27'))).toBe('October')
    expect(cycleMonthName(rec('2026-09-03', '2026-10-02'))).toBe('September')
  })
})

describe('isFirstReview', () => {
  it('is true until any review is completed or skipped', () => {
    expect(isFirstReview([rec('2026-09-01', '2026-09-30'), rec('2026-10-01', null)])).toBe(true)
    expect(isFirstReview([rec('2026-09-01', '2026-09-30', 'skipped')])).toBe(false)
    expect(isFirstReview([rec('2026-09-01', '2026-09-30', 'completed')])).toBe(false)
  })
})

describe('intro seen flag', () => {
  it('counts as seen when storage is unavailable, so the intro never loops', () => {
    // vitest runs in node: no localStorage, so both helpers take their fallback.
    expect(() => markIntroSeen('u1')).not.toThrow()
    expect(introSeen('u1')).toBe(true)
  })
})

describe('pillar plain language', () => {
  it('every pillar has a plain meaning and examples, joined into the hint', () => {
    for (const p of PILLARS) {
      expect(PILLAR_PLAIN[p].length).toBeGreaterThan(0)
      expect(PILLAR_EXAMPLES[p].length).toBeGreaterThan(0)
      expect(PILLAR_HINT[p].startsWith(PILLAR_PLAIN[p])).toBe(true)
    }
  })
})
