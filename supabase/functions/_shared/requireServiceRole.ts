// Guard for functions that only pg_cron or another Edge Function may call.
//
// The platform's verify_jwt check accepts *any* valid project JWT — including
// the public anon key that ships in the app bundle and every signed-in user's
// token. Without this guard anyone could call push-send with no user_id and
// push a message to every subscriber, or kick off the import sweep.
//
// Accepted callers:
//   - pg_cron jobs: `Authorization: <vault 'srkey'>` = "Bearer <service_role JWT>"
//   - functions.invoke from a service-role client: the same bearer
//
// The bearer is accepted when it equals SUPABASE_SERVICE_ROLE_KEY, or when its
// `role` claim is `service_role`. The claim is only trustworthy because the
// gateway has already verified the signature — so these functions must keep
// the default verify_jwt = true (never list them in config.toml with false).
//
// Call it after the OPTIONS preflight return and before any protected work.

export function requireServiceRole(req: Request, headers: Record<string, string>): Response | null {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (token && (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || jwtRole(token) === 'service_role')) {
    return null
  }
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function jwtRole(token: string): string | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
    const role = JSON.parse(json)?.role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}
