import type { ProjectMember, ProjectTransaction } from '../types'

// "Shared by" helpers for expenses. NULL = everyone active. Ids resolve only against the
// members of this project; anything else (a deleted member, a foreign id) is "removed".

const byOrder = (a: ProjectMember, b: ProjectMember) =>
  (a.display_order - b.display_order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * What to store for a picker selection: NULL when it is exactly everyone active (and no
 * inactive member), otherwise the selected ids in display order. Unknown ids are dropped.
 * Returns [] for "nobody" — callers must not save that (the database rejects it too).
 */
export function normalizeSharedBy(selected: Iterable<string>, members: ProjectMember[]): string[] | null {
  const pick = new Set(selected)
  const chosen = [...members].sort(byOrder).filter(m => pick.has(m.id))
  const active = members.filter(m => m.is_active)
  const isEveryone = chosen.length === active.length && chosen.every(m => m.is_active) && active.length > 0
  return isEveryone ? null : chosen.map(m => m.id)
}

export interface ResolvedSharedBy {
  everyone: boolean
  /** Members of this project in the group, display order. Empty for everyone. */
  people: ProjectMember[]
  /** Ids that aren't members of this project (deleted / foreign), deduplicated. */
  removed: number
  /** Unreadable data (not an array of strings, or empty). */
  malformed: boolean
}

export function resolveSharedBy(sharedBy: unknown, members: ProjectMember[]): ResolvedSharedBy {
  if (sharedBy == null) return { everyone: true, people: [], removed: 0, malformed: false }
  if (!Array.isArray(sharedBy) || sharedBy.length === 0 || sharedBy.some(x => typeof x !== 'string' || x === '')) {
    return { everyone: false, people: [], removed: 0, malformed: true }
  }
  const ids = [...new Set(sharedBy as string[])]
  const known = new Map(members.map(m => [m.id, m]))
  const people = ids.filter(id => known.has(id)).map(id => known.get(id)!).sort(byOrder)
  return { everyone: false, people, removed: ids.length - people.length, malformed: false }
}

/**
 * Number shown in the row indicator ("Shared by 3"): people in this project who share it,
 * so it matches the detail sheet. null for everyone or non-expenses.
 */
export function sharedByCount(t: ProjectTransaction, members: ProjectMember[]): number | null {
  if (t.transaction_type !== 'expense' || t.shared_by == null) return null
  const r = resolveSharedBy(t.shared_by, members)
  return r.malformed ? 0 : r.people.length
}

/** Detail-sheet text: "Everyone", or "Arjun, Bilal (inactive) + 1 removed". */
export function sharedByText(r: ResolvedSharedBy): string {
  if (r.everyone) return 'Everyone'
  if (r.malformed) return "Couldn't read who shared this"
  const names = r.people.map(m => (m.is_active ? m.name : `${m.name} (inactive)`))
  const removed = r.removed > 0 ? `${r.removed} removed member${r.removed === 1 ? '' : 's'}` : null
  return [names.join(', '), removed].filter(Boolean).join(names.length ? ' + ' : '') || 'No one'
}
