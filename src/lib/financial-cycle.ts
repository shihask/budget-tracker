import type { AppState, Transaction, IncomePattern } from '@/types'
import { getIncomePattern } from '@/lib/income-pattern'
import { INCOME_GROUP } from '@/lib/constants'
import { getWeekStart } from '@/lib/utils'

export type CycleSource = 'transaction' | 'calendar_fallback' | 'estimated'

// Single source of truth for "when is the next primary income expected?"
// Used by: Financial Planning (obligation reservation), Cashflow Forecast, Hero, AI.
// Never duplicate this prediction logic elsewhere.
export interface ExpectedNextIncome {
  expectedDate: Date | null
  confidence: 'high' | 'medium' | 'low'
  source: 'configured' | 'estimated' | 'unknown'
}

export function getExpectedNextPrimaryIncome(
  state: AppState,
  referenceDate?: Date,
): ExpectedNextIncome {
  const pattern = getIncomePattern(state.settings)
  const ref = midnight(referenceDate ?? new Date())

  switch (pattern) {
    case 'monthly': {
      const sd = state.settings.salary_date
      if (sd == null || sd < 1 || sd > 31) {
        return { expectedDate: null, confidence: 'low', source: 'unknown' }
      }
      // nextDueDayAfter(sd, ref): if today IS salary day, returns next month's salary.
      // If today < salary day, returns this month's salary. Always "after today."
      return { expectedDate: nextDueDayAfter(sd, ref), confidence: 'high', source: 'configured' }
    }
    case 'weekly': {
      const incDay = state.settings.income_day ?? 5
      const dow = ref.getDay()
      const diff = (incDay - dow + 7) % 7
      // diff === 0 means today IS income day → skip to next week
      const daysToAdd = diff === 0 ? 7 : diff
      const next = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + daysToAdd)
      return { expectedDate: next, confidence: 'high', source: 'configured' }
    }
    case 'variable': {
      // Same weekly cadence as generateIncomeEvents in cashflow.ts: weekly_start_day
      const startDay = state.settings.weekly_start_day ?? 1
      const dow = ref.getDay()
      const diff = (startDay - dow + 7) % 7
      const daysToAdd = diff === 0 ? 7 : diff
      const next = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + daysToAdd)
      const hasHistory = state.transactions.some(t => isPrimaryIncomeTransaction(t, state))
      return { expectedDate: next, confidence: hasHistory ? 'medium' : 'low', source: 'estimated' }
    }
    case 'business': {
      // Same monthly cadence as generateIncomeEvents in cashflow.ts: day 1 of month
      // nextDueDayAfter(1, ref): if today IS the 1st, returns next month's 1st.
      return { expectedDate: nextDueDayAfter(1, ref), confidence: 'medium', source: 'estimated' }
    }
    default:
      return { expectedDate: null, confidence: 'low', source: 'unknown' }
  }
}

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

