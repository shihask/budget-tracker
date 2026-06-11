import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DAILY_LIMIT = 100

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
    // Reset daily — check if reset_at is today
    const needsReset = !resetAt ||
      resetAt.getFullYear() !== now.getFullYear() ||
      resetAt.getMonth() !== now.getMonth() ||
      resetAt.getDate() !== now.getDate()
    const used = needsReset ? 0 : (settings?.ai_requests_used ?? 0)

    if (used >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'quota_exceeded', used, limit: DAILY_LIMIT }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { mode, description, categoryNames, groupNames, text, accountNames, message, history, context } = body

    // ── Chat mode: conversational finance assistant ──
    if (mode === 'chat') {
      if (!message) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
      }

      const historyLines = (history ?? []).slice(-6).map((m: { role: string; text: string }) =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`
      ).join('\n')

      const prompt = `You are Mint, MoneyPlant's AI financial assistant. Answer concisely in 1-4 sentences. When asked for monthly summary or recurring patterns, be detailed and structured. Use ₹ for amounts. Be specific with numbers when relevant. The user may write in broken English, Hinglish, or Manglish — understand their intent and always reply in simple English.

IMPORTANT RULES:
- You are a READ-ONLY assistant. You CANNOT record, save, modify, or delete any transactions or data.
- Transaction recording is handled automatically by the app — the user types something like "500 coffee" and the app detects and saves it. You have no role in that process.
- Never say "I've recorded", "I've saved", "I've added", or imply you performed any action on the user's data.
- If the user seems to be asking you to record a transaction, clarify: "To record a transaction, just type the amount and item (e.g. '500 coffee') and the app will save it automatically."

User's financial data:
${context ?? ''}

${historyLines ? `Conversation so far:\n${historyLines}\n` : ''}User: ${message}
Assistant:`

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.4,
        }),
      })

      if (!groqRes.ok) {
        return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const groqData = await groqRes.json()
      const reply = groqData?.choices?.[0]?.message?.content?.trim() ?? ''

      await db.from('settings').update({
        ai_requests_used: used + 1,
        ...(needsReset ? { ai_requests_reset_at: now.toISOString() } : {}),
      }).eq('user_id', user.id)

      return new Response(
        JSON.stringify({ reply, expense: null, used: used + 1, limit: DAILY_LIMIT }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Parse mode: extract description, amount, account, category from free text ──
    if (mode === 'parse') {
      if (!text) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
      }

      const expenseCats = (categoryNames ?? []).filter((c: string) => {
        // exclude Income/Transfer categories from parse suggestions
        return true
      })

      const prompt = `Parse this transaction entry and return JSON only. No markdown, no explanation.
The user may write in broken English, Hinglish, Manglish (Malayalam+English), or short informal phrases — understand the intent.

Input: "${text}"

Accounts: ${(accountNames ?? []).join(', ') || 'none'}
Categories: ${expenseCats.join(', ') || 'none'}

Return exactly this JSON shape:
{"description":"cleaned item name","amount":null,"account":null,"category":null}

Rules:
- description: the item/purpose only, cleaned up, fix typos, remove amount/account/filler words
- amount: number without currency symbol, null if not mentioned
- account: fuzzy-match to closest name in Accounts list (e.g. "aksis"→"Axis", "fedral"→"Federal"), null if no reasonable match
- category: exact name from Categories list that best matches the item, null if unsure`

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0,
        }),
      })

      if (!groqRes.ok) {
        return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const groqData = await groqRes.json()
      const raw = groqData?.choices?.[0]?.message?.content?.trim() ?? ''

      let parsed: { description?: string; amount?: number | null; account?: string | null; category?: string | null } = {}
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {
        parsed = { description: text }
      }

      const validAccount = (accountNames ?? []).find((a: string) => a.toLowerCase() === (parsed.account ?? '').toLowerCase()) ?? null
      const validCategory = (categoryNames ?? []).find((c: string) => c.toLowerCase() === (parsed.category ?? '').toLowerCase()) ?? null

      await db.from('settings').update({
        ai_requests_used: used + 1,
        ...(needsReset ? { ai_requests_reset_at: now.toISOString() } : {}),
      }).eq('user_id', user.id)

      return new Response(
        JSON.stringify({
          description: parsed.description ?? null,
          amount: typeof parsed.amount === 'number' ? parsed.amount : null,
          account: validAccount,
          category: validCategory,
          used: used + 1,
          limit: DAILY_LIMIT,
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Categorize mode (default) ──
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

    const prompt = `You are a personal finance categorizer. Reply with ONE line only.

Transaction: "${description}"

EXISTING CATEGORIES: ${categoryNames.join(', ')}

GROUPS (only for suggesting new categories):
${groupLines}

- If one of the EXISTING CATEGORIES is a clear, direct match: reply with that exact category name.
- If none fit clearly: reply with NEW: <new category name> | <best group>
- Do NOT use a group name as a category answer.
- ONE line. Nothing else.`

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

    const defaultGroup = (groupNames ?? []).find((g: string) => g !== 'Income' && g !== 'Transfer') ?? (groupNames?.[0] ?? 'Lifestyle')
    const resolveGroup = (g: string) =>
      (groupNames ?? []).find((n: string) => n.toLowerCase() === g.toLowerCase()) ?? defaultGroup

    // Normalise: if AI skipped NEW: but still used "name | group" format, add prefix
    const rawLine = raw.split('\n')[0].trim()
    const line = (!rawLine.startsWith('NEW:') && rawLine.includes('|'))
      ? 'NEW: ' + rawLine
      : rawLine

    if (line.startsWith('NEW:')) {
      const parts = line.slice(4).split('|').map((s: string) => s.trim())
      suggestion = { name: parts[0] ?? '', group: resolveGroup(parts[1] ?? defaultGroup) }
    } else {
      const exactMatch = categoryNames.find((c: string) => c.toLowerCase() === line.toLowerCase())
      if (exactMatch) {
        result = exactMatch
      } else if (line.length > 0) {
        suggestion = { name: line, group: defaultGroup }
      }
    }

    // Increment usage
    await db.from('settings').update({
      ai_requests_used: used + 1,
      ...(needsReset ? { ai_requests_reset_at: now.toISOString() } : {}),
    }).eq('user_id', user.id)

    return new Response(
      JSON.stringify({ result, suggestion, used: used + 1, limit: DAILY_LIMIT }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})
