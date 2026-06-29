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
