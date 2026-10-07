// Anonymous sign-up funnel steps → supabase `funnel_events` (see its migration).
// Records only the step, the ad it came from, platform and in-app browser —
// never who. Fire-and-forget: a failed insert must never touch sign-up.

import { supabase } from '@/lib/supabase'
import { inAppBrowserName } from '@/lib/browser-env'

export type FunnelStep =
  | 'landing_view' | 'signup_opened' | 'signin_opened' | 'google_clicked'
  | 'signup_code_sent' | 'code_send_failed' | 'signup_code_verified'
  | 'account_created' | 'signin_success'

/** Each step counts once per page load — StrictMode and re-opens don't inflate it. */
const recorded = new Set<FunnelStep>()

/**
 * The ad's utm_campaign, read once at load. The auth flow can rewrite the URL,
 * so later steps must not re-read it.
 */
const source = (() => {
  try { return new URLSearchParams(window.location.search).get('utm_campaign')?.slice(0, 40) || null } catch { return null }
})()

function platform() {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

export function trackStep(step: FunnelStep) {
  if (recorded.has(step) || !import.meta.env.PROD) return
  recorded.add(step)
  void supabase.from('funnel_events')
    .insert({ step, source, platform: platform(), in_app: inAppBrowserName()?.slice(0, 20) ?? null })
    .then(() => {}, () => {})
}
