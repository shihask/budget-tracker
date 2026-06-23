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
  source: 'salary' | 'commitment' | 'saving' | 'card' | 'borrowing'
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

// Estimate the next salary amount. Priority (high confidence first):
//   1. average of recent "Salary"-category transactions (last ~190 days, up to 3)
//   2. most recent "Salary"-category transaction
//   3. user-entered monthly_salary from settings (fallback only)
//   4. null  → salary event is hidden (never show unrealistic values like ₹20)
export function estimateForecastSalary(state: AppState): { amount: number | null; source: 'avg' | 'recent' | 'override' | null } {
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
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1)) // newest first

  if (salaryTxns.length >= 2) {
    const recent = salaryTxns.slice(0, 3)
    const avg = recent.reduce((s, t) => s + t.amount, 0) / recent.length
    return { amount: Math.round(avg), source: 'avg' }
  }
  if (salaryTxns.length === 1) {
    return { amount: Math.round(salaryTxns[0].amount), source: 'recent' }
  }
  const manual = state.settings.monthly_salary
  if (manual != null && manual > 0) {
    return { amount: Math.round(manual), source: 'override' }
  }
  return { amount: null, source: null }
}

// Forecast is "ready" when the salary day exists AND there's something to project:
// at least one active commitment/savings plan, or usable income history.
export function forecastReady(state: AppState): boolean {
  if (state.settings.salary_date == null) return false
  const hasItems =
    state.commitments.some(c => c.is_active !== false && c.remaining > 0) ||
    state.savings.some(s => s.is_active !== false && s.is_recurring)
  const hasIncome = estimateForecastSalary(state).amount != null
  return hasItems || hasIncome
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
    if (incSavings != null && !incSavings.includes(s.id)) continue
    if (!s.is_recurring) continue            // FD / one-time plans have no future contribution
    // finished recurring plans (all installments made) have nothing left to contribute
    if (s.total_installments != null && s.current_installment >= s.total_installments) continue
    // due day may be unset for some plans — fall back so EVERY active plan is forecast
    const lastDay = s.last_contribution_date ? new Date(s.last_contribution_date).getDate() : null
    const dueDay = s.due_day ?? lastDay ?? state.settings.salary_date ?? 1
    const due = nextDueDate(dueDay, today)
    if (due < today || due > horizon) continue
    const amount = Math.round(s.amount)
    if (!(amount > 0)) continue
    events.push({ date: isoOf(due), title: s.name, amount, type: 'expense', source: 'saving' })
  }

  // ── Upcoming credit-card bills (outstanding due on the card's due day) ──
  if (state.settings.track_credit_cards) {
    for (const cc of state.credit_cards) {
      if (cc.is_active === false) continue
      if (!(cc.current_balance > 0)) continue
      const due = nextDueDate(cc.due_day, today)
      if (due < today || due > horizon) continue
      events.push({ date: isoOf(due), title: `${cc.name} bill`, amount: Math.round(cc.current_balance), type: 'expense', source: 'card' })
    }
  }

  // ── Pending borrowed money you still owe. Borrowings carry no due date, so we
  //    assume repayment lands at the next payday (clearly conservative — it only
  //    adds outflows, never optimistic incoming repayments). ──
  {
    const owed = state.borrowings.filter(b => b.direction === 'borrowed' && b.remaining_amount > 0)
    if (owed.length > 0) {
      const sDay = state.settings.salary_date
      const bDue = sDay != null
        ? nextDueDate(sDay, today)
        : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)
      if (bDue >= today && bDue <= horizon) {
        for (const b of owed) {
          events.push({ date: isoOf(bDue), title: `Repay ${b.person_name}`, amount: Math.round(b.remaining_amount), type: 'expense', source: 'borrowing' })
        }
      }
    }
  }

  // ── Next salary (only if we have both a salary day and a reliable estimate) ──
  let nextSalaryDate: string | undefined
  const salaryDay = state.settings.salary_date
  const estSalary = estimateForecastSalary(state).amount
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

// Whole days from today until an ISO date (>= 0).
export function daysUntil(isoDate: string): number {
  const today = midnight(new Date())
  const [y, m, dd] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, dd)
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000))
}
