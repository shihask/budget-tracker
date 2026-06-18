// All seed data removed — everything loads from Supabase.
// This file only contains pure calculation functions (no data).

import type { AppState, DerivedMetrics, TrendPoint, BarPoint, CatPoint, TimelineDayPoint, TimelineLane, MonthTimelineData } from '@/types'
import { TODAY, iso, addDays, getWeekStart, getMonthStart } from '@/lib/utils'

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
