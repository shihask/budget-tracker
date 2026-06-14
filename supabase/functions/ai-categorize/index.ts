import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DAILY_LIMIT = 100

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// ── Tool definitions ──
const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getTransactionsByDateRange',
      description: 'Fetch transactions between two dates. Use for date-specific queries the context does not already cover: "what did I spend in March", "show fuel expenses last 3 months", "transactions last week".',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
          end_date:   { type: 'string', description: 'YYYY-MM-DD inclusive' },
          type: { type: 'string', enum: ['expense', 'income', 'all'], default: 'expense' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCategorySummary',
      description: 'Get spend grouped by category for a date range. Use for: "how much on fuel this month", "top categories last month", "which category increased most", "give me a breakdown".',
      parameters: {
        type: 'object',
        properties: {
          start_date:    { type: 'string', description: 'YYYY-MM-DD' },
          end_date:      { type: 'string', description: 'YYYY-MM-DD' },
          category_name: { type: 'string', description: 'Optional — filter to one category name e.g. "Fuel"' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchTransactions',
      description: 'Search transactions by keyword in description. Use for: "find all petrol purchases", "show grocery transactions", "how many times did I buy coffee".',
      parameters: {
        type: 'object',
        properties: {
          keyword:    { type: 'string', description: 'Word or phrase to search in transaction description' },
          start_date: { type: 'string', description: 'Optional YYYY-MM-DD' },
          end_date:   { type: 'string', description: 'Optional YYYY-MM-DD' },
        },
        required: ['keyword'],
      },
    },
  },
]

type DbClient = ReturnType<typeof createClient>
type ToolArgs = Record<string, string>

// Parse llama's text-format tool call. Two formats seen in the wild:
//   <function=name>{...}</function>
//   <function=name({...})></function>
function extractTextToolCall(content: string): { name: string; rawArgs: string } | null {
  // Format 1: args between tags
  let m = content.match(/<function=(\w+)>(\{[\s\S]*?\})<\/function>/)
  if (m) return { name: m[1], rawArgs: m[2].trim() }
  // Format 2: args inside parentheses
  m = content.match(/<function=(\w+)\((\{[\s\S]*?\})\)><\/function>/)
  if (m) return { name: m[1], rawArgs: m[2].trim() }
  return null
}

// Map any invented function name + args to our actual tool names
function resolveToolName(name: string, args: ToolArgs): string | null {
  const n = name.toLowerCase()
  if (n.includes('search')) return 'searchTransactions'
  // If args contain a category field, the intent is a category summary
  if (n.includes('category') || n.includes('summary') || args.category) return 'getCategorySummary'
  if (n.includes('date') || n.includes('range') || n.includes('transaction')) return 'getTransactionsByDateRange'
  return null
}

async function executeTool(name: string, args: ToolArgs, userId: string, db: DbClient): Promise<unknown> {
  if (name === 'getTransactionsByDateRange') {
    const { start_date, end_date, type = 'expense' } = args
    let q = db
      .from('transactions')
      .select('transaction_date, description, amount, transaction_type, categories!category_id(name)')
      .eq('user_id', userId)
      .gte('transaction_date', start_date)
      .lte('transaction_date', end_date)
      .order('transaction_date', { ascending: false })
      .limit(40)
    if (type !== 'all') q = q.eq('transaction_type', type)
    else q = q.in('transaction_type', ['expense', 'income'])
    const { data } = await q
    type TxRow = { transaction_date: string; description: string; amount: number; transaction_type: string; categories: { name: string } | null }
    const rows = (data ?? []) as TxRow[]
    return {
      total: rows.reduce((s, t) => s + t.amount, 0),
      count: rows.length,
      transactions: rows.map(t => ({
        date: t.transaction_date,
        description: t.description,
        amount: t.amount,
        category: t.categories?.name ?? 'Uncategorized',
      })),
    }
  }

  if (name === 'getCategorySummary') {
    const { start_date, end_date, category_name } = args
    const { data } = await db
      .from('transactions')
      .select('amount, categories!category_id(name)')
      .eq('user_id', userId)
      .eq('transaction_type', 'expense')
      .gte('transaction_date', start_date)
      .lte('transaction_date', end_date)
      .limit(300)
    type CatRow = { amount: number; categories: { name: string } | null }
    const rows = (data ?? []) as CatRow[]
    const summary: Record<string, { total: number; count: number }> = {}
    for (const row of rows) {
      const cat = row.categories?.name ?? 'Uncategorized'
      if (category_name && cat.toLowerCase() !== category_name.toLowerCase()) continue
      if (!summary[cat]) summary[cat] = { total: 0, count: 0 }
      summary[cat].total += row.amount
      summary[cat].count++
    }
    return Object.entries(summary)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([category, v]) => ({ category, total: v.total, count: v.count }))
  }

  if (name === 'searchTransactions') {
    const { keyword, start_date, end_date } = args
    let q = db
      .from('transactions')
      .select('transaction_date, description, amount, transaction_type, categories!category_id(name)')
      .eq('user_id', userId)
      .ilike('description', `%${keyword}%`)
      .order('transaction_date', { ascending: false })
      .limit(20)
    if (start_date) q = q.gte('transaction_date', start_date)
    if (end_date)   q = q.lte('transaction_date', end_date)
    const { data } = await q
    type TxRow = { transaction_date: string; description: string; amount: number; transaction_type: string; categories: { name: string } | null }
    const rows = (data ?? []) as TxRow[]
    return {
      total: rows.reduce((s, t) => s + t.amount, 0),
      count: rows.length,
      transactions: rows.map(t => ({
        date: t.transaction_date,
        description: t.description,
        amount: t.amount,
        category: t.categories?.name ?? 'Uncategorized',
      })),
    }
  }

  return { error: 'unknown_tool' }
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
    const needsReset = !resetAt
      || now.getFullYear() !== resetAt.getFullYear()
      || now.getMonth() !== resetAt.getMonth()
      || now.getDate() !== resetAt.getDate()
    const used = needsReset ? 0 : (settings?.ai_requests_used ?? 0)

    if (used >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: 'quota_exceeded', used, limit: DAILY_LIMIT }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { mode, description, categoryNames, groupNames, text, accountNames, message, history, context } = body

    // ── Chat mode: conversational finance assistant with tool calling ──
    if (mode === 'chat') {
      if (!message) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
      }

      const systemPrompt = `You are Mint, MoneyPlant's AI financial assistant. Answer concisely. When asked for monthly summary or recurring patterns, be detailed and structured. Use ₹ for amounts. Be specific with numbers when relevant. The user may write in broken English, Hinglish, or Manglish — understand their intent and always reply in simple English.

RULES:
- READ-ONLY assistant. Never claim to record, save, or delete data. If the user seems to be entering a transaction, say: "Just type the amount and description (e.g. '500 coffee') and the app will save it automatically."
- For date-specific questions: use the Date and Today fields from the context if they cover the query. Call a tool only when you need data beyond what the context already provides.
- Borrowings are balance-sheet movements (not income or expense). Never include them in spending, savings, or free-money totals. "owed-to-you" = your receivable asset. "you-owe" = your liability.

User's financial data:
${context ?? ''}`

      const historyMessages = (history ?? []).slice(-6).map((m: { role: string; text: string }) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }))

      const baseMessages = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: message },
      ]

      const groqHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` }
      const encoder = new TextEncoder()
      const streamHeaders = {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Used': String(used + 1),
      }

      // ── Call 1: detect intent / tool need (non-streaming) ──
      const call1 = await fetch(GROQ_URL, {
        method: 'POST',
        headers: groqHeaders,
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: baseMessages,
          tools: CHAT_TOOLS,
          tool_choice: 'auto',
          max_tokens: 500,
          temperature: 0.2,
        }),
      })

      if (!call1.ok) {
        return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const call1Data = await call1.json()
      const choice = call1Data.choices?.[0]

      // Increment quota
      await db.from('settings').update({
        ai_requests_used: used + 1,
        ...(needsReset ? { ai_requests_reset_at: now.toISOString() } : {}),
      }).eq('user_id', user.id)

      // ── Tool path: execute tools then stream final answer ──
      if (choice?.finish_reason === 'tool_calls') {
        type ToolCall = { id: string; function: { name: string; arguments: string } }
        const toolCalls: ToolCall[] = choice.message.tool_calls ?? []

        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            const args = JSON.parse(tc.function.arguments) as ToolArgs
            const result = await executeTool(tc.function.name, args, user.id, db)
            return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) }
          })
        )

        const call2 = await fetch(GROQ_URL, {
          method: 'POST',
          headers: groqHeaders,
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [...baseMessages, choice.message, ...toolResults],
            max_tokens: 450,
            temperature: 0.4,
            stream: true,
          }),
        })

        if (!call2.ok) {
          return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = call2.body!.getReader()
            const decoder = new TextDecoder()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                controller.enqueue(encoder.encode(decoder.decode(value)))
              }
            } catch { /* client disconnected */ } finally {
              controller.close()
            }
          },
          cancel() { call2.body?.cancel() },
        })

        return new Response(stream, { headers: streamHeaders })
      }

      // ── No-tool path: check for text-format tool call (llama fallback) ──
      const text = choice?.message?.content?.trim() ?? ''
      const textCall = extractTextToolCall(text)
      let parsedArgs: ToolArgs = {}
      if (textCall) { try { parsedArgs = JSON.parse(textCall.rawArgs) } catch { /* use empty */ } }
      const resolvedName = textCall ? resolveToolName(textCall.name, parsedArgs) : null

      if (textCall && resolvedName) {
        // Normalise arg names (model sometimes uses 'category' instead of 'category_name')
        const args: ToolArgs = { ...parsedArgs }
        if (args.category && !args.category_name) { args.category_name = args.category; delete args.category }

        const result = await executeTool(resolvedName, args, user.id, db)
        const syntheticId = 'tool_0'

        const call2 = await fetch(GROQ_URL, {
          method: 'POST',
          headers: groqHeaders,
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              ...baseMessages,
              {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: syntheticId, type: 'function', function: { name: resolvedName, arguments: textCall.rawArgs } }],
              },
              { role: 'tool', tool_call_id: syntheticId, content: JSON.stringify(result) },
            ],
            max_tokens: 450,
            temperature: 0.4,
            stream: true,
          }),
        })

        if (!call2.ok) {
          return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = call2.body!.getReader()
            const decoder = new TextDecoder()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                controller.enqueue(encoder.encode(decoder.decode(value)))
              }
            } catch { /* client disconnected */ } finally {
              controller.close()
            }
          },
          cancel() { call2.body?.cancel() },
        })

        return new Response(stream, { headers: streamHeaders })
      }

      // Truly no tool needed — return answer as SSE
      const ssePayload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
      return new Response(encoder.encode(ssePayload), { headers: streamHeaders })
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
- amount: ANY standalone number at the start or end is the price/amount (e.g. "266 Z5 subscription" → amount=266, "coffee 80" → amount=80). null only if truly no number present.
- description: the item/purpose only, cleaned up, fix typos, remove the amount number and account/filler words
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
