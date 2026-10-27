/**
 * Build-time switch for Household. Off (the default), nothing of the feature
 * renders, no household request is made and index.html leaves invite fragments
 * alone. Turn on (VITE_HOUSEHOLD=true in Vercel) only after
 * 20261027000001_household.sql is applied — see supabase/preflight/README.md.
 */
export const HOUSEHOLD_ENABLED = import.meta.env.VITE_HOUSEHOLD === 'true'
