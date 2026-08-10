import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// Single implementation of "who is calling, and are they an admin" — whoami and
// requireAdmin both funnel through this so there is only one role-lookup path.
export async function getAdminStatus(req: Request): Promise<{ user: User | null; isAdmin: boolean }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { user: null, isAdmin: false }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await anonClient.auth.getUser()
  if (error || !user) return { user: null, isAdmin: false }

  const db = serviceClient()
  const { data: roleRow } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return { user, isAdmin: roleRow?.role === 'admin' }
}

export async function requireAdmin(req: Request): Promise<{ user: User } | { error: Response }> {
  const { user, isAdmin } = await getAdminStatus(req)
  if (!user) {
    return { error: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors }) }
  }
  if (!isAdmin) {
    return { error: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors }) }
  }
  return { user }
}
