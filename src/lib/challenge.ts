import { TODAY, iso, addDays } from '@/lib/utils'
import type { AppState } from '@/types'
import { getIncomePattern } from '@/lib/income-pattern'
import { getCurrentFinancialCycle, type FinancialCycle } from '@/lib/financial-cycle'

export interface PlantGrowth {
  leaves: number
  milestone: 'seed' | 'sprout' | 'first_leaf' | 'young' | 'growing' | 'mature' | 'blooming'
  milestoneLabel: string
  nextGoal: number
  streakBonus: boolean
  stageIdx: number   // 0-6, for SVG rendering
}

export interface ChallengeCalc {
  daysRemaining: number
  planningMode: 'salary_cycle' | 'month_end'
  availableSpendable: number
  safeDailyLimit: number
  targets: { easy: number; medium: number; hard: number }
  recommendedDifficulty: 'easy' | 'medium' | 'hard'
  target: number
  adjustedTarget: number
  recoveryAmount: number
  spentToday: number
  remaining: number
  pctUsed: number
  status: 'clear' | 'on_track' | 'at_risk' | 'exceeded'
  message: string
  todayStr: string
  currentPace: number
  survivalStatus: 'on_track' | 'watch' | 'at_risk'
  todaysWin: string | null
  plantGrowth: PlantGrowth
  successRate: number | null
  avgDailySpend30: number
}

const PLANT_MILESTONES: Array<{ threshold: number; label: string; key: PlantGrowth['milestone'] }> = [
  { threshold: 0,   label: 'Seed',         key: 'seed'       },
  { threshold: 1,   label: 'Sprout',       key: 'sprout'     },
  { threshold: 5,   label: 'First Leaves', key: 'first_leaf' },
  { threshold: 15,  label: 'Young Plant',  key: 'young'      },
  { threshold: 30,  label: 'Growing',      key: 'growing'    },
  { threshold: 60,  label: 'Mature',       key: 'mature'     },
  { threshold: 100, label: 'Blooming',     key: 'blooming'   },
]

function daysUntilMonthEnd(): number {
  const today = new Date()
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(1, Math.round((lastDay.getTime() - todayMid.getTime()) / 86400000) + 1)
}

function getPlantGrowth(leaves: number, streak: number): PlantGrowth {
  let milestoneIdx = 0
  for (let i = PLANT_MILESTONES.length - 1; i >= 0; i--) {
    if (leaves >= PLANT_MILESTONES[i].threshold) { milestoneIdx = i; break }
  }
  const current = PLANT_MILESTONES[milestoneIdx]
  const next = PLANT_MILESTONES[milestoneIdx + 1]
  return {
    leaves,
    milestone: current.key,
    milestoneLabel: `${current.label} — ${leaves} ${leaves === 1 ? 'leaf' : 'leaves'}`,
    nextGoal: next ? next.threshold - leaves : 0,
    streakBonus: streak >= 7,
    stageIdx: milestoneIdx,
  }
}

function getDailyExpenses(transactions: AppState['transactions'], dateStr: string, excluded: string[]): number {
  return transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date === dateStr && !excluded.includes(t.id))
    .reduce((s, t) => s + t.amount, 0)
}

