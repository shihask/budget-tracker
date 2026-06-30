import type { AppState, DerivedMetrics } from '@/types'
import { getCreditCardBilling } from '@/lib/credit-card'
import { getIncomePattern } from '@/lib/income-pattern'
import { estimateHistoricalDailyIncome } from '@/lib/variable-income'
import { getExpectedNextPrimaryIncome } from '@/lib/financial-cycle'

/* ============================================================================
   Cash Flow Forecast — projects future balance using KNOWN future events only.
   No predicted spending, no AI, no trends. Deterministic.
   Events: upcoming commitments, upcoming savings contributions, next income.
   ============================================================================ */

export interface CashFlowEvent {
  date: string
  title: string
  amount: number
  type: 'income' | 'expense'
  source: 'salary' | 'commitment' | 'saving' | 'card' | 'borrowing' | 'planned' | 'lifestyle'
  category_id?: string | null
  card_id?: string
  is_prized?: boolean
}

export interface CashFlowProjection {
  event: CashFlowEvent
  balanceAfter: number
}

export interface CashFlowForecast {
  currentBalance: number
  lowestBalance: number
  lowestBalanceDate?: string
  nextSalaryDate?: string
  recoveryDate?: string
  recoveryBalance?: number
  projections: CashFlowProjection[]
}

const HORIZON_DAYS = 30

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Next date on/after `from` whose day-of-month is `dueDay`, clamped to month length.
function nextDueDate(dueDay: number, from: Date): Date {
  const mk = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate()
    return new Date(y, m, Math.min(dueDay, last))
  }
  const today0 = midnight(from)
  const thisMonth = mk(from.getFullYear(), from.getMonth())
  if (thisMonth >= today0) return thisMonth
  return mk(from.getFullYear(), from.getMonth() + 1)
}

export type SalarySource = 'override' | 'avg' | 'recent' | null

export const SALARY_SOURCE_LABEL: Record<NonNullable<SalarySource>, string> = {
  override: 'Custom Estimate',
  avg: 'Salary History',
  recent: 'Recent Salary',
}

// Estimate the next salary amount. Priority:
//   1. forecast_settings.salary_override  (user explicitly set a custom estimate)
//   2. average of recent "Salary"-category transactions (last ~190 days, up to 3)
//   3. most recent "Salary"-category transaction
//   4. null  → salary event is hidden
export function estimateForecastSalary(state: AppState): { amount: number | null; source: SalarySource } {
  const override = state.forecast_settings.salary_override
  if (override != null && override > 0) {
    return { amount: Math.round(override), source: 'override' }
  }

  const catName = new Map(state.categories.map(c => [c.id, c.name.toLowerCase()]))
  const today = midnight(new Date())
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 190)

  const salaryTxns = state.transactions
    .filter(t => {
      if (t.transaction_type !== 'income') return false
      if (t.category_id == null || catName.get(t.category_id) !== 'salary') return false
      if (!(t.amount > 0)) return false
      const [y, m, dd] = t.transaction_date.split('-').map(Number)
      return new Date(y, m - 1, dd) >= cutoff
    })
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))

  if (salaryTxns.length >= 2) {
    const recent = salaryTxns.slice(0, 3)
    const avg = recent.reduce((s, t) => s + t.amount, 0) / recent.length
    return { amount: Math.round(avg), source: 'avg' }
  }
  if (salaryTxns.length === 1) {
    return { amount: Math.round(salaryTxns[0].amount), source: 'recent' }
  }
  return { amount: null, source: null }
}

export interface ForecastDriver {
  title: string
  amount: number
  source: CashFlowEvent['source']
}

export function getForecastDrivers(projections: CashFlowProjection[], limit = 5): ForecastDriver[] {
  return projections
    .filter(p => p.event.type === 'expense')
    .sort((a, b) => b.event.amount - a.event.amount)
    .slice(0, limit)
    .map(p => ({ title: p.event.title, amount: p.event.amount, source: p.event.source }))
}

export function forecastReady(state: AppState): boolean {
  const pattern = getIncomePattern(state.settings)
  const hasItems =
    state.commitments.some(c => c.is_active !== false && c.remaining > 0) ||
    state.savings.some(s => s.is_active !== false && s.is_recurring)

  switch (pattern) {
    case 'monthly':
      if (state.settings.salary_date == null) return false
      return hasItems || estimateForecastSalary(state).amount != null
    case 'weekly':
      return (state.settings.weekly_income ?? 0) > 0 && state.settings.income_day != null
    case 'variable': {
      const hasIncome = (state.settings.average_daily_income ?? 0) > 0 || estimateHistoricalDailyIncome(state) != null
      return hasItems || hasIncome
    }
    case 'business':
      return hasItems || (state.settings.business_monthly_drawings ?? 0) > 0
  }
}

