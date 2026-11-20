// Pure decisions for the project-attachments sweep — no Deno or network imports, so the app's
// vitest suite can test them (src/lib/__tests__/projectAttachmentCleanup.test.ts).

export const BATCH_SIZE = 100
/** Below this many orphans the large-sweep brake never applies (a tiny bucket is mostly noise). */
export const BRAKE_MIN_ORPHANS = 20
/** Refuse when orphans exceed this share of the whole bucket: likely a path-matching bug, not cleanup. */
export const BRAKE_MAX_SHARE = 0.5

export interface OrphanReport {
  bucket_total: number
  orphan_total: number
  paths: string[]
}

export type SweepPlan =
  | { action: 'nothing' }
  | { action: 'refuse'; reason: string }
  | { action: 'sweep'; batches: string[][] }

export function planSweep(report: OrphanReport, allowLarge = false): SweepPlan {
  const paths = report.paths.filter(p => typeof p === 'string' && p.length > 0)
  if (paths.length === 0) return { action: 'nothing' }
  if (!allowLarge
      && report.orphan_total > BRAKE_MIN_ORPHANS
      && report.orphan_total > report.bucket_total * BRAKE_MAX_SHARE) {
    return {
      action: 'refuse',
      reason: `${report.orphan_total} of ${report.bucket_total} files look orphaned (over ${BRAKE_MAX_SHARE * 100}%). ` +
        'Nothing deleted. Check path matching, then re-run with {"allowLarge": true} if this is real.',
    }
  }
  const batches: string[][] = []
  for (let i = 0; i < paths.length; i += BATCH_SIZE) batches.push(paths.slice(i, i + BATCH_SIZE))
  return { action: 'sweep', batches }
}

/** Re-check right before deleting: drop any path a row now points to (a row saved since the list). */
export function stillOrphaned(batch: string[], referenced: Iterable<string>): string[] {
  const live = new Set(referenced)
  return batch.filter(p => !live.has(p))
}
