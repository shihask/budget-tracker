// The one reading of "email or mobile number" — shared by the sign-in page and
// Settings → Sign-in methods, so both accept exactly the same input.

export type Identifier = { kind: 'email' | 'phone'; value: string }

/** Supabase Auth refuses a second code to the same address within 60 s. */
export const OTP_RESEND_SECONDS = 60
/** Must match Dashboard → Auth → Email OTP length (SMS codes are always 6). */
export const OTP_LENGTH = 6
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Reads the box as an email or an Indian mobile number (SMS goes through
 * 2Factor, India only — see send-sms-otp). Accepts 9876543210, 98765 43210,
 * 09876543210, +91 98765-43210. Null when it's neither.
 * India-only by design; going international means a phone-number library, not more regexes.
 */
export function parseIdentifier(raw: string): Identifier | null {
  const v = raw.trim()
  if (v.includes('@')) return EMAIL_RE.test(v) ? { kind: 'email', value: v.toLowerCase() } : null
  const compact = v.replace(/[\s\-().]/g, '')
  if (!/^\+?\d+$/.test(compact)) return null
  let digits = compact.replace(/^\+/, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? { kind: 'phone', value: `+91${digits}` } : null
}

/** `+919876543210` → `+91 98765 43210`; emails unchanged. */
export function displayIdentifier(id: Identifier) {
  return id.kind === 'phone' ? `+91 ${id.value.slice(3, 8)} ${id.value.slice(8)}` : id.value
}

/**
 * Supabase's raw errors when the Phone provider / SMS hook isn't set up
 * ("Unsupported phone provider", "Phone logins are disabled", …).
 */
export const isPhoneAuthOff = (msg: string) => /unsupported phone provider|phone (logins|signups) (are )?disabled/i.test(msg)
export const PHONE_AUTH_OFF = "Mobile number sign-in isn't available yet. Please use your email or Google."

/** Supabase stores phones as digits without '+' (919876543210). */
export function displayStoredPhone(phone: string | undefined | null) {
  const id = phone ? parseIdentifier(phone) : null
  return id ? displayIdentifier(id) : phone ? `+${phone}` : ''
}