export function parseTxDate(dateStr: string): Date {
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

function hasValidSalaryDate(sd: number | null | undefined): sd is number {
  return sd != null && sd >= 1 && sd <= 31
}

// Only monthly/weekly, only when primary_income_category_id is NOT set (that path is
// already a strict, deliberate filter and stays untouched), and only when there's an
// actual schedule to compare against.
function isScheduleGuardActive(pattern: IncomePattern, settings: AppState['settings']): boolean {
  if (settings.primary_income_category_id) return false
  if (pattern === 'monthly') return hasValidSalaryDate(settings.salary_date)
  if (pattern === 'weekly') return true // income_day always has a default
  return false // variable / business: fully untouched
}

function getEarlyPaydayTolerance(pattern: IncomePattern): number {
  // Never exceed the late/cluster window — keeps the two thresholds from drifting
  // apart if getClusterWindow() is ever retuned.
  return Math.min(getClusterWindow(pattern), 5)
}

function nextWeeklyPaydayAfter(incDay: number, after: Date): Date {
  const dow = after.getDay()
  const diff = (incDay - dow + 7) % 7
  const daysToAdd = diff === 0 ? 7 : diff
  return new Date(after.getFullYear(), after.getMonth(), after.getDate() + daysToAdd)
}

// Can this transaction legitimately anchor/extend a financial cycle? True if it's on
// schedule (near a real payday, either slightly late — arrears tolerance — or slightly
// early). False for supplementary income (bonus, freelance, gifts, etc.) landing far
// from any scheduled payday, which should never restart the cycle by itself.
function isEligibleCycleAnchor(txnDate: Date, pattern: IncomePattern, settings: AppState['settings']): boolean {
  const clusterWindow = getClusterWindow(pattern)
  const earlyTolerance = getEarlyPaydayTolerance(pattern)
  if (pattern === 'monthly') {
    const sd = settings.salary_date as number
    const prevPayday = computeExpectedIncomeDate('monthly', settings, txnDate)!
    if ((txnDate.getTime() - prevPayday.getTime()) / MS_DAY <= clusterWindow) return true
    const nextPayday = nextDueDayAfter(sd, txnDate)
    return (nextPayday.getTime() - txnDate.getTime()) / MS_DAY <= earlyTolerance
  }
  if (pattern === 'weekly') {
    const incDay = settings.income_day ?? 5
    const prevPayday = computeExpectedIncomeDate('weekly', settings, txnDate)!
    if ((txnDate.getTime() - prevPayday.getTime()) / MS_DAY <= clusterWindow) return true
    const nextPayday = nextWeeklyPaydayAfter(incDay, txnDate)
    return (nextPayday.getTime() - txnDate.getTime()) / MS_DAY <= earlyTolerance
  }
  return true // unreachable given isScheduleGuardActive gating
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

// Walks one cycle further into the past, given a cycle already computed (current or previous).
// Prefers the qualifying income transaction right before `cycle.cycleStart`; falls back to a
// fixed calendar shift (7 days for weekly, 1 month otherwise) when no such transaction exists.
export function getPreviousFinancialCycle(
  state: AppState,
  cycle: FinancialCycle,
  pattern: IncomePattern,
): FinancialCycle {
  const cycleStart = cycle.cycleStart
  const prevCycleEnd = new Date(cycleStart.getTime() - MS_DAY)

  const prevIncomeTxns = state.transactions
    .filter(t => isPrimaryIncomeTransaction(t, state) && parseTxDate(t.transaction_date) < cycleStart)
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))

  const guardActive = isScheduleGuardActive(pattern, state.settings)
  const seedIdx = guardActive
    ? prevIncomeTxns.findIndex(t => isEligibleCycleAnchor(parseTxDate(t.transaction_date), pattern, state.settings))
    : (prevIncomeTxns.length > 0 ? 0 : -1)

  let prevCycleStart: Date
  let latestIncomeTransaction: Transaction | null = null
  let source: CycleSource
  if (seedIdx !== -1) {
    latestIncomeTransaction = prevIncomeTxns[seedIdx]
    prevCycleStart = parseTxDate(latestIncomeTransaction.transaction_date)
    source = 'transaction'
  } else if (pattern === 'weekly') {
    prevCycleStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() - 7)
    source = 'calendar_fallback'
  } else {
    prevCycleStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth() - 1, cycleStart.getDate())
    source = 'calendar_fallback'
  }

  const totalDays = Math.max(1, Math.round((prevCycleEnd.getTime() - prevCycleStart.getTime()) / MS_DAY) + 1)

  return {
    cycleStart: prevCycleStart,
    cycleEnd: prevCycleEnd,
    currentDay: totalDays,
    totalDays,
    daysRemaining: 0,
    weeksRemaining: 0,
    latestIncomeTransaction,
    isWaitingForIncome: false,
    expectedIncomeDate: null,
    status: 'active',
    source,
    startLabel: fmtDate(prevCycleStart),
    endLabel: fmtDate(prevCycleEnd),
  }
}

// offset 0 = current cycle, 1 = the cycle before that, etc.
export function getFinancialCycleAtOffset(state: AppState, offset: number): FinancialCycle {
  const pattern = getIncomePattern(state.settings)
  let cycle = getCurrentFinancialCycle(state)
  for (let i = 0; i < offset; i++) {
    cycle = getPreviousFinancialCycle(state, cycle, pattern)
  }
  return cycle
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

  const guardActive = isScheduleGuardActive(pattern, state.settings)
  let seedIdx = 0
  if (guardActive) {
    seedIdx = qualifying.findIndex(t => isEligibleCycleAnchor(parseTxDate(t.transaction_date), pattern, state.settings))
    if (seedIdx === -1) {
      return buildCalendarFallback(pattern, state.settings, today)
    }
  }

  let latestIncome = qualifying[seedIdx]
  let cycleStart = parseTxDate(latestIncome.transaction_date)
  const mostRecentIncomeDate = cycleStart.getTime()

  const clusterWindow = getClusterWindow(pattern)
  for (let i = seedIdx + 1; i < qualifying.length; i++) {
    const txnDate = parseTxDate(qualifying[i].transaction_date)
    const daysDiff = (mostRecentIncomeDate - txnDate.getTime()) / MS_DAY
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
    if (today.getTime() >= expectedMid.getTime() && mostRecentIncomeDate < expectedMid.getTime()) {
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
