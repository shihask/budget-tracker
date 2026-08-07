import type { BriefingItem } from './briefing'

// Same mp_<feature>_<userId> + version + dateStr convention as challenge-snapshot.ts,
// applied to Today's Briefing: freezes which non-critical items are shown and in what
// order for the rest of the day, so the card reads like "today's briefing" instead of
// reshuffling every time a new transaction changes the live ranking.
export const BRIEFING_SNAPSHOT_VERSION = 1

interface FrozenBriefingSnapshot {
  version: number
  dateStr: string
  orderedIds: string[]   // BriefingItem ids, not detector slugs — a detector can produce
                          // more than one live item in the same day (e.g. goal_behind_pace
                          // once per behind-pace goal), so only the id is guaranteed unique.
}

function storageKey(userId: string): string {
  return `mp_briefing_snapshot_${userId}`
}

function loadSnapshot(userId: string, dateStr: string): FrozenBriefingSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FrozenBriefingSnapshot
    if (parsed.version !== BRIEFING_SNAPSHOT_VERSION) return null
    if (parsed.dateStr !== dateStr) return null
    if (!Array.isArray(parsed.orderedIds)) return null
    return parsed
  } catch {
    return null
  }
}

function saveSnapshot(userId: string, snapshot: FrozenBriefingSnapshot): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot))
  } catch {
    /* localStorage unavailable — degrade to live recompute every call */
  }
}

// Applies the day's frozen ordering to a live, already-ranked+deduped candidate list
// (see buildDailyBriefing), then caps to maxItems.
//
// Critical-tone items always show, always sort first, and are never part of the
// freeze — mirrors how notification-engine's applySnooze always shows critical
// regardless of snooze state, so a same-day crisis is never hidden behind yesterday's
// ordering decision.
//
// For the remaining slots: on the day's first call, snapshot the current top picks.
// On later calls the same day, keep that order for items still present live, drop any
// whose condition resolved (id no longer in the live list), and append newly-appearing
// non-critical items after the frozen head rather than reshuffling it.
export function applyDailyFreeze(
  userId: string,
  dateStr: string,
  liveItems: BriefingItem[],
  maxItems: number,
): BriefingItem[] {
  const critical = liveItems.filter(i => i.tone === 'critical')
  const rest = liveItems.filter(i => i.tone !== 'critical')
  const restSlots = Math.max(0, maxItems - critical.length)

  const existing = loadSnapshot(userId, dateStr)
  const byId = new Map(rest.map(i => [i.id, i]))

  let orderedRest: BriefingItem[]
  if (existing) {
    const fromFrozen = existing.orderedIds
      .map(id => byId.get(id))
      .filter((i): i is BriefingItem => !!i)
    const frozenIds = new Set(fromFrozen.map(i => i.id))
    const newcomers = rest.filter(i => !frozenIds.has(i.id))
    orderedRest = [...fromFrozen, ...newcomers]
  } else {
    orderedRest = rest
    saveSnapshot(userId, {
      version: BRIEFING_SNAPSHOT_VERSION,
      dateStr,
      orderedIds: rest.slice(0, restSlots).map(i => i.id),
    })
  }

  return [...critical, ...orderedRest].slice(0, maxItems)
}
