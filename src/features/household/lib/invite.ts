// Invite links: https://moneyplant.online/#household_invite=<token>
//
// The token is a bearer secret, so it travels in the URL *fragment*, which
// browsers never send to a server (no Vercel request log, no Referer, no link-
// preview crawler sees it). An inline script at the top of index.html moves it
// into sessionStorage and strips it from the URL before any other script —
// analytics, Sentry, Supabase — can read location. That script duplicates the
// key, format and token pattern below; keep the two in sync.
//
// The stored token lives only for the sign-in / sign-up / onboarding journey:
// it is cleared on accept, on an invalid preview, on dismiss, on sign-out, and
// after PENDING_INVITE_TTL_MS. Never log it or send it anywhere but the two RPCs.

export const INVITE_HASH_PREFIX = '#household_invite='
export const PENDING_INVITE_KEY = 'mp_household_invite'
export const PENDING_INVITE_TTL_MS = 24 * 60 * 60 * 1000

/** 32 random bytes, base64url without padding — what mp_household_create_invite returns. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
export const isInviteToken = (s: unknown): s is string => typeof s === 'string' && TOKEN_RE.test(s)

export function buildInviteLink(origin: string, token: string): string {
  return `${origin}/${INVITE_HASH_PREFIX}${token}`
}

/** The token in a location.hash, or null. Anything else after the prefix is rejected. */
export function parseInviteHash(hash: string): string | null {
  if (!hash.startsWith(INVITE_HASH_PREFIX)) return null
  const token = hash.slice(INVITE_HASH_PREFIX.length)
  return isInviteToken(token) ? token : null
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStore(): Store | null {
  try { return window.sessionStorage } catch { return null }
}

export function savePendingInvite(token: string, now = Date.now(), store: Store | null = defaultStore()): void {
  if (!store || !isInviteToken(token)) return
  try { store.setItem(PENDING_INVITE_KEY, JSON.stringify({ token, savedAt: now })) } catch { /* storage blocked: the link can be opened again */ }
}

/** The pending token, or null. A malformed or expired entry is removed. */
export function readPendingInvite(now = Date.now(), store: Store | null = defaultStore()): string | null {
  if (!store) return null
  let raw: string | null
  try { raw = store.getItem(PENDING_INVITE_KEY) } catch { return null }
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; savedAt?: unknown }
    const fresh = typeof parsed.savedAt === 'number' && now - parsed.savedAt >= 0 && now - parsed.savedAt < PENDING_INVITE_TTL_MS
    if (fresh && isInviteToken(parsed.token)) return parsed.token
  } catch { /* fall through to removal */ }
  clearPendingInvite(store)
  return null
}

/** '#household_invite=<token>' while an invite is pending, else ''. For handing the
 *  page to another browser (in-app browser escape, copy link): the fragment was
 *  stripped from the URL on arrival, and sessionStorage doesn't travel with it. */
export function pendingInviteFragment(now = Date.now(), store: Store | null = defaultStore()): string {
  const token = readPendingInvite(now, store)
  return token ? INVITE_HASH_PREFIX + token : ''
}

export function clearPendingInvite(store: Store | null = defaultStore()): void {
  try { store?.removeItem(PENDING_INVITE_KEY) } catch { /* nothing to clear */ }
}
