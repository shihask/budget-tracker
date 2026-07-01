import type { ChallengeCalc } from './challenge'

export const CHALLENGE_SNAPSHOT_VERSION = 1

export interface FrozenChallengeSnapshot {
  version: number
  dateStr: string
  cycleKey: string
  settingsFingerprint: string
  safeDailyLimit: number
  targets: { easy: number; medium: number; hard: number }
}

function storageKey(userId: string): string {
  return `mp_challenge_snapshot_${userId}`
}

export function loadFrozenSnapshot(
  userId: string,
  dateStr: string,
  cycleKey: string,
  settingsFingerprint: string
): FrozenChallengeSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FrozenChallengeSnapshot
    if (parsed.version !== CHALLENGE_SNAPSHOT_VERSION) return null
    if (parsed.dateStr !== dateStr) return null
    if (parsed.cycleKey !== cycleKey) return null
    if (parsed.settingsFingerprint !== settingsFingerprint) return null
    return parsed
  } catch {
    return null
  }
}

export function saveFrozenSnapshot(userId: string, snapshot: FrozenChallengeSnapshot): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(snapshot))
  } catch {
    /* localStorage unavailable — degrade to live recompute every render */
  }
}

export function freezeFromCalc(
  calc: ChallengeCalc,
  cycleKey: string,
  settingsFingerprint: string
): FrozenChallengeSnapshot {
  return {
    version: CHALLENGE_SNAPSHOT_VERSION,
    dateStr: calc.todayStr,
    cycleKey,
    settingsFingerprint,
    safeDailyLimit: calc.safeDailyLimit,
    targets: calc.targets,
  }
}