function nextWeekday(dayOfWeek: number, from: Date): Date {
  const d = midnight(from)
  const diff = (dayOfWeek - d.getDay() + 7) % 7
  return diff === 0 ? d : new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}

function allWeekdays(dayOfWeek: number, from: Date, until: Date): Date[] {
  const dates: Date[] = []
  const tomorrow = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1)
  let d = nextWeekday(dayOfWeek, tomorrow)
  while (d <= until) {
    dates.push(d)
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
  }
  return dates
}

function generateIncomeEvents(state: AppState, today: Date, horizon: Date): CashFlowEvent[] {
  const pattern = getIncomePattern(state.settings)
  const events: CashFlowEvent[] = []

  // Determine income amount for this pattern
  let incomeTitle: string
  let incomeAmount: number | null
  switch (pattern) {
    case 'monthly': {
      incomeTitle = 'Salary'
      incomeAmount = state.settings.salary_date != null ? (estimateForecastSalary(state).amount ?? null) : null
      break
    }
    case 'weekly': {
      incomeTitle = 'Weekly Income'
      const wi = state.settings.weekly_income
      incomeAmount = wi != null && wi > 0 ? Math.round(wi) : null
      break
    }
    case 'variable': {
      incomeTitle = 'Projected Income'
      const adi = state.settings.average_daily_income ?? estimateHistoricalDailyIncome(state)?.avgDailyIncome ?? 0
      const wpw = state.settings.working_days_per_week ?? 6
      const lump = Math.round(adi * wpw)
      incomeAmount = lump > 0 ? lump : null
      break
    }
    case 'business': {
      incomeTitle = 'Business Drawings'
      const d = state.settings.business_monthly_drawings
      incomeAmount = d != null && d > 0 ? Math.round(d) : null
      break
    }
    default:
      return events
  }

  if (incomeAmount == null) return events

  // Use getExpectedNextPrimaryIncome (shared with Financial Planning) for the first date,
  // then iterate forward so Forecast and Financial Planning always agree on income timing.
  let refDate = today
  while (true) {
    const next = getExpectedNextPrimaryIncome(state, refDate)
    if (next.expectedDate == null || next.expectedDate > horizon) break
    events.push({ date: isoOf(next.expectedDate), title: incomeTitle, amount: incomeAmount, type: 'income', source: 'salary' })
    refDate = new Date(next.expectedDate.getFullYear(), next.expectedDate.getMonth(), next.expectedDate.getDate())
  }

  return events
}

function allDueDates(dueDay: number, from: Date, until: Date): Date[] {
  const dates: Date[] = []
  let due = nextDueDate(dueDay, from)
  while (due <= until) {
    dates.push(due)
    due = nextDueDate(dueDay, new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1))
  }
  return dates
}

