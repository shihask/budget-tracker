// Where the app is running: installed PWA, which phone OS, and whether it's
// inside a social app's built-in browser.
//
// The in-app browser case matters because links from Instagram posts open in
// Instagram's own WebView, where two things are broken by the platform, not by
// us: Google blocks OAuth in embedded WebViews ("403 disallowed_useragent"),
// and there is no Add to Home Screen / Install app. The only fix is getting the
// user into Safari or Chrome.

export type Device = 'ios' | 'android' | 'desktop'

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function getDevice(): Device {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

// Each app stamps its own token into the WebView's user agent. Named tokens
// only, never a generic WebView heuristic (Android's "; wv)"): a false
// positive would hide Google sign-in from someone who could have used it.
const IN_APP_BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Instagram/i, 'Instagram'],
  [/Barcelona/, 'Threads'],
  [/FBAN|FBAV|FB_IAB/, 'Facebook'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Snapchat/i, 'Snapchat'],
]

/** The social app whose built-in browser this is, or null in a real browser. */
export function inAppBrowserName(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  for (const [re, name] of IN_APP_BROWSERS) if (re.test(ua)) return name
  return null
}

/**
 * Android only: an intent: URL that hands the current page to the phone's
 * default browser. No `package=`, so it respects the user's choice of browser
 * instead of assuming Chrome is installed.
 */
export function openInBrowserIntentUrl(): string {
  const { host, pathname, search, hash } = window.location
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;end`
}
