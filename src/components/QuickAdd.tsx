import { useEffect, useRef, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTheme } from '@/lib/theme-context'
import { fmt, TODAY, iso } from '@/lib/utils'
import { Glyph } from './Glyph'
import { CategorySelect } from './CategorySelect'
import type { AppState, Transaction, TransactionType, Category } from '@/types'
import { parseExpenseWithAI } from '@/lib/gemini'

const schema = z.object({
  date: z.string().min(1),
  description: z.string().min(1, 'Description required'),
  amount: z.number().positive('Amount must be positive'),
  category_id: z.string(),
  from_account_id: z.string().min(1),
})
type FormValues = z.infer<typeof schema>

// Keyword → category name mapping for auto-detection
const KEYWORD_CATS: [string[], string][] = [
  [['tea', 'coffee', 'chai', 'juice', 'drink', 'snack', 'breakfast', 'lunch', 'dinner', 'food', 'eat', 'restaurant', 'hotel', 'bakery', 'biscuit', 'sweet', 'biriyani', 'parotta', 'dosa', 'idli'], 'Food & Tea'],
  [['petrol', 'fuel', 'diesel', 'gas', 'bunk', 'pump', 'filling station'], 'Fuel'],
  [['grocery', 'groceries', 'vegetable', 'rice', 'dal', 'flour', 'milk', 'bread', 'egg', 'fruit', 'supermarket', 'provision', 'store', 'market', 'sabzi'], 'Groceries'],
  [['medical', 'medicine', 'doctor', 'hospital', 'pharmacy', 'tablet', 'injection', 'clinic', 'health', 'lab', 'prescription'], 'Medical'],
  [['shopping', 'clothes', 'shirt', 'pants', 'dress', 'shoes', 'amazon', 'flipkart', 'mall', 'apparel'], 'Shopping'],
  [['netflix', 'spotify', 'hotstar', 'prime video', 'youtube premium', 'disney', 'subscription', 'streaming'], 'Shopping'],
  [['electricity', 'electric', 'bill', 'internet', 'wifi', 'broadband', 'mobile recharge', 'recharge', 'bsnl', 'jio', 'airtel', 'kseb', 'utility'], 'Utilities'],
  [['loan', 'emi', 'mortgage', 'installment'], 'Loan EMI'],
  [['gold', 'jewel', 'chit', 'kuri', 'chitty'], 'Gold Scheme'],
  [['sip', 'mutual fund', 'investment'], 'SIP'],
  [['kitchen', 'utensil', 'vessel', 'cooker'], 'Kitchen'],
  [['granite', 'marble', 'tiles', 'flooring'], 'Granite'],
  [['wiring', 'electrician', 'switch', 'fan', 'bulb', 'mcb'], 'Electrical'],
  [['plumbing', 'pipe', 'tap', 'bathroom', 'toilet', 'sink'], 'Plumbing'],
  [['family', 'home expense', 'domestic'], 'Family'],
]

