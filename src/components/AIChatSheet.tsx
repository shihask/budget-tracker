import { useRef, useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { parseExpenseWithAI } from '@/lib/gemini'
import { MintAnimation } from './MintAnimation'
import type { AppState, DerivedMetrics, Transaction, Category } from '@/types'
import { INCOME_GROUP, BORROWING_CREDIT_CATS } from '@/lib/constants'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

type SavedExpense = { description: string; amount: number; account: string; category: string; date: string }
type EditPrompt = {
  transaction: Transaction
  field: 'amount' | 'description' | 'category'
  newAmount?: number
  newDescription?: string
  newCategoryId?: string
  newCategoryName?: string
}
type DeletePrompt = { transaction: Transaction }
type Message = { role: 'user' | 'ai'; text: string; savedExpense?: SavedExpense; warning?: boolean; editPrompt?: EditPrompt; deletePrompt?: DeletePrompt }

function guessTransactionType(text: string): 'income' | 'expense' {
  const lower = text.toLowerCase()
  return /\b(received|receive|salary|income|earned|earn|credited|got paid|deposited|deposit)\b/.test(lower)
    ? 'income'
    : 'expense'
}

const FINANCE_QUERY_WORDS = [
  'expense', 'expenses', 'spend', 'spent', 'spending',
  'budget', 'balance', 'category', 'categories',
  'transaction', 'transactions', 'summary', 'report',
  'analytics', 'compare', 'remaining', 'total', 'monthly', 'weekly',
  'saving', 'savings', 'investment', 'investments', 'invest',
  'sip', 'mutual fund', 'fd', 'fixed deposit', 'rd', 'recurring deposit',
  'gold', 'ppf', 'nps', 'chit', 'kuri', 'portfolio', 'contribution',
  'maturity', 'prized', 'corpus',
]

function classifyIntent(text: string): 'question' | 'edit' | 'delete' | 'transaction' {
  const q = text.toLowerCase().trim()

  // Stage 1: question keywords or finance query words → never try to parse as transaction
  if (/\b(what|how|why|show|compare|give|list|tell|which|when|am i|did i|can i)\b/.test(q)) return 'question'
  if (FINANCE_QUERY_WORDS.some(w => q.includes(w))) return 'question'

  // Stage 2a: delete intent
  if (/\b(delete|remove)\b/.test(q)) return 'delete'

  // Stage 2b: edit intent
  if (/\b(change|edit|update|fix|wrong|replace|correct|rename|recategorize|categorize)\b/.test(q)) return 'edit'

  // Stage 3: contains a number → likely a transaction entry
  if (/\d/.test(q)) return 'transaction'

  return 'question'
}

function buildContext(state: AppState, d: DerivedMetrics): string {
  const activeAccs = state.accounts.filter(a => a.is_active)
  const totalBalance = activeAccs.reduce((s, a) => s + a.current_balance, 0)

  const now = new Date()
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const isBorrowingTx = (t: Transaction) =>
    t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment'

  const todayTxns = state.transactions.filter(t =>
    t.transaction_date === localDateStr && t.transaction_type === 'expense'
  )
  const todaySpend = todayTxns.reduce((s, t) => s + t.amount, 0)
  const todayLines = todayTxns.length > 0
    ? todayTxns.map(t => {
        const catName = state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
        return `  • ${t.description}: ₹${t.amount.toLocaleString()} (${catName})`
      }).join('\n')
    : '  (none yet)'

  const thisMonthTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense'
  )
  const lastMonthTxns = state.transactions.filter(t => {
    const dt = new Date(t.transaction_date)
    return dt >= lastMonthStart && dt <= lastMonthEnd && t.transaction_type === 'expense'
  })
  const thisMonthIncomeTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= monthStart && t.transaction_type === 'income'
  )
  const thisMonthTransferTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= monthStart && t.transaction_type === 'transfer'
  )
  const savingsContribThisMonth = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'savings_contribution')
    .reduce((s, t) => s + t.amount, 0)
  const savingsWithdrawThisMonth = state.transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'savings_withdrawal')
    .reduce((s, t) => s + t.amount, 0)

  const monthlySpend = thisMonthTxns.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpend = lastMonthTxns.reduce((s, t) => s + t.amount, 0)
  const thisMonthIncome = thisMonthIncomeTxns.reduce((s, t) => s + t.amount, 0)
  const thisMonthTransfers = thisMonthTransferTxns.reduce((s, t) => s + t.amount, 0)
  // Approximate what balance was at start of month (before this month's income/spend)
  const monthStartBalance = Math.round(totalBalance + monthlySpend - thisMonthIncome)
  const trackingDaysThisMonth = new Set(thisMonthTxns.map(t => t.transaction_date)).size
  const trackingCountThisMonth = thisMonthTxns.length
  const budget = d.weeklyBudget

  // Category breakdown this month (exclude borrowing transactions)
  const catTotalsMonth: Record<string, number> = {}
  thisMonthTxns.forEach(t => {
    const name = state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
    catTotalsMonth[name] = (catTotalsMonth[name] ?? 0) + t.amount
  })
  const topCats = Object.entries(catTotalsMonth)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([n, v]) => `${n}: ₹${v.toLocaleString()}`)
    .join(', ')

  // Recurring pattern detection — descriptions appearing 3+ times in last 90 days (exclude borrowing)
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(now.getDate() - 90)
  const descCount: Record<string, { count: number; total: number }> = {}
  state.transactions
    .filter(t => new Date(t.transaction_date) >= ninetyDaysAgo && t.transaction_type === 'expense')
    .forEach(t => {
      const key = t.description.toLowerCase().trim()
      if (!descCount[key]) descCount[key] = { count: 0, total: 0 }
      descCount[key].count++
      descCount[key].total += t.amount
    })
  const recurring = Object.entries(descCount)
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, v]) => `${name} (${v.count}x, avg ₹${Math.round(v.total / v.count).toLocaleString()})`)
    .join(', ')

  const recent = state.transactions.slice(0, 5).map(t => {
    const catName = state.categories.find(c => c.id === t.category_id)?.name ?? ''
    const tag = isBorrowingTx(t) ? 'balance-sheet' : t.transaction_type
    return `${t.transaction_date} ${t.description} ₹${t.amount} ${catName} [${tag}]`
  }).join('\n')

  // Compact borrowings — rules live in the system prompt, not here
  let borrowingsLine = ''
  if (state.settings.track_borrowings) {
    const lent = state.borrowings.filter(b => b.direction === 'lent' && b.remaining_amount > 0)
    const borrowed = state.borrowings.filter(b => b.direction === 'borrowed' && b.remaining_amount > 0)
    const totalLent = lent.reduce((s, b) => s + b.remaining_amount, 0)
    const totalOwed = borrowed.reduce((s, b) => s + b.remaining_amount, 0)
    const lentStr = lent.map(b => `${b.person_name} ₹${b.remaining_amount.toLocaleString()}`).join(', ') || 'none'
    const owedStr = borrowed.map(b => `${b.person_name} ₹${b.remaining_amount.toLocaleString()}`).join(', ') || 'none'
    borrowingsLine = `\nBorrowings[balance-sheet]: owed-to-you: ${lentStr} (₹${totalLent.toLocaleString()}) | you-owe: ${owedStr} (₹${totalOwed.toLocaleString()})`
  }

  const todayStr = todayTxns.length > 0
    ? todayTxns.map(t => {
        const cat = state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
        return `${t.description} ₹${t.amount.toLocaleString()} (${cat})`
      }).join(' | ')
    : 'none'

  const activeCCs = (state.credit_cards ?? []).filter(cc => cc.is_active)
  const ccLine = activeCCs.length > 0
    ? `\nCreditCards: ${activeCCs.map(cc => {
        const last = cc.last_four ? ` •${cc.last_four}` : ''
        const used = Math.round(cc.current_balance)
        const limit = Math.round(cc.credit_limit)
        return `${cc.name}${last} outstanding ₹${used.toLocaleString('en-IN')} / limit ₹${limit.toLocaleString('en-IN')}`
      }).join(' | ')}`
    : ''

  const activeGoals = (state.goals ?? []).filter(g => g.is_active)
  const goalsLine = activeGoals.length > 0
    ? `\nGoals: ${activeGoals.map(g => {
        const pct = g.goal_amount > 0 ? Math.round((g.current_saved / g.goal_amount) * 100) : 0
        const tDate = new Date(g.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        return `${g.name}(${g.goal_type}) ${pct}% · ₹${g.current_saved.toLocaleString()}/${g.goal_amount.toLocaleString()} by ${tDate}`
      }).join(' | ')}`
    : ''

  const activeCommitments = (state.commitments ?? []).filter(c => c.is_active)
  const commitmentsLine = activeCommitments.length > 0
    ? `\nBillsAndObligations: ${activeCommitments.map(c => {
        const paid = c.remaining < c.amount
        const dueStr = c.due_day ? ` due-day:${c.due_day}` : ''
        const status = paid ? 'paid' : 'unpaid'
        return `${c.name} ₹${c.amount.toLocaleString()}${dueStr} [${status}]`
      }).join(' | ')} | remaining-unpaid: ₹${d.remainingCommitments.toLocaleString()}`
    : ''

  const activeSavings = (state.savings ?? []).filter(s => s.is_active)
  let savingsLine = ''
  if (activeSavings.length > 0) {
    const totalMonthly = activeSavings.filter(s => s.is_recurring && s.frequency === 'monthly').reduce((a, s) => a + s.amount, 0)
    const totalContributed = activeSavings.reduce((a, s) => a + s.current_installment * s.amount, 0)
    const totalPortfolio = activeSavings.filter(s => s.current_value > 0).reduce((a, s) => a + s.current_value, 0)
    const items = activeSavings.map(s => {
      const contributed = s.current_installment * s.amount
      const progress = s.total_installments ? `${s.current_installment}/${s.total_installments}` : `${s.current_installment} done`
      const valueStr = s.current_value > 0 ? ` current-value:₹${s.current_value.toLocaleString()}` : ''
      const prizedStr = s.type === 'chit'
        ? s.is_prized
          ? ` [prized at month ${s.prize_month ?? '?'} of ${s.total_installments ?? '?'} prize-received:₹${s.current_value.toLocaleString()}${s.total_installments && s.current_installment < s.total_installments ? ` remaining:${s.total_installments - s.current_installment}-installments=₹${((s.total_installments - s.current_installment) * s.amount).toLocaleString()}` : ''}]`
          : ` [unprized]`
        : ''
      const dueStr = s.due_day ? ` due-day:${s.due_day}` : ''
      return `${s.name}(${s.type}) ₹${s.amount.toLocaleString()}/${s.frequency ?? 'one-time'} contributed:₹${contributed.toLocaleString()} [${progress}]${valueStr}${prizedStr}${dueStr}`
    }).join(' | ')
    const portfolioStr = totalPortfolio > 0 ? ` | portfolio-value:₹${totalPortfolio.toLocaleString()}` : ''
    savingsLine = `\nSavingsAndInvestments: monthly-commitment:₹${totalMonthly.toLocaleString()} total-contributed:₹${totalContributed.toLocaleString()}${portfolioStr} | ${items}`
  }

  const transfersLine = thisMonthTransfers > 0
    ? ` | transfers-this-month:₹${thisMonthTransfers.toLocaleString()} (internal moves, not spending)`
    : ''
  const savingsActivityLine = (savingsContribThisMonth > 0 || savingsWithdrawThisMonth > 0)
    ? ` | savings-contributed-this-month:₹${savingsContribThisMonth.toLocaleString()} savings-withdrawn-this-month:₹${savingsWithdrawThisMonth.toLocaleString()} (wealth movement, not spending)`
    : ''

  return `Date:${localDateStr} Balance:₹${totalBalance.toLocaleString()} MonthStartBalance(approx):₹${monthStartBalance.toLocaleString()} Emergency:₹${d.emergencyFund.toLocaleString()} FreeMoney:₹${d.realFreeMoney.toLocaleString()}
Accounts: ${activeAccs.map(a => `${a.name}:₹${a.current_balance.toLocaleString()}`).join(' | ')}${ccLine}
Budget: weekly ₹${budget.toLocaleString()} spent ₹${d.weeklySpent.toLocaleString()} (${Math.round(d.weeklySpent / budget * 100)}% used)
Spend: this-month ₹${monthlySpend.toLocaleString()} | income-this-month ₹${thisMonthIncome.toLocaleString()} | last-month ₹${lastMonthSpend.toLocaleString()}${transfersLine}${savingsActivityLine}
Tracking: ${trackingCountThisMonth} transactions logged across ${trackingDaysThisMonth} days this month
Today(${localDateStr}): total ₹${todaySpend.toLocaleString()} | ${todayStr}
Categories(month): ${topCats || 'no data'}
Recurring(90d): ${recurring || 'none'}
Recent:
${recent}${borrowingsLine}${goalsLine}${commitmentsLine}${savingsLine}`
}

