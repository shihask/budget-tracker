import type { AppState } from '@/types'
import { ACHIEVEMENTS, type AchievementDefinition, type AchievementEvent, type AchievementProgress } from '@/lib/achievement-definitions'

// Two ways to notice a condition became true, one achievement system: both filter the
// same ACHIEVEMENTS list and both feed the same unlockAchievement() call at the caller.

// Called once on load (src/hooks/useAchievements.ts) — mirrors useDailyChallenge's
// once-only day-evaluation so unlock-checking isn't scattered across mutation sites.
export function evaluateDaily(state: AppState, alreadyUnlockedIds: Set<string>): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(a =>
    a.trigger.kind === 'daily' &&
    !alreadyUnlockedIds.has(a.id) &&
    a.condition?.(state) === true
  )
}

// Called directly from wherever a transient, unrecoverable-later fact is momentarily
// knowable (e.g. updateChallengeResult emitting { type: 'challenge_comeback' }).
export function evaluateEvent(event: AchievementEvent, alreadyUnlockedIds: Set<string>): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(a =>
    a.trigger.kind === 'event' &&
    a.trigger.event === event.type &&
    !alreadyUnlockedIds.has(a.id)
  )
}

export function calculateProgress(def: AchievementDefinition, state: AppState): AchievementProgress | null {
  return def.progress ? def.progress(state) : null
}
