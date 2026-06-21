// All seed data removed — everything loads from Supabase.
// This file only contains pure calculation functions (no data).

import type { AppState, DerivedMetrics, TrendPoint, BarPoint, CatPoint, TimelineDayPoint, TimelineLane, MonthTimelineData, JourneyData, JourneyMilestone, JourneyReplayEvent, JourneyHealthItem, JourneyFlowItem } from '@/types'
import { TODAY, iso, addDays, getWeekStart, getMonthStart } from '@/lib/utils'
import { ADJUSTMENT_GROUP } from '@/lib/constants'

// System transactions (opening_balance, balance_adjustment) must never count as real income/expense.
// Also covers legacy transactions created before the dedicated types existed (category-group fallback).
export const isSystemTx = (t: AppState['transactions'][0], catMap: ReturnType<typeof catById>) =>
  t.transaction_type === 'opening_balance' ||
  t.transaction_type === 'balance_adjustment' ||
  t.transaction_type === 'credit_card_payment' ||
  catMap[t.category_id ?? '']?.group_name === ADJUSTMENT_GROUP

/** @deprecated Use isSystemTx */
export const isAdjustmentTx = isSystemTx

export const catById = (categories: AppState['categories']) =>
  Object.fromEntries(categories.map(c => [c.id, c]))

export const WEEK_START = getWeekStart(TODAY)
export const MONTH_START = getMonthStart(TODAY)

const isLifestyle = (t: AppState['transactions'][0], catMap: ReturnType<typeof catById>) =>
  t.transaction_type === 'expense' && catMap[t.category_id!]?.group_name === 'Lifestyle'

function makeScopeFilter(state: AppState) {
  const scope = state.settings.weekly_budget_scope
  const hasGroupOrCat = scope && (scope.groups.length > 0 || scope.categoryIds.length > 0)
  const hasTxn = scope && scope.transactionIds && scope.transactionIds.length > 0

  if (!hasGroupOrCat && !hasTxn) return isLifestyle

  return (t: AppState['transactions'][0], catMap: ReturnType<typeof catById>) => {
    if (t.transaction_type !== 'expense') return false
    if (isSystemTx(t, catMap)) return false   // never count system transactions as spending
    if (hasTxn && scope!.transactionIds.includes(t.id)) return true
    if (!hasGroupOrCat) return false
    const cat = catMap[t.category_id ?? '']
    return (scope!.groups.length > 0 && scope!.groups.includes(cat?.group_name ?? '')) ||
           (scope!.categoryIds.length > 0 && scope!.categoryIds.includes(t.category_id ?? ''))
  }
}