type ParsedEdit =
  | { type: 'amount'; description: string; oldAmount: number | null; newAmount: number }
  | { type: 'description'; oldDescription: string; newDescription: string }
  | { type: 'category'; description: string; newCategoryId: string; newCategoryName: string }
  | { type: 'category_not_found'; description: string; attempted: string }

function findCategory(name: string, categories: Category[]): Category | null {
  const lower = name.toLowerCase().trim()
  return (
    categories.find(c => c.name.toLowerCase() === lower) ??
    categories.find(c => c.name.toLowerCase().includes(lower)) ??
    categories.find(c => lower.includes(c.name.toLowerCase())) ??
    null
  )
}

function parseEditIntent(text: string, categories: Category[]): ParsedEdit | null {
  const t = text.trim()

  // Amount: "change fuel 500 to 300"
  const withOld = t.match(/(?:change|fix|update|edit|correct|replace)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/i)
  if (withOld) return { type: 'amount', description: withOld[1].trim(), oldAmount: parseFloat(withOld[2]), newAmount: parseFloat(withOld[3]) }

  // Amount: "change fuel to 300"
  const amountOnly = t.match(/(?:change|fix|update|edit|correct|replace)\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*$/i)
  if (amountOnly) return { type: 'amount', description: amountOnly[1].trim(), oldAmount: null, newAmount: parseFloat(amountOnly[2]) }

  // Category: "recategorize petrol to Travel" / "move petrol to Travel"
  const recatMatch = t.match(/(?:recategorize|categorize|move)\s+(.+?)\s+to\s+(.+)/i)
  if (recatMatch) {
    const desc = recatMatch[1].trim()
    const attempt = recatMatch[2].trim()
    const cat = findCategory(attempt, categories)
    return cat ? { type: 'category', description: desc, newCategoryId: cat.id, newCategoryName: cat.name }
               : { type: 'category_not_found', description: desc, attempted: attempt }
  }

  // Category: "change petrol category to Travel"
  const changeCatMatch = t.match(/(?:change|update|set)\s+(.+?)\s+category\s+to\s+(.+)/i)
  if (changeCatMatch) {
    const desc = changeCatMatch[1].trim()
    const attempt = changeCatMatch[2].trim()
    const cat = findCategory(attempt, categories)
    return cat ? { type: 'category', description: desc, newCategoryId: cat.id, newCategoryName: cat.name }
               : { type: 'category_not_found', description: desc, attempted: attempt }
  }

  // Description rename: "rename tea to Coffee Shop" / "change tea to Coffee Shop"
  const renameMatch = t.match(/(?:rename|change|update)\s+(.+?)\s+to\s+(.+)/i)
  if (renameMatch) {
    const newDesc = renameMatch[2].trim()
    if (!/^\d+(?:\.\d+)?$/.test(newDesc)) {
      return { type: 'description', oldDescription: renameMatch[1].trim(), newDescription: newDesc }
    }
  }

  return null
}

