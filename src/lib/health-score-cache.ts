import { HEALTH_SCORE_ALGORITHM_VERSION } from './health-score'

// Same mp_<feature>_<userId> convention as mint-coach-cache.ts, applied to Health
// Score: no persisted score history table, just "what did we compute last time,"
// enough to derive a day-over-day trend arrow client-side.
export const HEALTH_SCORE_CACHE_VERSION = 1

interface CachedHealthScore {
  version: number
  algorithmVersion: number
  dateStr: string
  score: number
}

function storageKey(userId: string): string {
  return `mp_health_score_${userId}`
}

function readRaw(userId: string): CachedHealthScore | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedHealthScore
    if (parsed.version !== HEALTH_SCORE_CACHE_VERSION) return null
    if (typeof parsed.dateStr !== 'string' || typeof parsed.score !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

// Returns the last cached score strictly before todayStr — "yesterday's score" (works
// across gaps too, same as mint-coach-cache's loadPreviousDaySummary). Returns null if
// nothing's cached yet, or if the cached entry was computed under a different
// HEALTH_SCORE_ALGORITHM_VERSION — a future weight rebalance should never show as a
// misleading score jump/drop that's actually just a formula change.
export function loadPreviousScore(userId: string, todayStr: string): number | null {
  const cached = readRaw(userId)
  if (!cached) return null
  if (cached.algorithmVersion !== HEALTH_SCORE_ALGORITHM_VERSION) return null
  if (cached.dateStr >= todayStr) return null
  return cached.score
}

export function saveTodayScore(userId: string, dateStr: string, score: number): void {
  try {
    const payload: CachedHealthScore = { version: HEALTH_SCORE_CACHE_VERSION, algorithmVersion: HEALTH_SCORE_ALGORITHM_VERSION, dateStr, score }
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    /* localStorage unavailable — trend degrades to null every load */
  }
}

export function scoreTrend(current: number, previous: number | null): 'up' | 'down' | 'flat' | null {
  if (previous === null) return null
  if (current > previous) return 'up'
  if (current < previous) return 'down'
  return 'flat'
}
