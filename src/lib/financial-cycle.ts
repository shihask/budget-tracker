import type { AppState, Transaction, IncomePattern } from '@/types'
import { getIncomePattern } from '@/lib/income-pattern'
import { INCOME_GROUP } from '@/lib/constants'
import { getWeekStart } from '@/lib/utils'

export type CycleSource = 'transaction' | 'calendar_fallback' | 'estimated'

export interface FinancialCycle {
  cycleStart: Date
  cycleEnd: Date
  currentDay: number
  totalDays: number
  daysRemaining: number
  weeksRemaining: number
  latestIncomeTransaction: Transaction | null
  isWaitingForIncome: boolean
  expectedIncomeDate: Date | null
  status: 'active' | 'waiting'
  source: CycleSource
  startLabel: string
  endLabel: string
}

const MS_DAY = 86400000
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

function parseTxDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isPrimaryIncomeTransaction(
  t: Transaction,
  state: AppState,
): boolean {
  if (t.transaction_type !== 'income') return false
  if (!(t.amount > 0)) return false

  const today = midnight(new Date())
  if (parseTxDate(t.transaction_date) > today) return false

  if (t.category_id == null) return false
  const cat = state.categories.find(c => c.id === t.category_id)
  if (!cat) return false

  const primaryId = state.settings.primary_income_category_id
  if (primaryId) return t.category_id === primaryId

  if (cat.group_name !== INCOME_GROUP) return false
  if (cat.name.toLowerCase() === 'refund') return false
  return true
}

function getExpectedCycleDays(pattern: IncomePattern): number {
  return pattern === 'weekly' ? 7 : 30
}

function getClusterWindow(pattern: IncomePattern): number {
  return pattern === 'weekly' ? 3 : 15
}

function nextDueDayAfter(dueDay: number, after: Date): Date {
  const y = after.getFullYear()
  const m = after.getMonth()
  const d = after.getDate()
  const clamped = Math.min(dueDay, new Date(y, m + 1, 0).getDate())
  if (d < clamped) return new Date(y, m, clamped)
  const nextM = m + 1
  const nextClamped = Math.min(dueDay, new Date(y, nextM + 1, 0).getDate())
  return new Date(y, nextM, nextClamped)
}

function estimateCycleEnd(
  cycleStart: Date,
  pattern: IncomePattern,
  salaryDate: number | null,
): Date {
  switch (pattern) {
    case 'monthly': {
      const sd = salaryDate ?? cycleStart.getDate()
      const nextSalary = nextDueDayAfter(sd, new Date(cycleStart.getTime() + MS_DAY))
      return new Date(nextSalary.getTime() - MS_DAY)
    }
    case 'weekly':
      return new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + 6,
      )
    case 'variable':
    case 'business':
    default: {
      const lastDay = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 0)
      return lastDay
    }
  }
}

function computeExpectedIncomeDate(
  pattern: IncomePattern,
  settings: AppState['settings'],
  today: Date,
): Date | null {
  switch (pattern) {
    case 'monthly': {
      const sd = settings.salary_date
      if (sd == null || sd < 1 || sd > 31) return null
      const y = today.getFullYear()
      const m = today.getMonth()
      const day = today.getDate()
      const clamped = Math.min(sd, new Date(y, m + 1, 0).getDate())
      const thisMonth = new Date(y, m, clamped)
      if (day >= clamped) return thisMonth
      const prevClamped = Math.min(sd, new Date(y, m, 0).getDate())
      return new Date(y, m - 1, prevClamped)
    }
    case 'weekly': {
      const incDay = settings.income_day ?? 5
      const dow = today.getDay()
      const diff = (incDay - dow + 7) % 7
      if (diff === 0) return today
      const lastOccurrence = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (7 - diff))
      return lastOccurrence
    }
    case 'variable':
    case 'business':
    default:
      return null
  }
}

