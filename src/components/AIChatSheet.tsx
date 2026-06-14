import { useRef, useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { parseExpenseWithAI } from '@/lib/gemini'
import { MintAnimation } from './MintAnimation'
import type { AppState, DerivedMetrics, Transaction } from '@/types'
import { INCOME_GROUP, BORROWING_CREDIT_CATS } from '@/lib/constants'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

type SavedExpense = { description: string; amount: number; account: string; category: string; date: string }
type EditPrompt = { transaction: Transaction; newAmount: number }
type Message = { role: 'user' | 'ai'; text: string; savedExpense?: SavedExpense; warning?: boolean; editPrompt?: EditPrompt }

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
]

function classifyIntent(text: string): 'question' | 'edit' | 'transaction' {
  const q = text.toLowerCase().trim()

  // Stage 1: question keywords or finance query words → never try to parse as transaction
  if (/\b(what|how|why|show|compare|give|list|tell|which|when|am i|did i|can i)\b/.test(q)) return 'question'
  if (FINANCE_QUERY_WORDS.some(w => q.includes(w))) return 'question'

  // Stage 2: edit/delete intent → send to chat to explain edit is not yet supported
  if (/\b(change|edit|update|fix|delete|remove|wrong|replace|correct)\b/.test(q)) return 'edit'

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

  const monthlySpend = thisMonthTxns.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpend = lastMonthTxns.reduce((s, t) => s + t.amount, 0)
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

  return `Date:${localDateStr} Balance:₹${totalBalance.toLocaleString()} Emergency:₹${d.emergencyFund.toLocaleString()} FreeMoney:₹${d.realFreeMoney.toLocaleString()}
Accounts: ${activeAccs.map(a => `${a.name}:₹${a.current_balance.toLocaleString()}`).join(' | ')}
Budget: weekly ₹${budget.toLocaleString()} spent ₹${d.weeklySpent.toLocaleString()} (${Math.round(d.weeklySpent / budget * 100)}% used)
Spend: this-month ₹${monthlySpend.toLocaleString()} | last-month ₹${lastMonthSpend.toLocaleString()}
Today(${localDateStr}): total ₹${todaySpend.toLocaleString()} | ${todayStr}
Categories(month): ${topCats || 'no data'}
Recurring(90d): ${recurring || 'none'}
Recent:
${recent}${borrowingsLine}`
}

function parseEditIntent(text: string): { description: string; oldAmount: number | null; newAmount: number } | null {
  // "change fuel 500 to 300"
  const withOld = text.match(/(?:change|fix|update|edit|correct|replace)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/i)
  if (withOld) return { description: withOld[1].trim(), oldAmount: parseFloat(withOld[2]), newAmount: parseFloat(withOld[3]) }
  // "change fuel to 300"
  const noOld = text.match(/(?:change|fix|update|edit|correct|replace)\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)/i)
  if (noOld) return { description: noOld[1].trim(), oldAmount: null, newAmount: parseFloat(noOld[2]) }
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return { used: used ? Number(used) : null }
      try {
        const token = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
        if (token) onToken(token)
      } catch { /* partial chunk */ }
    }
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
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
  onBusyChange?: (busy: boolean) => void
}

export function AIChatSheet({ open, onClose, state, d, onSave, onUpdate, onUpdateSettings, onBusyChange }: AIChatSheetProps) {
  const c = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [dragY, setDragY] = useState(0)
  const [keyboardH, setKeyboardH] = useState(0)

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

        let greeting = 'Hey! Ask me anything about your finances.'
        let isWarning = false
        if (pct >= 100) {
          greeting = `You've exceeded your weekly budget! Spent ₹${weeklySpent.toLocaleString()} of ₹${weeklyBudget.toLocaleString()} (${pct}%). Ask me how to manage the rest of the week.`
          isWarning = true
        } else if (pct >= 80) {
          greeting = `Heads up! You've used ${pct}% of your weekly budget (₹${weeklySpent.toLocaleString()} of ₹${weeklyBudget.toLocaleString()}). Spend carefully this week.`
          isWarning = true
        }
        setMessages([{ role: 'ai', text: greeting, warning: isWarning }])
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

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
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
      const parsed = parseEditIntent(text)
      if (parsed) {
        const match = findMatchingTransaction(state.transactions, parsed.description, parsed.oldAmount)
        if (match) {
          const acc = [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === match.from_account_id)
          setMessages(m => [...m, {
            role: 'ai',
            text: `Found: "${match.description}" ₹${match.amount.toLocaleString()} · ${match.transaction_date} · ${acc?.name ?? 'Unknown'}. Update amount to ₹${parsed.newAmount.toLocaleString()}?`,
            editPrompt: { transaction: match, newAmount: parsed.newAmount },
          }])
        } else {
          setMessages(m => [...m, {
            role: 'ai',
            text: `I couldn't find a matching "${parsed.description}" transaction. Check the transaction list and try again.`,
          }])
        }
      } else {
        setMessages(m => [...m, {
          role: 'ai',
          text: 'To edit a transaction, say something like: "change fuel 500 to 300".',
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
        description: ep.transaction.description,
        amount: ep.newAmount,
        transaction_type: ep.transaction.transaction_type,
        category_id: ep.transaction.category_id,
        from_account_id: ep.transaction.from_account_id,
      })
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : {
        role: 'ai',
        text: `Done! Updated "${ep.transaction.description}" from ₹${ep.transaction.amount.toLocaleString()} to ₹${ep.newAmount.toLocaleString()}.`,
        savedExpense: {
          description: ep.transaction.description,
          amount: ep.newAmount,
          account: [...state.accounts, ...(state.credit_cards ?? [])].find(a => a.id === ep.transaction.from_account_id)?.name ?? '',
          category: state.categories.find(c => c.id === ep.transaction.category_id)?.name ?? 'Uncategorized',
          date: ep.transaction.transaction_date,
        },
      }))
    } catch {
      setMessages(m => m.map((msg, i) => i !== msgIndex ? msg : { role: 'ai', text: 'Something went wrong updating the transaction. Please try again.' }))
    }
  }

  const handleEditCancel = (msgIndex: number) => {
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
              { label: 'Monthly summary', q: 'Give me a summary of my spending this month' },
              { label: 'Recurring expenses', q: 'What are my recurring expenses and how much do they cost monthly?' },
              { label: 'Am I on budget?', q: 'Am I on budget this week?' },
              { label: 'Top category', q: "What's my top expense category this month?" },
              { label: 'Save money', q: 'Where can I cut expenses to save money?' },
              { label: 'Free money', q: "What's my real free money right now?" },
              { label: 'Who owes me?', q: 'Who owes me money and how much in total?' },
              { label: 'What do I owe?', q: 'Who do I owe money to and what is the total?' },
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
          display: 'flex', gap: 10, alignItems: 'center', background: c.surface,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about your finances…"
            enterKeyHint="send"
            style={{
              flex: 1, border: `1.5px solid ${c.faint}`, background: c.surface2,
              borderRadius: 22, padding: '11px 16px',
              font: '500 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
            }}
          />
          <button
            onClick={send}
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
