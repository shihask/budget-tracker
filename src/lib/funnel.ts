// Anonymous sign-up funnel steps → supabase `funnel_events` (see its migration).
// Records only the step, the ad it came from, platform and in-app browser —
// never who. Fire-and-forget: a failed insert must never touch sign-up.

import { supabase } from '@/lib/supabase'
import { inAppBrowserName } from '@/lib/browser-env'

export type FunnelStep =
  | 'landing_view' | 'signup_opened' | 'signin_opened' | 'google_clicked'
  | 'signup_code_sent' | 'code_send_failed' | 'signup_code_verified'
  | 'account_created' | 'signin_success'
  | 'first_expense'   // a new account saved its first expense: the first real use

/** Each step counts once per page load — StrictMode and re-opens don't inflate it. */
const recorded = new Set<FunnelStep>()

/** Tab-scoped copy of the campaign. sessionStorage: no cookie, no identifier, gone with the tab. */
const SOURCE_KEY = 'mp_funnel_source'

/**
 * The link's utm_campaign. Read at load, because the auth flow can rewrite the
 * URL. Code sign-up stays in the same page load, but Google sign-in leaves for
 * Google and comes back to a bare URL — so the campaign is also kept in
 * sessionStorage, which survives that round trip in the same tab. A new tab or
 * the installed app starts unattributed.
 */
const source = (() => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('utm_campaign')?.slice(0, 40) || null
    if (fromUrl) {
      try { sessionStorage.setItem(SOURCE_KEY, fromUrl) } catch { /* storage blocked: this load still has it */ }
      return fromUrl
    }
    return sessionStorage.getItem(SOURCE_KEY)
  } catch { return null }
})()

function platform() {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

/**
 * Decides when `first_expense` happens, from the data hook's (loading, expense
 * count) over time. True exactly once: when a load has been seen to finish with
 * **zero** expenses and a later observation has at least one.
 *
 * - Needs to see `loading` go true → false first: a 0 that was never loaded
 *   (the initial empty state) proves nothing.
 * - Settling with expenses already there (an existing user) disarms it for good.
 * - Never re-arms, so refetches, StrictMode re-runs and later adds can't repeat it.
 *
 * Count expenses only: onboarding writes opening-balance rows on its own.
 * Callers also limit it to new accounts and keep a per-device flag, so a first
 * load that failed (empty list, then a reload with real rows) can't fake one.
 */
export function createActivationWatcher() {
  let sawLoading = false
  let armed = false
  let done = false
  return {
    observe(loading: boolean, expenseCount: number): boolean {
      if (done) return false
      if (loading) { sawLoading = true; return false }
      if (!armed) {
        if (!sawLoading) return false
        if (expenseCount > 0) { done = true; return false }
        armed = true
        return false
      }
      if (expenseCount > 0) { done = true; return true }
      return false
    },
  }
}

export function trackStep(step: FunnelStep) {
  if (recorded.has(step) || !import.meta.env.PROD) return
  recorded.add(step)
  void supabase.from('funnel_events')
    .insert({ step, source, platform: platform(), in_app: inAppBrowserName()?.slice(0, 20) ?? null })
    .then(() => {}, () => {})
}