export function buildCashFlowForecast(state: AppState, derived: DerivedMetrics): CashFlowForecast {
  const today = midnight(new Date())
  const days = state.forecast_settings.days ?? HORIZON_DAYS
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)

  // Optional include-lists (null = include all active). Set during forecast setup.
  const incCommit = state.forecast_settings.commitment_ids
  const incSavings = state.forecast_settings.savings_ids

  // Spendable cash now. availableBalance = actual balance − emergency fund.
  // We deliberately do NOT use realFreeMoney here: that already subtracts
  // committed amounts, which we re-introduce below as explicit events.
  const currentBalance = Math.round(derived.availableBalance)

  const events: CashFlowEvent[] = []

  // ── Upcoming commitments (EMI / rent / insurance / recurring) ──
  for (const c of state.commitments) {
    if (c.is_active === false) continue
    if (incCommit != null && !incCommit.includes(c.id)) continue
    if (!(c.remaining > 0)) continue
    const amount = Math.round(Math.min(c.amount, c.remaining))
    if (!(amount > 0)) continue

    if (c.is_recurring && c.due_day != null) {
      let remainingAmt = c.remaining
      const installmentsDone = c.current_installment ?? 0
      const totalInstallments = c.total_installments
      let count = 0
      for (const due of allDueDates(c.due_day, today, horizon)) {
        if (totalInstallments != null && installmentsDone + count >= totalInstallments) break
        const payAmt = Math.round(Math.min(c.amount, remainingAmt))
        if (!(payAmt > 0)) break
        events.push({ date: isoOf(due), title: c.name, amount: payAmt, type: 'expense', source: 'commitment', category_id: c.category_id })
        remainingAmt -= payAmt
        count++
      }
    } else {
      let due: Date | null = null
      if (c.due_day != null) {
        due = nextDueDate(c.due_day, today)
      } else if (c.due_date) {
        const parsed = new Date(c.due_date + 'T00:00:00')
        due = parsed < today ? today : parsed
      }
      if (!due || due > horizon) continue
      events.push({ date: isoOf(due), title: c.name, amount, type: 'expense', source: 'commitment', category_id: c.category_id })
    }
  }

  // ── Upcoming savings contributions (SIP / gold / RD / chit …) ──
  for (const s of state.savings) {
    if (s.is_active === false) continue
    if (incSavings != null && !incSavings.includes(s.id)) continue
    if (!s.is_recurring) continue
    if (s.total_installments != null && s.current_installment >= s.total_installments) continue
    const lastDay = s.last_contribution_date ? new Date(s.last_contribution_date).getDate() : null
    const dueDay = s.due_day ?? lastDay ?? state.settings.salary_date ?? 1
    const amount = Math.round(s.amount)
    if (!(amount > 0)) continue

    let installmentsDone = s.current_installment
    let count = 0
    for (const due of allDueDates(dueDay, today, horizon)) {
      if (s.total_installments != null && installmentsDone + count >= s.total_installments) break
      events.push({ date: isoOf(due), title: s.name, amount, type: 'expense', source: 'saving', category_id: s.category_id, is_prized: s.is_prized || undefined })
      count++
    }
  }

  // ── Upcoming credit-card bills (billed amount due on the card's due day) ──
  if (state.settings.track_credit_cards) {
    for (const cc of state.credit_cards) {
      if (cc.is_active === false) continue
      if (!(cc.current_balance > 0)) continue
      const billing = getCreditCardBilling(cc, state.transactions, today)
      const amount = Math.round(billing.billedAmount || cc.current_balance)
      for (const due of allDueDates(cc.due_day, today, horizon)) {
        events.push({ date: isoOf(due), title: `${cc.name} bill`, amount, type: 'expense', source: 'card', card_id: cc.id })
      }
    }
  }

  // ── Pending borrowed money you still owe — assume repayment at next income event ──
  // If income was just received (cycle active, early in cycle), schedule repayments
  // within a few days rather than waiting for next month's salary.
  {
    const owed = state.borrowings.filter(b => b.direction === 'borrowed' && b.remaining_amount > 0)
    if (owed.length > 0) {
      const pattern = getIncomePattern(state.settings)
      const cycle = derived.financialCycle
      const cycleJustStarted = cycle && cycle.status === 'active' && cycle.currentDay <= 3
      let bDue: Date
      if (cycleJustStarted) {
        bDue = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      } else if (pattern === 'monthly' && state.settings.salary_date != null) {
        bDue = nextDueDate(state.settings.salary_date, today)
      } else if (pattern === 'weekly' && state.settings.income_day != null) {
        bDue = nextWeekday(state.settings.income_day, today)
      } else {
        bDue = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)
      }
      if (bDue >= today && bDue <= horizon) {
        for (const b of owed) {
          events.push({ date: isoOf(bDue), title: `Repay ${b.person_name}`, amount: Math.round(b.remaining_amount), type: 'expense', source: 'borrowing' })
        }
      }
    }
  }

  // ── Planned expenses (one-time user-defined future spending) ──
  for (const pe of state.planned_expenses) {
    if (pe.is_completed) continue
    const [y, m, dd] = pe.planned_date.split('-').map(Number)
    const due = new Date(y, m - 1, dd)
    if (due < today || due > horizon) continue
    const amount = Math.round(pe.amount)
    if (!(amount > 0)) continue
    events.push({ date: pe.planned_date, title: pe.title, amount, type: 'expense', source: 'planned', category_id: pe.category_id })
  }

  // ── Income events (pattern-aware) ──
  let nextSalaryDate: string | undefined
  const incomeEvents = generateIncomeEvents(state, today, horizon)
  for (const ev of incomeEvents) {
    if (!nextSalaryDate) nextSalaryDate = ev.date
    events.push(ev)
  }

  // ── Sort chronologically (income settles before expenses on the same day) ──
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1
    return 0
  })

  // ── Run the balance forward ──
  let running = currentBalance
  let lowestBalance = currentBalance
  let lowestBalanceDate: string | undefined

  const projections: CashFlowProjection[] = events.map(event => {
    running += event.type === 'income' ? event.amount : -event.amount
    if (running < lowestBalance) {
      lowestBalance = running
      lowestBalanceDate = event.date
    }
    return { event, balanceAfter: Math.round(running) }
  })

  // ── Recovery point: if the balance dips below zero, the first event after that
  //    where it climbs back to >= 0 (so the user knows how long the squeeze lasts).
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

  return {
    currentBalance,
    lowestBalance: Math.round(lowestBalance),
    lowestBalanceDate,
    nextSalaryDate,
    recoveryDate,
    recoveryBalance,
    projections,
  }
}

export function simulatePurchase(state: AppState, derived: DerivedMetrics, amount: number): CashFlowForecast {
  return buildCashFlowForecast(state, {
    ...derived,
    availableBalance: derived.availableBalance - amount,
  })
}

// Whole days from today until an ISO date (>= 0).
export function daysUntil(isoDate: string): number {
  const today = midnight(new Date())
  const [y, m, dd] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, dd)
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000))
}
