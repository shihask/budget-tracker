// Guests (Supabase anonymous sign-in, user.is_anonymous) can't use features that
// cost money or reach other people: AI, invite emails, bank sync. These functions
// run as the service role and bypass RLS, so the check has to live here too —
// hiding the buttons is not a boundary. See supabase/migrations/*_guest_mode.sql.
//
// Call right after getUser(), before any quota reservation or external request.

export function refuseGuest(user: { is_anonymous?: boolean }, headers: Record<string, string>): Response | null {
  if (user.is_anonymous !== true) return null
  return new Response(JSON.stringify({ error: 'guest_not_allowed' }), {
    status: 403,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
