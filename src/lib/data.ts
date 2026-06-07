// All seed data removed — everything loads from Supabase.
// This file only contains pure calculation functions (no data).

import type { AppState, DerivedMetrics, TrendPoint, BarPoint, CatPoint } from '@/types'
import { TODAY, iso, addDays, getWeekStart, getMonthStart } from '@/lib/utils'

export const catById = (categories: AppState['categories']) =>
  Object.fromEntries(categories.map(c => [c.id, c]))

export const WEEK_START = getWeekStart(TODAY)
export const MONTH_START = getMonthStart(TODAY)

const isLifestyle = (t: AppState['transactions'][0], catMap: ReturnType<typeof catById>) =>
  catMap[t.category_id!]?.group_name === 'Lifestyle'

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
  const weeklySpent = state.transactions
    .filter(t => isLifestyle(t, catMap) && new Date(t.transaction_date) >= WEEK_START)
    .reduce((s, t) => s + t.amount, 0)
  const weeklyRemaining = weeklyBudget - weeklySpent
  const weeklyPct = weeklyBudget ? (weeklySpent / weeklyBudget) * 100 : 0

  const renovationGroupName = state.settings.renovation_group ?? 'Renovation'
  const renovationMonth = state.transactions
    .filter(t => catMap[t.category_id!]?.group_name === renovationGroupName && new Date(t.transaction_date) >= MONTH_START)
    .reduce((s, t) => s + t.amount, 0)

  return {
    actualBalance, emergencyFund, availableBalance, remainingCommitments,
    realFreeMoney, weeklyBudget, weeklySpent, weeklyRemaining, weeklyPct, renovationMonth,
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
