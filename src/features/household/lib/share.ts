// "Share with Household" in Quick Add — the pure rules. The database enforces all
// of them again (mp_execute_shared_transaction); these decide what the UI offers.

import type { HouseholdCategory } from '../types'

/** What Quick Add knows about the user's household, or null when not in one. */
export interface HouseholdShareContext {
  householdName: string
  categories: HouseholdCategory[]
}

export type ShareBlock = 'type' | 'reimbursement' | 'split' | 'offline' | null

/** Why sharing can't be offered for the current form (null = it can). */
export function shareBlock(o: { txType: string; reimbursing: boolean; split: boolean; offline: boolean }): ShareBlock {
  if (o.offline) return 'offline'
  if (o.txType !== 'expense' && o.txType !== 'income') return 'type'
  if (o.reimbursing) return 'reimbursement'
  if (o.split) return 'split'
  return null
}

export const SHARE_BLOCK_TEXT: Record<Exclude<ShareBlock, null>, string> = {
  offline: 'Sharing needs a connection.',
  type: 'Transfers can’t be shared with your household.',
  reimbursement: 'Reimbursements can’t be shared with your household.',
  split: 'Split payments can’t be shared with your household.',
}

/** The household category to prefill: same name (case/space-insensitive), same
 *  kind, not archived. null when there's no such match — the user then picks
 *  one; we never guess. */
export function matchHouseholdCategory(
  personalName: string | null | undefined,
  kind: 'expense' | 'income',
  categories: HouseholdCategory[],
): string | null {
  const key = personalName?.trim().toLowerCase()
  if (!key) return null
  return categories.find(c => c.kind === kind && !c.is_archived && c.name.trim().toLowerCase() === key)?.id ?? null
}

/** The note as the household will see it (mirrors the SQL: trimmed, ≤ 120 chars). */
export const sharedNote = (description: string) => description.trim().slice(0, 120)

/** A shared save got no answer: it may or may not have committed. Not queued
 *  offline — retrying with the same id returns the existing pair if it did. */
export class ShareNotConfirmedError extends Error {
  constructor() {
    super('Couldn’t confirm the save — check your connection and tap Save again. It won’t be saved twice.')
    this.name = 'ShareNotConfirmedError'
  }
}
