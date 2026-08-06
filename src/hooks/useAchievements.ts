import { useEffect, useRef, useState } from 'react'
import { evaluateDaily } from '@/lib/achievement-engine'
import type { AchievementDefinition } from '@/lib/achievement-definitions'
import type { AppState } from '@/types'

// Called once in App.tsx — same lesson as useDailyChallenge: one evaluation point,
// not hooked into every mutation site, guarded against concurrent re-entry.
export function useAchievements(
  state: AppState,
  unlockAchievement: (achievementId: string) => Promise<void>,
) {
  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementDefinition[]>([])
  const evaluatingRef = useRef(false)

  useEffect(() => {
    if (evaluatingRef.current) return

    async function evaluate() {
      evaluatingRef.current = true
      const alreadyUnlockedIds = new Set(state.user_achievements.map(a => a.achievement_id))
      const toUnlock = evaluateDaily(state, alreadyUnlockedIds)
      for (const def of toUnlock) {
        await unlockAchievement(def.id)
      }
      if (toUnlock.length > 0) {
        setNewlyUnlocked(prev => [...prev, ...toUnlock])
      }
      evaluatingRef.current = false
    }

    evaluate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings, state.goals, state.goal_contributions, state.user_achievements])

  const dismiss = (id: string) => setNewlyUnlocked(prev => prev.filter(a => a.id !== id))

  return { newlyUnlocked, dismiss }
}
