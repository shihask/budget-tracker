// Turns a Supabase/PostgREST error into a sentence for the user. The household
// RPCs and triggers raise PTxxx with user-facing messages, which are shown
// verbatim; everything else maps to a generic line. Never includes request data
// (an invite token must not end up on screen, in a toast or in a log).

interface PgError { code?: string; message?: string }

export const GUEST_NOT_ALLOWED = 'guest_not_allowed'

export function isGuestRefusal(err: unknown): boolean {
  return (err as PgError | null)?.message === GUEST_NOT_ALLOWED
}

export function householdErrorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  const e = (err ?? {}) as PgError
  if (e.message === GUEST_NOT_ALLOWED) return 'Save your account to use Household.'
  if (e.code?.startsWith('PT') && e.message) return e.message
  switch (e.code) {
    case '23503': return 'That category or member is no longer available. Reload and try again.'
    case '23505': return 'That already exists.'
    case '23514': return 'Check the values and try again.'
    case '42501': return "You don't have access to this household any more."
  }
  if (e.message && /fetch|network|offline/i.test(e.message)) return 'No connection. Check your internet and try again.'
  return fallback
}

/** Thrown when an edit's optimistic check finds the row changed or gone. */
export class HouseholdConflictError extends Error {
  constructor() {
    super('Your partner changed or deleted this entry. It has been reloaded — check it and try again.')
    this.name = 'HouseholdConflictError'
  }
}
