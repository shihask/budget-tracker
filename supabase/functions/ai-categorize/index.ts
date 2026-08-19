import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Enforcement switch ONLY. The user-facing percentage is always token-derived
// (mp_ai_usage_today), in both phases — flipping this changes what blocks, never
// what is displayed. Stays false until the ai_call_log calibration query says
// what a real day of usage costs; blocking on an untested number means learning
// its value from complaints instead of data.
//
// The limits themselves live in SQL (mp_daily_ai_request_limit,
// mp_daily_ai_token_budget) so the percentage has exactly one definition and
// the client never receives the budget.
const ENFORCE_TOKEN_LIMIT = false

// Only these reach ai_call_log.feature; anything else is stored as NULL.
// SIX features send mode='chat' (real chat plus the affordability / analytics /
// goal-plan / goal-progress / coach one-shots), so `mode` alone collapses
// exactly the distinctions calibration depends on — hence a separate label.
// Allowlisted rather than trusted, so a malformed or hostile client cannot
// invent categories and pollute the data the budget is set from.
const KNOWN_FEATURES = new Set([
  'chat', 'affordability', 'analytics', 'goal-plan', 'goal-progress', 'coach',
  'categorize', 'parse', 'receipt-extract', 'statement-extract',
])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Used',
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// ── Groq models ──────────────────────────────────────────────────────────────
// Named, not inlined, because Groq has now decommissioned a model under this
// app three times (llama-4-scout 2026-07-17, then llama-3.3-70b-versatile and
// llama-3.1-8b-instant together on 2026-08-16, which took chat, autopilot
// categorisation and the text-statement path down at once). The next one
// should be a one-line change here, not a hunt through six call sites.
//
// llama-3.1-8b-instant and llama-3.3-70b-versatile are GONE — do not
// reintroduce them. Groq's only production-tier text models are the gpt-oss
// pair below.
const MODEL_TEXT_LARGE = 'openai/gpt-oss-120b'  // chat: needs tool calling + longer reasoning
const MODEL_TEXT_SMALL = 'openai/gpt-oss-20b'   // categorise/parse/statement-text: short, cheap, 2x faster

// The ONLY vision-capable model Groq offers, and it sits in their Preview tier
// ("not for production, may be discontinued at short notice"). Receipt scanning
// and the scanned-statement path depend on it, so a Groq preview pull breaks
// them with no in-provider fallback. Flagged deliberately: if receipts must be
// reliable, they belong on a provider with a stable multimodal tier.
const MODEL_VISION = 'qwen/qwen3.6-27b'