function parseDeleteIntent(text: string): { description: string; amount: number | null } | null {
  // "delete tea 20" or "remove petrol 500"
  const withAmount = text.match(/(?:delete|remove)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/i)
  if (withAmount) return { description: withAmount[1].trim(), amount: parseFloat(withAmount[2]) }
  // "delete tea" or "remove petrol"
  const noAmount = text.match(/(?:delete|remove)\s+(.+)/i)
  if (noAmount) return { description: noAmount[1].trim(), amount: null }
  return null
}

function findMatchingTransaction(transactions: Transaction[], description: string, oldAmount: number | null): Transaction | null {
  const words = description.toLowerCase().replace(/\bthe\b/g, '').trim().split(/\s+/).filter(w => w.length > 1)
  const scored = transactions
    .filter(t => t.transaction_type === 'expense' || t.transaction_type === 'income')
    .map(t => {
      const td = t.description.toLowerCase()
      let score = words.filter(w => td.includes(w)).length * 2
      if (td === description.toLowerCase()) score += 5
      if (oldAmount !== null && Math.abs(t.amount - oldAmount) < 0.01) score += 3
      const daysOld = (Date.now() - new Date(t.transaction_date).getTime()) / 86400000
      score += daysOld < 7 ? 2 : daysOld < 30 ? 1 : 0
      return { t, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.t ?? null
}

async function streamChat(
  message: string,
  history: Message[],
  context: string,
  signal: AbortSignal,
  onToken: (token: string) => void,
): Promise<{ used: number | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('unauthenticated')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ mode: 'chat', message, history, context }),
    signal,
  })

  if (res.status === 429) throw new Error('quota_exceeded')
  if (!res.ok) throw new Error('ai_error')

  const used = res.headers.get('X-Used')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleLine = (line: string): boolean => {
    if (!line.startsWith('data: ')) return false
    const data = line.slice(6).trim()
    if (data === '[DONE]') return true
    try {
      const token = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
      if (token) onToken(token)
    } catch { /* malformed line, skip */ }
    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the last, possibly-incomplete line for the next read
    for (const line of lines) {
      if (handleLine(line)) return { used: used ? Number(used) : null }
    }
  }
  // flush any trailing complete line that had no newline
  for (const line of buffer.split('\n')) {
    if (handleLine(line)) break
  }
  return { used: used ? Number(used) : null }
}

