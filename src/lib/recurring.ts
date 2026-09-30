export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | 'custom'

export interface RecurringPeriod {
  periodStart: Date
  periodEnd: Date
  frequency: RecurringFrequency
  label: string
  daysRemaining: number
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function getCurrentRecurringPeriod(
  frequency: RecurringFrequency | null,
  referenceDate?: Date,
): RecurringPeriod {
  const ref = midnight(referenceDate ?? new Date())
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const d = ref.getDate()
  const freq = frequency ?? 'monthly'

  let periodStart: Date
  let periodEnd: Date

  switch (freq) {
    case 'daily':
      periodStart = ref
      periodEnd = ref
      break

    case 'weekly': {
      const dow = ref.getDay()
      const monday = (dow === 0 ? -6 : 1) - dow
      periodStart = new Date(y, m, d + monday)
      periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 6)
      break
    }

    case 'fortnightly': {
      const epoch = new Date(2024, 0, 1) // Monday Jan 1 2024
      const daysSinceEpoch = Math.floor((ref.getTime() - epoch.getTime()) / 86400000)
      const fortnightIndex = Math.floor(daysSinceEpoch / 14)
      const fortnightStart = new Date(epoch.getTime() + fortnightIndex * 14 * 86400000)
      periodStart = fortnightStart
      periodEnd = new Date(fortnightStart.getTime() + 13 * 86400000)
      break
    }

    case 'monthly':
      periodStart = new Date(y, m, 1)
      periodEnd = new Date(y, m + 1, 0)
      break

    case 'quarterly': {
      const qStart = Math.floor(m / 3) * 3
      periodStart = new Date(y, qStart, 1)
      periodEnd = new Date(y, qStart + 3, 0)
      break
    }

    case 'half_yearly': {
      const hStart = m < 6 ? 0 : 6
      periodStart = new Date(y, hStart, 1)
      periodEnd = new Date(y, hStart + 6, 0)
      break
    }

    case 'yearly':
      periodStart = new Date(y, 0, 1)
      periodEnd = new Date(y, 11, 31)
      break

    case 'custom':
    default:
      periodStart = new Date(y, m, 1)
      periodEnd = new Date(y, m + 1, 0)
      break
  }

  const daysRemaining = Math.max(0, Math.round((periodEnd.getTime() - ref.getTime()) / 86400000))

  return {
    periodStart,
    periodEnd,
    frequency: freq,
    label: getRecurringPeriodLabel(freq),
    daysRemaining,
  }
}

export function isRecurringCompleted(
  lastCompletedDate: string | null,
  frequency: RecurringFrequency | null,
  referenceDate?: Date,
): boolean {
  if (!lastCompletedDate) return false
  const period = getCurrentRecurringPeriod(frequency, referenceDate)
  const [ly, lm, ld] = lastCompletedDate.split('-').map(Number)
  const completed = new Date(ly, lm - 1, ld)
  return completed >= period.periodStart && completed <= period.periodEnd
}

// Returns the configured due date within a given period start.
// For monthly: dueDay = day of month (1–31). For weekly: dueDay = weekday (0=Sun, 6=Sat).
function dueDateInPeriod(
  freq: RecurringFrequency,
  dueDay: number,
  periodStart: Date,
): Date {
  const y = periodStart.getFullYear()
  const m = periodStart.getMonth()
  switch (freq) {
    case 'weekly':
    case 'fortnightly': {
      const diff = (dueDay - periodStart.getDay() + 7) % 7
      return new Date(y, m, periodStart.getDate() + diff)
    }
    case 'monthly':
    case 'quarterly':
    case 'half_yearly':
    default: {
      const lastDay = new Date(y, m + 1, 0).getDate()
      return new Date(y, m, Math.min(dueDay, lastDay))
    }
  }
}

// Returns the next scheduled due date for a recurring item using only the configured
// schedule (due_day + frequency). Never derives dates from lastPayment + frequency
// to prevent schedule drift from early or late payments.
//
// Supported: monthly, weekly. Yearly returns null (due_month field deferred to future PR).
// Missing due_day returns null — caller skips reservation.
export function getNextRecurringDueDate(
  item: {
    frequency: RecurringFrequency | null
    due_day?: number | null
    last_contribution_date?: string | null
    paid_through?: string | null
  },
  referenceDate?: Date,
): Date | null {
  const freq = item.frequency ?? 'monthly'
  const ref = midnight(referenceDate ?? new Date())
  const dueDay = item.due_day ?? null

  if (freq === 'yearly' || freq === 'custom') return null
  if (dueDay == null) return null

  if (item.paid_through && supportsPaidFor(freq)) {
    const through = parseIsoDate(item.paid_through)
    return scheduledDuesAround(freq, dueDay, ref, 0, MAX_SCAN_PERIODS).find(d => d >= ref && d > through) ?? null
  }

  const completed = isRecurringCompleted(item.last_contribution_date ?? null, freq, ref)
  const currentPeriod = getCurrentRecurringPeriod(freq, ref)

  if (completed) {
    const nextPeriodStart = new Date(currentPeriod.periodEnd.getTime() + 86400000)
    const nextPeriod = getCurrentRecurringPeriod(freq, nextPeriodStart)
    return dueDateInPeriod(freq, dueDay, nextPeriod.periodStart)
  }

  // Check if this period's due date has already passed today (e.g. item never paid,
  // due_day=10, today=Jun 30 → returns Jun 10 which is past → advance to Jul 10)
  const thisPeriodDue = dueDateInPeriod(freq, dueDay, currentPeriod.periodStart)
  if (thisPeriodDue < ref) {
    const nextPeriodStart = new Date(currentPeriod.periodEnd.getTime() + 86400000)
    const nextPeriod = getCurrentRecurringPeriod(freq, nextPeriodStart)
    return dueDateInPeriod(freq, dueDay, nextPeriod.periodStart)
  }

  return thisPeriodDue
}

