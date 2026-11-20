import { describe, it, expect } from 'vitest'
import {
  planSweep, stillOrphaned, BATCH_SIZE, BRAKE_MIN_ORPHANS,
} from '../../../supabase/functions/project-attachments-cleanup/plan.ts'

const paths = (n: number) => Array.from({ length: n }, (_, i) => `u/p/${i}.jpg`)

describe('project-attachments sweep plan', () => {
  it('does nothing when there are no orphans', () => {
    expect(planSweep({ bucket_total: 40, orphan_total: 0, paths: [] })).toEqual({ action: 'nothing' })
  })
  it('ignores empty or non-string paths', () => {
    expect(planSweep({ bucket_total: 5, orphan_total: 1, paths: ['', null as unknown as string] })).toEqual({ action: 'nothing' })
  })
  it('batches by 100', () => {
    const plan = planSweep({ bucket_total: 1000, orphan_total: 250, paths: paths(250) })
    expect(plan.action).toBe('sweep')
    if (plan.action !== 'sweep') return
    expect(plan.batches.map(b => b.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 50])
    expect(plan.batches.flat()).toEqual(paths(250))
  })
  it('refuses when orphans are over half the bucket (and above the floor)', () => {
    const plan = planSweep({ bucket_total: 100, orphan_total: 51, paths: paths(51) })
    expect(plan.action).toBe('refuse')
  })
  it('exactly half is allowed', () => {
    expect(planSweep({ bucket_total: 100, orphan_total: 50, paths: paths(50) }).action).toBe('sweep')
  })
  it('the brake never applies to a handful of files', () => {
    const plan = planSweep({ bucket_total: BRAKE_MIN_ORPHANS, orphan_total: BRAKE_MIN_ORPHANS, paths: paths(BRAKE_MIN_ORPHANS) })
    expect(plan.action).toBe('sweep')
  })
  it('the brake judges the whole orphan total, not just this run\'s page', () => {
    // 500 listed this run, but 900 of 1000 files are orphaned overall.
    expect(planSweep({ bucket_total: 1000, orphan_total: 900, paths: paths(500) }).action).toBe('refuse')
  })
  it('allowLarge overrides the brake', () => {
    expect(planSweep({ bucket_total: 100, orphan_total: 90, paths: paths(90) }, true).action).toBe('sweep')
  })
  it('re-check drops paths a row now points to', () => {
    expect(stillOrphaned(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
    expect(stillOrphaned(['a'], [])).toEqual(['a'])
    expect(stillOrphaned(['a', 'b'], ['a', 'b'])).toEqual([])
  })
})
