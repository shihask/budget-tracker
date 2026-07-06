import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, startOfWeek, subDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Indian-locale currency, no decimals unless fractional — matches data.js fmt()
export function fmt(n: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const { sign = false } = opts
  // auto decimals: show 2 if fractional, 0 if whole
  const decimals = opts.decimals !== undefined ? opts.decimals : (n % 1 !== 0 ? 2 : 0)
  const v = Math.abs(n)
  const s = v.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const pre = n < 0 ? '−' : sign ? '+' : ''
  return pre + '₹' + s
}

export const TODAY = new Date()

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Local-calendar-date ISO string (YYYY-MM-DD) — unlike iso(), which uses
// toISOString() and can shift by a day near midnight depending on timezone.
// Use this when comparing against calendar dates built from local
// `new Date(y, m, d)` values (e.g. financial cycle boundaries).
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function getWeekStart(d: Date, startDay = 1): Date {
  const x = new Date(d)
  const day = (x.getDay() - startDay + 7) % 7
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x
}

export function getMonthStart(d: Date, startDate = 1): Date {
  if (d.getDate() >= startDate) {
    return new Date(d.getFullYear(), d.getMonth(), startDate)
  }
  return new Date(d.getFullYear(), d.getMonth() - 1, startDate)
}

export function fmtDate(s: string): string {
  const t = iso(TODAY)
  const yesterday = iso(addDays(TODAY, -1))
  if (s === t) return 'Today'
  if (s === yesterday) return 'Yesterday'
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function fmtTime(s: string): string {
  return new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
}
