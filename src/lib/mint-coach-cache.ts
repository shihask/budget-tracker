// Same mp_<feature>_<userId> + embedded-invalidation-fields convention as
// challenge-snapshot.ts, applied to Coach: one entry, compared against the current
// dateStr + state fingerprint on read rather than encoded into the key itself.

export const COACH_CACHE_VERSION = 1

export interface CachedCoach {
  version: number
  dateStr: string
  fingerprint: string
  text: string
}

function storageKey(userId: string): string {
  return `mp_mint_coach_${userId}`
}

function readRaw(userId: string): CachedCoach | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedCoach
    if (parsed.version !== COACH_CACHE_VERSION) return null
    if (typeof parsed.dateStr !== 'string' || typeof parsed.fingerprint !== 'string' || typeof parsed.text !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

// Returns cached text only when both dateStr AND fingerprint match today's — a
// fingerprint change means something Coach-relevant happened since the last
// generation (mission status flipped, reflection completed, a habit checked off, an
// achievement unlocked), so the cached narration is no longer accurate.
export function loadCachedCoach(userId: string, dateStr: string, fingerprint: string): string | null {
  const cached = readRaw(userId)
  if (!cached) return null
  if (cached.dateStr !== dateStr || cached.fingerprint !== fingerprint) return null
  return cached.text
}

// Reads whatever's currently cached (regardless of fingerprint) and returns its text
// only if its dateStr is strictly before todayStr — "the last thing Mint told you."
// Works across gaps too (app not opened for a few days still finds the last real
// entry). Call this before saveCachedCoach overwrites the slot for a new day.
export function loadPreviousDaySummary(userId: string, todayStr: string): string | null {
  const cached = readRaw(userId)
  if (!cached) return null
  if (cached.dateStr >= todayStr) return null
  return cached.text
}

export function saveCachedCoach(userId: string, dateStr: string, fingerprint: string, text: string): void {
  try {
    const payload: CachedCoach = { version: COACH_CACHE_VERSION, dateStr, fingerprint, text }
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    /* localStorage unavailable — degrade to regenerating every load */
  }
}
