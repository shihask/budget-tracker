import { useMemo, useEffect, useRef } from 'react'
import { computeChallenge, type ChallengeCalc } from '@/lib/challenge'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import { loadFrozenSnapshot, saveFrozenSnapshot, freezeFromCalc } from '@/lib/challenge-snapshot'
import { iso, addDays, TODAY } from '@/lib/utils'
import type { AppState, DerivedMetrics } from '@/types'

export interface DailyChallengeState {
  calc: ChallengeCalc | null
  enabled: boolean
  difficulty: 'easy' | 'medium' | 'hard'
  streak: number
  remaining: number
  progressPct: number
  isOverTarget: boolean
}

// Single source of truth for Daily Challenge state — call once (in App.tsx) and pass
// the result down as props. Calling this independently from multiple mounted
// components (e.g. a dashboard card and a Grow page card open at the same time)
// would each run the day-change-evaluation effect below concurrently, risking a
// double-counted streak/leaf award for the same backlog day.
export function useDailyChallenge(
  state: AppState,
  d: DerivedMetrics,
  userId: string,
  updateChallengeResult: (result: 'success' | 'miss', savedAmount: number, target: number, date: string) => Promise<void>,
  onSuccessDay?: (savedAmount: number) => void,
): DailyChallengeState {
  const settings = state.settings
  const enabled = settings.challenge_enabled ?? false
  const difficulty = settings.challenge_difficulty ?? 'medium'
  const streak = settings.challenge_streak ?? 0
  const evaluatingRef = useRef(false)

  const liveCalc = useMemo(
    () => enabled ? computeChallenge(state, difficulty, d.realFreeMoney, d.financialCycle) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, state.transactions, settings, d.realFreeMoney, d.financialCycle]
  )

  // Freeze "Safe Today" + Easy/Medium/Hard targets for the day so they don't shrink as you spend.
  // Everything else (Available, spentToday, progress, streak, etc.) stays fully live from liveCalc.
  const cycle = d.financialCycle ?? getCurrentFinancialCycle(state)
  const cycleKey = `${iso(cycle.cycleStart)}:${cycle.status}`
  const settingsFingerprint = [
    settings.emergency_fund ?? 0,
    settings.income_pattern ?? 'monthly',
    settings.salary_date ?? '',
    settings.income_day ?? '',
    settings.primary_income_category_id ?? '',
  ].join(':')

  const frozen = useMemo(() => {
    if (!liveCalc) return null
    const existing = loadFrozenSnapshot(userId, liveCalc.todayStr, cycleKey, settingsFingerprint)
    if (existing) return existing
    const snap = freezeFromCalc(liveCalc, cycleKey, settingsFingerprint)
    saveFrozenSnapshot(userId, snap)
    return snap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, liveCalc?.todayStr, cycleKey, settingsFingerprint])

  const calc: ChallengeCalc | null = liveCalc && frozen ? {
    ...liveCalc,
    safeDailyLimit: frozen.safeDailyLimit,
    targets: frozen.targets,
    target: frozen.targets[difficulty],
  } : null

  // Day-change detection: evaluate past days lazily on mount
  useEffect(() => {
    if (!enabled || evaluatingRef.current || !calc) return
    const targets = calc.targets // hoisted here so TS narrows it once, outside the async closure below

    async function evaluatePastDays() {
      evaluatingRef.current = true
      const lastDate = settings.challenge_last_date
      const todayStr = iso(TODAY)
      const yesterdayStr = iso(addDays(TODAY, -1))

      if (!lastDate || lastDate === todayStr) {
        evaluatingRef.current = false
        return
      }

      let cursor = new Date(lastDate)
      cursor.setDate(cursor.getDate() + 1)
      const yesterday = new Date(yesterdayStr)

      while (cursor <= yesterday) {
        const dateStr = iso(cursor)
        const dayDifficulty = settings.challenge_difficulty ?? 'medium'
        const excluded = settings.challenge_excluded_txn_ids ?? []
        const daySpent = state.transactions
          .filter(t => t.transaction_type === 'expense' && t.transaction_date === dateStr && !excluded.includes(t.id))
          .reduce((s, t) => s + t.amount, 0)
        const dayTarget = targets[dayDifficulty]
        const savedAmt = dayTarget - daySpent
        const result = daySpent <= dayTarget ? 'success' : 'miss'
        await updateChallengeResult(result, savedAmt, dayTarget, dateStr)
        if (result === 'success' && savedAmt > 0 && dateStr === yesterdayStr) {
          onSuccessDay?.(savedAmt)
        }
        cursor.setDate(cursor.getDate() + 1)
      }
      evaluatingRef.current = false
    }

    evaluatePastDays()
  }, [enabled, settings.challenge_last_date]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!calc) {
    return { calc: null, enabled, difficulty, streak, remaining: 0, progressPct: 0, isOverTarget: false }
  }

  const remaining = Math.round(calc.target - calc.spentToday)
  const progressPct = Math.min(100, calc.target > 0
    ? (calc.spentToday / calc.target) * 100
    : (calc.spentToday > 0 ? 110 : 0))
  const isOverTarget = remaining < 0

  return { calc, enabled, difficulty, streak, remaining, progressPct, isOverTarget }
}
