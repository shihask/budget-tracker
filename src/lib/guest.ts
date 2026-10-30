// Guest mode: a Supabase anonymous sign-in. A guest is a real user (own uid,
// same RLS) with no email, phone or name yet. Saving the account later links an
// email/phone to the same uid, so nothing moves.
//
// This is the one client-side definition of "guest" — check it here, never
// `user.email == null` or a missing name (phone users have no email; new
// email/phone users have no name until CompleteProfilePage).

import type { User } from '@supabase/supabase-js'

/**
 * Build-time switch. Off: the landing CTA opens the normal sign-up and makes no
 * "no sign-up" promise. Turn it on (VITE_GUEST_MODE=true in Vercel) only after
 * anonymous sign-ins are enabled in Supabase *and* the server-side guest blocks
 * are deployed — so main is always safe to push.
 */
export const GUEST_MODE_ENABLED = import.meta.env.VITE_GUEST_MODE === 'true'

export function isGuest(user: Pick<User, 'is_anonymous'> | null | undefined): boolean {
  return user?.is_anonymous === true
}

/**
 * Set when a guest creates their first account in GuestQuickStart: the rest of
 * onboarding (income pattern, features) was skipped and should run once the
 * account is saved. Per device — a guest can't be on another device anyway.
 */
export const guestSetupPendingKey = (userId: string) => 'mp_guest_setup_pending_' + userId

/** Local date (YYYY-MM-DD) the guest saved their account, for guest_saved_return. */
export const guestSavedOnKey = (userId: string) => 'mp_guest_saved_on_' + userId
/** guest_saved_return already counted on this device. */
export const guestSavedReturnKey = (userId: string) => 'mp_guest_saved_return_' + userId
/** The "save your account" prompt after the first expense was already shown. */
export const guestSavePromptedKey = (userId: string) => 'mp_guest_save_prompted_' + userId

/**
 * Set just before a guest leaves for Google to link it (GuestSaveSheet). After
 * the redirect it tells App this load is the end of a guest save: count
 * guest_saved, or reopen the sheet if Google was already someone's account.
 */
export const guestGoogleLinkKey = (userId: string) => 'mp_guest_google_link_' + userId

/** The account has a Google sign-in (a Google sign-up, or a guest who saved with Google). */
export function hasGoogleIdentity(user: Pick<User, 'identities'> | null | undefined): boolean {
  return !!user?.identities?.some(i => i.provider === 'google')
}

/** The name Google gave, for a saved guest whose metadata has none yet. */
export function googleIdentityName(user: Pick<User, 'identities'>): string | null {
  const data = user.identities?.find(i => i.provider === 'google')?.identity_data
  const name = data?.full_name ?? data?.name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/** A saved guest is "back" on any later calendar day than the save (local dates). */
export function isLaterDay(savedOn: string | null, today: string): boolean {
  return !!savedOn && /^\d{4}-\d{2}-\d{2}$/.test(savedOn) && savedOn < today
}
