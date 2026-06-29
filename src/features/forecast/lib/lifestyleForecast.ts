import type { AppState, DerivedMetrics, ForecastMode } from '@/types'
import type { CashFlowEvent, CashFlowForecast, CashFlowProjection } from '@/lib/cashflow'
import { buildCashFlowForecast, estimateForecastSalary } from '@/lib/cashflow'
import { getStrategyPcts, getCategoryBucket } from '@/components/BudgetStrategyCard'
import { getIncomePattern, getVariableMonthlyIncome } from '@/lib/income-pattern'
import { getCurrentFinancialCycle, type FinancialCycle } from '@/lib/financial-cycle'

export type { ForecastMode }

export type DailySpendSource = 'budget_strategy' | 'historical' | 'hybrid' | null
export type SpendConfidence = 'low' | 'medium' | 'high' | 'very_high'

export interface DailySpendEstimate {
  amount: number
  source: DailySpendSource
  breakdown?: { needs: number; wants: number }
  days?: number
  historyAmount?: number
  budgetAmount?: number
  historyWeight?: number
  confidence?: SpendConfidence
}

export interface BudgetRecommendation {
  amount: number
  needsDaily: number
  wantsDaily: number
  daysRemaining: number
  needsTarget: number
  needsSpent: number
  wantsTarget: number
  wantsSpent: number
  strategy: string
}

export type LifestyleRisk = 'healthy' | 'tight' | 'risk' | 'critical'

export interface LifestyleForecast extends CashFlowForecast {
  dailySpend: DailySpendEstimate
  recommendation: BudgetRecommendation | null
  safeUntilDate: string | null
  safeUntilLabel: string
  risk: LifestyleRisk
  lifestyleProjectionCount: number
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Budget-strategy-based daily spend ──
function estimateFromBudgetStrategy(state: AppState, d: DerivedMetrics): DailySpendEstimate | null {
  if (d.isWaitingForIncome) return null
  const pcts = getStrategyPcts(state.budget_strategy_settings)
  if (!pcts) return null

  const base = state.budget_strategy_settings.budget_strategy_base ?? 'income'
  const pattern = getIncomePattern(state.settings)
  const incomeAmount = base === 'available_funds'
    ? Math.max(0, d.availableBalance)
    : pattern === 'weekly'
    ? (state.settings.weekly_income ?? 0)
    : pattern === 'variable' || pattern === 'business'
    ? getVariableMonthlyIncome(state.settings)
    : (state.settings.monthly_salary ?? 0)

  if (incomeAmount <= 0) return null

  const cycle = d.financialCycle ?? getCurrentFinancialCycle(state)
  const periodStart = cycle.cycleStart
  const periodEnd = new Date(cycle.cycleEnd.getTime() + 86400000)

  const needsTarget = Math.round(incomeAmount * pcts.needs / 100)
  const wantsTarget = Math.round(incomeAmount * pcts.wants / 100)

  const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))

  let needsSpent = 0
  let wantsSpent = 0
  const periodStartIso = isoOf(periodStart)

  for (const t of state.transactions) {
    if (t.transaction_date < periodStartIso) continue
    if (t.transaction_type !== 'expense' && t.transaction_type !== 'commitment') continue
    const cat = catMap[t.category_id ?? '']
    if (!cat) continue
    const bucket = getCategoryBucket(cat, state.groups)
    if (bucket === 'needs') needsSpent += t.amount
    else if (bucket === 'wants') wantsSpent += t.amount
  }

  const today = midnight(new Date())
  const daysRemaining = Math.max(1, Math.round((periodEnd.getTime() - today.getTime()) / 86400000))

  const needsRemaining = Math.max(0, needsTarget - needsSpent)
  const wantsRemaining = Math.max(0, wantsTarget - wantsSpent)

  const needsDaily = Math.round(needsRemaining / daysRemaining)
  const wantsDaily = Math.round(wantsRemaining / daysRemaining)
  const total = needsDaily + wantsDaily

  if (total <= 0) return null

  return { amount: total, source: 'budget_strategy', breakdown: { needs: needsDaily, wants: wantsDaily } }
}

