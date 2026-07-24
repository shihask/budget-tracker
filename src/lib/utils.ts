import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, startOfWeek, subDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export class TimeoutError extends Error {}

// Opens a native <input type="date"> picker, if the browser supports showPicker()
// (Chrome/Edge, Safari 16.4+, Firefox 108+). Deferred a beat so it doesn't fire
// while another field's picker is still closing — calling focus() + showPicker()
// synchronously in that window made some mobile browsers treat it as a second
// "open" on an already-opening picker and toggle it straight to a closed/committed
// state (auto-filling today). showPicker() already focuses the element, so no
// separate focus() call is needed.
export function openDatePicker(el: HTMLInputElement | null) {
  if (!el) return
  setTimeout(() => {
    try {
      el.showPicker?.()
    } catch {
      // ignore — showPicker() can throw if not called from a user gesture
    }
  }, 150)
}

// Races `promise` against a timer that rejects with a TimeoutError after `ms`.
// Does NOT abort the underlying request — it only stops waiting for it, so
// `promise` may still resolve in the background. Fine here since every
// caller's follow-up write (upsert / null-out / re-fetch) is naturally idempotent.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
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

// Snap a float to the nearest cent — guards against binary floating-point
// drift (e.g. 0.1 + 0.2) surfacing as raw digits in stored/displayed amounts.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
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
