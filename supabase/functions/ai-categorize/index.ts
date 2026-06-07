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

    const groupDescriptions: Record<string, string> = {
      'Lifestyle':   'day-to-day discretionary spend: food, personal care, clothing, entertainment, subscriptions',
      'Commitment':  'fixed recurring obligations: rent, EMI, insurance, loan repayments',
      'Renovation':  'home improvement and repair costs',
      'Family':      'family-related expenses: school fees, gifts, household items',
      'Transfer':    'money moved between accounts, not real spend',
      'Income':      'money received, not an expense',
    }
    const groupLines = (groupNames ?? [])
      .filter((g: string) => g !== 'Income' && g !== 'Transfer')
      .map((g: string) => `  ${g}: ${groupDescriptions[g] ?? g}`)
      .join('\n')

    const prompt = `You are a strict personal finance categorizer.

Transaction: "${description}"

EXISTING CATEGORIES: ${categoryNames.join(', ')}

GROUPS for new suggestions:
${groupLines}

Rules:
1. Match by what the item IS, not where it is bought. Example: facewash → Personal Care (not Groceries); gym → Fitness (not Commitment).
2. Only pick an existing category if it is a CLEAR, DIRECT match. A loose or approximate match is NOT good enough.
3. If an existing category is a clear match, reply with just that category name. Nothing else.
4. If NO existing category is a clear match, reply with exactly 2 lines:
   NEW: <specific new category name> | <best group from the list above>
   CLOSEST: <the single most related existing category from EXISTING CATEGORIES>
5. Never reply with a group name as the category answer.`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0,
      }),
    })

    if (!groqRes.ok) {
      return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const groqData = await groqRes.json()
    const raw: string = groqData?.choices?.[0]?.message?.content?.trim() ?? ''

    // Parse response (may be 1 or 2 lines)
    let result: string | null = null
    let closest: string | null = null
    let suggestion: { name: string; group: string } | null = null

    const defaultGroup = (groupNames ?? []).find((g: string) => g !== 'Income' && g !== 'Transfer') ?? (groupNames?.[0] ?? 'Lifestyle')
    const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean)

    for (const line of lines) {
      if (line.startsWith('NEW:')) {
        const parts = line.slice(4).split('|').map((s: string) => s.trim())
        suggestion = { name: parts[0] ?? '', group: parts[1] ?? defaultGroup }
      } else if (line.startsWith('CLOSEST:')) {
        const name = line.slice(8).trim()
        const match = categoryNames.find((c: string) => c.toLowerCase() === name.toLowerCase())
        if (match) closest = match
      } else {
        // Single-line: existing category or unformatted new name
        const exactMatch = categoryNames.find((c: string) => c.toLowerCase() === line.toLowerCase())
        if (exactMatch) {
          result = exactMatch
        } else if (!suggestion && line.length > 0) {
          suggestion = { name: line, group: defaultGroup }
        }
      }
    }

    // Increment usage
    await db.from('settings').update({
      ai_requests_used: used + 1,
      ...(needsReset ? { ai_requests_reset_at: now.toISOString() } : {}),
    }).eq('user_id', user.id)

    return new Response(
      JSON.stringify({ result, suggestion, closest, used: used + 1, limit: MONTHLY_LIMIT }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})