// Match description words against actual category names — returns ranked matches
function findCategoryMatches(description: string, categories: Category[]): Category[] {
  const descWords = description.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
  if (descWords.length === 0) return []
  const scored = categories
    .map(cat => {
      const catLower = cat.name.toLowerCase()
      const score = descWords.reduce((s, w) => s + (catLower.includes(w) ? 1 : 0), 0)
      return { cat, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
  if (scored.length === 0) return []
  const top = scored[0].score
  return scored.filter(({ score }) => score >= top).map(({ cat }) => cat)
}

function guessCategory(description: string, categories: Category[]): string | null {
  const lower = description.toLowerCase()
  for (const [keywords, catName] of KEYWORD_CATS) {
    if (keywords.some(kw => lower.includes(kw))) {
      const cat = categories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()))
      if (cat) return cat.id
    }
  }
  return null
}

const STRIP_WORDS = new Set([
  'from', 'for', 'at', 'in', 'on', 'to', 'the', 'a', 'an', 'by', 'via', 'with', 'using', 'through', 'of',
  'bought', 'purchased', 'paid', 'spent', 'got', 'buy', 'get', 'paying',
  'rs', 'inr', 'rupees', 'rupee',
])

function parseSmartInput(
  text: string,
  accounts: { id: string; name: string }[],
  categories: Category[]
): { description: string; amount: number | null; accountId: string | null; categoryId: string | null } {
  const tokens = text.trim().split(/\s+/)
  let amount: number | null = null
  let amountIdx = -1
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/^₹/, '')
    const n = parseFloat(t)
    if (!isNaN(n) && n > 0) { amount = n; amountIdx = i; break }
  }
  const remaining = tokens.filter((_, i) => i !== amountIdx)
  let accountId: string | null = null
  let accountIdx = -1
  for (let i = 0; i < remaining.length; i++) {
    const token = remaining[i].toLowerCase()
    const match = accounts.find(a =>
      a.name.toLowerCase().split(/\s+/).some(w => w.startsWith(token)) ||
      a.name.toLowerCase().includes(token)
    )
    if (match) { accountId = match.id; accountIdx = i; break }
  }
  const descTokens = remaining
    .filter((_, i) => i !== accountIdx)
    .filter(t => !STRIP_WORDS.has(t.toLowerCase()))
  const description = descTokens.join(' ')
  const categoryId = description ? guessCategory(description, categories) : null
  return { description, amount, accountId, categoryId }
}

interface FABProps { onClick: () => void }