// computeChallenge() does not calculate cash availability — it consumes a precomputed
// business metric (safeToSpend) supplied by the caller, the same one Real Free Money
// uses. Keeps Daily Challenge consistent with the rest of the app instead of growing
// its own duplicate financial calculation.
export function computeChallenge(
  state: AppState,
  difficulty: 'easy' | 'medium' | 'hard',
  safeToSpend: number,
  precomputedCycle?: FinancialCycle,
): ChallengeCalc {
  const { settings, transactions } = state
  const now = new Date()
  const todayStr = iso(TODAY)
  const excluded = settings.challenge_excluded_txn_ids ?? []

  const availableSpendable = Math.max(0, safeToSpend)

  // Days horizon — Financial Cycle aware
  let daysRemaining: number
  let planningMode: ChallengeCalc['planningMode']
  const pattern = getIncomePattern(settings)
  if (pattern === 'monthly' || pattern === 'weekly') {
    const cycle = precomputedCycle ?? getCurrentFinancialCycle(state)
    daysRemaining = cycle.daysRemaining
    planningMode = 'salary_cycle'
  } else {
    daysRemaining = daysUntilMonthEnd()
    planningMode = 'month_end'
  }

  const safeDailyLimit = availableSpendable / daysRemaining

  const targets = {
    easy:   safeDailyLimit * 1.0,
    medium: safeDailyLimit * 0.85,
    hard:   safeDailyLimit * 0.70,
  }

  // Auto-difficulty from last 30 days average
  const thirtyDaysAgo = iso(addDays(TODAY, -30))
  const totalLast30 = transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date >= thirtyDaysAgo && t.transaction_date <= todayStr)
    .reduce((s, t) => s + t.amount, 0)
  const avgDailySpend30 = totalLast30 / 30

  let recommendedDifficulty: 'easy' | 'medium' | 'hard'
  if (avgDailySpend30 <= targets.hard * 1.1) recommendedDifficulty = 'hard'
  else if (avgDailySpend30 <= targets.medium * 1.1) recommendedDifficulty = 'medium'
  else recommendedDifficulty = 'easy'

  const target = targets[difficulty]

  // Recovery: based on yesterday
  const yesterdayStr = iso(addDays(TODAY, -1))
  const yesterdaySpent = getDailyExpenses(transactions, yesterdayStr, excluded)
  const yesterdayTarget = targets[difficulty]
  const yesterdayOverspend = Math.max(0, yesterdaySpent - yesterdayTarget)
  const recoveryAmount = daysRemaining > 1 ? yesterdayOverspend / (daysRemaining - 1) : 0
  const adjustedTarget = Math.max(0, target - recoveryAmount)

  // Today's spending
  const spentToday = getDailyExpenses(transactions, todayStr, excluded)
  const remaining = adjustedTarget - spentToday
  const pctUsed = adjustedTarget > 0 ? (spentToday / adjustedTarget) * 100 : (spentToday > 0 ? 110 : 0)

  let status: ChallengeCalc['status']
  if (pctUsed === 0) status = 'clear'
  else if (pctUsed <= 75) status = 'on_track'
  else if (pctUsed <= 100) status = 'at_risk'
  else status = 'exceeded'

  const message = getChallengeMessage(pctUsed, remaining, adjustedTarget)

  // Salary Survival: 7-day pace
  const last7Dates = Array.from({ length: 7 }, (_, i) => iso(addDays(TODAY, -(6 - i))))
  const last7Totals = last7Dates.map(d => getDailyExpenses(transactions, d, []))
  const currentPace = last7Totals.reduce((s, v) => s + v, 0) / 7
  let survivalStatus: ChallengeCalc['survivalStatus']
  if (currentPace <= safeDailyLimit) survivalStatus = 'on_track'
  else if (currentPace <= safeDailyLimit * 1.2) survivalStatus = 'watch'
  else survivalStatus = 'at_risk'

  // Today's Win
  const todaysWin = getTodaysWin(transactions, excluded, spentToday, yesterdaySpent, todayStr, thirtyDaysAgo, status)

  // Plant Growth (behavior-based: leaves earned from completions, not money)
  const leaves = settings.challenge_leaves ?? 0
  const streak = settings.challenge_streak ?? 0
  const plantGrowth = getPlantGrowth(leaves, streak)

  // Success Rate
  const totalDays = settings.challenge_total_days ?? 0
  const successDays = settings.challenge_success_days ?? 0
  const successRate = totalDays >= 3 ? Math.round((successDays / totalDays) * 100) : null

  return {
    daysRemaining, planningMode, availableSpendable,
    safeDailyLimit, targets, recommendedDifficulty, target, adjustedTarget,
    recoveryAmount, spentToday, remaining, pctUsed, status, message, todayStr,
    currentPace, survivalStatus, todaysWin, plantGrowth, successRate, avgDailySpend30,
  }
}

export function getChallengeMessage(pctUsed: number, remaining: number, target: number): string {
  const over = Math.round(Math.abs(remaining))
  if (pctUsed === 0) return 'Set your challenge and start tracking today.'
  if (pctUsed <= 40) return 'Great start. Keep the pace.'
  if (pctUsed <= 75) return "You're on track for today's challenge."
  if (pctUsed <= 95) return `₹${over} left — one mindful choice completes today.`
  if (pctUsed <= 100) return 'Right at the edge. Hold steady.'
  if (target > 0 && Math.abs(remaining) / target < 0.10) return `Just ₹${over} above target. Streak preserved.`
  if (pctUsed <= 150) return "Today's spending was higher than the challenge target. Tomorrow is a fresh start."
  return "Today included significant spending. Focus on tomorrow's challenge instead of trying to recover everything at once."
}

function getTodaysWin(
  transactions: AppState['transactions'],
  excluded: string[],
  spentToday: number,
  yesterdaySpent: number,
  todayStr: string,
  thirtyDaysAgo: string,
  status: ChallengeCalc['status']
): string | null {
  // Win 1: less than yesterday
  if (spentToday > 0 && yesterdaySpent > 0 && spentToday < yesterdaySpent) {
    const diff = Math.round(yesterdaySpent - spentToday)
    return `₹${diff} less than yesterday`
  }

  // Win 2: top category below its 30-day average
  const todayByCategory: Record<string, number> = {}
  transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date === todayStr && !excluded.includes(t.id) && t.category_id)
    .forEach(t => { todayByCategory[t.category_id!] = (todayByCategory[t.category_id!] ?? 0) + t.amount })

  const topCatId = Object.entries(todayByCategory).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (topCatId) {
    const last30ForCat = transactions
      .filter(t => t.transaction_type === 'expense' && t.transaction_date >= thirtyDaysAgo && t.transaction_date <= todayStr && t.category_id === topCatId)
      .reduce((s, t) => s + t.amount, 0)
    const avg30DailyForCat = last30ForCat / 30
    if (todayByCategory[topCatId] < avg30DailyForCat * 0.8) {
      const catName = transactions.find(t => t.category_id === topCatId && t.category)?.category?.name
      if (catName) return `${catName} lower than your average`
    }
  }

  // Win 3: at least 1 transaction logged
  const hasAny = transactions.some(t => t.transaction_type === 'expense' && t.transaction_date === todayStr && !excluded.includes(t.id))
  if (hasAny) return status === 'exceeded' ? 'You still tracked every expense today' : 'Every expense tracked today'

  return null
}
