// Supabase Auth "Send SMS" hook — delivers phone sign-in/sign-up OTPs through
// 2Factor.in instead of a built-in provider (Twilio et al. cost ~30x more to
// Indian numbers). Supabase generates and verifies the code; this function
// only carries it to the phone.
//
// Caller is Supabase Auth, not a browser, so verify_jwt = false in
// supabase/config.toml. Authenticity comes from the Standard Webhooks
// signature instead: SEND_SMS_HOOK_SECRET is the "v1,whsec_…" secret shown in
// Dashboard → Authentication → Hooks when the hook is created.
//
// Secrets: SEND_SMS_HOOK_SECRET, TWOFACTOR_API_KEY, and optionally
// TWOFACTOR_TEMPLATE (the 2Factor OTP template name; defaults to MoneyPlantOTP).
//
// Failure contract: 200 only once 2Factor confirms Status "Success". Every
// other outcome returns a non-2xx { error } so Auth fails signInWithOtp and the
// app stays on the enter screen. No retries here — the hook has a 5 s budget;
// the user's Resend is the retry.
//
// Logging: the provider URL carries the API key, phone and OTP
// (/API/V1/{key}/SMS/{phone}/{otp}), and Deno's network errors embed the URL.
// So never log the URL, err.message, the OTP or the full number — only the
// status, err.name, scrubbed provider text and the number's last 4 digits.

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

const HOOK_SECRET = Deno.env.get('SEND_SMS_HOOK_SECRET') ?? ''
const API_KEY = Deno.env.get('TWOFACTOR_API_KEY') ?? ''
// The approved 2Factor OTP template. Without one, 2Factor falls back to a voice call.
const TEMPLATE = Deno.env.get('TWOFACTOR_TEMPLATE') || 'MoneyPlantOTP'

/** Under the Auth hook's 5 s limit, leaving room to answer. */
const PROVIDER_TIMEOUT_MS = 4000
const SEND_FAILED = 'Could not send the code. Please try again in a minute.'

interface HookPayload {
  user?: { phone?: string }
  sms?: { otp?: string }
}

// Auth shows `message` to the client as the sign-in error.
function hookError(httpCode: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Provider text is logged only after digit runs (keys, numbers, codes) are blanked. */
function redactProviderText(text: unknown) {
  return String(text ?? '').replace(/\d{4,}/g, '[redacted]').slice(0, 80)
}

Deno.serve(async req => {
  if (!HOOK_SECRET || !API_KEY) {
    console.error('send-sms-otp: SEND_SMS_HOOK_SECRET or TWOFACTOR_API_KEY is not set')
    return hookError(500, "SMS isn't configured. Please use email for now.")
  }

  const body = await req.text()
  let payload: HookPayload
  try {
    payload = new Webhook(HOOK_SECRET.replace('v1,whsec_', '')).verify(body, Object.fromEntries(req.headers)) as HookPayload
  } catch (_) {
    return hookError(401, 'Invalid hook signature')
  }

  const otp = payload.sms?.otp
  // Auth stores phones as E.164 digits without '+', e.g. 919876543210.
  const phone = (payload.user?.phone ?? '').replace(/\D/g, '')
  if (!otp || !phone) return hookError(400, 'Missing phone number or code')
  if (!phone.startsWith('91') || phone.length !== 12) {
    return hookError(400, 'Only Indian (+91) mobile numbers are supported')
  }
  const tail = phone.slice(-4)

  // GET /API/V1/{key}/SMS/+91XXXXXXXXXX/{otp}/{template}. The phone is digits-only
  // by now, so its literal '+' is safe unencoded (2Factor expects '+', not %2B).
  const url = `https://2factor.in/API/V1/${encodeURIComponent(API_KEY)}/SMS/+${phone}/${encodeURIComponent(otp)}/${encodeURIComponent(TEMPLATE)}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
  } catch (e) {
    console.error(`send-sms-otp: 2Factor unreachable (${(e as Error)?.name ?? 'Error'}) for …${tail}`)
    return hookError(502, SEND_FAILED)
  }

  const out = await res.json().catch(() => null) as { Status?: string; Details?: unknown } | null
  if (!res.ok || out?.Status !== 'Success') {
    console.error(`send-sms-otp: 2Factor rejected (HTTP ${res.status}, ${out ? redactProviderText(out.Details) : 'non-JSON'}) for …${tail}`)
    return hookError(502, SEND_FAILED)
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
})
