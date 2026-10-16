import { describe, it, expect } from 'vitest'
import type { KakeiboReflection } from '@/types'
import { bellItems, dashboardActions, emptyReflection, monthCycle, monthBounds, nextReviewState } from '../lib/kakeibo'

const at = (y: number, m: number, d: number) => new Date(y, m, d, 12)
const month = (start: string, o: Partial<KakeiboReflection> = {}): KakeiboReflection =>
  ({ ...emptyReflection(start, `m-${start}`), cycle_kind: 'month', cycle_end: monthBounds(start).end, ...o })
const salary = (start: string, o: Partial<KakeiboReflection> = {}): KakeiboReflection =>
  ({ ...emptyReflection(start, `s-${start}`), cycle_kind: 'salary', ...o })

const bellOn = (rows: KakeiboReflection[], d: number) => bellItems(rows, monthCycle(at(2026, 10, d)), at(2026, 10, d), 'month')

describe('Kakeibo bell items', () => {
  const rows = [month('2026-10-01'), month('2026-11-01')]

  it('payday: one review item and one goal item, with stable unique ids', () => {
    const items = bellOn(rows, 1)
    expect(items.map(i => [i.type, i.id, i.month])).toEqual([
      ['review', 'kakeibo:review:month:2026-10-01', 'October'],
      ['goal', 'kakeibo:goal:month:2026-11-01', 'November'],
    ])
    expect(bellOn(rows, 1).map(i => i.id)).toEqual(items.map(i => i.id)) // deterministic → no duplicates
  })

  it('the review item outlives the dashboard row: still there on day 25', () => {
    expect(dashboardActions(rows, monthCycle(at(2026, 10, 25)), at(2026, 10, 25), 'month').review).toBeNull()
    expect(bellOn(rows, 25).map(i => i.type)).toEqual(['review'])
  })

  it('"Not now" hides the dashboard row but NOT the bell item', () => {
    const dismissed = [month('2026-10-01', { review_reminder_dismissed_at: 'x' }), month('2026-11-01')]
    expect(dashboardActions(dismissed, monthCycle(at(2026, 10, 2)), at(2026, 10, 2), 'month').review).toBeNull()
    expect(bellOn(dismissed, 2).some(i => i.type === 'review')).toBe(true)
  })

  it('completing or explicitly skipping the review removes it', () => {
    for (const action of [{ kind: 'save', note: 'Cook more' }, { kind: 'skip' }] as const) {
      const prev = month('2026-10-01')
      const done = [{ ...prev, ...nextReviewState(prev, action, 'now') }, month('2026-11-01')]
      expect(bellOn(done, 2).some(i => i.type === 'review')).toBe(false)
    }
  })

  it('the goal item follows the 7-day window and leaves once the goal is set or skipped', () => {
    expect(bellOn(rows, 7).some(i => i.type === 'goal')).toBe(true)
    expect(bellOn(rows, 8).some(i => i.type === 'goal')).toBe(false)
    const decided = [month('2026-10-01', { review_status: 'completed' }), month('2026-11-01', { goal_decided_at: 'x' })]
    expect(bellOn(decided, 2)).toEqual([])
  })

  it('no review item for a month Kakeibo never saw', () => {
    expect(bellOn([month('2026-11-01')], 1).map(i => i.type)).toEqual(['goal'])
  })

  it('salary cycles: the goal item is named after the month the cycle is mostly in', () => {
    const rowsS = [salary('2026-09-28', { cycle_end: '2026-10-27' }), salary('2026-10-28')]
    const cycle = { cycleStart: new Date(2026, 9, 28), cycleEnd: new Date(2026, 10, 27) }
    const items = bellItems(rowsS, cycle, at(2026, 9, 29), 'salary')
    expect(items.map(i => [i.type, i.month, i.id])).toEqual([
      ['review', 'October', 'kakeibo:review:salary:2026-09-28'],
      ['goal', 'November', 'kakeibo:goal:salary:2026-10-28'],
    ])
  })
})
