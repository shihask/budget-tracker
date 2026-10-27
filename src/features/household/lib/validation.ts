// Client-side mirrors of the database CHECKs in 20261027000001_household.sql, so a
// form can say what's wrong before a round trip. The database stays the authority.

export const HOUSEHOLD_NAME_MAX = 60
export const DISPLAY_NAME_MAX = 40
export const CATEGORY_NAME_MAX = 40
export const DESCRIPTION_MAX = 120
/** numeric(14,2) */
export const AMOUNT_MAX = 999_999_999_999.99

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseAmount(input: string): Checked<number> {
  const s = input.trim().replace(/,/g, '')
  if (!s) return { ok: false, error: 'Enter an amount.' }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: 'Use numbers only, with up to 2 decimals.' }
  const value = Number(s)
  if (value <= 0) return { ok: false, error: 'The amount must be more than ₹0.' }
  if (value > AMOUNT_MAX) return { ok: false, error: 'That amount is too large.' }
  return { ok: true, value }
}

/** A budget limit may be 0 ("spend nothing"), unlike an entry amount. */
export function parseLimit(input: string): Checked<number> {
  const s = input.trim().replace(/,/g, '')
  if (s === '0' || /^0(\.0{1,2})?$/.test(s)) return { ok: true, value: 0 }
  return parseAmount(input)
}

export function checkName(input: string, max: number, what: string): Checked<string> {
  const value = input.trim()
  if (!value) return { ok: false, error: `Enter ${what}.` }
  if (value.length > max) return { ok: false, error: `Keep ${what} to ${max} characters.` }
  return { ok: true, value }
}

export function checkDescription(input: string): Checked<string | null> {
  const value = input.trim()
  if (value.length > DESCRIPTION_MAX) return { ok: false, error: `Keep the note to ${DESCRIPTION_MAX} characters.` }
  return { ok: true, value: value || null }
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}
