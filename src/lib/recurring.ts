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
  },
  referenceDate?: Date,
): Date | null {
  const freq = item.frequency ?? 'monthly'
  const ref = midnight(referenceDate ?? new Date())
  const dueDay = item.due_day ?? null

  if (freq === 'yearly' || freq === 'custom') return null
  if (dueDay == null) return null

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