const HIST_EXCLUDED_TYPES = new Set([
  'opening_balance', 'balance_adjustment', 'credit_card_payment',
  'cc_opening_balance', 'cc_balance_adjustment',
  'savings_contribution', 'borrowing_given', 'borrowing_repayment',
  'income', 'transfer',
])
const HIST_EXCLUDED_GROUPS = new Set(['Income', 'Transfer', 'Borrowings', 'Adjustments', 'Savings'])

interface HistResult { amount: number; days: number; spendingDays: number; calendarDays: number }

function estimateFromHistory(state: AppState): HistResult | null {
  const today = midnight(new Date())
  const todayIso = isoOf(today)
  const sixtyDaysAgo = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 60))
  const thirtyDaysAgo = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30))

  const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))

  const dailyTotals60 = new Map<string, number>()
  const dailyTotals30 = new Map<string, number>()
  for (const t of state.transactions) {
    if (t.transaction_date > todayIso) continue
    if (HIST_EXCLUDED_TYPES.has(t.transaction_type)) continue
    const cat = catMap[t.category_id ?? '']
    if (cat && HIST_EXCLUDED_GROUPS.has(cat.group_name)) continue
    if (!(t.amount > 0)) continue
    if (t.transaction_date >= sixtyDaysAgo) {
      dailyTotals60.set(t.transaction_date, (dailyTotals60.get(t.transaction_date) ?? 0) + t.amount)
    }
    if (t.transaction_date >= thirtyDaysAgo) {
      dailyTotals30.set(t.transaction_date, (dailyTotals30.get(t.transaction_date) ?? 0) + t.amount)
    }
  }

  const has60 = dailyTotals60.size > dailyTotals30.size
  const dailyMap = has60 ? dailyTotals60 : dailyTotals30
  const periodDays = has60 ? 60 : 30
  if (dailyMap.size === 0) return null

  const dates = [...dailyMap.keys()].sort()
  const earliest = new Date(dates[0] + 'T00:00:00')
  const calendarDays = Math.max(1, Math.round((today.getTime() - earliest.getTime()) / 86400000))

  const sorted = [...dailyMap.values()].sort((a, b) => a - b)
  const trimCount = Math.max(1, Math.floor(sorted.length * 0.9))
  const trimmed = sorted.slice(0, trimCount)
  const trimmedSum = trimmed.reduce((s, v) => s + v, 0)
  const avg = Math.round(trimmedSum / trimmed.length)

  return avg > 0 ? { amount: avg, days: periodDays, spendingDays: dailyMap.size, calendarDays } : null
}

function getBudgetDailyAmount(state: AppState, d: DerivedMetrics): number | null {
  const est = estimateFromBudgetStrategy(state, d)
  return est ? est.amount : null
}

// ── Confidence & blending ──

function getConfidence(calendarDays: number): SpendConfidence {
  if (calendarDays >= 60) return 'very_high'
  if (calendarDays >= 30) return 'high'
  if (calendarDays >= 14) return 'medium'
  return 'low'
}

const CONFIDENCE_WEIGHTS: Record<SpendConfidence, number> = {
  low: 0.2,
  medium: 0.5,
  high: 0.7,
  very_high: 0.8,
}

// ── Public API ──

