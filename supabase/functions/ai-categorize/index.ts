import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MONTHLY_LIMIT = 100

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })

    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: settings } = await db
      .from('settings')
      .select('id, ai_requests_used, ai_requests_reset_at')
      .eq('user_id', user.id)
      .single()

    const now = new Date()
    const resetAt = settings?.ai_requests_reset_at ? new Date(settings.ai_requests_reset_at) : null
    const needsReset = !resetAt || now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth()
    const used = needsReset ? 0 : (settings?.ai_requests_used ?? 0)

    if (used >= MONTHLY_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'quota_exceeded', used, limit: MONTHLY_LIMIT }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const { description, categoryNames, groupNames } = await req.json()
    if (!description || !categoryNames?.length) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
    }

    const prompt = `You are a personal finance categorizer.

Existing categories: ${categoryNames.join(', ')}
Available groups: ${(groupNames ?? []).join(', ')}

Transaction: "${description}"

Rules:
- If one of the existing categories fits well, reply with ONLY that exact category name.
- If no existing category fits, reply with: NEW: <suggested category name> | <best group from the available groups list>

Reply with nothing else.`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 30,
        temperature: 0,
      }),
    })

    if (!groqRes.ok) {
      return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const groqData = await groqRes.json()
    const raw: string = groqData?.choices?.[0]?.message?.content?.trim() ?? ''

    // Parse response
    let result: string | null = null
    let suggestion: { name: string; group: string } | null = null

    if (raw.startsWith('NEW:')) {
      const parts = raw.slice(4).split('|').map((s: string) => s.trim())
      suggestion = { name: parts[0] ?? '', group: parts[1] ?? (groupNames?.[0] ?? '') }
    } else {
      result = raw
    }

    // Increment usage
    await db.from('settings').update({
      ai_requests_used: used + 1,
      ...(needsReset ? { ai_requests_reset_at: now.toISOString() } : {}),
    }).eq('user_id', user.id)

    return new Response(
      JSON.stringify({ result, suggestion, used: used + 1, limit: MONTHLY_LIMIT }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})
