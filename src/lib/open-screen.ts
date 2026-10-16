// Push-notification deep links. Push Edge Functions send `url: '/?open=<screen>'`;
// the service worker opens that URL (app closed) or posts it to the running app
// (`OPEN_SCREEN_MESSAGE`), and App's openScreen opens the matching sheet/page.
// Keep the keys in sync with the push-* Edge Functions.

export const OPEN_SCREENS = [
  'quick-add',
  'reflection',
  'commitments',
  'credit-cards',
  'notifications',
  'analytics-trend',
  'analytics-weeks',
  'analytics-category',
] as const

export type OpenScreen = typeof OPEN_SCREENS[number]

export const OPEN_SCREEN_PARAM = 'open'
export const OPEN_SCREEN_MESSAGE = 'MP_OPEN_SCREEN'

/** The screen a URL asks for, or null — an unknown key (an older or newer push) just shows the dashboard. */
export function parseOpenScreen(url: string | null | undefined): OpenScreen | null {
  if (!url) return null
  try {
    const key = new URL(url, 'https://moneyplant.online').searchParams.get(OPEN_SCREEN_PARAM)
    return (OPEN_SCREENS as readonly string[]).includes(key ?? '') ? key as OpenScreen : null
  } catch {
    return null
  }
}

/** Removes `?open=` from the address bar, so a refresh doesn't open the screen again. */
export function clearOpenScreenParam(): void {
  const u = new URL(window.location.href)
  if (!u.searchParams.has(OPEN_SCREEN_PARAM)) return
  u.searchParams.delete(OPEN_SCREEN_PARAM)
  window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash)
}
