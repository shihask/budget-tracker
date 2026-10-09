import { describe, it, expect } from 'vitest'
import { createActivationWatcher } from './funnel'

/** Feeds (loading, expenseCount) pairs in order; returns how many times it fired. */
function run(steps: Array<[boolean, number]>) {
  const w = createActivationWatcher()
  return steps.filter(([loading, n]) => w.observe(loading, n)).length
}

describe('createActivationWatcher', () => {
  it('fires once for a new user: load finishes with 0 expenses, then one is added', () => {
    expect(run([[true, 0], [false, 0], [false, 1]])).toBe(1)
  })

  it('never fires for an existing user whose history loads', () => {
    expect(run([[true, 0], [false, 200], [false, 201], [true, 201], [false, 202]])).toBe(0)
  })

  it('does not fire again after later adds or refetches', () => {
    expect(run([[true, 0], [false, 0], [false, 1], [false, 2], [true, 2], [false, 2], [false, 3]])).toBe(1)
  })

  it('does not double-fire on repeated identical observations (StrictMode re-runs)', () => {
    expect(run([[true, 0], [true, 0], [false, 0], [false, 0], [false, 1], [false, 1]])).toBe(1)
  })

  it('does not arm on a 0 it never saw loaded', () => {
    expect(run([[false, 0], [false, 1]])).toBe(0)
  })

  it('stays armed through a refetch that still has no expenses', () => {
    expect(run([[true, 0], [false, 0], [true, 0], [false, 0], [false, 1]])).toBe(1)
  })
})