export function derive(state: AppState): DerivedMetrics {
  const catMap = catById(state.categories)
  const accs = state.accounts.filter(a => a.is_active)
  const actualBalance = accs.reduce((s, a) => s + a.current_balance, 0)
  const emergencyFund = state.settings.emergency_fund
  const availableBalance = actualBalance - emergencyFund
  const now = new Date()
const remainingCommitments = state.commitments
  .filter(c => c.is_active)
  .reduce((s, c) => {
    if (c.is_recurring && c.last_paid_date) {
      const paid = new Date(c.last_paid_date)
      if (paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()) {
        return s
      }
    }
    return s + (c.is_recurring ? c.amount : c.remaining)
  }, 0)
  const realFreeMoney = availableBalance - remainingCommitments

  const weeklyBudget = state.settings.weekly_budget
  const matchesScope = makeScopeFilter(state)
  const period = state.settings.budget_period ?? 'weekly'
  const periodStart = period === 'daily'
    ? new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())
    : period === 'monthly'
    ? getMonthStart(TODAY, state.settings.monthly_start_date ?? 1)
    : getWeekStart(TODAY, state.settings.weekly_start_day ?? 1)
  const weeklySpent = state.transactions
    .filter(t => matchesScope(t, catMap) && new Date(t.transaction_date) >= periodStart)
    .reduce((s, t) => s + t.amount, 0)
  const weeklyRemaining = weeklyBudget - weeklySpent
  const weeklyPct = weeklyBudget ? (weeklySpent / weeklyBudget) * 100 : 0

  // Salary-cycle-based metrics (auto budget mode)
  const salaryDate = state.settings.salary_date
  let cycleSpent = 0, cycleRemaining = realFreeMoney
  let safeDailySpend = 0, safeWeeklySpend = 0
  let cycleDaysLeft = 0, cycleWeeksLeft = 0

  if (salaryDate && salaryDate >= 1 && salaryDate <= 31) {
    const t = new Date()
    const y = t.getFullYear(), m = t.getMonth(), day = t.getDate()
    const cycleStart = day >= salaryDate
      ? new Date(y, m, salaryDate)
      : new Date(y, m - 1, salaryDate)
    const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, salaryDate - 1)
    const todayMid = new Date(y, m, day)
    cycleDaysLeft = Math.max(1, Math.round((cycleEnd.getTime() - todayMid.getTime()) / 86400000) + 1)
    cycleWeeksLeft = cycleDaysLeft / 7

    cycleSpent = state.transactions
      .filter(tx => matchesScope(tx, catMap) && new Date(tx.transaction_date) >= cycleStart)
      .reduce((s, tx) => s + tx.amount, 0)
    cycleRemaining = realFreeMoney
    safeDailySpend  = realFreeMoney / cycleDaysLeft
    safeWeeklySpend = realFreeMoney / cycleWeeksLeft
  }

  return {
    actualBalance, emergencyFund, availableBalance, remainingCommitments,
    realFreeMoney, weeklyBudget, weeklySpent, weeklyRemaining, weeklyPct,
    cycleSpent, cycleRemaining, safeDailySpend, safeWeeklySpend, cycleDaysLeft, cycleWeeksLeft,
  }
}

export function weeklyTrend(state: AppState): TrendPoint[] {
  const catMap = catById(state.categories)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(TODAY, -(6 - i))
    const total = state.transactions
      .filter(t => isLifestyle(t, catMap) && t.transaction_date === iso(d))
      .reduce((s, t) => s + t.amount, 0)
    return { label: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()], date: iso(d), value: total }
  })
}

export function weeklyBars(state: AppState): BarPoint[] {
  const catMap = catById(state.categories)
  return Array.from({ length: 5 }, (_, w) => {
    const wOff = 4 - w
    const ws = addDays(WEEK_START, -7 * wOff)
    const we = addDays(ws, 7)
    const total = state.transactions
      .filter(t => isLifestyle(t, catMap) && new Date(t.transaction_date) >= ws && new Date(t.transaction_date) < we)
      .reduce((s, t) => s + t.amount, 0)
    return { label: wOff === 0 ? 'This wk' : wOff + 'w ago', value: total }
  })
}

