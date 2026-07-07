import type { Goal, GoalContribution } from '@/types'

export const MS_MONTH = 1000 * 60 * 60 * 24 * 30.44

export interface GoalStatus {
  pct: number
  monthsRemaining: number
  isComplete: boolean
  health: 'complete' | 'on_track' | 'needs_attention'
  daysAhead?: number
  daysBehind?: number
  extraNeeded?: number
}

export function calcGoalStatus(goal: Goal): GoalStatus {
  const now = Date.now()
  const created = new Date(goal.created_at).getTime()
  const target = new Date(goal.target_date + 'T00:00:00').getTime()
  const monthsElapsed = Math.max(0, (now - created) / MS_MONTH)
  const monthsRemaining = Math.max(0, (target - now) / MS_MONTH)
  const expectedSaved = goal.monthly_target * monthsElapsed
  const diff = goal.current_saved - expectedSaved
  const pct = goal.goal_amount > 0 ? Math.min(100, Math.round((goal.current_saved / goal.goal_amount) * 100)) : 0
  const isComplete = goal.current_saved >= goal.goal_amount
  if (isComplete) return { pct: 100, monthsRemaining: 0, isComplete: true, health: 'complete' }
  if (diff >= 0) {
    const daysAhead = goal.monthly_target > 0 ? Math.round((diff / goal.monthly_target) * 30) : 0
    return { pct, daysAhead, monthsRemaining, isComplete: false, health: 'on_track' }
  }
  const shortfall = Math.abs(diff)
  const extraNeeded = monthsRemaining > 0 ? Math.round(shortfall / monthsRemaining) : Math.round(shortfall)
  const daysBehind = goal.monthly_target > 0 ? Math.round((shortfall / goal.monthly_target) * 30) : 0
  return { pct, daysBehind, extraNeeded, monthsRemaining, isComplete: false, health: 'needs_attention' }
}

export interface GoalForecast {
  currentPace: number
  forecastLabel: string | null
  requiredPace: number | null
  monthlyGap: number | null
  monthsToComplete: number | null
}

export function calcGoalForecast(goal: Goal): GoalForecast {
  const now = Date.now()
  const created = new Date(goal.created_at).getTime()
  const target = new Date(goal.target_date + 'T00:00:00').getTime()
  const monthsElapsed = (now - created) / MS_MONTH
  const monthsRemaining = Math.max(0, (target - now) / MS_MONTH)
  const remaining = Math.max(0, goal.goal_amount - goal.current_saved)

  const currentPace = monthsElapsed >= 0.5
    ? goal.current_saved / monthsElapsed
    : goal.monthly_target

  const monthsToComplete = currentPace > 0 ? remaining / currentPace : null
  let forecastLabel: string | null = null
  if (monthsToComplete !== null) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + Math.ceil(monthsToComplete))
    forecastLabel = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  }

  const requiredPace = monthsRemaining > 0 ? remaining / monthsRemaining : null
  const monthlyGap = requiredPace !== null ? Math.round(requiredPace - currentPace) : null

  return {
    currentPace: Math.round(currentPace),
    forecastLabel,
    requiredPace: requiredPace !== null ? Math.round(requiredPace) : null,
    monthlyGap,
    monthsToComplete: monthsToComplete !== null ? Math.ceil(monthsToComplete) : null,
  }
}

export interface GoalMomentum {
  thisMonthCount: number
  thisMonthTotal: number
  daysSinceLast: number | null
  challengeTotal: number
  manualTotal: number
  totalContribs: number
  challengeCount: number
  recentContribs: GoalContribution[]
}

export function calcGoalMomentum(goalId: string, contributions: GoalContribution[]): GoalMomentum {
  const currentMonth = new Date().toISOString().substring(0, 7)
  const goalContribs = contributions.filter(c => c.goal_id === goalId)
  const thisMonth = goalContribs.filter(c => c.created_at.substring(0, 7) === currentMonth)
  const daysSinceLast = goalContribs[0]
    ? Math.floor((Date.now() - new Date(goalContribs[0].created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const challengeTotal = goalContribs.filter(c => c.source === 'daily_challenge').reduce((s, c) => s + c.amount, 0)
  const manualTotal = goalContribs.filter(c => c.source === 'manual').reduce((s, c) => s + c.amount, 0)
  return {
    thisMonthCount: thisMonth.length,
    thisMonthTotal: thisMonth.reduce((s, c) => s + c.amount, 0),
    daysSinceLast,
    challengeTotal,
    manualTotal,
    totalContribs: goalContribs.length,
    challengeCount: goalContribs.filter(c => c.source === 'daily_challenge').length,
    recentContribs: goalContribs.slice(0, 8),
  }
}

export function calcTargetInfo(goalAmount: number, currentSaved: number, monthlyTarget: number) {
  const needed = Math.max(0, goalAmount - currentSaved)
  const months = monthlyTarget > 0 ? Math.ceil(needed / monthlyTarget) : 0
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  return {
    label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    iso: d.toISOString().slice(0, 10),
    months,
  }
}
