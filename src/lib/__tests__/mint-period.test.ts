import { describe, it, expect } from 'vitest'
import { parsePeriod } from '@/lib/mintActions/period'
import { classifyExportIntent } from '@/lib/mintActions/exportIntent'
import type { AppState, DerivedMetrics } from '@/types'

const NOW = new Date(2026, 8, 30, 23, 45)  // 30 Sep 2026, late evening local

describe('parsePeriod', () => {
  it('returns null when no period is named', () => {
    expect(parsePeriod('find plumber', null, NOW)).toBeNull()
  })

  it.each([
    ['today', '2026-09-30', '2026-09-30'],
    ['yesterday', '2026-09-29', '2026-09-29'],
    ['this week', '2026-09-28', '2026-09-30'],
    ['last week', '2026-09-21', '2026-09-27'],
    ['this month', '2026-09-01', '2026-09-30'],
    ['last month', '2026-08-01', '2026-08-31'],
    ['august', '2026-08-01', '2026-08-31'],
    ['december', '2025-12-01', '2025-12-31'],
    ['march 2024', '2024-03-01', '2024-03-31'],
    ['12 august', '2026-08-12', '2026-08-12'],
    ['august 5th', '2026-08-05', '2026-08-05'],
    ['2025', '2025-01-01', '2025-12-31'],
    ['2026', '2026-01-01', '2026-09-30'],
  ])('"%s" → %s … %s (local days)', (q, from, to) => {
    const p = parsePeriod(q, null, NOW)!
    expect(p.dateFrom).toBe(from)
    expect(p.dateTo).toBe(to)
  })

  it('last month across a year boundary', () => {
    const p = parsePeriod('last month', null, new Date(2026, 0, 10))!
    expect([p.dateFrom, p.dateTo]).toEqual(['2025-12-01', '2025-12-31'])
  })

  it('never reads a future year or money as a year', () => {
    expect(parsePeriod('2031', null, NOW)).toBeNull()
    expect(parsePeriod('₹2025', null, NOW)).toBeNull()
    expect(parsePeriod('rs 2025', null, NOW)).toBeNull()
  })

  it('salary cycle uses the cycle start as a local date', () => {
    const p = parsePeriod('this cycle', new Date(2026, 8, 1), NOW)!
    expect([p.dateFrom, p.dateTo]).toEqual(['2026-09-01', '2026-09-30'])
  })
})

describe('classifyExportIntent period', () => {
  const state = { categories: [], transactions: [] } as unknown as AppState
  const noCycle = {} as DerivedMetrics

  it('"export august" starts on Aug 1, not Jul 31', () => {
    const a = classifyExportIntent('export august', state, noCycle, NOW)!
    expect(a.filters.dateFrom).toBe('2026-08-01')
    expect(a.filters.dateTo).toBe('2026-08-31')
  })

  it('no period → the salary cycle, else this month', () => {
    const withCycle = classifyExportIntent('export', state, { financialCycle: { cycleStart: new Date(2026, 8, 5) } } as unknown as DerivedMetrics, NOW)!
    expect(withCycle.filters.dateFrom).toBe('2026-09-05')
    expect(withCycle.periodLabel).toMatch(/^Salary Cycle/)
    const monthly = classifyExportIntent('export', state, noCycle, NOW)!
    expect(monthly.filters.dateFrom).toBe('2026-09-01')
  })
})