export function categorySplit(state: AppState): CatPoint[] {
  const catMap = catById(state.categories)
  const map: Record<string, number> = {}
  state.transactions
    .filter(t => isLifestyle(t, catMap) && new Date(t.transaction_date) >= MONTH_START)
    .forEach(t => {
      const name = catMap[t.category_id!]?.name
      if (name) map[name] = (map[name] || 0) + t.amount
    })
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function monthTimeline(state: AppState): MonthTimelineData {
  const now = TODAY
  const y = now.getFullYear()
  const m = now.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const todayDay = now.getDate()
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const pad = (n: number) => String(n).padStart(2, '0')
  const prefix = `${y}-${pad(m + 1)}`

  const catMap = catById(state.categories)
  const monthTxns = state.transactions.filter(
    t => t.transaction_type === 'expense' && t.transaction_date.startsWith(prefix)
  )

  const byDay: TimelineDayPoint[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const isoDate = `${prefix}-${pad(day)}`
    const dayTxns = monthTxns.filter(t => t.transaction_date === isoDate)
    return {
      day,
      isoDate,
      total: dayTxns.reduce((s, t) => s + t.amount, 0),
      isFuture: day > todayDay,
      transactions: dayTxns,
    }
  })

  const catAcc: Record<string, { name: string; group: string; total: number; days: Record<string, number> }> = {}
  monthTxns.forEach(t => {
    const cat = catMap[t.category_id ?? '']
    if (!cat) return
    if (!catAcc[cat.name]) catAcc[cat.name] = { name: cat.name, group: cat.group_name, total: 0, days: {} }
    catAcc[cat.name].total += t.amount
    catAcc[cat.name].days[t.transaction_date] = (catAcc[cat.name].days[t.transaction_date] || 0) + t.amount
  })
  const byCategory: TimelineLane[] = Object.values(catAcc)
    .sort((a, b) => b.total - a.total)
    .map(c => ({
      name: c.name, group: c.group, total: c.total,
      days: Object.entries(c.days).map(([isoDate, amount]) => ({
        day: parseInt(isoDate.split('-')[2]), isoDate, amount,
      })).sort((a, b) => a.day - b.day),
    }))

  const grpAcc: Record<string, { name: string; total: number; days: Record<string, number> }> = {}
  monthTxns.forEach(t => {
    const cat = catMap[t.category_id ?? '']
    const group = cat?.group_name || 'Uncategorized'
    if (!grpAcc[group]) grpAcc[group] = { name: group, total: 0, days: {} }
    grpAcc[group].total += t.amount
    grpAcc[group].days[t.transaction_date] = (grpAcc[group].days[t.transaction_date] || 0) + t.amount
  })
  const byGroup: TimelineLane[] = Object.values(grpAcc)
    .sort((a, b) => b.total - a.total)
    .map(g => ({
      name: g.name, total: g.total,
      days: Object.entries(g.days).map(([isoDate, amount]) => ({
        day: parseInt(isoDate.split('-')[2]), isoDate, amount,
      })).sort((a, b) => a.day - b.day),
    }))

  return {
    byDay, byCategory, byGroup,
    daysInMonth, todayDay, monthLabel,
    totalSpent: monthTxns.reduce((s, t) => s + t.amount, 0),
  }
}

const SAVINGS_TYPE_LABEL: Record<string, string> = {
  sip: 'Mutual Funds', gold: 'Gold', rd: 'Recurring Deposit',
  fd: 'Fixed Deposit', ppf_nps: 'PPF / NPS', chit: 'Chit Fund', custom: 'Investment',
}

