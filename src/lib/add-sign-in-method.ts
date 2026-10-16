// Wording for adding an email or mobile to the signed-in account — shared by
// Profile → Sign-in methods and saving a guest account (GuestSaveSheet). Pure,
// so the mapping is testable; the flow itself is useAddSignInMethod.

import { isPhoneAuthOff, type Identifier } from '@/lib/auth-identifier'

type Kind = Identifier['kind']

export interface AuthErrorLike { message: string; code?: string }

/** The address already belongs to another account. Accounts are never merged. */
export function isTakenError(err: AuthErrorLike): boolean {
  return err.code === 'email_exists' || err.code === 'phone_exists' || /already|exists/i.test(err.message)
}

/**
 * The guest session is gone (purged after 30 idle days, or signed out in another
 * tab): there is no user left to attach the address to.
 */
export function isSessionGoneError(err: AuthErrorLike): boolean {
  return err.code === 'user_not_found' || err.code === 'session_not_found'
    || /user not found|session (?:not found|missing)|sub claim/i.test(err.message)
}

export function sendCodeErrorMessage(err: AuthErrorLike, kind: Kind, opts: { guest?: boolean } = {}): string {
  const noun = kind === 'phone' ? 'number' : 'email'
  if (isPhoneAuthOff(err.message)) return "Adding a mobile number isn't available yet."
  if (isTakenError(err)) {
    return opts.guest
      ? `This ${noun} already has a MoneyPlant account. Accounts can't be merged, so use a different one or sign in to that account.`
      : `This ${noun} is already used by another MoneyPlant account.`
  }
  if (opts.guest && isSessionGoneError(err)) return 'This guest session has expired, so its entries can no longer be saved.'
  return err.message
}

export function verifyCodeErrorMessage(err: AuthErrorLike): string {
  return /expired|invalid/i.test(err.message) ? 'That code is wrong or has expired.' : err.message
}
