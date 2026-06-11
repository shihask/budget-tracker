import { useRef, useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { parseExpenseWithAI } from '@/lib/gemini'
import type { AppState, Transaction } from '@/types'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

type SavedExpense = { description: string; amount: number; account: string; category: string; date: string }
type Message = { role: 'user' | 'ai'; text: string; savedExpense?: SavedExpense; warning?: boolean }

function guessTransactionType(text: string): 'income' | 'expense' {
  const lower = text.toLowerCase()
  return /\b(received|receive|salary|income|earned|earn|credited|got paid|deposited|deposit)\b/.test(lower)
    ? 'income'
    : 'expense'
}

function buildContext(state: AppState): string {
  const activeAccs = state.accounts.filter(a => a.is_active)
  const totalBalance = activeAccs.reduce((s, a) => s + a.current_balance, 0)

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const thisWeekTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= weekStart && t.transaction_type === 'expense'
  )
  const thisMonthTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense'
  )
  const lastMonthTxns = state.transactions.filter(t => {
    const d = new Date(t.transaction_date)
    return d >= lastMonthStart && d <= lastMonthEnd && t.transaction_type === 'expense'
  })

  const weeklySpend = thisWeekTxns.reduce((s, t) => s + t.amount, 0)
  const monthlySpend = thisMonthTxns.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpend = lastMonthTxns.reduce((s, t) => s + t.amount, 0)
  const budget = state.settings.weekly_budget ?? 5000

  // Category breakdown this month
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

  // Recurring pattern detection — descriptions appearing 3+ times in last 90 days
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

  const recent = state.transactions.slice(0, 8).map(t =>
    `${t.transaction_date} | ${t.description} | ₹${t.amount} | ${t.transaction_type}`
  ).join('\n')

  return `Today: ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
Total balance: ₹${totalBalance.toLocaleString()}
Weekly spend: ₹${weeklySpend.toLocaleString()} / ₹${budget.toLocaleString()} budget (${Math.round(weeklySpend / budget * 100)}% used)
This month spend: ₹${monthlySpend.toLocaleString()}
Last month spend: ₹${lastMonthSpend.toLocaleString()}
Emergency fund: ₹${(state.settings.emergency_fund ?? 20000).toLocaleString()}
Real free money: ₹${(totalBalance - (state.settings.emergency_fund ?? 20000) - state.commitments.filter(c => c.is_active).reduce((s, c) => s + (c.is_recurring ? c.amount : c.remaining), 0)).toLocaleString()}
Accounts: ${activeAccs.map(a => `${a.name} ₹${a.current_balance.toLocaleString()}`).join(', ')}
This month by category: ${topCats || 'no data'}
Recurring expenses (last 90 days): ${recurring || 'none detected'}
Recent transactions:
${recent}`
}

async function chatWithAI(
  message: string,
  history: Message[],
  context: string,
  categoryNames: string[],
  accountNames: string[]
): Promise<{ reply: string; expense: SavedExpense | null; used: number | null } | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'chat', message, history, context, categoryNames, accountNames }),
    })

    if (!res.ok) return null
    const data = await res.json()
    return { reply: data.reply ?? '', expense: data.expense ?? null, used: data.used ?? null }
  } catch {
    return null
  }
}

interface AIChatSheetProps {
  open: boolean
  onClose: () => void
  state: AppState
  onSave: (data: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => void
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
}

export function AIChatSheet({ open, onClose, state, onSave, onUpdateSettings }: AIChatSheetProps) {
  const c = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragStartY = useRef<number | null>(null)
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
        const weeklyBudget = state.settings.weekly_budget ?? 5000
        const now = new Date()
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay())
        const weeklySpent = state.transactions
          .filter(t => new Date(t.transaction_date) >= weekStart && t.transaction_type === 'expense')
          .reduce((s, t) => s + t.amount, 0)
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

    const allAccObjs = [
      ...state.accounts.filter(a => a.is_active),
      ...(state.credit_cards ?? []),
    ]
    const allAccNames = allAccObjs.map(a => a.name)
    const txType = guessTransactionType(text)
    const catNames = txType === 'income'
      ? state.categories.filter(c => c.group_name === 'Income').map(c => c.name)
      : state.categories.filter(c => c.group_name !== 'Income').map(c => c.name)

    // Always ask AI to parse — if it returns an amount it understood it as a transaction
    const parsed = await parseExpenseWithAI(text, catNames, allAccNames, state.groups.map(g => g.name))

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
        setLoading(false)
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
      setLoading(false)
      return
    }

    // No amount found — treat as Q&A
    const context = buildContext(state)
    const result = await chatWithAI(text, next.slice(-6), context, catNames, allAccNames)
    if (result?.reply) {
      setMessages(m => [...m, { role: 'ai', text: result.reply }])
      if (result.used != null) onUpdateSettings?.({ ai_requests_used: result.used })
    } else {
      setMessages(m => [...m, { role: 'ai', text: "Mint has reached its daily limit (100 requests/day). Please try again tomorrow." }])
    }
    setLoading(false)
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, pointerEvents: open ? 'auto' : 'none', touchAction: open ? 'none' : 'auto' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }}
      />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: keyboardH,
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
              <span style={{ font: '800 17px Plus Jakarta Sans', letterSpacing: '-0.02em' }}>
                <span style={{ color: '#16C98A' }}>Mint</span><span style={{ color: 'inherit' }}> Chat</span>
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
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: c.surface2, borderRadius: '18px 18px 18px 4px', padding: '12px 16px', display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: 999, background: c.muted,
                    animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
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

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </div>
  )
}