export function calculateBudgetRecommendation(state: AppState, d: DerivedMetrics): BudgetRecommendation | null {
  if (d.isWaitingForIncome) return null
  const pcts = getStrategyPcts(state.budget_strategy_settings)
  if (!pcts) return null

  const base = state.budget_strategy_settings.budget_strategy_base ?? 'income'
  const pattern = getIncomePattern(state.settings)
  const incomeAmount = base === 'available_funds'
    ? Math.max(0, d.availableBalance)
    : pattern === 'weekly'
    ? (state.settings.weekly_income ?? 0)
    : pattern === 'variable' || pattern === 'business'
    ? getVariableMonthlyIncome(state.settings)
    : (state.settings.monthly_salary ?? 0)

  if (incomeAmount <= 0) return null

  const cycle = d.financialCycle ?? getCurrentFinancialCycle(state)
  const periodStart = cycle.cycleStart
  const periodEnd = new Date(cycle.cycleEnd.getTime() + 86400000)

  const est = estimateFromBudgetStrategy(state, d)
  if (!est || !est.breakdown) return null

  const today = midnight(new Date())
  const daysRemaining = Math.max(1, Math.round((periodEnd.getTime() - today.getTime()) / 86400000))
  const needsTarget = Math.round(incomeAmount * pcts.needs / 100)
  const wantsTarget = Math.round(incomeAmount * pcts.wants / 100)
  const catMap = Object.fromEntries(state.categories.map(cc => [cc.id, cc]))
  const periodStartIso = isoOf(periodStart)
  let needsSpent = 0, wantsSpent = 0
  for (const t of state.transactions) {
    if (t.transaction_date < periodStartIso) continue
    if (t.transaction_type !== 'expense' && t.transaction_type !== 'commitment') continue
    const cat = catMap[t.category_id ?? '']
    if (!cat) continue
    const bucket = getCategoryBucket(cat, state.groups)
    if (bucket === 'needs') needsSpent += t.amount
    else if (bucket === 'wants') wantsSpent += t.amount
  }

  return {
    amount: est.amount,
    needsDaily: est.breakdown.needs,
    wantsDaily: est.breakdown.wants,
    daysRemaining,
    needsTarget,
    needsSpent: Math.round(needsSpent),
    wantsTarget,
    wantsSpent: Math.round(wantsSpent),
    strategy: pcts.label,
  }
}

const MAX_CHANGE_PCT = 0.25
let sessionPrevForecast: number | null = null

function smoothForecast(raw: number): number {
  if (sessionPrevForecast != null && sessionPrevForecast > 0 && Math.abs(raw - sessionPrevForecast) / sessionPrevForecast > MAX_CHANGE_PCT) {
    const smoothed = Math.round(sessionPrevForecast + (raw - sessionPrevForecast) * MAX_CHANGE_PCT)
    sessionPrevForecast = smoothed
    return smoothed
  }
  sessionPrevForecast = raw
  return raw
}

export function calculateDailySpendEstimate(state: AppState, d: DerivedMetrics): DailySpendEstimate {
  const hist = estimateFromHistory(state)
  const budgetAmt = getBudgetDailyAmount(state, d)

  if (!hist && budgetAmt == null) return { amount: 0, source: null }

  if (!hist && budgetAmt != null) {
    return { amount: budgetAmt, source: 'budget_strategy', budgetAmount: budgetAmt }
  }

  if (hist && budgetAmt == null) {
    const amount = smoothForecast(hist.amount)
    return { amount, source: 'historical', days: hist.days, historyAmount: hist.amount, confidence: getConfidence(hist.calendarDays) }
  }

  const confidence = getConfidence(hist!.calendarDays)
  const histWeight = CONFIDENCE_WEIGHTS[confidence]

  const raw = Math.round(hist!.amount * histWeight + budgetAmt! * (1 - histWeight))
  const amount = smoothForecast(raw)
  return {
    amount,
    source: 'hybrid',
    days: hist!.days,
    historyAmount: hist!.amount,
    budgetAmount: budgetAmt!,
    historyWeight: histWeight,
    confidence,
  }
}

