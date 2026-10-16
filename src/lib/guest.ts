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
