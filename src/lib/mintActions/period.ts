import { localIso } from '@/lib/utils'

/**
 * A date range named in a Mint message ("last month", "august 2025", "yesterday").
 *
 * Dates are LOCAL calendar days (`localIso`), never `toISOString()`: that is UTC,
 * and in IST local midnight on Aug 1 is Jul 31 18:30 UTC — "export August" used
 * to start on Jul 31.
 */
export interface MintPeriod {
  dateFrom: string
  dateTo: string
  label: string
  /** The text that named the period, so a caller can strip it before reading
   *  the rest of the message for search words. */
  matched: string
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const shortDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })

function mondayOf(d: Date): Date {
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
  return mon
}

/** The period `q` names, or null when it names none — each caller picks its own
 *  default (export: the salary cycle; find: all history). */
export function parsePeriod(text: string, cycleStart: Date | null | undefined, now: Date = new Date()): MintPeriod | null {
  const q = text.toLowerCase()
  const today = localIso(now)
  let m: RegExpMatchArray | null

  if (cycleStart && (m = q.match(/\b(salary cycle|this cycle|current cycle)\b/))) {
    return { dateFrom: localIso(cycleStart), dateTo: today, label: `Salary Cycle (${shortDate(cycleStart)} – Today)`, matched: m[0] }
  }
  if ((m = q.match(/\btoday\b/))) {
    return { dateFrom: today, dateTo: today, label: 'Today', matched: m[0] }
  }
  if ((m = q.match(/\byesterday\b/))) {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    return { dateFrom: localIso(y), dateTo: localIso(y), label: 'Yesterday', matched: m[0] }
  }
  if ((m = q.match(/\blast month\b/))) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { dateFrom: localIso(first), dateTo: localIso(last), label: monthLabel(first.getFullYear(), first.getMonth()), matched: m[0] }
  }
  if ((m = q.match(/\b(this|current) month\b/))) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { dateFrom: localIso(first), dateTo: today, label: monthLabel(now.getFullYear(), now.getMonth()), matched: m[0] }
  }
  if ((m = q.match(/\blast week\b/))) {
    const mon = mondayOf(now)
    mon.setDate(mon.getDate() - 7)
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
    return { dateFrom: localIso(mon), dateTo: localIso(sun), label: `Last Week (${shortDate(mon)} – ${shortDate(sun)})`, matched: m[0] }
  }
  if ((m = q.match(/\b(this|current) week\b/))) {
    const mon = mondayOf(now)
    return { dateFrom: localIso(mon), dateTo: today, label: `This Week (${shortDate(mon)} – Today)`, matched: m[0] }
  }

  // "august" / "august 2025" / "12 august" / "august 12th 2025". A month without
  // a year means its most recent occurrence; a day narrows it to that date, and
  // is consumed here so a caller never reads "12" as an amount.
  const DAY = '(\\d{1,2})(?:st|nd|rd|th)?'
  if ((m = q.match(new RegExp(`(?:\\b${DAY}\\s+(?:of\\s+)?)?\\b(${MONTHS.join('|')})\\b(?:\\s+${DAY}\\b)?(?:,?\\s+(20\\d{2})\\b)?`)))) {
    const month = MONTHS.indexOf(m[2])
    const year = m[4] ? Number(m[4]) : month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
    const lastDay = new Date(year, month + 1, 0).getDate()
    const day = Number(m[1] ?? m[3] ?? 0)
    if (day >= 1 && day <= lastDay) {
      const at = new Date(year, month, day)
      return { dateFrom: localIso(at), dateTo: localIso(at), label: at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), matched: m[0] }
    }
    return {
      dateFrom: localIso(new Date(year, month, 1)),
      dateTo: localIso(new Date(year, month + 1, 0)),
      label: monthLabel(year, month),
      matched: m[0],
    }
  }

  // A bare year. Only 2000 → this year, so an amount like "5000" is never a year,
  // and never one written as money ("₹2025", "rs 2025").
  if ((m = q.match(/(?<!(?:₹|\brs\.?|\binr)\s*)\b(20\d{2})\b/)) && Number(m[1]) <= now.getFullYear()) {
    const year = Number(m[1])
    const dateTo = year === now.getFullYear() ? today : `${year}-12-31`
    return { dateFrom: `${year}-01-01`, dateTo, label: String(year), matched: m[0] }
  }

  return null
}