// gpt-oss are REASONING models. Left at default effort they spend the token
// budget thinking before emitting anything, so a tight max_tokens yields an
// empty string rather than an error — autopilot would silently stop suggesting
// instead of failing loudly. Same failure qwen3.6 exhibited (see the
// receipt-extract notes below), so the same mitigation: minimise reasoning and
// leave headroom on the completion cap.
const LOW_REASONING = { reasoning_effort: 'low' }

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
  {
    type: 'function',
    function: {
      name: 'getAccountTransactions',
      description: 'Fetch transactions from a specific bank account or credit card by name. Use when the user asks about a specific card or account: "what did I spend on HDFC card", "show Axis credit card transactions", "how much charged to SBI account this month".',
      parameters: {
        type: 'object',
        properties: {
          account_name: { type: 'string', description: 'Name or partial name of the account or credit card, e.g. "HDFC", "Axis", "SBI"' },
          start_date:   { type: 'string', description: 'Optional YYYY-MM-DD' },
          end_date:     { type: 'string', description: 'Optional YYYY-MM-DD' },
        },
        required: ['account_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMonthlySummary',
      description: 'Get full income vs expense summary with category breakdown for a month. Use for: "give me my monthly report", "summarize my spending", "income vs expense this month", "how much did I save last month", "monthly breakdown".',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM format. Omit for current month.' },
        },
        required: [],
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
  if (n.includes('account') || args.account_name || args.account) return 'getAccountTransactions'
  if (n.includes('monthly') || n.includes('report') || args.month) return 'getMonthlySummary'
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

  if (name === 'getAccountTransactions') {
    const { account_name, start_date, end_date } = args
    // Find matching account (bank accounts first, then credit cards)
    const [{ data: accRows }, { data: ccRows }] = await Promise.all([
      db.from('accounts').select('id, name').eq('user_id', userId).ilike('name', `%${account_name}%`).limit(1),
      db.from('credit_cards').select('id, name').eq('user_id', userId).ilike('name', `%${account_name}%`).limit(1),
    ])
    type NamedRow = { id: string; name: string }
    const found = ((accRows ?? []) as NamedRow[])[0] ?? ((ccRows ?? []) as NamedRow[])[0]
    if (!found) {
      return { error: 'account_not_found', searched: account_name }
    }
    let q = db
      .from('transactions')
      .select('transaction_date, description, amount, transaction_type, categories!category_id(name)')
      .eq('user_id', userId)
      .eq('from_account_id', found.id)
      .order('transaction_date', { ascending: false })
      .limit(40)
    if (start_date) q = q.gte('transaction_date', start_date)
    if (end_date)   q = q.lte('transaction_date', end_date)
    const { data } = await q
    type TxRow = { transaction_date: string; description: string; amount: number; transaction_type: string; categories: { name: string } | null }
    const rows = (data ?? []) as TxRow[]
    return {
      account: found.name,
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

  if (name === 'getMonthlySummary') {
    const { month } = args
    const now = new Date()
    const target = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [yr, mo] = target.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const lastDay = new Date(yr, mo, 0).getDate()
    const end = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const { data } = await db
      .from('transactions')
      .select('amount, transaction_type, categories!category_id(name)')
      .eq('user_id', userId)
      .gte('transaction_date', start)
      .lte('transaction_date', end)
      .in('transaction_type', ['expense', 'income'])
      .limit(500)
    type TxRow = { amount: number; transaction_type: string; categories: { name: string } | null }
    const rows = (data ?? []) as TxRow[]
    const expenses = rows.filter(r => r.transaction_type === 'expense')
    const incomes = rows.filter(r => r.transaction_type === 'income')
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0)
    const totalIncome = incomes.reduce((s, r) => s + r.amount, 0)
    const catTotals: Record<string, number> = {}
    expenses.forEach(r => {
      const cat = r.categories?.name ?? 'Uncategorized'
      catTotals[cat] = (catTotals[cat] ?? 0) + r.amount
    })
    return {
      month: target,
      totalExpense,
      totalIncome,
      savings: totalIncome - totalExpense,
      categories: Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([category, total]) => ({
          category,
          total,
          pct: totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0,
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

    // Stamped ONCE, here, and reused for every usage write belonging to this
    // request — including a streaming flush that lands after midnight.
    // Recomputing it at flush time is the bug documented in
    // mp_bump_ai_usage: the flush would take the "new day" branch carrying
    // 0 requests and open the day with zero requests but N tokens banked.
    const usageDate = new Date().toISOString().slice(0, 10)  // UTC, matches the SQL
    // Correlates every upstream call this ONE question makes, so per-question
    // cost is computable. A chat can fan out to four Groq calls; without this
    // they are indistinguishable from four separate questions.
    const requestId = crypto.randomUUID()

    // Reserve the request atomically: reset-if-stale, check the cap and
    // increment all happen under one row lock. The previous read-then-check-
    // then-increment was raceable — two requests arriving at 99 both read 99,
    // both passed, and the user landed on 101.
    const { data: startRows, error: startError } = await db
      .rpc('mp_try_start_ai_request', { p_user_id: user.id, p_usage_date: usageDate })
    if (startError) {
      console.error('[usage] mp_try_start_ai_request failed', startError)
      return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const start = (startRows as { allowed: boolean; requests: number; tokens: number; usage_pct: number }[])?.[0]

    if (!start?.allowed) {
      return new Response(
        JSON.stringify({
          error: 'quota_exceeded',
          usage_pct: start?.usage_pct ?? 100,
          enforcing: ENFORCE_TOKEN_LIMIT,
        }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (ENFORCE_TOKEN_LIMIT && start.usage_pct >= 100) {
      return new Response(
        JSON.stringify({ error: 'quota_exceeded', usage_pct: start.usage_pct, enforcing: true }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // `used` is the reserved count for this request, still surfaced as X-Used
    // and `used` for backward compatibility with existing clients.
    const used = start.requests - 1

    const body = await req.json()
    const { mode, description, categoryNames, groupNames, text, accountNames, message, history, context, once, imageBase64, mimeType, images, feature } = body

    // ── Token accounting for this request ──────────────────────────────────
    // One HTTP request can make up to TEN upstream Groq calls: the chat tool
    // loop runs up to 3 rounds, groqFetch retries up to 3 models per round,
    // plus a final answer call. So this has to accumulate, not read once.
    const loggedFeature = typeof feature === 'string' && KNOWN_FEATURES.has(feature) ? feature : null
    let tokensThisRequest = 0
    const callLog: { stage: string; model: string; prompt: number | null; completion: number | null }[] = []

    // Records one upstream call. `usage` absent (streaming disconnect, malformed
    // response) is logged as NULL, never 0 — a fake zero would quietly drag the
    // calibration average down and make the budget look cheaper than it is.
    function recordUsage(stage: string, model: string, usage: unknown) {
      const u = usage as { prompt_tokens?: number; completion_tokens?: number } | null | undefined
      const prompt = typeof u?.prompt_tokens === 'number' ? u.prompt_tokens : null
      const completion = typeof u?.completion_tokens === 'number' ? u.completion_tokens : null
      tokensThisRequest += (prompt ?? 0) + (completion ?? 0)
      callLog.push({ stage, model, prompt, completion })
    }

    // Writes the measured tokens and the per-call rows. The counter bump and
    // the log insert are not one transaction: if the bump lands and the insert
    // fails we under-count, which is the safe direction, and calibration reads
    // the log so it stays accurate either way.
    // MUST be idempotent: several paths can reach it (an error return after a
    // partial tool loop, then the stream's finally, then cancel()), and it both
    // bumps a counter and inserts rows. Draining the buffers first means a
    // second call is a no-op instead of double-counting tokens and writing
    // duplicate log rows — which would corrupt the very data the budget is
    // meant to be calibrated from.
    async function flushUsage() {
      const tokens = tokensThisRequest
      const rows = callLog.splice(0, callLog.length)
      tokensThisRequest = 0
      if (tokens > 0) {
        const { error } = await db.rpc('mp_bump_ai_usage', {
          p_user_id: user.id, p_usage_date: usageDate, p_requests: 0, p_tokens: tokens,
        })
        if (error) console.error('[usage] mp_bump_ai_usage failed', error)
      }
      if (rows.length > 0) {
        const { error } = await db.from('ai_call_log').insert(
          rows.map(c => ({
            user_id: user.id, request_id: requestId, mode: mode ?? 'categorize', feature: loggedFeature,
            stage: c.stage, model: c.model, prompt_tokens: c.prompt, completion_tokens: c.completion,
          }))
        )
        if (error) console.error('[usage] ai_call_log insert failed', error)
      }
    }

    // Groq failures are not all the same, and the client can only tell them
    // apart if we say so. A 429 (TPM rate limit) or a 5xx is transient — the
    // user should be told to try again in a moment, not shown the generic
    // "Something went wrong" that also covers real bugs. Returning 503 keeps
    // it distinct from OUR 429, which means the daily allowance is spent.
    function groqFailure(status: number, errBody: string): Response {
      const transient = status === 429 || status >= 500
      return new Response(
        JSON.stringify({ error: transient ? 'ai_busy' : 'ai_error', groq_status: status, groq_body: errBody }),
        { status: transient ? 503 : 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    // Authoritative post-call usage for the response body. Never computed
    // client-side, and never derived from the request count.
    async function currentUsagePct(): Promise<number> {
      const { data } = await db.rpc('mp_ai_usage_today', { p_user_id: user.id })
      return (data as { usage_pct: number }[] | null)?.[0]?.usage_pct ?? 0
    }

    // ── Chat mode: conversational finance assistant with tool calling ──
    if (mode === 'chat') {
      if (!message) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
      }

      // Half of this prompt used to be sent on every call regardless of
      // relevance. The MoneyMovement and DailyChallenge blocks are explicitly
      // conditional in their own wording ("when X context is present") yet were
      // always included: 657 of 1,318 tokens, re-sent on each of the up-to-four
      // Groq calls one question makes. Gating them on the context that actually
      // activates them is a pure token saving with NO behavioural change — the
      // rules are inert when their data is absent.
      //
      // Keep the gate strings in sync with what the client puts in `context`;
      // a rename there silently drops the rules rather than erroring.
      const ctxText = String(context ?? '')
      const systemPrompt = [
        `You are Mint, MoneyPlant's personal finance coach — warm, practical, non-judgmental, specific. Help users understand their financial story and take one small step forward.

COACHING RULES:
- Acknowledge feelings first when users seem worried, then give context. Never blame.
- Never say "you spent too much." Say "Your [category] was ₹X — here's how to trim ₹Y from it."
- Savings suggestions: name the actual category, state % reduction, give ₹/month impact, AND a real-world action ("skip 1 restaurant meal/week"). Numbers without actions feel like homework.
- Budget recovery: give 2–3 specific options (daily limit, pause one category, weekly target) — never just "spend less."
- End with a positive: something they controlled well, money that's coming back, or a tracking win.
- Essential categories: Commitment group, medical, utilities, school fees, groceries, family. Don't make users feel guilty for essential spend.
- Discretionary: food out, entertainment, shopping, subscriptions, personal care, travel (non-work).`,
        ctxText.includes('MoneyMovement') ? `MONEY MOVEMENT RULE — when MoneyMovement context is present:
Your goal is not to summarize transactions. Your goal is to help the user understand why their financial position changed.
Always connect causes and effects. Never list facts without explaining their relationship.
When explaining a spending question, chart, week, or month, your Financial Story must answer:
• Where money came from — and whether each source is recurring, temporary, or one-time.
• Where money went — and what the largest movements were.
• How cash flows changed position: StartingBalance → [events] → EndingBalance.
• What the user should do next (concrete, specific, ₹-quantified).

Source classification rules (use the [Facts] labels from context):
- recurring-income = salary, regular income. Sustainable. Lead with this in your explanation.
- temporary-cash = borrowed money. A LIABILITY, not income. If present: state its % of total cash-in in Why. Add to Watch Out: it's a liability, not extra income; if NextImportantEvent or Liabilities shows a due date, name it explicitly.
- one-time-source = savings withdrawn, refunds, gifts. Non-recurring. Say so.
- recoverable-realized = money returned to you. Frame positively.
- lent-out = cash sent to someone else but recoverable. Frame as "₹X will come back to you from [name]" — not a loss.
- savings-contributed = good financial discipline → mention in Good News.

Quantify the relationships:
- "₹X (Y%) of available cash this period came from borrowed money, not income."
- "Without the borrowed ₹X, your net cash change would have been ₹Y."
- "The [LargestExpense] was funded partly by salary and partly by borrowed money."

Use Timeline to narrate sequence: "Salary arrived on [date], money was borrowed on [date], college fee was paid on [date] — that connects the high spend."
FinancialPressure calibrates your tone: high = urgent and practical; low = reassuring.
StoryConfidence: if medium/low, qualify your analysis: "Based on available data…"
NextImportantEvent: this is always an outgoing payment YOU owe (never money you receive). Proactively mention in Recommendations if it's within the next 2 weeks. NEVER put it in Good News — it is a liability due, not incoming cash.` : '',
        ctxText.includes('DailyChallenge') ? `DAILY CHALLENGE (when DailyChallenge context present):
- on_track/clear: acknowledge streak, state remaining for today.
- at_risk: motivating, not alarming. "One mindful decision can complete today's mission."
- exceeded: compassionate. "Small miss — tomorrow is a fresh start."
- Reference the plant positively when relevant. Never say "you failed" or "you broke your streak."` : '',
        `FIXED RULES:
- READ-ONLY: Never claim to record/save/delete transactions. If user enters one, say: "Just type the amount and description (e.g. '500 coffee') and I'll save it."
- Borrowings are balance-sheet items — exclude from spend/savings/free-money totals. owed-to-you = asset (coming back). you-owe = liability.
- Use ₹ for all amounts. Be specific with numbers.
- Reply in simple English even if user writes in Hinglish or Manglish.
- Use context for current-month data; call a tool only for date ranges beyond what context covers.

RESPONSE STRUCTURE — use this order whenever applicable:
🟢/🟠/🔴 One sentence answer — no heading, just emoji + sentence. Use 🟢 when things are generally OK, 🟠 when caution is needed, 🔴 when there is real risk.

**Why:**
Explanation here (max 2 sentences per paragraph, blank line between paragraphs).

**Recommendations:**
- First action
- Second action

**Watch Out:**
Only when a genuine risk exists (one short paragraph).

**Good News:**
Only when something is genuinely positive.

FORMATTING RULES:
- Bold ALL rupee amounts: **₹5,216**. Bold key percentages: **18%**.
- Never write a rupee amount without bold — every ₹ must be inside **...**.
- Only "- item" bullets. Use ONLY these four section headings: **Why:** / **Recommendations:** / **Watch Out:** / **Good News:**
- Omit any section with nothing to say. Never write an empty heading.
- Max 2 sentences per paragraph. Never produce walls of text.
- Never use markdown tables or code blocks.
- For spending breakdowns, format each expense as: - Category: **₹amount**`,
        `User's financial data:\n${context ?? ''}`,
      ].filter(Boolean).join('\n\n')

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
      // Each model has its own TPM budget on Groq, so falling back to the
      // smaller one buys a fresh allowance when the larger is saturated.
      //
      // The fallback triggers on ANY non-OK status, not just 429. It used to
      // check `if (r.status !== 429) return r`, which meant a decommissioned
      // model — a 404, not a 429 — returned immediately and the fallback never
      // ran. That is exactly how the 2026-08-16 shutdown took chat down
      // completely instead of degrading to the smaller model. Availability
      // failures and rate limits both deserve the second attempt; only the
      // sleep-and-retry step is 429-specific, since sleeping does nothing for
      // a model that no longer exists.
      // Returns the model alongside the response: the fallback means the model
      // that actually produced the tokens varies per call, and gpt-oss-120b and
      // gpt-oss-20b are priced 2x apart. Attributing every call to the primary
      // would make the calibration data wrong in exactly the direction that
      // matters (under load, when the cheap model answers most often).
      const groqFetch = async (payload: Record<string, unknown>): Promise<{ res: Response; model: string }> => {
        const call = (model: string) =>
          fetch(GROQ_URL, { method: 'POST', headers: groqHeaders, body: JSON.stringify({ model, ...LOW_REASONING, ...payload }) })

        const primary = await call(MODEL_TEXT_LARGE)
        if (primary.ok) return { res: primary, model: MODEL_TEXT_LARGE }
        console.error(`[chat] ${MODEL_TEXT_LARGE} returned ${primary.status}, falling back to ${MODEL_TEXT_SMALL}`)

        const secondary = await call(MODEL_TEXT_SMALL)
        if (secondary.ok || secondary.status !== 429) return { res: secondary, model: MODEL_TEXT_SMALL }

        // Only a rate limit is worth waiting out (~12s covers Groq's window).
        await new Promise<void>(res => setTimeout(res, 12000))
        return { res: await call(MODEL_TEXT_SMALL), model: MODEL_TEXT_SMALL }
      }
      const encoder = new TextEncoder()
      const streamHeaders = {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Used': String(used + 1),
      }

      // ── Multi-turn tool calling loop (up to 3 rounds) ──
      type ToolCall = { id: string; function: { name: string; arguments: string } }
      let loopMessages = [...baseMessages]
      let directAnswer: string | null = null

      for (let round = 0; round < 3; round++) {
        const { res: callR, model: callModel } = await groqFetch({
          messages: loopMessages,
          tools: CHAT_TOOLS,
          tool_choice: 'auto',
          max_tokens: 500,
          temperature: 0.2,
        })
        if (!callR.ok) {
          const errBody = await callR.text()
          console.error(`[chat] Groq tool-call round ${round} failed: ${callR.status} ${errBody}`)
          await flushUsage()  // earlier rounds may already have cost tokens
          return groqFailure(callR.status, errBody)
        }
        const callRData = await callR.json()
        recordUsage('tool-round', callModel, callRData?.usage)
        const roundChoice = callRData.choices?.[0]

        if (roundChoice?.finish_reason !== 'tool_calls') {
          directAnswer = roundChoice?.message?.content?.trim() ?? ''
          break
        }

        const toolCalls: ToolCall[] = roundChoice.message.tool_calls ?? []
        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            let args: ToolArgs = {}
            try {
              const parsed = JSON.parse(tc.function.arguments)
              if (parsed && typeof parsed === 'object') args = parsed as ToolArgs
            } catch { /* fall through with empty args */ }
            const result = await executeTool(tc.function.name, args, user.id, db)
            return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) }
          })
        )
        loopMessages = [...loopMessages, roundChoice.message, ...toolResults]
      }

      // The request itself was already reserved atomically at the top of the
      // handler; tokens are flushed once the Groq calls have returned.

      // Helper: produce final answer from a messages array (streaming or JSON)
      const streamFinal = async (msgs: object[]): Promise<Response> => {
        if (once) {
          const { res: r, model: finalModel } = await groqFetch({ messages: msgs, max_tokens: 600, temperature: 0.4 })
          if (!r.ok) {
            const errBody = await r.text()
            console.error(`[chat] Groq final (once) failed: ${r.status} ${errBody}`)
            await flushUsage()
            return groqFailure(r.status, errBody)
          }
          const d = await r.json()
          recordUsage('final', finalModel, d?.usage)
          const reply = d.choices?.[0]?.message?.content?.trim() ?? ''
          await flushUsage()
          return new Response(
            JSON.stringify({ reply, used: used + 1, usage_pct: await currentUsagePct(), enforcing: ENFORCE_TOKEN_LIMIT }),
            { headers: { ...cors, 'Content-Type': 'application/json', 'X-Used': String(used + 1) } }
          )
        }
        // include_usage makes Groq emit a final `{"choices":[],"usage":{…}}`
        // chunk just before [DONE]. That is the only way to learn the token
        // cost of a streamed answer.
        const { res: r, model: finalModel } = await groqFetch({
          messages: msgs, max_tokens: 600, temperature: 0.4,
          stream: true, stream_options: { include_usage: true },
        })
        if (!r.ok) {
          const errBody = await r.text()
          console.error(`[chat] Groq stream failed: ${r.status} ${errBody}`)
          await flushUsage()
          return groqFailure(r.status, errBody)
        }

        // Tokens are known only when the stream ends, which is AFTER the
        // response headers have already been flushed — so they cannot ride on
        // X-Used. They are written to the database here and announced to the
        // client as one extra SSE event instead.
        //
        // Idempotent and called from BOTH start()'s finally and cancel():
        // cancel() bypasses start() entirely, so a user pressing stop would
        // otherwise lose the write for tokens Groq has already charged us for.
        let flushed = false
        let sawUsage = false
        const flushStreamUsage = async () => {
          if (flushed) return
          flushed = true
          // No usage chunk means the stream was cut short. Log the call with
          // NULL tokens rather than 0: the cost is unknown, not zero.
          if (!sawUsage) recordUsage('stream-nousage', finalModel, null)
          await flushUsage()
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = r.body!.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let doneSeen = false

            // Forwards one complete SSE line, holding back [DONE] so the usage
            // event can be emitted before it — the client's reader returns as
            // soon as it sees [DONE] and never reads past it.
            const forward = (line: string) => {
              const trimmed = line.trim()
              if (trimmed === 'data: [DONE]') { doneSeen = true; return }
              if (trimmed.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(trimmed.slice(6))
                  // Groq reports the SAME usage twice: once on the
                  // finish_reason:"stop" chunk and again on the dedicated
                  // include_usage chunk (choices:[]), with identical numbers.
                  // Recording both double-counted every streamed chat, so take
                  // the first and ignore the repeat.
                  if (parsed?.usage && !sawUsage) { sawUsage = true; recordUsage('stream-usage', finalModel, parsed.usage) }
                } catch { /* not JSON — a comment or keep-alive, forward as-is */ }
              }
              controller.enqueue(encoder.encode(line + '\n'))
            }

            try {
              while (true) {
                // { stream: true } is required: without it a multi-byte
                // character split across a TCP chunk decodes to U+FFFD, and the
                // chat prompt mandates a rupee sign on every amount.
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''  // keep the trailing partial line
                for (const line of lines) forward(line)
              }
              if (buffer.trim()) forward(buffer)
            } catch {
              /* client disconnected mid-stream */
            } finally {
              try {
                await flushStreamUsage()
                const pct = await currentUsagePct()
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ mp_usage_pct: pct, enforcing: ENFORCE_TOKEN_LIMIT })}\n\n`))
                if (doneSeen) controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              } catch { /* client gone; the DB write above still happened */ }
              controller.close()
            }
          },
          cancel() {
            r.body?.cancel()
            // Fire-and-forget: cancel() cannot await, but the isolate stays
            // alive long enough for this to land.
            flushStreamUsage().catch(e => console.error('[usage] cancel flush failed', e))
          },
        })
        return new Response(stream, { headers: streamHeaders })
      }

      // ── If tools were used: generate proper final answer with full context ──
      if (loopMessages.length > baseMessages.length) {
        return await streamFinal(loopMessages)
      }

      // ── No tools used: check for text-format tool call (llama fallback) ──
      const text = directAnswer ?? ''
      const textCall = extractTextToolCall(text)
      let parsedArgs: ToolArgs = {}
      if (textCall) { try { parsedArgs = JSON.parse(textCall.rawArgs) } catch { /* use empty */ } }
      const resolvedName = textCall ? resolveToolName(textCall.name, parsedArgs) : null

      if (textCall && resolvedName) {
        const args: ToolArgs = { ...parsedArgs }
        if (args.category && !args.category_name) { args.category_name = args.category; delete args.category }
        const result = await executeTool(resolvedName, args, user.id, db)
        const syntheticId = 'tool_0'
        return await streamFinal([
          ...baseMessages,
          { role: 'assistant', content: null, tool_calls: [{ id: syntheticId, type: 'function', function: { name: resolvedName, arguments: textCall.rawArgs } }] },
          { role: 'tool', tool_call_id: syntheticId, content: JSON.stringify(result) },
        ])
      }

      // Truly no tool needed — the tool-loop round that produced this answer
      // still cost tokens, and this is the MOST COMMON chat path (a question
      // that needs no tool call). Both returns below must flush, or the bulk of
      // chat spend is captured into the accumulator and then thrown away.
      await flushUsage()
      const noToolPct = await currentUsagePct()
      if (once) {
        return new Response(JSON.stringify({ reply: text, used: used + 1, usage_pct: noToolPct, enforcing: ENFORCE_TOKEN_LIMIT }), { headers: { ...cors, 'Content-Type': 'application/json', 'X-Used': String(used + 1) } })
      }
      // Synthetic single-chunk stream. Carries the usage event before [DONE],
      // matching the real streaming path's contract so the client updates its
      // percentage the same way either way.
      const ssePayload =
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n` +
        `data: ${JSON.stringify({ mp_usage_pct: noToolPct, enforcing: ENFORCE_TOKEN_LIMIT })}\n\n` +
        `data: [DONE]\n\n`
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
          model: MODEL_TEXT_SMALL,
          messages: [{ role: 'user', content: prompt }],
          ...LOW_REASONING,
          // Was 100 under llama-3.1-8b-instant. Raised because gpt-oss spends
          // part of the budget reasoning even at low effort, and a truncated
          // completion here returns empty rather than erroring.
          max_tokens: 300,
          temperature: 0,
        }),
      })

      if (!groqRes.ok) {
        return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const groqData = await groqRes.json()
      recordUsage(mode === 'parse' ? 'parse' : 'categorize', MODEL_TEXT_SMALL, groqData?.usage)
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

      await flushUsage()

      return new Response(
        JSON.stringify({
          description: parsed.description ?? null,
          amount: typeof parsed.amount === 'number' ? parsed.amount : null,
          account: validAccount,
          category: validCategory,
          used: used + 1,
          usage_pct: await currentUsagePct(),
          enforcing: ENFORCE_TOKEN_LIMIT,
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Receipt-extract mode: read merchant/amount/date/category off a receipt photo ──
    if (mode === 'receipt-extract') {
      if (!imageBase64) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
      }

      const currentYear = new Date().getFullYear()
      const extractPrompt = `Extract payment details from this photo. Return strict JSON only, no markdown:
{"description":null,"amount":null,"transaction_date":null,"category":null,"confidence":"low"}

This can be EITHER a printed/physical receipt or invoice, OR a screenshot of a payment app's transaction confirmation screen (Google Pay, PhonePe, Paytm, other UPI apps, net banking, bank apps, etc.) — both are equally valid, treat a payment-app screenshot exactly like a receipt.

- description: short, customer-friendly merchant/payee name. On a paper receipt this is the store name at the top (e.g. "DMart", not "DMART RETAIL LTD. STORE 0054"). On a payment-app screenshot this is who the money was PAID TO — usually labeled "To:", "Paid to", or shown next to a "Pay again"-style button (e.g. "DAYA DISCOUNT HYPER PHARMA"). Never use the payer's own name (often labeled "From:") as the description. null if unreadable.
- amount: the actual amount paid. On a paper receipt, prefer "Grand Total"/"Amount Paid" over a Subtotal/GST/Discount/Round Off line. On a payment-app screenshot this is usually the large prominent number near the top (e.g. "₹71"). Ignore currency symbols/commas, return the plain number only (e.g. "₹1,250.50" → 1250.50). If genuinely ambiguous, return null and confidence "low" rather than guessing.
- transaction_date: the date (and time, if shown) of the purchase/payment, as YYYY-MM-DD. Payment-app screenshots often show it as e.g. "18 Jul 2026, 7:53pm" — convert that to date-only YYYY-MM-DD. If year is missing, assume ${currentYear}. null if illegible.
- category: exact name from this list, or "NEW: <name> | <group>" if none fit, or null if unsure.
- confidence: return "high" ONLY if merchant/payee, amount, AND date are all clearly readable and internally consistent. Return "low" if any of them are blurry, ambiguous, guessed, or inconsistent — prefer "low" whenever in doubt. A failed/pending payment (not "Completed"/"Success") should also lower confidence.

Categories: ${(categoryNames ?? []).join(', ') || 'none'}
Groups (for NEW only): ${(groupNames ?? []).filter((g: string) => g !== 'Income' && g !== 'Transfer').join(', ')}

Only return all nulls and confidence "low" if this is clearly neither a receipt nor a payment confirmation of any kind (e.g. a random unrelated photo).`

      const extractRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          // meta-llama/llama-4-scout-17b-16e-instruct was deprecated/removed by Groq
          // (shutdown 2026-07-17) — see MODEL_VISION for the current one and why
          // it is a standing risk.
          model: MODEL_VISION,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: extractPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
            ],
          }],
          // No response_format here (unlike a text-only request) — Groq's strict
          // JSON-mode validator rejects this vision model's own output combined with
          // an image input (400 "Failed to validate JSON"), confirmed via live logs.
          // The prompt's own "strict JSON only" instruction + the regex-based parse
          // below (same approach as the parse/categorize modes) is the reliable path.
          // qwen3.6 is a reasoning model that otherwise emits a <think>...</think>
          // trace before the actual answer — confirmed via live logs it was getting
          // cut off mid-thought by max_tokens before ever reaching the JSON. Disable
          // reasoning entirely since it's unnecessary for structured extraction.
          reasoning_effort: 'none',
          max_tokens: 300,
          temperature: 0,
        }),
      })

      if (!extractRes.ok) {
        const errBody = await extractRes.text()
        console.error(`[receipt-extract] Groq call failed: ${extractRes.status} ${errBody}`)
        return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const extractData = await extractRes.json()
      recordUsage('receipt', MODEL_VISION, extractData?.usage)
      const extractRaw: string = extractData?.choices?.[0]?.message?.content?.trim() ?? ''
      console.log('[receipt-extract] raw model output:', extractRaw)

      // Defensive: strip a <think>...</think> block if one still shows up despite
      // reasoning_effort: 'none' — only the content after it should hold the JSON.
      const extractAfterThink = extractRaw.includes('</think>')
        ? extractRaw.split('</think>').pop() ?? extractRaw
        : extractRaw

      let extractParsed: { description?: string; amount?: unknown; transaction_date?: string; category?: string; confidence?: string } = {}
      try {
        const jsonMatch = extractAfterThink.match(/\{[\s\S]*\}/)
        if (jsonMatch) extractParsed = JSON.parse(jsonMatch[0])
      } catch (err) {
        console.error('[receipt-extract] JSON parse failed:', err)
        extractParsed = {}
      }

      const validDescription = extractParsed.description?.trim() || null

      // Some vision responses represent the amount as a string (e.g. "71" or "₹71")
      // even in JSON mode — coerce before validating rather than rejecting outright.
      let validAmount: number | null = null
      const rawAmountValue = typeof extractParsed.amount === 'number'
        ? extractParsed.amount
        : typeof extractParsed.amount === 'string'
        ? Number(extractParsed.amount.replace(/[^0-9.]/g, ''))
        : NaN
      if (!isNaN(rawAmountValue) && rawAmountValue > 0 && rawAmountValue < 10_000_000) {
        validAmount = rawAmountValue
      }

      let validDate: string | null = null
      if (typeof extractParsed.transaction_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extractParsed.transaction_date)) {
        const candidate = new Date(extractParsed.transaction_date + 'T00:00:00')
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        if (candidate <= tomorrow) validDate = extractParsed.transaction_date
      }

      let extractCategory: string | null = null
      let extractSuggestion: { name: string; group: string } | null = null
      const rawCategory = (extractParsed.category ?? '').trim()
      if (rawCategory.startsWith('NEW:')) {
        const parts = rawCategory.slice(4).split('|').map((s: string) => s.trim())
        const extractDefaultGroup = (groupNames ?? []).find((g: string) => g !== 'Income' && g !== 'Transfer') ?? (groupNames?.[0] ?? 'Lifestyle')
        const extractResolveGroup = (g: string) =>
          (groupNames ?? []).find((n: string) => n.toLowerCase() === g.toLowerCase()) ?? extractDefaultGroup
        extractSuggestion = { name: parts[0] ?? '', group: extractResolveGroup(parts[1] ?? extractDefaultGroup) }
      } else if (rawCategory) {
        extractCategory = (categoryNames ?? []).find((c: string) => c.toLowerCase() === rawCategory.toLowerCase()) ?? null
      }

      const validConfidence = extractParsed.confidence === 'high' ? 'high' : 'low'

      await flushUsage()

      return new Response(
        JSON.stringify({
          description: validDescription,
          merchant: validDescription,
          amount: validAmount,
          transaction_date: validDate,
          category: extractCategory,
          confidence: validConfidence,
          suggestion: extractSuggestion,
          used: used + 1,
          usage_pct: await currentUsagePct(),
          enforcing: ENFORCE_TOKEN_LIMIT,
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── Statement-extract mode: read every transaction row off a UPI-app/bank-statement
    // screenshot chunk (one or more images) or a chunk of PDF-extracted text ──
    if (mode === 'statement-extract') {
      if (!images?.length && !text) {
        return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: cors })
      }

      const stmtCurrentYear = new Date().getFullYear()
      const stmtIsImages = Array.isArray(images) && images.length > 0

      const stmtInstructions = `Extract every individual transaction row from this ${stmtIsImages ? 'UPI-app/bank-statement screenshot' : 'bank/UPI-app statement text'}. Return strict JSON only, no markdown, matching this shape exactly:
{"statement":{"bank":null,"period_from":null,"period_to":null},"unparsed_count":0,"transactions":[{"page":1,"description":null,"description_confidence":"high","amount":null,"amount_confidence":"high","date":null,"date_confidence":"high","type":"debit","category":null,"category_confidence":"high","account_hint":null,"status":"success"}]}

- One entry in "transactions" per distinct transaction row, in the order they appear. Do not merge, summarize, or skip rows.
- page: 1-based index of which image this row came from${stmtIsImages ? ` (there are ${images.length} images, in the order given)` : ' (always 1 for text input)'}.
- description: the merchant/payee/counterparty name as shown, cleaned up for readability (drop reference numbers/IDs glued onto the name).
- amount: the plain transaction amount, no currency symbol/commas. Never a running/closing balance column.
- date: YYYY-MM-DD. If year is missing, assume ${stmtCurrentYear}.
- type: "debit" if money left the account (payment/purchase/withdrawal), "credit" if money came in (received/refund/deposit).
- category: exact name from this list, or "NEW: <name> | <group>" if none fit, or null if unsure.
- Each "_confidence" field is "high" only if that specific value is clearly legible and unambiguous, "low" if blurry/guessed/cut off — judge every field independently (e.g. a blurry date does not make the amount low-confidence too).
- account_hint: ONLY when this row has its own visible bank/account label (e.g. a "Bank" column showing "Axis XX87", or an inline "Axis Bank ••87" tag) — an object {"raw": "<exact text shown>", "bank_name": "<bank name only, e.g. Axis>", "masked_number": "<masked suffix only, e.g. XX87>"}. If the row has no such per-row account label (most screenshots don't), account_hint MUST be null — never guess or invent one from context.
- status: "failed" if this row is explicitly marked FAILED/DECLINED/REVERSED/UNSUCCESSFUL, "pending" if explicitly marked PENDING/PROCESSING, otherwise "success" (the default — most statements don't show a status at all, which also means "success").
- unparsed_count: how many additional rows you can tell exist (partial text, a row cut off at an edge, an entry too garbled to extract) but couldn't confidently turn into a transaction entry. 0 if none.
- statement.bank/period_from/period_to: fill in only if clearly visible, else null.

Categories: ${(categoryNames ?? []).join(', ') || 'none'}
Groups (for NEW only): ${(groupNames ?? []).filter((g: string) => g !== 'Income' && g !== 'Transfer').join(', ')}

If there are no transaction rows at all, return an empty "transactions" array rather than guessing.`

      const stmtModel = stmtIsImages ? MODEL_VISION : MODEL_TEXT_SMALL
      const stmtMessages = stmtIsImages
        ? [{
            role: 'user',
            content: [
              { type: 'text', text: stmtInstructions },
              ...images.map((img: { base64: string; mimeType?: string }) => ({
                type: 'image_url',
                image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
              })),
            ],
          }]
        : [{ role: 'user', content: `${stmtInstructions}\n\nSTATEMENT TEXT:\n${text}` }]

      async function fetchStmtGroq(): Promise<Response> {
        return fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: stmtModel,
            messages: stmtMessages,
            // Reasoning suppression on BOTH paths now, for the same underlying
            // reason but two different models: qwen3.6 emits a <think>...</think>
            // trace inline (see receipt-extract), and gpt-oss reasons before
            // emitting. Either way an unsuppressed reasoning pass eats the token
            // budget before the JSON is written. No response_format on the image
            // path for the "Groq's JSON validator rejects it combined with image
            // input" reason documented in receipt-extract.
            ...(stmtIsImages ? { reasoning_effort: 'none' } : LOW_REASONING),
            max_tokens: 3000,
            temperature: 0,
          }),
        })
      }

      // One retry on transient failure (network hiccup / model timeout / provider
      // blip) before surfacing an error — a chunk covering a dozen-plus rows is
      // too expensive to force the user to re-run over a one-off glitch.
      let stmtRes = await fetchStmtGroq()
      if (!stmtRes.ok) {
        // The first attempt still cost whatever Groq charged for it. It used to
        // be dropped un-parsed, which under-reported the true cost of every
        // retried chunk — precisely the calls calibration most needs to see.
        // A failed response usually carries no usage body, so this is
        // best-effort and records NULL rather than 0 when there is none.
        try {
          const failedBody = await stmtRes.clone().json()
          if (failedBody?.usage) recordUsage('statement-retry', stmtModel, failedBody.usage)
        } catch { /* error body was not JSON; nothing recoverable */ }
        stmtRes = await fetchStmtGroq()
      }

      if (!stmtRes.ok) {
        const errBody = await stmtRes.text()
        console.error(`[statement-extract] Groq call failed: ${stmtRes.status} ${errBody}`)
        return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      const stmtData = await stmtRes.json()
      recordUsage('statement', stmtModel, stmtData?.usage)
      const stmtRaw: string = stmtData?.choices?.[0]?.message?.content?.trim() ?? ''
      console.log('[statement-extract] raw model output:', stmtRaw)

      const stmtAfterThink = stmtRaw.includes('</think>') ? stmtRaw.split('</think>').pop() ?? stmtRaw : stmtRaw

      let stmtParsed: { statement?: Record<string, unknown>; unparsed_count?: unknown; transactions?: unknown[] } = {}
      try {
        const jsonMatch = stmtAfterThink.match(/\{[\s\S]*\}/)
        if (jsonMatch) stmtParsed = JSON.parse(jsonMatch[0])
      } catch (err) {
        console.error('[statement-extract] JSON parse failed:', err)
        stmtParsed = {}
      }

      const stmtTomorrow = new Date(now)
      stmtTomorrow.setDate(stmtTomorrow.getDate() + 1)

      function coerceStmtAmount(v: unknown): number | null {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : NaN
        return !isNaN(n) && n > 0 && n < 10_000_000 ? n : null
      }
      function coerceStmtDate(v: unknown): string | null {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
        const d = new Date(v + 'T00:00:00')
        return d <= stmtTomorrow ? v : null
      }
      function coerceStmtConfidence(v: unknown): 'high' | 'low' {
        return v === 'high' ? 'high' : 'low'
      }
      function coerceStmtStatus(v: unknown): 'success' | 'failed' | 'pending' {
        return v === 'failed' || v === 'pending' ? v : 'success'
      }
      function coerceStmtAccountHint(v: unknown): { raw: string | null; bank_name: string | null; masked_number: string | null } | null {
        if (!v || typeof v !== 'object') return null
        const obj = v as Record<string, unknown>
        const raw = typeof obj.raw === 'string' ? obj.raw.trim() || null : null
        const bank_name = typeof obj.bank_name === 'string' ? obj.bank_name.trim() || null : null
        const masked_number = typeof obj.masked_number === 'string' ? obj.masked_number.trim() || null : null
        // Nothing usable — treat like no hint was given rather than an empty-but-truthy object.
        if (!raw && !bank_name && !masked_number) return null
        return { raw, bank_name, masked_number }
      }
      function resolveStmtCategory(raw: unknown): { category: string | null; suggestion: { name: string; group: string } | null } {
        const rawCategory = (typeof raw === 'string' ? raw : '').trim()
        if (rawCategory.startsWith('NEW:')) {
          const parts = rawCategory.slice(4).split('|').map((s: string) => s.trim())
          const defaultGroup = (groupNames ?? []).find((g: string) => g !== 'Income' && g !== 'Transfer') ?? (groupNames?.[0] ?? 'Lifestyle')
          const resolveGroup = (g: string) => (groupNames ?? []).find((n: string) => n.toLowerCase() === g.toLowerCase()) ?? defaultGroup
          return { category: null, suggestion: { name: parts[0] ?? '', group: resolveGroup(parts[1] ?? defaultGroup) } }
        }
        if (rawCategory) {
          return { category: (categoryNames ?? []).find((c: string) => c.toLowerCase() === rawCategory.toLowerCase()) ?? null, suggestion: null }
        }
        return { category: null, suggestion: null }
      }

      const stmtTransactions = (Array.isArray(stmtParsed.transactions) ? stmtParsed.transactions : [])
        .map((t: Record<string, unknown>) => {
          const description = typeof t.description === 'string' ? t.description.trim() || null : null
          const amount = coerceStmtAmount(t.amount)
          const { category, suggestion } = resolveStmtCategory(t.category)
          return {
            page: typeof t.page === 'number' && t.page > 0 ? Math.floor(t.page) : 1,
            description,
            description_confidence: coerceStmtConfidence(t.description_confidence),
            amount,
            amount_confidence: coerceStmtConfidence(t.amount_confidence),
            date: coerceStmtDate(t.date),
            date_confidence: coerceStmtConfidence(t.date_confidence),
            type: t.type === 'credit' ? 'credit' : 'debit',
            category,
            category_suggestion: suggestion,
            category_confidence: coerceStmtConfidence(t.category_confidence),
            account_hint: coerceStmtAccountHint(t.account_hint),
            status: coerceStmtStatus(t.status),
          }
        })
        // Nothing usable at all (no description AND no amount) — not a real row.
        .filter(t => t.description !== null || t.amount !== null)

      const stmtUnparsedCount = typeof stmtParsed.unparsed_count === 'number' && stmtParsed.unparsed_count >= 0
        ? Math.floor(stmtParsed.unparsed_count)
        : 0

      await flushUsage()

      return new Response(
        JSON.stringify({
          statement: stmtParsed.statement ?? { bank: null, period_from: null, period_to: null },
          unparsed_count: stmtUnparsedCount,
          transactions: stmtTransactions,
          used: used + 1,
          usage_pct: await currentUsagePct(),
          enforcing: ENFORCE_TOKEN_LIMIT,
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
        model: MODEL_TEXT_SMALL,
        messages: [{ role: 'user', content: prompt }],
        ...LOW_REASONING,
        // Was 30 under llama-3.1-8b-instant, which was ample for a one-line
        // answer. A reasoning model would burn all 30 before writing anything
        // and return an empty string — autopilot would quietly stop suggesting
        // rather than surface an error. 200 leaves room for the reasoning pass.
        max_tokens: 200,
        temperature: 0,
      }),
    })

    if (!groqRes.ok) {
      return new Response(JSON.stringify({ error: 'ai_error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const groqData = await groqRes.json()
    recordUsage(mode === 'parse' ? 'parse' : 'categorize', MODEL_TEXT_SMALL, groqData?.usage)
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

    await flushUsage()

    return new Response(
      JSON.stringify({ result, suggestion, used: used + 1, usage_pct: await currentUsagePct(), enforcing: ENFORCE_TOKEN_LIMIT }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[ai-categorize] unhandled exception:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: cors })
  }
})