function buildCalendarFallback(
  pattern: IncomePattern,
  settings: AppState['settings'],
  today: Date,
): FinancialCycle {
  let cycleStart: Date
  let cycleEnd: Date

  switch (pattern) {
    case 'monthly': {
      const sd = settings.salary_date
      if (sd && sd >= 1 && sd <= 31) {
        const y = today.getFullYear()
        const m = today.getMonth()
        const day = today.getDate()
        cycleStart = day >= sd
          ? new Date(y, m, sd)
          : new Date(y, m - 1, sd)
        const endMonth = cycleStart.getMonth() + 1
        const endClamped = Math.min(sd - 1, new Date(cycleStart.getFullYear(), endMonth + 1, 0).getDate())
        cycleEnd = new Date(cycleStart.getFullYear(), endMonth, endClamped)
      } else {
        cycleStart = new Date(today.getFullYear(), today.getMonth(), 1)
        cycleEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      }
      break
    }
    case 'weekly': {
      const incDay = settings.income_day ?? 5
      cycleStart = getWeekStart(today, incDay)
      cycleEnd = new Date(
        cycleStart.getFullYear(),
        cycleStart.getMonth(),
        cycleStart.getDate() + 6,
      )
      break
    }
    case 'variable':
    case 'business':
    default: {
      cycleStart = new Date(today.getFullYear(), today.getMonth(), 1)
      cycleEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      break
    }
  }

  const todayMid = midnight(today)
  const daysRemaining = Math.max(1, Math.round((cycleEnd.getTime() - todayMid.getTime()) / MS_DAY) + 1)
  const totalDays = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / MS_DAY) + 1)
  const currentDay = totalDays - daysRemaining + 1

  return {
    cycleStart,
    cycleEnd,
    currentDay,
    totalDays,
    daysRemaining,
    weeksRemaining: daysRemaining / 7,
    latestIncomeTransaction: null,
    isWaitingForIncome: false,
    expectedIncomeDate: computeExpectedIncomeDate(pattern, settings, today),
    status: 'active',
    source: 'calendar_fallback',
    startLabel: fmtDate(cycleStart),
    endLabel: fmtDate(cycleEnd),
  }
}

export function getCurrentFinancialCycle(state: AppState): FinancialCycle {
  const pattern = getIncomePattern(state.settings)
  const today = midnight(new Date())

  const qualifying = state.transactions
    .filter(t => isPrimaryIncomeTransaction(t, state))
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))

  if (qualifying.length === 0) {
    return buildCalendarFallback(pattern, state.settings, today)
  }

  let latestIncome = qualifying[0]
  let cycleStart = parseTxDate(latestIncome.transaction_date)

  const clusterWindow = getClusterWindow(pattern)
  const mostRecentDate = cycleStart.getTime()
  for (let i = 1; i < qualifying.length; i++) {
    const txnDate = parseTxDate(qualifying[i].transaction_date)
    const daysDiff = (mostRecentDate - txnDate.getTime()) / MS_DAY
    if (daysDiff <= clusterWindow) {
      cycleStart = txnDate
      latestIncome = qualifying[i]
    } else {
      break
    }
  }

  const cycleEnd = estimateCycleEnd(cycleStart, pattern, state.settings.salary_date)

  const expectedIncomeDate = computeExpectedIncomeDate(pattern, state.settings, today)
  let isWaitingForIncome = false
  if (expectedIncomeDate) {
    const expectedMid = midnight(expectedIncomeDate)
    if (today.getTime() >= expectedMid.getTime() && cycleStart.getTime() < expectedMid.getTime()) {
      isWaitingForIncome = true
    }
  }

  const todayMid = today
  const daysRemaining = Math.max(1, Math.round((cycleEnd.getTime() - todayMid.getTime()) / MS_DAY) + 1)
  const totalDays = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / MS_DAY) + 1)
  const currentDay = totalDays - daysRemaining + 1

  return {
    cycleStart,
    cycleEnd,
    currentDay,
    totalDays,
    daysRemaining,
    weeksRemaining: daysRemaining / 7,
    latestIncomeTransaction: latestIncome,
    isWaitingForIncome,
    expectedIncomeDate,
    status: isWaitingForIncome ? 'waiting' : 'active',
    source: 'transaction',
    startLabel: fmtDate(cycleStart),
    endLabel: fmtDate(cycleEnd),
  }
}