export function journeyData(state: AppState): JourneyData {
  const now = TODAY
  const salaryDate = state.settings.salary_date
  let cycleStart: Date
  if (salaryDate && salaryDate >= 1 && salaryDate <= 31) {
    const day = now.getDate()
    cycleStart = day >= salaryDate
      ? new Date(now.getFullYear(), now.getMonth(), salaryDate)
      : new Date(now.getFullYear(), now.getMonth() - 1, salaryDate)
  } else {
    cycleStart = getMonthStart(now)
  }
  const cycleLabel = cycleStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const catMap = catById(state.categories)

  // Seed — income in this cycle
  const incomeTxns = state.transactions.filter(
    t => t.transaction_type === 'income' && new Date(t.transaction_date) >= cycleStart
  )
  const incomeByCat: Record<string, number> = {}
  incomeTxns.forEach(t => {
    const name = catMap[t.category_id ?? '']?.name || 'Income'
    incomeByCat[name] = (incomeByCat[name] || 0) + t.amount
  })
  const incomeItems = Object.entries(incomeByCat)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  const totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0)

  // Roots — commitments paid + savings contributed + goal contributions
  const commitmentsPaid = state.transactions
    .filter(t => t.transaction_type === 'commitment' && new Date(t.transaction_date) >= cycleStart)
    .reduce((s, t) => s + t.amount, 0)
  const savingsContributed = state.transactions
    .filter(t => t.transaction_type === 'savings_contribution' && new Date(t.transaction_date) >= cycleStart)
    .reduce((s, t) => s + t.amount, 0)
  const goalsContributed = state.goal_contributions
    .filter(gc => new Date(gc.created_at) >= cycleStart)
    .reduce((s, gc) => s + gc.amount, 0)
  const rootsTotal = commitmentsPaid + savingsContributed + goalsContributed
  const rootsPct = totalIncome > 0 ? Math.round((rootsTotal / totalIncome) * 100) : 0

  // Stem — challenge habit metrics
  const st = state.settings
  const challengeEnabled = st.challenge_enabled ?? false
  const successDays = st.challenge_success_days ?? 0
  const totalDays = st.challenge_total_days ?? 0
  const leavesEarned = st.challenge_month_leaves ?? st.challenge_leaves ?? 0
  const streak = st.challenge_streak ?? 0
  const successRate = totalDays > 0 ? Math.round((successDays / totalDays) * 100) : 0

  // Branches — active savings/investment current values
  const wealthItems = state.savings
    .filter(sv => sv.is_active && sv.current_value > 0)
    .sort((a, b) => b.current_value - a.current_value)
    .map(sv => ({ name: sv.name, type: SAVINGS_TYPE_LABEL[sv.type] || sv.type, value: sv.current_value }))
  const totalWealth = wealthItems.reduce((s, w) => s + w.value, 0)

  // Flowers — active goals and their progress
  const goalItems = state.goals
    .filter(g => g.is_active)
    .map(g => {
      const pct = g.goal_amount > 0 ? Math.min(100, Math.round((g.current_saved / g.goal_amount) * 100)) : 0
      return { name: g.name, target: g.goal_amount, current: g.current_saved, pct, completed: pct >= 100 }
    })
    .sort((a, b) => b.pct - a.pct)
  const completedGoals = goalItems.filter(g => g.completed).length
  const activeGoals = goalItems.length

  // Hero — single most impressive number
  let heroValue: number, heroLabel: string
  if (totalWealth > 0 && totalWealth >= rootsTotal) {
    heroValue = totalWealth; heroLabel = 'Future Wealth Built'
  } else if (rootsTotal > 0) {
    heroValue = rootsTotal; heroLabel = 'Growth This Cycle'
  } else {
    heroValue = totalIncome; heroLabel = 'Seed Received'
  }

  // Milestones — inline achievements per section
  const milestones: JourneyMilestone[] = []
  if (totalIncome > 0 && rootsPct >= 30)
    milestones.push({ emoji: '🌱', text: `${rootsPct}% of income invested — strong roots!`, section: 'roots' })
  else if (rootsTotal > 0 && rootsPct > 0)
    milestones.push({ emoji: '🌱', text: `${rootsPct}% of income directed to the future`, section: 'roots' })
  if (challengeEnabled) {
    if (streak >= 14) milestones.push({ emoji: '🔥', text: `${streak}-day streak — unstoppable!`, section: 'stem' })
    else if (streak >= 7) milestones.push({ emoji: '🌿', text: `${streak}-day streak — keep going!`, section: 'stem' })
    else if (successDays === 1) milestones.push({ emoji: '🌿', text: 'First challenge win this cycle!', section: 'stem' })
  }
  if (totalWealth >= 100000)
    milestones.push({ emoji: '🌳', text: 'Wealth crossed ₹1 lakh!', section: 'branch' })
  else if (totalWealth >= 50000)
    milestones.push({ emoji: '🌳', text: 'Wealth crossed ₹50,000!', section: 'branch' })
  if (completedGoals >= 1)
    milestones.push({ emoji: '🌺', text: `${completedGoals} goal${completedGoals > 1 ? 's' : ''} achieved this cycle!`, section: 'flower' })

  // Story line — one human sentence
  const brief = (n: number) => '₹' + (n >= 100000 ? +(n / 100000).toFixed(1) + 'L' : n >= 1000 ? Math.round(n / 1000) + 'k' : n)
  const storyOutcomes: string[] = []
  if (totalWealth > 0) storyOutcomes.push(`${brief(totalWealth)} of wealth`)
  if (challengeEnabled && successDays > 0) storyOutcomes.push(`${successDays} challenge win${successDays !== 1 ? 's' : ''}`)
  if (activeGoals > 0) storyOutcomes.push(`${activeGoals} active goal${activeGoals !== 1 ? 's' : ''}`)
  let storyLine: string
  if (totalIncome === 0) {
    storyLine = 'Your journey is just beginning. Log income to see your story grow.'
  } else if (storyOutcomes.length === 0) {
    storyLine = rootsTotal > 0
      ? `Your seed of ${brief(totalIncome)} is building roots — ${brief(rootsTotal)} directed to your future.`
      : `Your seed of ${brief(totalIncome)} is planted. Start building roots to grow.`
  } else {
    const joined = storyOutcomes.length === 1 ? storyOutcomes[0]
      : storyOutcomes.slice(0, -1).join(', ') + ' and ' + storyOutcomes[storyOutcomes.length - 1]
    storyLine = `Your seed of ${brief(totalIncome)} grew into ${joined}.`
  }

  // Health score (0–100)
  const healthBreakdown: JourneyHealthItem[] = []
  const savingsScore = rootsPct >= 30 ? 35 : rootsPct >= 20 ? 25 : rootsPct >= 10 ? 15 : rootsPct > 0 ? 8 : 0
  healthBreakdown.push({ label: 'Savings Rate', score: savingsScore, max: 35 })
  const challengeScore = challengeEnabled && totalDays > 0
    ? successRate >= 80 ? 30 : successRate >= 60 ? 22 : successRate >= 40 ? 14 : successRate >= 20 ? 7 : 0 : 0
  healthBreakdown.push({ label: 'Challenge', score: challengeScore, max: 30 })
  const avgGoalPct = goalItems.length > 0 ? goalItems.reduce((s, g) => s + g.pct, 0) / goalItems.length : 0
  const goalScore = avgGoalPct >= 75 ? 20 : avgGoalPct >= 50 ? 15 : avgGoalPct >= 25 ? 10 : avgGoalPct > 0 ? 5 : 0
  healthBreakdown.push({ label: 'Goal Momentum', score: goalScore, max: 20 })
  const wealthScore = totalWealth >= 100000 ? 15 : totalWealth >= 50000 ? 12 : totalWealth >= 10000 ? 8 : totalWealth > 0 ? 5 : 0
  healthBreakdown.push({ label: 'Wealth Growth', score: wealthScore, max: 15 })
  const healthScore = savingsScore + challengeScore + goalScore + wealthScore
  const healthLabel = healthScore >= 85 ? 'Thriving' : healthScore >= 70 ? 'Growing Strong' : healthScore >= 55 ? 'Building' : healthScore >= 40 ? 'Sprouting' : 'Just Planted'

  // Lifestyle spending — regular expenses in the cycle
  const lifestyleTxns = state.transactions.filter(
    t => t.transaction_type === 'expense' && new Date(t.transaction_date) >= cycleStart
  )
  const lifestyleSpending = lifestyleTxns.reduce((s, t) => s + t.amount, 0)
  const lifeCatAcc: Record<string, number> = {}
  lifestyleTxns.forEach(t => {
    const name = catMap[t.category_id ?? '']?.name || 'Other'
    lifeCatAcc[name] = (lifeCatAcc[name] || 0) + t.amount
  })
  const lifestyleCategories: JourneyFlowItem[] = Object.entries(lifeCatAcc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
  const spendingPct = totalIncome > 0 ? Math.round((lifestyleSpending / totalIncome) * 100) : 0

  // Saved breakdown — individual contributions this cycle grouped by name
  const savedAcc: Record<string, number> = {}
  state.transactions
    .filter(t => t.transaction_type === 'savings_contribution' && new Date(t.transaction_date) >= cycleStart)
    .forEach(t => { const n = t.description || 'Savings'; savedAcc[n] = (savedAcc[n] || 0) + t.amount })
  state.transactions
    .filter(t => t.transaction_type === 'commitment' && new Date(t.transaction_date) >= cycleStart)
    .forEach(t => { const n = t.description || 'Commitment'; savedAcc[n] = (savedAcc[n] || 0) + t.amount })
  state.goal_contributions
    .filter(gc => new Date(gc.created_at) >= cycleStart)
    .forEach(gc => { const n = state.goals.find(g => g.id === gc.goal_id)?.name || 'Goal'; savedAcc[n] = (savedAcc[n] || 0) + gc.amount })
  const savedBreakdown: JourneyFlowItem[] = Object.entries(savedAcc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)

  // Replay events — full chronological log with eventType for rendering
  const expenseCatEmoji = (catName?: string) => {
    const n = (catName || '').toLowerCase()
    if (n.includes('food') || n.includes('dining')) return '🍱'
    if (n.includes('medical') || n.includes('health')) return '🏥'
    if (n.includes('fuel') || n.includes('transport')) return '⛽'
    if (n.includes('shopping')) return '🛍️'
    if (n.includes('utility') || n.includes('electric') || n.includes('bill')) return '💡'
    return '🛒'
  }
  const replayEvents: JourneyReplayEvent[] = []
  state.transactions
    .filter(t => t.transaction_type === 'income' && new Date(t.transaction_date) >= cycleStart)
    .forEach(t => replayEvents.push({ date: t.transaction_date, emoji: '💰', title: t.description, subtitle: catMap[t.category_id ?? '']?.name, amount: t.amount, eventType: 'income' }))
  state.transactions
    .filter(t => t.transaction_type === 'savings_contribution' && new Date(t.transaction_date) >= cycleStart)
    .forEach(t => replayEvents.push({ date: t.transaction_date, emoji: '📈', title: t.description, amount: t.amount, eventType: 'savings' }))
  state.transactions
    .filter(t => t.transaction_type === 'commitment' && new Date(t.transaction_date) >= cycleStart)
    .forEach(t => replayEvents.push({ date: t.transaction_date, emoji: '🌱', title: t.description, amount: t.amount, eventType: 'commitment' }))
  state.goal_contributions
    .filter(gc => new Date(gc.created_at) >= cycleStart)
    .forEach(gc => replayEvents.push({ date: gc.created_at.slice(0, 10), emoji: '🎯', title: state.goals.find(g => g.id === gc.goal_id)?.name ?? 'Goal funded', amount: gc.amount, eventType: 'goal' }))
  lifestyleTxns.forEach(t => {
    const catName = catMap[t.category_id ?? '']?.name
    replayEvents.push({ date: t.transaction_date, emoji: expenseCatEmoji(catName), title: t.description, subtitle: catName, amount: t.amount, eventType: 'expense' })
  })
  replayEvents.sort((a, b) => a.date.localeCompare(b.date))

  // Growth efficiency = rootsTotal as % of totalIncome
  const efficiencyPct = totalIncome > 0 ? Math.round((rootsTotal / totalIncome) * 100) : 0

  // Previous cycle — for comparison
  const prevCycleEnd = new Date(cycleStart.getTime() - 86400000)
  let prevCycleStart: Date
  if (salaryDate && salaryDate >= 1 && salaryDate <= 31) {
    prevCycleStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth() - 1, salaryDate)
  } else {
    prevCycleStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth() - 1, 1)
  }
  const prevRootsTotal = state.transactions
    .filter(t => ['commitment', 'savings_contribution'].includes(t.transaction_type) &&
      new Date(t.transaction_date) >= prevCycleStart &&
      new Date(t.transaction_date) <= prevCycleEnd)
    .reduce((s, t) => s + t.amount, 0)
    + state.goal_contributions
      .filter(gc => { const d = new Date(gc.created_at); return d >= prevCycleStart && d <= prevCycleEnd })
      .reduce((s, gc) => s + gc.amount, 0)
  const prevSavingsContributed = state.transactions
    .filter(t => t.transaction_type === 'savings_contribution' &&
      new Date(t.transaction_date) >= prevCycleStart &&
      new Date(t.transaction_date) <= prevCycleEnd)
    .reduce((s, t) => s + t.amount, 0)
  const hasPrevData = prevRootsTotal > 0 || prevSavingsContributed > 0

  return {
    totalIncome, incomeItems,
    commitmentsPaid, savingsContributed, goalsContributed, rootsTotal, rootsPct,
    challengeEnabled, successDays, totalDays, leavesEarned, streak, successRate,
    wealthItems, totalWealth,
    goalItems, activeGoals, completedGoals,
    heroValue, heroLabel,
    milestones,
    storyLine,
    healthScore, healthLabel, healthBreakdown,
    replayEvents,
    lifestyleSpending, lifestyleCategories, savedBreakdown, spendingPct,
    efficiencyPct,
    prevRootsTotal, prevSavingsContributed, hasPrevData,
    cycleLabel,
  }
}
