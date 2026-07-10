import type { AppState, DerivedMetrics, ForecastMode, Transaction, Category, Group } from '@/types'
import type { CashFlowEvent, CashFlowForecast, CashFlowProjection } from '@/lib/cashflow'
import { buildCashFlowForecast, estimateForecastSalary } from '@/lib/cashflow'
import { getStrategyPcts, getCategoryBucket } from '@/lib/budget-strategy'
import { getIncomePattern, getVariableMonthlyIncome } from '@/lib/income-pattern'
import { getCurrentFinancialCycle, type FinancialCycle } from '@/lib/financial-cycle'

export type { ForecastMode }

export type DailySpendSource = 'budget_strategy' | 'historical' | 'hybrid' | 'manual' | null
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
  calendarDays?: number
  // Steady-state daily rate for forecast days beyond the current budget cycle —
  // see buildLifestyleForecast's synthetic-events loop. Always populated; equals
  // `amount` whenever the estimate has no cycle-specific component (historical-only,
  // manual, or cold-start fallback).
  normalizedAmount: number
}

export interface DailySpendOptions {
  // When set (Manual budget mode), this figure is used as-is — the historical/
  // strategy blend is skipped entirely. Manual mode means the app follows the
  // user's stated budget, not an estimate of what they actually spend.
  manualDailyAmount?: number
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

  // Steady-state rate for days beyond this cycle: the FULL targets spread over a
  // FULL cycle length — not "what's left of this cycle's budget ÷ days left in it".
  // The in-cycle rate above is only valid until cycleEnd; reusing it for a 60-day
  // forecast that spans multiple cycles double-counts a single cycle's budget.
  const cycleLengthDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000))
  const normalizedNeedsDaily = Math.round(needsTarget / cycleLengthDays)
  const normalizedWantsDaily = Math.round(wantsTarget / cycleLengthDays)
  const normalizedTotal = normalizedNeedsDaily + normalizedWantsDaily

  if (total <= 0 && normalizedTotal <= 0) return null

  return {
    amount: total,
    normalizedAmount: normalizedTotal,
    source: 'budget_strategy',
    breakdown: { needs: needsDaily, wants: wantsDaily },
  }
}

const BEHAVIORAL_GROUP_TYPES = new Set(['discretionary', 'essential'])

export function isBehavioralSpending(
  t: Transaction,
  catMap: Record<string, Category>,
  groupsByName: Record<string, Group>,
): boolean {
  if (t.transaction_type !== 'expense') return false
  if (!(t.amount > 0)) return false
  const cat = catMap[t.category_id ?? '']
  if (!cat) return false
  const group = groupsByName[cat.group_name]
  if (!group?.type) return false
  return BEHAVIORAL_GROUP_TYPES.has(group.type)
}

interface HistResult { amount: number; days: number; spendingDays: number; calendarDays: number }

function estimateFromHistory(state: AppState): HistResult | null {
  const today = midnight(new Date())
  const todayIso = isoOf(today)
  const sixtyDaysAgo = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 60))
  const thirtyDaysAgo = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30))

  const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))
  const groupsByName = Object.fromEntries(state.groups.map(g => [g.name, g]))

  const dailyTotals60 = new Map<string, number>()
  const dailyTotals30 = new Map<string, number>()
  for (const t of state.transactions) {
    if (t.transaction_date > todayIso) continue
    if (!isBehavioralSpending(t, catMap, groupsByName)) continue
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

function getBudgetDailyAmount(state: AppState, d: DerivedMetrics): { amount: number; normalizedAmount: number } | null {
  const est = estimateFromBudgetStrategy(state, d)
  return est ? { amount: est.amount, normalizedAmount: est.normalizedAmount } : null
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

export function calculateDailySpendEstimate(state: AppState, d: DerivedMetrics, opts?: DailySpendOptions): DailySpendEstimate {
  if (opts?.manualDailyAmount != null) {
    return { amount: opts.manualDailyAmount, normalizedAmount: opts.manualDailyAmount, source: 'manual' }
  }

  const hist = estimateFromHistory(state)
  const budgetAmt = getBudgetDailyAmount(state, d)

  if (!hist && budgetAmt == null) {
    // Cold start — no history and no Budget Strategy configured. Fall back to
    // the onboarding-suggested weekly budget rather than reserving nothing.
    const fallback = state.settings.weekly_budget > 0 ? Math.round(state.settings.weekly_budget / 7) : 0
    return fallback > 0
      ? { amount: fallback, normalizedAmount: fallback, source: 'manual' }
      : { amount: 0, normalizedAmount: 0, source: null }
  }

  if (!hist && budgetAmt != null) {
    return { amount: budgetAmt.amount, normalizedAmount: budgetAmt.normalizedAmount, source: 'budget_strategy', budgetAmount: budgetAmt.amount }
  }

  if (hist && budgetAmt == null) {
    const amount = smoothForecast(hist.amount)
    return { amount, normalizedAmount: amount, source: 'historical', days: hist.days, historyAmount: hist.amount, confidence: getConfidence(hist.calendarDays), calendarDays: hist.calendarDays }
  }

  const confidence = getConfidence(hist!.calendarDays)
  const histWeight = CONFIDENCE_WEIGHTS[confidence]

  const raw = Math.round(hist!.amount * histWeight + budgetAmt!.amount * (1 - histWeight))
  const amount = smoothForecast(raw)
  // Same blend, but using the normalized (steady-state) budget-strategy rate instead
  // of the in-cycle one — history has no cycle-boundary concept, so its contribution
  // to the blend is identical either way.
  const normalizedAmount = Math.round(hist!.amount * histWeight + budgetAmt!.normalizedAmount * (1 - histWeight))
  return {
    amount,
    normalizedAmount,
    source: 'hybrid',
    days: hist!.days,
    historyAmount: hist!.amount,
    budgetAmount: budgetAmt!.amount,
    historyWeight: histWeight,
    confidence,
    calendarDays: hist!.calendarDays,
  }
}

export function buildLifestyleForecast(state: AppState, d: DerivedMetrics, opts?: DailySpendOptions): LifestyleForecast {
  const base = buildCashFlowForecast(state, d)
  const dailySpend = calculateDailySpendEstimate(state, d, opts)
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
  const cycle = d.financialCycle ?? getCurrentFinancialCycle(state)
  const cycleEnd = midnight(cycle.cycleEnd)

  // Collect existing event dates to avoid doubling up on the same day
  const existingDates = new Set(base.projections.map(p => p.event.date))

  // Generate synthetic daily spending events. Days within the current cycle use the
  // in-cycle pace (dailySpend.amount); days beyond it use the normalized steady-state
  // rate (dailySpend.normalizedAmount) — a forecast horizon longer than one cycle must
  // not repeat "what's left of this cycle's budget" across cycles it doesn't apply to.
  const syntheticEvents: CashFlowEvent[] = []
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

  while (cursor <= horizon) {
    const iso = isoOf(cursor)
    syntheticEvents.push({
      date: iso,
      title: 'Est. Daily Spending',
      amount: cursor <= cycleEnd ? dailySpend.amount : dailySpend.normalizedAmount,
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

// Mirrors simulatePurchase() in cashflow.ts, but runs the lifestyle-aware
// engine (known bills + estimated ongoing spending) instead of known-events-only.
export function simulateLifestylePurchase(state: AppState, derived: DerivedMetrics, amount: number, opts?: DailySpendOptions): LifestyleForecast {
  return buildLifestyleForecast(state, { ...derived, availableBalance: derived.availableBalance - amount }, opts)
}