interface AIChatSheetProps {
  open: boolean
  onClose: () => void
  state: AppState
  d: DerivedMetrics
  onSave: (data: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => void
  onUpdate: (old: Transaction, form: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => Promise<void>
  onDelete: (t: Transaction) => Promise<void>
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
  onBusyChange?: (busy: boolean) => void
}

export function AIChatSheet({ open, onClose, state, d, onSave, onUpdate, onDelete, onUpdateSettings, onBusyChange }: AIChatSheetProps) {
  const c = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatListening, setChatListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chatRecognitionRef = useRef<any>(null)
  const [dragY, setDragY] = useState(0)
  const [keyboardH, setKeyboardH] = useState(0)
  const SpeechRec = typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null

  useEffect(() => {
    const onResize = () => {
      if (window.visualViewport) {
        const kh = window.innerHeight - window.visualViewport.height
        setKeyboardH(kh > 150 ? kh : 0)
      }
    }
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', onResize)
      return () => vv.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (open) {
      if (messages.length === 0) {
        const weeklyBudget = d.weeklyBudget
        const weeklySpent = d.weeklySpent
        const pct = weeklyBudget > 0 ? Math.round((weeklySpent / weeklyBudget) * 100) : 0

        let greeting = "Hey! I'm Mint, your finance coach. Ask me anything — or tap a suggestion below to get started."
        if (pct >= 100) {
          greeting = `You've used ${pct}% of your weekly budget this week. That happens — let's look at what drove it and find a way forward. Try "help me recover my budget" or ask me anything.`
        } else if (pct >= 80) {
          greeting = `You've used ${pct}% of your weekly budget. You're still in control — ask me where you can ease up, or anything else about your finances.`
        }
        setMessages([{ role: 'ai', text: greeting }])
      }
      setTimeout(() => inputRef.current?.focus(), 300)
      // iOS-safe scroll lock: pinning the body with position:fixed actually stops
      // the page scrolling behind the sheet (overflow:hidden alone doesn't on iOS).
      const scrollY = window.scrollY
      const body = document.body
      const prev = {
        position: body.style.position, top: body.style.top, left: body.style.left,
        right: body.style.right, width: body.style.width, overflow: body.style.overflow,
      }
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
      return () => {
        body.style.position = prev.position
        body.style.top = prev.top
        body.style.left = prev.left
        body.style.right = prev.right
        body.style.width = prev.width
        body.style.overflow = prev.overflow
        window.scrollTo(0, scrollY)
      }
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const stopChatVoice = () => {
    chatRecognitionRef.current?.stop()
    chatRecognitionRef.current = null
    setChatListening(false)
  }

  const startChatVoice = () => {
    if (!SpeechRec || chatListening) return
    const recognition = new SpeechRec()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setChatListening(true)
    recognition.onend = () => setChatListening(false)
    recognition.onerror = () => setChatListening(false)
    recognition.onresult = (e: any) => {
      const transcript: string = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) send(transcript)
    }
    chatRecognitionRef.current = recognition
    recognition.start()
  }

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return
    if (!textOverride) setInput('')
    const next: Message[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setLoading(true)
    onBusyChange?.(true)

    const allAccObjs = [
      ...state.accounts.filter(a => a.is_active),
      ...(state.credit_cards ?? []),
    ]
    const allAccNames = allAccObjs.map(a => a.name)
    const intent = classifyIntent(text)
    const txType = guessTransactionType(text)
    const catNames = txType === 'income'
      ? state.categories.filter(c => c.group_name === INCOME_GROUP).map(c => c.name)
      : state.categories.filter(c => c.group_name !== INCOME_GROUP).map(c => c.name)

    const parsed = intent === 'transaction'
      ? await parseExpenseWithAI(text, catNames, allAccNames, state.groups.map(g => g.name), (n) => onUpdateSettings?.({ ai_requests_used: n }))
      : null

    if (parsed && parsed.amount && parsed.amount > 0) {
      const matchedAccount = parsed.account
        ? allAccObjs.find(a => a.name.toLowerCase() === parsed.account!.toLowerCase())
        : null

      // If account couldn't be identified and there are multiple accounts, ask user
      if (!matchedAccount && allAccObjs.length > 1) {
        setMessages(m => [...m, {
          role: 'ai',
          text: `Which account should I use? Your accounts: ${allAccObjs.map(a => a.name).join(', ')}.`,
        }])
        setLoading(false); onBusyChange?.(false)
        return
      }

      const account = matchedAccount ?? allAccObjs[0]
      const category = state.categories.find(c => c.name.toLowerCase() === (parsed.category ?? '').toLowerCase())
      const today = new Date().toISOString().split('T')[0]

      onSave({
        transaction_date: today,
        description: parsed.description ?? text,
        amount: parsed.amount,
        transaction_type: txType,
        category_id: category?.id ?? null,
        from_account_id: account.id,
      })

      const savedExpense: SavedExpense = {
        description: parsed.description ?? text,
        amount: parsed.amount,
        account: account.name,
        category: category?.name ?? (txType === 'income' ? 'Income' : 'Uncategorized'),
        date: today,
      }
      const verb = txType === 'income' ? 'income' : 'expense'
      setMessages(m => [...m, {
        role: 'ai',
        text: `Done! Recorded ${verb} "${savedExpense.description}" ₹${savedExpense.amount} under ${savedExpense.category} from ${savedExpense.account}.`,
        savedExpense,
      }])
      setLoading(false); onBusyChange?.(false)
      return
    }

    // Edit intent — find matching transaction and show confirmation card
    if (intent === 'edit') {
      const parsed = parseEditIntent(text, state.categories)
      const allAccs = [...state.accounts, ...(state.credit_cards ?? [])]

      if (parsed?.type === 'category_not_found') {
        const available = state.categories.slice(0, 8).map(c => c.name).join(', ')
        setMessages(m => [...m, {
          role: 'ai',
          text: `I couldn't find a category called "${parsed.attempted}". Available categories: ${available}.`,
        }])
      } else if (parsed?.type === 'amount') {
        const match = findMatchingTransaction(state.transactions, parsed.description, parsed.oldAmount)
        if (match) {
          const acc = allAccs.find(a => a.id === match.from_account_id)
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'}. Update amount to ₹${parsed.newAmount.toLocaleString()}?`,
            editPrompt: { transaction: match, field: 'amount', newAmount: parsed.newAmount },
          }])
        } else {
          setMessages(m => [...m, { role: 'ai', text: `I couldn't find a matching "${parsed.description}" transaction.` }])
        }
      } else if (parsed?.type === 'description') {
        const match = findMatchingTransaction(state.transactions, parsed.oldDescription, null)
        if (match) {
          const acc = allAccs.find(a => a.id === match.from_account_id)
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'}. Rename to "${parsed.newDescription}"?`,
            editPrompt: { transaction: match, field: 'description', newDescription: parsed.newDescription },
          }])
        } else {
          setMessages(m => [...m, { role: 'ai', text: `I couldn't find a matching "${parsed.oldDescription}" transaction.` }])
        }
      } else if (parsed?.type === 'category') {
        const match = findMatchingTransaction(state.transactions, parsed.description, null)
        if (match) {
          const acc = allAccs.find(a => a.id === match.from_account_id)
          const currentCat = state.categories.find(c => c.id === match.category_id)?.name ?? 'Uncategorized'
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'} (${currentCat}). Move to ${parsed.newCategoryName}?`,
            editPrompt: { transaction: match, field: 'category', newCategoryId: parsed.newCategoryId, newCategoryName: parsed.newCategoryName },
          }])
        } else {
          setMessages(m => [...m, { role: 'ai', text: `I couldn't find a matching "${parsed.description}" transaction.` }])
        }
      } else {
        setMessages(m => [...m, {
          role: 'ai',
          text: 'To edit a transaction, try:\n• "change fuel 500 to 300" — update amount\n• "rename tea to Coffee Shop" — rename description\n• "recategorize petrol to Travel" — change category',
        }])
      }
      setLoading(false); onBusyChange?.(false)
      return
    }

    // Delete intent — find matching transaction and show confirmation card
    if (intent === 'delete') {
      const parsedDel = parseDeleteIntent(text)
      if (parsedDel) {
        const match = findMatchingTransaction(state.transactions, parsedDel.description, parsedDel.amount)
        if (match) {
          const acc = [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === match.from_account_id)
          const cat = state.categories.find(c => c.id === match.category_id)?.name ?? 'Uncategorized'
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'} · ${cat}. Delete this?`,
            deletePrompt: { transaction: match },
          }])
        } else {
          setMessages(m => [...m, {
            role: 'ai',
            text: `I couldn't find a matching "${parsedDel.description}" transaction. Check the transaction list and try again.`,
          }])
        }
      } else {
        setMessages(m => [...m, {
          role: 'ai',
          text: 'To delete a transaction, say something like: "delete tea 20" or "remove petrol 500".',
        }])
      }
      setLoading(false); onBusyChange?.(false)
      return
    }

    // No amount found — treat as Q&A (streamed)
    const context = buildContext(state, d)
    abortRef.current = new AbortController()

    // Insert empty placeholder that tokens will fill in
    setMessages(m => [...m, { role: 'ai', text: '' }])

    try {
      const { used } = await streamChat(
        text,
        next.slice(-6),
        context,
        abortRef.current.signal,
        (token) => {
          setMessages(m => {
            const copy = [...m]
            copy[copy.length - 1] = { role: 'ai', text: (copy[copy.length - 1].text) + token }
            return copy
          })
        },
      )
      if (used != null) onUpdateSettings?.({ ai_requests_used: used })
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (!isAbort) {
        const msg = err instanceof Error && err.message === 'quota_exceeded'
          ? 'Mint has reached its daily limit (100 requests/day). Please try again tomorrow.'
          : 'Something went wrong. Please try again.'
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'ai', text: msg }
          return copy
        })
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      onBusyChange?.(false)
    }
  }

  const handleEditConfirm = async (msgIndex: number, ep: EditPrompt) => {
    try {
      await onUpdate(ep.transaction, {
        transaction_date: ep.transaction.transaction_date,
        description: ep.field === 'description' ? ep.newDescription! : ep.transaction.description,
        amount: ep.field === 'amount' ? ep.newAmount! : ep.transaction.amount,
        transaction_type: ep.transaction.transaction_type,
        category_id: ep.field === 'category' ? ep.newCategoryId! : ep.transaction.category_id,
        from_account_id: ep.transaction.from_account_id,
      })

      let text = ''
      if (ep.field === 'amount') {
        text = `Done! Updated "${ep.transaction.description}" from ₹${ep.transaction.amount.toLocaleString()} to ₹${ep.newAmount!.toLocaleString()}.`
      } else if (ep.field === 'description') {
        text = `Done! Renamed "${ep.transaction.description}" to "${ep.newDescription}".`
      } else {
        const oldCat = state.categories.find(c => c.id === ep.transaction.category_id)?.name ?? 'Uncategorized'
        text = `Done! Moved "${ep.transaction.description}" from ${oldCat} to ${ep.newCategoryName}.`
      }
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text }))
    } catch {
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Something went wrong updating the transaction. Please try again.' }))
    }
  }

  const handleEditCancel = (msgIndex: number) => {
    setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Cancelled. No changes made.' }))
  }

  const handleDeleteConfirm = async (msgIndex: number, dp: DeletePrompt) => {
    try {
      await onDelete(dp.transaction)
      const acc = [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === dp.transaction.from_account_id)
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : {
        role: 'ai',
        text: `Done! Deleted "${dp.transaction.description}" ₹${dp.transaction.amount.toLocaleString()} from ${acc?.name ?? 'account'}.`,
      }))
    } catch {
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Something went wrong deleting the transaction. Please try again.' }))
    }
  }

  const handleDeleteCancel = (msgIndex: number) => {
    setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Cancelled. No changes made.' }))
  }

  const handleGrabStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY }
  const handleGrabMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = e.touches[0].clientY - dragStartY.current
    if (delta > 0) setDragY(delta)
  }
  const handleGrabEnd = () => {
    if (dragY > 100) onClose()
    setDragY(0)
    dragStartY.current = null
  }

  return (
    <div inert={!open} style={{ position: 'fixed', inset: 0, zIndex: 95, pointerEvents: open ? 'auto' : 'none', touchAction: open ? 'none' : 'auto' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }}
      />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: open ? keyboardH : 0,
        background: c.surface,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column',
        height: '82svh',
        transform: open ? `translateY(${dragY}px)` : 'translateY(115%)',
        transition: dragY > 0 ? 'none' : 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle */}
        <div
          onTouchStart={handleGrabStart}
          onTouchMove={handleGrabMove}
          onTouchEnd={handleGrabEnd}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 18px 0', touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 999, background: c.faint, marginBottom: 14 }} />
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/mint-ai-logo.svg" width="30" height="30" alt="Mint" />
              </div>
              <span style={{ font: '800 17px Plus Jakarta Sans', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#16C98A' }}>Mint</span>
                <span style={{ font: '700 7px Plus Jakarta Sans', color: '#F97316', background: '#F9731622', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.05em' }}>BETA</span>
                <span style={{ color: 'inherit' }}>Chat</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {messages.length > 1 && (
                <button
                  onClick={() => setMessages([{ role: 'ai', text: 'Hey! Ask me anything about your finances.' }])}
                  style={{ height: 32, borderRadius: 999, background: c.surface2, border: 'none', padding: '0 12px', font: '600 11px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: 999, background: c.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.sub} strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ flex: 1 }} />
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
              {m.warning ? (
                <div style={{
                  maxWidth: '82%', display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: '#FEF3C7', border: '1px solid #FCD34D',
                  borderRadius: '18px 18px 18px 4px', padding: '10px 14px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span style={{ font: '500 13px Plus Jakarta Sans', color: '#92400E', lineHeight: 1.5 }}>{m.text}</span>
                </div>
              ) : (
              <div style={{
                maxWidth: '82%',
                background: m.role === 'user' ? c.accent : c.surface2,
                color: m.role === 'user' ? '#fff' : c.ink,
                borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                padding: '10px 14px',
                font: '500 14px Plus Jakarta Sans',
                lineHeight: 1.5,
              }}>
                {m.text}
              </div>
              )}
              {m.savedExpense && (
                <div style={{
                  background: c.goodSoft, border: `1.5px solid ${c.good}33`,
                  borderRadius: 14, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 10, maxWidth: '82%',
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: c.good, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{m.savedExpense.description} · ₹{m.savedExpense.amount.toLocaleString()}</div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{m.savedExpense.category} · {m.savedExpense.account}</div>
                  </div>
                </div>
              )}
              {m.editPrompt && (
                <div style={{ display: 'flex', gap: 8, maxWidth: '82%' }}>
                  <button
                    onClick={() => handleEditConfirm(i, m.editPrompt!)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: c.accent, border: 'none', font: '600 13px Plus Jakarta Sans', color: '#fff', cursor: 'pointer' }}
                  >
                    Yes, update
                  </button>
                  <button
                    onClick={() => handleEditCancel(i)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: c.surface2, border: 'none', font: '600 13px Plus Jakarta Sans', color: c.sub, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {m.deletePrompt && (
                <div style={{ display: 'flex', gap: 8, maxWidth: '82%' }}>
                  <button
                    onClick={() => handleDeleteConfirm(i, m.deletePrompt!)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: '#EF4444', border: 'none', font: '600 13px Plus Jakarta Sans', color: '#fff', cursor: 'pointer' }}
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => handleDeleteCancel(i)}
                    style={{ flex: 1, height: 36, borderRadius: 10, background: c.surface2, border: 'none', font: '600 13px Plus Jakarta Sans', color: c.sub, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MintAnimation variant="thinking" size={38} style={{ borderRadius: 9, flexShrink: 0 }} />
              <div style={{
                background: c.surface2, borderRadius: '18px 18px 18px 4px',
                padding: '10px 14px', font: '500 14px Plus Jakarta Sans', color: c.muted,
              }}>
                Mint is thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} style={{ height: 8 }} />
        </div>

        {/* Suggestion chips */}
        {messages.length <= 1 && (
          <div style={{ padding: '8px 14px 4px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Why is balance low?', q: 'My balance feels low this month. Help me understand what happened — what was real spending vs transfers vs money I lent out?' },
              { label: 'My financial story', q: "Give me my financial story this month — where did my money go, what's recoverable, and how am I actually doing?" },
              { label: 'Quick savings wins', q: 'Based on my actual spending, what are 3 quick ways I can save money this week without feeling it too much?' },
              { label: 'Budget recovery', q: "I've been over my weekly budget. Give me a realistic recovery plan with specific steps." },
              { label: 'Monthly summary', q: 'Give me a full summary of my spending this month — categories, totals, and how I compare to last month.' },
              { label: 'Am I on track?', q: 'Am I really overspending, or does it just feel that way? Give me an honest assessment.' },
              { label: 'Save ₹5,000', q: 'Create a personalized plan for me to save ₹5,000 in the next 3 months based on my actual spending.' },
              { label: 'Free money', q: "What's my real free money right now after emergency fund and bills?" },
              { label: 'Who owes me?', q: 'Who owes me money and how much in total? When might I get it back?' },
              { label: 'My investments', q: 'Show me a summary of my savings and investments and how they are progressing.' },
            ].map(({ label, q }) => (
              <button
                key={q}
                onClick={() => { setInput(q); setTimeout(() => { inputRef.current?.focus(); }, 50) }}
                style={{
                  border: `1.5px solid ${c.faint}`, background: c.surface2,
                  borderRadius: 999, padding: '7px 13px',
                  font: '500 12px Plus Jakarta Sans', color: c.sub,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: `12px 14px ${keyboardH > 0 ? '12px' : 'calc(18px + env(safe-area-inset-bottom, 0px))'}`,
          borderTop: `1px solid ${c.faint}`,
          display: 'flex', gap: 8, alignItems: 'center', background: c.surface,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={chatListening ? 'Listening…' : 'Ask about your finances…'}
            enterKeyHint="send"
            style={{
              flex: 1, border: `1.5px solid ${chatListening ? '#EF4444' : c.faint}`,
              background: c.surface2, borderRadius: 22, padding: '11px 16px',
              font: '500 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
          {SpeechRec && (
            <button
              onPointerDown={e => { e.preventDefault(); chatListening ? stopChatVoice() : startChatVoice() }}
              aria-label={chatListening ? 'Stop recording' : 'Speak'}
              style={{
                width: 42, height: 42, borderRadius: 999, border: 'none',
                background: chatListening ? '#EF4444' : c.surface2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                boxShadow: chatListening ? '0 0 0 5px #EF444430, 0 0 0 10px #EF444415' : 'none',
                transition: 'background 0.15s, box-shadow 0.2s',
              }}
            >
              {chatListening ? (
                <div style={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
                  {[0, 0.14, 0.28, 0.42].map((delay, i) => (
                    <div key={i} style={{
                      width: 3, height: 14, borderRadius: 2, background: '#fff',
                      transformOrigin: 'center',
                      animation: 'voiceBar 0.7s ease-in-out infinite',
                      animationDelay: `${delay}s`,
                    }} />
                  ))}
                </div>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              )}
            </button>
          )}
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 42, height: 42, borderRadius: 999, border: 'none',
              background: input.trim() && !loading ? c.accent : c.faint,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              flexShrink: 0, transition: 'background 0.2s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}