export function FAB({ onClick }: FABProps) {
  const c = useTheme()
  return (
    <button
      onClick={onClick}
      aria-label="Quick add"
      style={{
        position: 'absolute', right: 18, bottom: 26, zIndex: 40,
        width: 60, height: 60, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: c.accent, color: '#fff',
        boxShadow: `0 8px 22px ${c.accent}66, 0 2px 6px rgba(0,0,0,0.2)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Glyph name="plus" color="#fff" size={26} />
    </button>
  )
}

interface QuickAddSheetProps {
  open: boolean
  onClose: () => void
  onSave: (data: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'> & { to_account_id?: string | null }) => void
  state: AppState
  onAddCategory: (name: string, group_name: string) => Promise<string>
  autopilotEnabled?: boolean
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
}

export function QuickAddSheet({ open, onClose, onSave, state, onAddCategory, autopilotEnabled = false, onUpdateSettings }: QuickAddSheetProps) {
  const c = useTheme()
  const [txType, setTxType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [transferToAccountId, setTransferToAccountId] = useState('')
  const amountRef = useRef<HTMLInputElement | null>(null)

  // Long press quick save
  const [longPressChip, setLongPressChip] = useState<{ label: string; category_id: string | null } | null>(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [quickAccountId, setQuickAccountId] = useState('')
  const [smartInput, setSmartInput] = useState('')
  const [smartParsed, setSmartParsed] = useState<{ description: string; amount: number | null; accountName: string | null; categoryName: string | null } | null>(null)
  const smartInputRef = useRef<HTMLInputElement | null>(null)
  const enterSubmittedRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const quickAmountRef = useRef<HTMLInputElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  const handleGrabStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY }
  const handleGrabMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    const delta = e.touches[0].clientY - dragStartY.current
    if (delta > 0) setDragY(delta)
  }
  const handleGrabEnd = () => {
    if (dragY > 100) { onClose(); setLongPressChip(null) }
    setDragY(0)
    dragStartY.current = null
  }

  const [aiParsing, setAiParsing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<{ name: string; group: string } | null>(null)
  const [catSuggestions, setCatSuggestions] = useState<Category[]>([])
  const aiJustParsed = useRef(false)

  const accs = state.accounts.filter(a => a.is_active)
  const cats = state.categories
  const catsRef = useRef(cats)
  catsRef.current = cats

  // Compute top 8 most-used expense descriptions from transaction history
  const topDescriptions = useMemo(() => {
    const freq: Record<string, { count: number; category_id: string | null }> = {}
    state.transactions
      .filter(t => t.transaction_type === 'expense')
      .forEach(t => {
        const key = t.description.trim()
        if (!key) return
        if (!freq[key]) freq[key] = { count: 0, category_id: t.category_id }
        freq[key].count++
      })
    return Object.entries(freq)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([label, { category_id }]) => ({ label, category_id }))
  }, [state.transactions])

  // Long press handlers
  const startLongPress = (label: string, category_id: string | null) => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      const lastTx = state.transactions.find(t => t.description.trim() === label && t.transaction_type === 'expense')
      const lastAcc = state.accounts.find(a => a.is_active)
      setQuickAmount(lastTx ? String(lastTx.amount) : '')
      setQuickAccountId(lastTx?.from_account_id || lastAcc?.id || '')
      setLongPressChip({ label, category_id })
      setTimeout(() => quickAmountRef.current?.focus(), 80)
    }, 500)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const handleChipTouchEnd = (label: string, category_id: string | null) => {
    if (!longPressFired.current) {
      cancelLongPress()
      if (!longPressChip) applyQuick(label, category_id)
    }
    longPressFired.current = false
  }

  const handleQuickSave = () => {
    const amt = parseFloat(quickAmount)
    if (isNaN(amt) || amt <= 0 || !longPressChip) return
    const catId = longPressChip.category_id || guessCategory(longPressChip.label, cats) || null
    onSave({
      transaction_date: iso(TODAY),
      description: longPressChip.label,
      amount: amt,
      transaction_type: 'expense',
      category_id: catId,
      from_account_id: quickAccountId,
    })
    setLongPressChip(null)
    onClose()
  }

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isValid } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      date: iso(TODAY),
      description: '',
      amount: 0,
      category_id: '',
      from_account_id: '',
    },
  })

  // Reset with correct first account & category each time sheet opens
  useEffect(() => {
    if (open) {
      const firstAccount = accs[0]?.id || ''
      const secondAccount = accs[1]?.id || ''
      const firstCat = cats.find(c => c.group_name === 'Lifestyle')?.id || cats[0]?.id || ''
      reset({ date: iso(TODAY), description: '', amount: 0, category_id: firstCat, from_account_id: firstAccount })
      setTxType('expense')
      setTransferToAccountId(secondAccount)
      setSmartInput('')
      setSmartParsed(null)
      setAiSuggestion(null)
      setCatSuggestions([])
      setAiParsing(false)
    }
  }, [open, reset])

  const descriptionVal = watch('description')
  const amountVal = watch('amount')
  const categoryVal = watch('category_id')

  // Auto-categorize: name match → keyword fallback only
  // Uses catsRef so adding a new category doesn't re-trigger this effect
  useEffect(() => {
    if (aiJustParsed.current) { aiJustParsed.current = false; return }
    if (!descriptionVal.trim()) { setAiSuggestion(null); setCatSuggestions([]); return }

    if (txType === 'income') {
      setAiSuggestion(null); setCatSuggestions([])
      const incomeCats = catsRef.current.filter(c => c.group_name === 'Income')
      const guessed = guessCategory(descriptionVal, incomeCats)
      if (guessed) setValue('category_id', guessed, { shouldValidate: true })
      return
    }

    // 1. Match against actual category names
    const nameMatches = findCategoryMatches(descriptionVal, catsRef.current)
    if (nameMatches.length === 1) {
      setValue('category_id', nameMatches[0].id, { shouldValidate: true })
      setCatSuggestions([]); setAiSuggestion(null)
      return
    }
    if (nameMatches.length > 1) {
      setValue('category_id', nameMatches[0].id, { shouldValidate: true })
      setCatSuggestions(nameMatches); setAiSuggestion(null)
      return
    }

    // 2. Keyword fallback
    setCatSuggestions([])
    const guessed = guessCategory(descriptionVal, catsRef.current)
    if (guessed) setValue('category_id', guessed, { shouldValidate: true })
    setAiSuggestion(null)
  }, [descriptionVal, setValue, txType])

  const handleSmartInput = (text: string) => {
    setSmartInput(text)
    if (!text.trim()) { setSmartParsed(null); setAiParsing(false) }
  }

  const handleSmartSubmit = async () => {
    const text = smartInput.trim()
    if (text.length < 2) return
    smartInputRef.current?.blur()

    const allAccs = [
      ...accs.map(a => ({ id: a.id, name: a.name })),
      ...(state.credit_cards || []).map(cc => ({ id: cc.id, name: cc.name })),
    ]

    if (autopilotEnabled) {
      setAiParsing(true)
      const catNames = catsRef.current.filter(c => c.group_name !== 'Income').map(c => c.name)
      const accNames = allAccs.map(a => a.name)
      const result = await parseExpenseWithAI(text, catNames, accNames, state.groups.map(g => g.name), (n) => onUpdateSettings?.({ ai_requests_used: n }))
      setAiParsing(false)
      if (!result) return

      aiJustParsed.current = true
      setCatSuggestions([])
      setAiSuggestion(null)
      if (result.description) setValue('description', result.description, { shouldValidate: true })
      if (result.amount !== null) setValue('amount', result.amount, { shouldValidate: true })
      if (result.account) {
        const acc = allAccs.find(a => a.name === result.account)
        if (acc) setValue('from_account_id', acc.id, { shouldValidate: true })
      }
      if (result.category) {
        const cat = catsRef.current.find(c => c.name === result.category)
        if (cat) setValue('category_id', cat.id, { shouldValidate: true })
      }
      setSmartParsed({
        description: result.description ?? '',
        amount: result.amount ?? null,
        accountName: result.account ?? null,
        categoryName: result.category ?? null,
      })
    } else {
      const parsed = parseSmartInput(text, allAccs, cats)
      if (parsed.description) setValue('description', parsed.description, { shouldValidate: true })
      if (parsed.amount !== null) setValue('amount', parsed.amount, { shouldValidate: true })
      if (parsed.accountId) setValue('from_account_id', parsed.accountId, { shouldValidate: true })
      if (parsed.categoryId) setValue('category_id', parsed.categoryId, { shouldValidate: true })
      setSmartParsed({
        description: parsed.description,
        amount: parsed.amount,
        accountName: allAccs.find(a => a.id === parsed.accountId)?.name ?? null,
        categoryName: cats.find(c => c.id === parsed.categoryId)?.name ?? null,
      })
    }
  }

  const applyQuick = (label: string, category_id: string | null) => {
    setValue('description', label, { shouldValidate: true })
    if (category_id) setValue('category_id', category_id, { shouldValidate: true })
    else {
      const guessed = guessCategory(label, cats)
      if (guessed) setValue('category_id', guessed, { shouldValidate: true })
    }
    // Clear amount and focus it
    setValue('amount', 0, { shouldValidate: false })
    setTimeout(() => {
      amountRef.current?.focus()
      amountRef.current?.select()
    }, 50)
  }

  const onSubmit = (data: FormValues) => {
    if (txType === 'transfer') {
      onSave({
        transaction_date: data.date,
        description: data.description.trim() || 'Transfer',
        amount: data.amount,
        transaction_type: 'transfer',
        category_id: null,
        from_account_id: data.from_account_id,
        to_account_id: transferToAccountId || null,
      })
    } else {
      onSave({
        transaction_date: data.date,
        description: data.description,
        amount: data.amount,
        transaction_type: txType as TransactionType,
        category_id: data.category_id || null,
        from_account_id: data.from_account_id,
        to_account_id: null,
      })
    }
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    borderRadius: 13, padding: '12px 14px',
    font: '600 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    font: '700 12px Plus Jakarta Sans', color: c.muted, marginBottom: 6, display: 'block',
  }

  const isExpense = txType === 'expense'
  const isTransfer = txType === 'transfer'
  const fromAccountId = watch('from_account_id')
  const typeColor = isTransfer ? c.accent : isExpense ? c.bad : c.good
  const transferValid = isTransfer && accs.length >= 2 && amountVal > 0 && !!fromAccountId && !!transferToAccountId && transferToAccountId !== fromAccountId
  const valid = isTransfer ? transferValid : (isValid && amountVal > 0 && !!descriptionVal.trim() && (txType === 'income' || !!categoryVal))

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none', touchAction: open ? 'none' : 'auto' }}>
      <div data-testid="sheet-backdrop" onClick={() => { onClose(); setLongPressChip(null) }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, background: c.surface,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: '8px 18px calc(30px + env(safe-area-inset-bottom, 0px))',
        transform: open ? `translateY(${dragY}px)` : 'translateY(110%)',
        transition: dragY > 0 ? 'none' : 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)', maxHeight: '88svh', overflowY: 'auto',
        overscrollBehavior: 'contain', touchAction: 'pan-y',
      }}>
        <div
          onTouchStart={handleGrabStart}
          onTouchMove={handleGrabMove}
          onTouchEnd={handleGrabEnd}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '4px 0 10px', cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 999, background: c.faint }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ font: '800 19px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
            {isTransfer ? 'Transfer' : isExpense ? 'Add Expense' : 'Add Income'}
          </div>
          <button aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 999, background: c.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Glyph name="close" color={c.sub} size={16} />
          </button>
        </div>

        {/* Expense / Income / Transfer toggle */}
        <div style={{ display: 'flex', background: c.surface2, borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 }}>
          {(['expense', 'income', 'transfer'] as const).map(t => {
            const active = txType === t
            const bg = active ? (t === 'income' ? c.good : t === 'transfer' ? c.accent : c.bad) : 'transparent'
            return (
              <button key={t} type="button" onClick={() => {
                setTxType(t)
                if (t === 'transfer') setValue('description', 'Transfer', { shouldValidate: true })
                else if (descriptionVal === 'Transfer') setValue('description', '', { shouldValidate: false })
              }} style={{
                flex: 1, border: 'none', borderRadius: 11, padding: '9px 0',
                font: '700 13px Plus Jakarta Sans',
                background: bg, color: active ? '#fff' : c.muted,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {t === 'expense' ? '↑ Out' : t === 'income' ? '↓ In' : '⇄ Move'}
              </button>
            )
          })}
        </div>

        {/* Smart input */}
        {isExpense && !isTransfer && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none', opacity: aiParsing ? 1 : 0.5, color: aiParsing ? c.accent : undefined, transition: 'color 0.2s' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/></svg></span>
              <input
                ref={smartInputRef}
                value={smartInput}
                onChange={e => handleSmartInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    enterSubmittedRef.current = true
                    handleSmartSubmit()
                  }
                }}
                onBlur={() => {
                  if (enterSubmittedRef.current) { enterSubmittedRef.current = false; return }
                  if (smartInput.trim().length >= 2) handleSmartSubmit()
                }}
                placeholder={autopilotEnabled ? 'e.g. "paid electricity bill 1200 via HDFC"' : 'e.g. "petrol 500 axis"'}
                enterKeyHint="done"
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>
            {smartParsed && (smartParsed.description || smartParsed.amount !== null) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {smartParsed.description && (
                  <span style={{ background: c.accentSoft, color: c.accent, borderRadius: 999, padding: '3px 10px', font: '700 12px Plus Jakarta Sans' }}>
                    {smartParsed.description}
                  </span>
                )}
                {smartParsed.amount !== null && (
                  <span style={{ background: c.surface2, color: c.ink, borderRadius: 999, padding: '3px 10px', font: '700 12px Plus Jakarta Sans' }}>
                    ₹{smartParsed.amount}
                  </span>
                )}
                {smartParsed.categoryName && (
                  <span style={{ background: c.surface2, color: c.sub, borderRadius: 999, padding: '3px 10px', font: '600 12px Plus Jakarta Sans' }}>
                    {smartParsed.categoryName}
                  </span>
                )}
                {smartParsed.accountName && (
                  <span style={{ background: c.surface2, color: c.sub, borderRadius: 999, padding: '3px 10px', font: '600 12px Plus Jakarta Sans' }}>
                    {smartParsed.accountName}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick chips — expense only, dynamic from history */}
        {isExpense && !isTransfer && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: '72px', overflow: 'hidden' }}>
              {(topDescriptions.length === 0
                ? ['Tea', 'Petrol', 'Groceries', 'Medical', 'Shopping'].map(label => ({ label, category_id: null }))
                : topDescriptions
              ).map(({ label, category_id }) => {
                const active = descriptionVal === label
                const isLongPressed = longPressChip?.label === label
                return (
                  <div key={label} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => !longPressChip && applyQuick(label, category_id)}
                      onMouseDown={() => startLongPress(label, category_id)}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={e => { e.preventDefault(); startLongPress(label, category_id) }}
                      onTouchEnd={e => { e.preventDefault(); handleChipTouchEnd(label, category_id) }}
                      onContextMenu={e => e.preventDefault()}
                      style={{
                        border: `1.5px solid ${active || isLongPressed ? c.accent : c.faint}`,
                        cursor: 'pointer',
                        background: active || isLongPressed ? c.accentSoft : c.surface,
                        color: active || isLongPressed ? c.accent : c.sub,
                        borderRadius: 999, padding: '8px 14px',
                        font: '700 13px Plus Jakarta Sans', whiteSpace: 'nowrap',
                        userSelect: 'none', WebkitUserSelect: 'none',
                        // @ts-ignore
                        WebkitTouchCallout: 'none',
                      }}
                    >
                      {label}
                    </button>

                    {/* Mini quick-save popup on long press — fixed to avoid clipping */}
                    {isLongPressed && (
                      <div style={{
                        position: 'fixed', bottom: 'calc(50% - 60px)', left: '50%',
                        transform: 'translateX(-50%)',
                        background: c.surface, borderRadius: 16, padding: 14,
                        boxShadow: '0 8px 28px rgba(0,0,0,0.22)', border: `1px solid ${c.faint}`,
                        zIndex: 200, minWidth: 220, width: '80vw', maxWidth: 300,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                          </svg>
                          Quick Save — {label}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase' }}>Amount</div>
                            <input
                              ref={quickAmountRef}
                              type="number"
                              value={quickAmount}
                              onChange={e => setQuickAmount(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleQuickSave()}
                              placeholder="0"
                              inputMode="decimal"
                              onFocus={e => e.target.select()}
                              style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 10px', font: '700 18px Plus Jakarta Sans', color: c.ink, outline: 'none' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 4, textTransform: 'uppercase' }}>Account</div>
                            <select value={quickAccountId} onChange={e => setQuickAccountId(e.target.value)}
                              style={{ width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '9px 6px', font: '600 12px Plus Jakarta Sans', color: c.ink, outline: 'none' }}>
                              {state.accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name} (CC)</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => setLongPressChip(null)}
                            style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button type="button" onClick={handleQuickSave} disabled={!quickAmount || parseFloat(quickAmount) <= 0}
                            style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', opacity: !quickAmount ? 0.6 : 1 }}>
                            Save ₹{quickAmount || '0'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 6 }}>
              Tap to fill · Hold to quick save
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <span style={{ font: '700 22px Plus Jakarta Sans', color: typeColor, verticalAlign: 'middle', marginRight: 4 }}>
              {isTransfer ? '⇄₹' : isExpense ? '−₹' : '+₹'}
            </span>
            <input
              {...register('amount', { valueAsNumber: true })}
              ref={e => { register('amount').ref(e); amountRef.current = e }}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              onFocus={e => e.target.select()}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: 160, textAlign: 'center', font: '800 44px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!isTransfer && (
              <div>
                <label style={labelStyle}>Description</label>
                <input {...register('description')} placeholder={isExpense ? 'e.g. Evening Tea' : 'e.g. Salary'}
                  style={{ ...inputStyle, borderColor: errors.description ? c.bad : c.faint }} />
              </div>
            )}

            {isTransfer && accs.length < 2 ? (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Need at least 2 accounts</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                  Add another account (e.g. Cash, Savings) from the Accounts section to enable transfers.
                </div>
              </div>
            ) : isTransfer ? (
              /* Transfer: From → To accounts */
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>From</label>
                  <select {...register('from_account_id')} style={inputStyle}>
                    {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ color: c.accent, font: '700 18px Plus Jakarta Sans', marginTop: 18, flexShrink: 0 }}>→</div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>To</label>
                  <select
                    value={transferToAccountId}
                    onChange={e => setTransferToAccountId(e.target.value)}
                    style={{ ...inputStyle, borderColor: transferToAccountId === fromAccountId && fromAccountId ? c.bad : c.faint }}
                  >
                    {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                    Category
                    {txType === 'income' && <span style={{ color: c.muted, fontWeight: 400 }}>(optional)</span>}
                  </label>
                  <CategorySelect
                    value={categoryVal}
                    onChange={v => setValue('category_id', v, { shouldValidate: true })}
                    state={state}
                    onAddCategory={onAddCategory}
                    style={inputStyle}
                    includeEmpty={txType === 'income'}
                    emptyLabel="No category"
                    filterGroup={txType === 'income' ? 'Income' : undefined}
                  />
                  {catSuggestions.length > 1 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {catSuggestions.map(cat => {
                        const active = categoryVal === cat.id
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => { setValue('category_id', cat.id, { shouldValidate: true }); setCatSuggestions([]) }}
                            style={{
                              border: `1.5px solid ${active ? c.accent : c.faint}`,
                              background: active ? c.accentSoft : c.surface2,
                              borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                              font: '600 12px Plus Jakarta Sans',
                              color: active ? c.accent : c.ink,
                              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                            }}
                          >
                            {cat.name}
                            <span style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{cat.group_name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {aiSuggestion && (
                    <button
                      type="button"
                      onClick={async () => {
                        const newId = await onAddCategory(aiSuggestion.name, aiSuggestion.group)
                        setValue('category_id', newId, { shouldValidate: true })
                        setAiSuggestion(null)
                      }}
                      style={{
                        marginTop: 6, width: '100%', border: `1.5px dashed ${c.accent}`,
                        background: c.accentSoft, borderRadius: 10, padding: '7px 10px',
                        font: '600 12px Plus Jakarta Sans', color: c.accent,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: -1, marginRight: 4 }}><path d="M12 2l2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/></svg>Create "{aiSuggestion.name}" in {aiSuggestion.group}?
                    </button>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Account</label>
                  <select {...register('from_account_id')} style={inputStyle}>
                    <optgroup label="Bank / Cash">
                      {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                    {isExpense && (state.credit_cards || []).length > 0 && (
                      <optgroup label="Credit Cards">
                        {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" {...register('date')} style={inputStyle} />
            </div>

            {isTransfer && transferToAccountId === fromAccountId && fromAccountId && (
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, textAlign: 'center' }}>
                From and To accounts must be different
              </div>
            )}
          </div>

          <button type="submit" disabled={!valid} style={{
            width: '100%', marginTop: 20, border: 'none', borderRadius: 15, padding: '15px 0',
            font: '800 16px Plus Jakarta Sans', cursor: valid ? 'pointer' : 'not-allowed',
            background: valid ? typeColor : c.faint, color: valid ? '#fff' : c.muted,
            boxShadow: valid ? `0 6px 16px ${typeColor}55` : 'none', transition: 'all 0.2s',
          }}>
            {valid
              ? isTransfer
                ? `Transfer  ·  ${fmt(amountVal)}`
                : `${isExpense ? 'Save Expense' : 'Add Income'}  ·  ${fmt(amountVal)}`
              : isTransfer
                ? 'Enter amount & select accounts'
                : 'Enter amount & description'}
          </button>
        </form>
      </div>
    </div>
  )
}
