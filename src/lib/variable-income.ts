import type { AppState, Settings, EstimateConfidence } from '@/types'
import { TODAY, iso, getWeekStart } from '@/lib/utils'
import { isSystemTx, catById } from '@/lib/data'

export interface HistoricalIncomeEstimate {
  avgDailyIncome: number
  workingDaysPerWeek: number
  totalIncome: number
  totalDays: number
  confidence: EstimateConfidence
  incomeVariance: number
  sampleDays: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

export function estimateHistoricalDailyIncome(state: AppState): HistoricalIncomeEstimate | null {
  const cutoff = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 60)
  const cutoffIso = iso(cutoff)

  const incomeTxns = state.transactions.filter(
    t => t.transaction_type === 'income' && t.amount > 0 && t.transaction_date >= cutoffIso
  )
  if (incomeTxns.length < 5) return null

  const dailyTotals: Record<string, number> = {}
  for (const t of incomeTxns) {
    dailyTotals[t.transaction_date] = (dailyTotals[t.transaction_date] || 0) + t.amount
  }

  const dailyAmounts = Object.values(dailyTotals)
  const workingDaysCount = dailyAmounts.length

  // Conservative estimate: use median instead of mean to reduce impact of outliers
  const avgDailyIncome = Math.round(median(dailyAmounts))

  const totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0)
  const totalDays = Math.max(1, Math.round((TODAY.getTime() - cutoff.getTime()) / 86400000))
  const totalWeeks = totalDays / 7
  const workingDaysPerWeek = Math.round(workingDaysCount / totalWeeks * 10) / 10

  // Confidence scoring
  const cv = coefficientOfVariation(dailyAmounts)
  const consistency = workingDaysPerWeek / 7
  let confidence: EstimateConfidence
  if (workingDaysCount >= 20 && cv < 0.4) {
    confidence = 'high'
  } else if (workingDaysCount >= 10 && cv < 0.7) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  return { avgDailyIncome, workingDaysPerWeek, totalIncome, totalDays, confidence, incomeVariance: Math.round(cv * 100), sampleDays: workingDaysCount }
}

export function calculateAvgDailySpending(state: AppState): number {
  const cutoff = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 30)
  const cutoffIso = iso(cutoff)
  const catMap = catById(state.categories)

  let total = 0
  for (const t of state.transactions) {
    if (t.transaction_date < cutoffIso) continue
    if (isSystemTx(t, catMap)) continue
    if (t.transaction_type === 'expense' || t.transaction_type === 'commitment') {
      total += t.amount
    }
  }
  return Math.round(total / 30)
}

export function calculateSafeUntilDays(realFreeMoney: number, avgDailySpending: number): number {
  if (avgDailySpending <= 0) return realFreeMoney > 0 ? 999 : 0
  return Math.max(0, Math.floor(realFreeMoney / avgDailySpending))
}

export function calculateTodaySummary(state: AppState): { todayIncome: number; todaySpending: number; todaySaving: number } {
  const todayStr = iso(TODAY)
  let todayIncome = 0, todaySpending = 0, todaySaving = 0

  for (const t of state.transactions) {
    if (t.transaction_date !== todayStr) continue
    switch (t.transaction_type) {
      case 'income':
        todayIncome += t.amount; break
      case 'expense':
        todaySpending += t.amount; break
      case 'commitment':
        todaySaving += t.amount; break
      case 'savings_contribution':
        todaySaving += t.amount; break
    }
  }
  return { todayIncome, todaySpending, todaySaving }
}

export function calculateWeekSummary(state: AppState, settings: Settings): { weekEarned: number; weekSpent: number; weekSaved: number } {
  const weekStart = getWeekStart(TODAY, settings.weekly_start_day ?? 1)
  const weekStartIso = iso(weekStart)
  let weekEarned = 0, weekSpent = 0, weekSaved = 0

  for (const t of state.transactions) {
    if (t.transaction_date < weekStartIso) continue
    switch (t.transaction_type) {
      case 'income':
        weekEarned += t.amount; break
      case 'expense':
        weekSpent += t.amount; break
      case 'commitment':
      case 'savings_contribution':
        weekSaved += t.amount; break
    }
  }
  return { weekEarned, weekSpent, weekSaved }
}
