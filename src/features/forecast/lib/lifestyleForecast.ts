import type { AppState, DerivedMetrics, ForecastMode } from '@/types'
import type { CashFlowEvent, CashFlowForecast, CashFlowProjection } from '@/lib/cashflow'
import { buildCashFlowForecast, estimateForecastSalary } from '@/lib/cashflow'
import { getStrategyPcts, getCategoryBucket } from '@/components/BudgetStrategyCard'
import { getIncomePattern, getVariableMonthlyIncome } from '@/lib/income-pattern'
import { getWeekStart } from '@/lib/utils'

export type { ForecastMode }

export type DailySpendSource = 'budget_strategy' | 'historical' | null

export interface DailySpendEstimate {
  amount: number
  source: DailySpendSource
  breakdown?: { needs: number; wants: number }
}

export type LifestyleRisk = 'safe' | 'watch' | 'risk'

export interface LifestyleForecast extends CashFlowForecast {
  dailySpend: DailySpendEstimate
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

  const now = new Date()
  let periodStart: Date
  let periodEnd: Date

  if (pattern === 'weekly') {
    const incDay = state.settings.income_day ?? 5
    periodStart = getWeekStart(now, incDay)
    periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 7)
  } else if (pattern === 'variable' || pattern === 'business') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  } else {
    const sd = state.settings.salary_date
    if (sd && sd >= 1 && sd <= 31) {
      const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
      periodStart = day >= sd ? new Date(y, m, sd) : new Date(y, m - 1, sd)
      periodEnd = day >= sd ? new Date(y, m + 1, sd) : new Date(y, m, sd)
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    }
  }

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

  const today = midnight(now)
  const daysRemaining = Math.max(1, Math.round((periodEnd.getTime() - today.getTime()) / 86400000))

  const needsRemaining = Math.max(0, needsTarget - needsSpent)
  const wantsRemaining = Math.max(0, wantsTarget - wantsSpent)

  const needsDaily = Math.round(needsRemaining / daysRemaining)
  const wantsDaily = Math.round(wantsRemaining / daysRemaining)
  const total = needsDaily + wantsDaily

  if (total <= 0) return null

  return { amount: total, source: 'budget_strategy', breakdown: { needs: needsDaily, wants: wantsDaily } }
}

// ── Historical-average-based daily spend ──
function estimateFromHistory(state: AppState): DailySpendEstimate | null {
  const today = midnight(new Date())
  const thirtyDaysAgo = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30))
  const todayIso = isoOf(today)

  const EXCLUDED_TYPES = new Set([
    'opening_balance', 'balance_adjustment', 'credit_card_payment',
    'cc_opening_balance', 'cc_balance_adjustment',
    'savings_contribution', 'borrowing_given', 'borrowing_repayment',
    'income', 'transfer',
  ])

  const EXCLUDED_GROUPS = new Set(['Income', 'Transfer', 'Borrowings', 'Adjustments', 'Savings'])
  const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))

  let total = 0
  for (const t of state.transactions) {
    if (t.transaction_date < thirtyDaysAgo || t.transaction_date > todayIso) continue
    if (EXCLUDED_TYPES.has(t.transaction_type)) continue
    const cat = catMap[t.category_id ?? '']
    if (cat && EXCLUDED_GROUPS.has(cat.group_name)) continue
    if (t.amount > 0) total += t.amount
  }

  const avg = Math.round(total / 30)
  if (avg <= 0) return null

  return { amount: avg, source: 'historical' }
}

// ── Public API ──

export function calculateDailySpendEstimate(state: AppState, d: DerivedMetrics): DailySpendEstimate {
  const fromStrategy = estimateFromBudgetStrategy(state, d)
  if (fromStrategy) return fromStrategy

  const fromHistory = estimateFromHistory(state)
  if (fromHistory) return fromHistory

  return { amount: 0, source: null }
}

export function buildLifestyleForecast(state: AppState, d: DerivedMetrics): LifestyleForecast {
  const base = buildCashFlowForecast(state, d)
  const dailySpend = calculateDailySpendEstimate(state, d)

  if (dailySpend.amount <= 0 || dailySpend.source === null) {
    return {
      ...base,
      dailySpend,
      safeUntilDate: null,
      safeUntilLabel: 'No spending data',
      risk: 'safe',
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
      source: 'planned', // reuse existing source type for compatibility
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
    const incomeLabel = getIncomePattern(state.settings) === 'monthly' ? 'Beyond Next Salary' : 'Beyond Next Income'
    safeUntilLabel = nextSalaryDate ? incomeLabel : 'End of Forecast'
  } else {
    safeUntilDate = prevPositiveDate
    const salaryEst = estimateForecastSalary(state)
    if (salaryEst.amount && nextSalaryDate && prevPositiveDate && prevPositiveDate >= nextSalaryDate) {
      safeUntilLabel = getIncomePattern(state.settings) === 'monthly' ? 'Next Salary ✓' : 'Next Income ✓'
    } else if (safeUntilDate) {
      safeUntilLabel = new Date(safeUntilDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    } else {
      safeUntilLabel = 'Today'
    }
  }

  // Risk indicator
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
    risk = 'risk'
  } else if (lowestBalance < threshold) {
    risk = 'watch'
  } else {
    risk = 'safe'
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
    safeUntilDate,
    safeUntilLabel,
    risk,
    lifestyleProjectionCount: syntheticEvents.length,
  }
}
