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

Transaction description: "${description}"

CATEGORIES (pick from this list if one fits):
${categoryNames.join(', ')}

GROUPS (only used when suggesting a new category):
${(groupNames ?? []).join(', ')}

Instructions:
- Categories are specific (e.g. Fuel, Groceries, Gym). Groups are broad buckets (e.g. Lifestyle, Commitment).
- If one of the CATEGORIES above fits the transaction, reply with ONLY that exact category name. Nothing else.
- If NONE of the CATEGORIES fit, reply with: NEW: <new category name> | <one group from the GROUPS list>
- Do NOT reply with a group name as the answer. Always pick from CATEGORIES or suggest a new one with NEW:.

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
      suggestion = { name: parts[0] ?? '', group: parts[1] ?? (groupNames?.[0] ?? 'Lifestyle') }
    } else {
      // Check if the raw result matches an existing category (case-insensitive)
      const exactMatch = categoryNames.find((c: string) => c.toLowerCase() === raw.toLowerCase())
      if (exactMatch) {
        result = exactMatch
      } else if (raw.length > 0) {
        // AI returned a new name without NEW: prefix — treat as suggestion
        const defaultGroup = (groupNames ?? []).find((g: string) => g !== 'Income' && g !== 'Transfer') ?? (groupNames?.[0] ?? 'Lifestyle')
        suggestion = { name: raw, group: defaultGroup }
      }
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
