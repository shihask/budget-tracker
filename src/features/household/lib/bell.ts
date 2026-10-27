// "Bilal joined Our Home" in the notification bell, for whoever was already in
// the household. Derived from the members list — no notifications table: a join
// shows while it is recent and not yet seen on this device.

import type { HouseholdMember } from '../types'

/** A join stays in the bell this long unless opened or dismissed. */
export const JOIN_BELL_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export const joinSeenKey = (userId: string) => 'mp_household_join_seen_' + userId

export interface JoinBellItem {
  memberId: string
  name: string
  joinedAt: string
}

/** Members who joined after me (so I was there to be told), recently, and unseen. */
export function joinBellItems(members: HouseholdMember[], meMemberId: string, seen: ReadonlySet<string>, now: number): JoinBellItem[] {
  const me = members.find(m => m.id === meMemberId)
  if (!me) return []
  const myJoin = new Date(me.joined_at).getTime()
  return members
    .filter(m => {
      const joined = new Date(m.joined_at).getTime()
      return m.id !== meMemberId && m.status === 'active' && !seen.has(m.id)
        && joined > myJoin && now - joined < JOIN_BELL_DAYS * DAY_MS
    })
    .map(m => ({ memberId: m.id, name: m.display_name, joinedAt: m.joined_at }))
}

export function readSeen(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(joinSeenKey(userId))
    const ids = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markSeen(userId: string, memberIds: string[]): Set<string> {
  const next = readSeen(userId)
  for (const id of memberIds) next.add(id)
  try { localStorage.setItem(joinSeenKey(userId), JSON.stringify([...next].slice(-50))) } catch { /* shows again next load */ }
  return next
}