// ── Which due date a payment is for ─────────────────────────────────────────
// A payment's date doesn't say which installment it pays: Regal Gold (due 27th)
// paid on 30 Sep is either late for 27 Sep or early for 27 Oct, and someone paid
// on the 29th routinely pays ahead. So the user picks it, and `paid_through` stores
// the latest due date paid. Every due on or before it is paid; nothing after is.
// Rows recorded before `paid_through` existed keep the calendar-period rule.

// Periods scanned forward when looking for the next unpaid due (two years monthly).
const MAX_SCAN_PERIODS = 24

export interface PaidSchedule {
  frequency: RecurringFrequency | null
  due_day?: number | null
  paid_through?: string | null
}

// Only schedules with a computable due date per period can say which one was paid.
export function supportsPaidFor(frequency: RecurringFrequency | null): boolean {
  const f = frequency ?? 'monthly'
  return f === 'monthly' || f === 'weekly'
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shiftPeriods(freq: RecurringFrequency, date: Date, n: number): Date {
  let d = midnight(date)
  for (let i = 0; i < Math.abs(n); i++) {
    const p = getCurrentRecurringPeriod(freq, d)
    d = n > 0
      ? new Date(p.periodEnd.getFullYear(), p.periodEnd.getMonth(), p.periodEnd.getDate() + 1)
      : new Date(p.periodStart.getFullYear(), p.periodStart.getMonth(), p.periodStart.getDate() - 1)
  }
  return d
}

// Scheduled due dates from `back` periods before `anchor`'s period to `ahead` after, oldest first.
export function scheduledDuesAround(
  frequency: RecurringFrequency | null,
  dueDay: number,
  anchor: Date,
  back: number,
  ahead: number,
): Date[] {
  const freq = frequency ?? 'monthly'
  const out: Date[] = []
  for (let i = -back; i <= ahead; i++) {
    const p = getCurrentRecurringPeriod(freq, shiftPeriods(freq, anchor, i))
    out.push(dueDateInPeriod(freq, dueDay, p.periodStart))
  }
  return out
}

// The one rule for "is this due date already paid?".
export function isDueCovered(item: PaidSchedule, lastPaidDate: string | null, due: Date): boolean {
  if (item.paid_through) return midnight(due) <= parseIsoDate(item.paid_through)
  return isRecurringCompleted(lastPaidDate, item.frequency, due)
}

// The due date the latest payment covered — for display and as the correction
// sheet's starting value. Legacy rows: the due in the last payment's calendar period.
export function coveredDue(item: PaidSchedule, lastPaidDate: string | null): Date | null {
  if (item.paid_through) return parseIsoDate(item.paid_through)
  if (!lastPaidDate || item.due_day == null || !supportsPaidFor(item.frequency)) return null
  return scheduledDuesAround(item.frequency, item.due_day, parseIsoDate(lastPaidDate), 0, 0)[0]
}

// Is nothing left to pay until the next cycle? Monthly items look to the end of the
// salary cycle — paid on payday for the 10th is done for this cycle, even though the
// 10th is next calendar month. Weekly items look to the end of the week.
export function isPaidForCycle(
  item: PaidSchedule,
  lastPaidDate: string | null,
  today: Date,
  cycleEnd: Date,
): boolean {
  const freq = item.frequency ?? 'monthly'
  if (!item.paid_through || item.due_day == null || !supportsPaidFor(freq)) {
    return isRecurringCompleted(lastPaidDate, freq, today)
  }
  const through = parseIsoDate(item.paid_through)
  const next = scheduledDuesAround(freq, item.due_day, through, 0, 2).find(d => d > through)
  const ref = midnight(today)
  const periodEnd = freq === 'weekly' ? getCurrentRecurringPeriod(freq, ref).periodEnd : midnight(cycleEnd)
  const horizon = periodEnd > ref ? periodEnd : ref
  return !next || next > horizon
}

export interface PaidForChoice {
  options: Date[]
  defaultDue: Date
}

// Offered when recording a payment: unpaid dues, oldest first, at most three.
// Default = the earliest unpaid due. Without a known paid_through (legacy rows,
// first payment) a due before the salary cycle began is assumed to belong to
// last cycle's money, so a payday payment defaults to this cycle's due.
export function paidForChoices(
  item: PaidSchedule,
  lastPaidDate: string | null,
  today: Date,
  cycleStart: Date,
): PaidForChoice | null {
  const freq = item.frequency ?? 'monthly'
  if (item.due_day == null || !supportsPaidFor(freq)) return null
  const ref = midnight(today)
  const unpaid = scheduledDuesAround(freq, item.due_day, ref, 2, 3).filter(d => !isDueCovered(item, lastPaidDate, d))
  const known = !!item.paid_through
  const late = unpaid.filter(d => d < ref).slice(known ? -2 : -1)
  const options = [...late, ...unpaid.filter(d => d >= ref)].slice(0, 3)
  if (options.length === 0) return null
  const start = midnight(cycleStart)
  const defaultDue = known ? options[0] : (options.find(d => d >= start) ?? options[0])
  return { options, defaultDue }
}

export function fmtDue(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function getRecurringPeriodLabel(frequency: RecurringFrequency | null): string {
  switch (frequency ?? 'monthly') {
    case 'daily': return 'today'
    case 'weekly': return 'this week'
    case 'fortnightly': return 'this fortnight'
    case 'monthly': return 'this month'
    case 'quarterly': return 'this quarter'
    case 'half_yearly': return 'this half-year'
    case 'yearly': return 'this year'
    case 'custom': return 'this period'
    default: return 'this month'
  }
}
