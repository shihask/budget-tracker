import { useRef, useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import type { AppState, Transaction } from '@/types'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-categorize`

type SavedExpense = { description: string; amount: number; account: string; category: string; date: string }
type Message = { role: 'user' | 'ai'; text: string; savedExpense?: SavedExpense }

function buildContext(state: AppState): string {
  const activeAccs = state.accounts.filter(a => a.is_active)
  const totalBalance = activeAccs.reduce((s, a) => s + a.current_balance, 0)

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  const thisWeekTxns = state.transactions.filter(t =>
    new Date(t.transaction_date) >= weekStart && t.transaction_type === 'expense'
  )
  const weeklySpend = thisWeekTxns.reduce((s, t) => s + t.amount, 0)
  const budget = state.settings.weekly_budget ?? 5000

  const recent = state.transactions.slice(0, 8).map(t =>
    `${t.transaction_date} | ${t.description} | ₹${t.amount} | ${t.transaction_type}`
  ).join('\n')

  const catTotals: Record<string, number> = {}
  state.transactions.filter(t => t.transaction_type === 'expense').forEach(t => {
    const name = state.categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
    catTotals[name] = (catTotals[name] ?? 0) + t.amount
  })
  const topCats = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, v]) => `${n}: ₹${v.toLocaleString()}`)
    .join(', ')

  return `Total balance: ₹${totalBalance.toLocaleString()}
Weekly spend: ₹${weeklySpend.toLocaleString()} / ₹${budget.toLocaleString()} budget (${Math.round(weeklySpend / budget * 100)}% used)
Emergency fund goal: ₹${(state.settings.emergency_fund ?? 20000).toLocaleString()}
Accounts: ${activeAccs.map(a => `${a.name} ₹${a.current_balance.toLocaleString()}`).join(', ')}
Top spending categories: ${topCats}
Recent transactions:
${recent}`
}

async function chatWithAI(
  message: string,
  history: Message[],
  context: string,
  categoryNames: string[],
  accountNames: string[]
): Promise<{ reply: string; expense: SavedExpense | null } | null> {
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
    return { reply: data.reply ?? '', expense: data.expense ?? null }
  } catch {
    return null
  }
}

interface AIChatSheetProps {
  open: boolean
  onClose: () => void
  state: AppState
  onSave: (data: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => void
}

export function AIChatSheet({ open, onClose, state, onSave }: AIChatSheetProps) {
  const c = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  useEffect(() => {
    if (open) {
      if (messages.length === 0) {
        setMessages([{ role: 'ai', text: 'Hey! Ask me anything about your finances.' }])
      }
      setTimeout(() => inputRef.current?.focus(), 300)
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

    const context = buildContext(state)
    const allAccs = [
      ...state.accounts.filter(a => a.is_active).map(a => a.name),
      ...(state.credit_cards ?? []).map(cc => cc.name),
    ]
    const catNames = state.categories.filter(c => c.group_name !== 'Income').map(c => c.name)
    const result = await chatWithAI(text, next.slice(-6), context, catNames, allAccs)

    if (!result) {
      setMessages(m => [...m, { role: 'ai', text: 'Sorry, something went wrong.' }])
      setLoading(false)
      return
    }

    let savedExpense: SavedExpense | undefined
    if (result.expense) {
      const exp = result.expense
      const account = [
        ...state.accounts.filter(a => a.is_active),
        ...(state.credit_cards ?? []),
      ].find(a => a.name.toLowerCase() === exp.account.toLowerCase())
      const category = state.categories.find(c => c.name.toLowerCase() === exp.category.toLowerCase())

      if (account && exp.amount > 0) {
        onSave({
          transaction_date: exp.date,
          description: exp.description,
          amount: exp.amount,
          transaction_type: 'expense',
          category_id: category?.id ?? null,
          from_account_id: account.id,
        })
        savedExpense = exp
      }
    }

    setMessages(m => [...m, { role: 'ai', text: result.reply, savedExpense }])
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, pointerEvents: open ? 'auto' : 'none' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }}
      />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: c.surface,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column',
        height: '82svh',
        transform: open ? `translateY(${dragY}px)` : 'translateY(110%)',
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
              <div style={{ width: 30, height: 30, borderRadius: 999, background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L13.8 9.2L21 12L13.8 14.8L12 22L10.2 14.8L3 12L10.2 9.2L12 2Z" fill="white" />
                </svg>
              </div>
              <span style={{ font: '800 17px Plus Jakarta Sans', letterSpacing: '-0.02em' }}>
                <span style={{ color: c.ink }}>Money</span><span style={{ color: '#16C98A' }}>Plant</span><span style={{ color: c.muted, fontWeight: 600 }}> AI</span>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
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
              'How much did I spend this week?',
              "What's my top expense category?",
              'Am I on budget?',
              "What's my total balance?",
              'How much have I spent on food?',
            ].map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50) }}
                style={{
                  border: `1.5px solid ${c.faint}`, background: c.surface2,
                  borderRadius: 999, padding: '7px 13px',
                  font: '500 12px Plus Jakarta Sans', color: c.sub,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '12px 14px calc(18px + env(safe-area-inset-bottom, 0px))',
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
