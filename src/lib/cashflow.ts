import type { AppState, DerivedMetrics } from '@/types'

/* ============================================================================
   Cash Flow Forecast — projects future balance using KNOWN future events only.
   No predicted spending, no AI, no trends. Deterministic.
   Events: upcoming commitments, upcoming savings contributions, next salary.
   ============================================================================ */

export interface CashFlowEvent {
  date: string
  title: string
  amount: number
  type: 'income' | 'expense'
  source: 'salary' | 'commitment' | 'saving'
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
  projections: CashFlowProjection[]
}

const HORIZON_DAYS = 60

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

// Estimate the next salary amount. Strategy (deterministic, no stored amount):
//   1) most recent income categorized as "Salary"
//   2) else the largest income in the last 45 days (salary is normally the biggest inflow)
//   3) else null → salary event is omitted (per spec: hide when no reliable estimate)
function estimateSalary(state: AppState): number | null {
  const catName = new Map(state.categories.map(c => [c.id, c.name.toLowerCase()]))
  const incomes = state.transactions
    .filter(t => t.transaction_type === 'income')
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1)) // newest first

  // 1) explicit "Salary" category
  const salaryTx = incomes.find(t => t.category_id != null && catName.get(t.category_id) === 'salary')
  if (salaryTx && salaryTx.amount > 0) return Math.round(salaryTx.amount)

  // 2) fallback: largest income in the trailing 45 days
  const today = midnight(new Date())
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 45)
  const recentMax = incomes.reduce((max, t) => {
    const [y, m, dd] = t.transaction_date.split('-').map(Number)
    const dt = new Date(y, m - 1, dd)
    return dt >= cutoff && t.amount > max ? t.amount : max
  }, 0)
  if (recentMax > 0) return Math.round(recentMax)

  return null
}

export function buildCashFlowForecast(state: AppState, derived: DerivedMetrics): CashFlowForecast {
  const today = midnight(new Date())
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + HORIZON_DAYS)

  // Spendable cash now. availableBalance = actual balance − emergency fund.
  // We deliberately do NOT use realFreeMoney here: that already subtracts
  // committed amounts, which we re-introduce below as explicit events.
  const currentBalance = Math.round(derived.availableBalance)

  const events: CashFlowEvent[] = []

  // ── Upcoming commitments (EMI / rent / insurance / recurring) ──
  for (const c of state.commitments) {
    if (c.is_active === false) continue
    if (!(c.remaining > 0)) continue
    if (c.due_day == null) continue
    const due = nextDueDate(c.due_day, today)
    if (due < today || due > horizon) continue
    const amount = Math.round(Math.min(c.amount, c.remaining))
    if (!(amount > 0)) continue
    events.push({ date: isoOf(due), title: c.name, amount, type: 'expense', source: 'commitment' })
  }

  // ── Upcoming savings contributions (SIP / gold / RD / chit …) ──
  for (const s of state.savings) {
    if (s.is_active === false) continue
    if (!s.is_recurring) continue            // FD / one-time plans have no future contribution
    if (s.due_day == null) continue
    // finished recurring plans (all installments made) have nothing left to contribute
    if (s.total_installments != null && s.current_installment >= s.total_installments) continue
    const due = nextDueDate(s.due_day, today)
    if (due < today || due > horizon) continue
    const amount = Math.round(s.amount)
    if (!(amount > 0)) continue
    events.push({ date: isoOf(due), title: s.name, amount, type: 'expense', source: 'saving' })
  }

  // ── Next salary (only if we have both a salary day and a reliable estimate) ──
  let nextSalaryDate: string | undefined
  const salaryDay = state.settings.salary_date
  const estSalary = estimateSalary(state)
  if (salaryDay != null && estSalary != null) {
    const due = nextDueDate(salaryDay, today)
    if (due >= today && due <= horizon) {
      nextSalaryDate = isoOf(due)
      events.push({ date: nextSalaryDate, title: 'Salary', amount: estSalary, type: 'income', source: 'salary' })
    }
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

  return {
    currentBalance,
    lowestBalance: Math.round(lowestBalance),
    lowestBalanceDate,
    nextSalaryDate,
    projections,
  }
}

// Whole days from today until an ISO date (>= 0).
export function daysUntil(isoDate: string): number {
  const today = midnight(new Date())
  const [y, m, dd] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, dd)
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000))
}