export function buildLifestyleForecast(state: AppState, d: DerivedMetrics): LifestyleForecast {
  const base = buildCashFlowForecast(state, d)
  const dailySpend = calculateDailySpendEstimate(state, d)
  const recommendation = calculateBudgetRecommendation(state, d)

  if (dailySpend.amount <= 0 || dailySpend.source === null) {
    return {
      ...base,
      dailySpend,
      recommendation,
      safeUntilDate: null,
      safeUntilLabel: 'No spending data',
      risk: 'healthy',
      lifestyleProjectionCount: 0,
    }
  }

  const today = midnight(new Date())
  const days = state.forecast_settings.days ?? 30
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)

  // Collect existing event dates to avoid doubling up on the same day
  const existingDates = new Set(base.projections.map(p => p.event.date))

  // Generate synthetic daily spending events
  const syntheticEvents: CashFlowEvent[] = []
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

  while (cursor <= horizon) {
    const iso = isoOf(cursor)
    syntheticEvents.push({
      date: iso,
      title: 'Est. Daily Spending',
      amount: dailySpend.amount,
      type: 'expense',
      source: 'lifestyle',
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Merge all events (base + synthetic) and re-sort
  const allEvents: CashFlowEvent[] = [
    ...base.projections.map(p => p.event),
    ...syntheticEvents,
  ]

  allEvents.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1
    // Real events before synthetic on the same day
    if (a.title === 'Est. Daily Spending' && b.title !== 'Est. Daily Spending') return 1
    if (a.title !== 'Est. Daily Spending' && b.title === 'Est. Daily Spending') return -1
    return 0
  })

  // Run the balance forward
  let running = base.currentBalance
  let lowestBalance = base.currentBalance
  let lowestBalanceDate: string | undefined
  let nextSalaryDate = base.nextSalaryDate

  const projections: CashFlowProjection[] = allEvents.map(event => {
    running += event.type === 'income' ? event.amount : -event.amount
    if (running < lowestBalance) {
      lowestBalance = running
      lowestBalanceDate = event.date
    }
    return { event, balanceAfter: Math.round(running) }
  })

  // Recovery point
  let recoveryDate: string | undefined
  let recoveryBalance: number | undefined
  if (lowestBalance < 0) {
    let wentNegative = false
    for (const p of projections) {
      if (p.balanceAfter < 0) wentNegative = true
      else if (wentNegative && p.balanceAfter >= 0) {
        recoveryDate = p.event.date
        recoveryBalance = p.balanceAfter
        break
      }
    }
  }

  // Safe Until: last date where balance is still > 0
  let safeUntilDate: string | null = null
  let prevPositiveDate: string | null = isoOf(today)

  for (const p of projections) {
    if (p.balanceAfter > 0) {
      prevPositiveDate = p.event.date
    } else {
      break
    }
  }

  // Check if balance stays positive through the entire forecast
  const staysPositive = projections.length === 0 || projections.every(p => p.balanceAfter > 0)

  let safeUntilLabel: string
  if (staysPositive) {
    safeUntilDate = null
    safeUntilLabel = 'Safe throughout forecast'
  } else {
    safeUntilDate = prevPositiveDate
    if (safeUntilDate) {
      safeUntilLabel = new Date(safeUntilDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    } else {
      safeUntilLabel = 'Today'
    }
  }

  // Risk indicator — 4 levels
  const pat = getIncomePattern(state.settings)
  const fallbackIncome = pat === 'weekly'
    ? (state.settings.weekly_income ?? 0)
    : pat === 'variable' || pat === 'business'
    ? getVariableMonthlyIncome(state.settings)
    : (state.settings.monthly_salary ?? 0)
  const monthlyIncome = estimateForecastSalary(state).amount ?? fallbackIncome
  const threshold = Math.round(monthlyIncome * 0.25)

  let risk: LifestyleRisk
  if (lowestBalance < 0) {
    risk = recoveryDate ? 'risk' : 'critical'
  } else if (lowestBalance < threshold) {
    risk = 'tight'
  } else {
    risk = 'healthy'
  }

  return {
    currentBalance: base.currentBalance,
    lowestBalance: Math.round(lowestBalance),
    lowestBalanceDate,
    nextSalaryDate,
    recoveryDate,
    recoveryBalance,
    projections,
    dailySpend,
    recommendation,
    safeUntilDate,
    safeUntilLabel,
    risk,
    lifestyleProjectionCount: syntheticEvents.length,
  }
}
