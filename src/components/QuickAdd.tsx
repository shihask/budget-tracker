import { useEffect, useRef, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTheme } from '@/lib/theme-context'
import { fmt, TODAY, iso } from '@/lib/utils'
import { Glyph } from './Glyph'
import { CategorySelect } from './CategorySelect'
import type { AppState, Transaction, TransactionType, Category } from '@/types'

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
  onSave: (data: Omit<Transaction, 'id' | 'created_at' | 'to_account_id' | 'notes'>) => void
  state: AppState
  onAddCategory: (name: string, group_name: string) => Promise<void>
}

export function QuickAddSheet({ open, onClose, onSave, state, onAddCategory }: QuickAddSheetProps) {
  const c = useTheme()
  const [txType, setTxType] = useState<'expense' | 'income'>('expense')
  const amountRef = useRef<HTMLInputElement | null>(null)

  const accs = state.accounts.filter(a => a.is_active)
  const cats = state.categories

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
      const firstCat = cats.find(c => c.group_name === 'Lifestyle')?.id || cats[0]?.id || ''
      reset({ date: iso(TODAY), description: '', amount: 0, category_id: firstCat, from_account_id: firstAccount })
      setTxType('expense')
    }
  }, [open, reset, accs.length, cats.length])

  const descriptionVal = watch('description')
  const amountVal = watch('amount')
  const categoryVal = watch('category_id')

  // Auto-detect category from description
  useEffect(() => {
    if (!descriptionVal.trim()) return
    const guessed = guessCategory(descriptionVal, cats)
    if (guessed) setValue('category_id', guessed, { shouldValidate: true })
  }, [descriptionVal, cats, setValue])

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
    onSave({
      transaction_date: data.date,
      description: data.description,
      amount: data.amount,
      transaction_type: txType as TransactionType,
      category_id: data.category_id || null,
      from_account_id: data.from_account_id,
    })
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
  const typeColor = isExpense ? c.bad : c.good
  const valid = isValid && amountVal > 0 && !!descriptionVal.trim() && (txType === 'income' || !!categoryVal)

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, background: c.surface,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: '8px 18px calc(30px + env(safe-area-inset-bottom, 0px))',
        transform: open ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)', maxHeight: '88svh', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 5, borderRadius: 999, background: c.faint, margin: '6px auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ font: '800 19px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
            {isExpense ? 'Add Expense' : 'Add Income'}
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 999, background: c.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Glyph name="close" color={c.sub} size={16} />
          </button>
        </div>

        {/* Expense / Income toggle */}
        <div style={{ display: 'flex', background: c.surface2, borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 }}>
          {(['expense', 'income'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTxType(t)} style={{
              flex: 1, border: 'none', borderRadius: 11, padding: '9px 0',
              font: '700 13px Plus Jakarta Sans',
              background: txType === t ? (t === 'income' ? c.good : c.accent) : 'transparent',
              color: txType === t ? '#fff' : c.muted,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {t === 'expense' ? '↑ Expense' : '↓ Income'}
            </button>
          ))}
        </div>

        {/* Quick chips — expense only, dynamic from history */}
        {isExpense && (
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18,
            maxHeight: '72px', overflow: 'hidden',
          }}>
            {topDescriptions.length === 0 ? (
              // Fallback when no history yet
              ['Tea', 'Petrol', 'Groceries', 'Medical', 'Shopping'].map(label => {
                const active = descriptionVal === label
                return (
                  <button key={label} type="button" onClick={() => applyQuick(label, null)} style={{
                    border: `1.5px solid ${active ? c.accent : c.faint}`, cursor: 'pointer',
                    background: active ? c.accentSoft : c.surface, color: active ? c.accent : c.sub,
                    borderRadius: 999, padding: '8px 14px', font: '700 13px Plus Jakarta Sans', whiteSpace: 'nowrap',
                  }}>{label}</button>
                )
              })
            ) : (
              topDescriptions.map(({ label, category_id }) => {
                const active = descriptionVal === label
                return (
                  <button key={label} type="button" onClick={() => applyQuick(label, category_id)} style={{
                    border: `1.5px solid ${active ? c.accent : c.faint}`, cursor: 'pointer',
                    background: active ? c.accentSoft : c.surface, color: active ? c.accent : c.sub,
                    borderRadius: 999, padding: '8px 14px', font: '700 13px Plus Jakarta Sans', whiteSpace: 'nowrap',
                  }}>{label}</button>
                )
              })
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <span style={{ font: '700 22px Plus Jakarta Sans', color: typeColor, verticalAlign: 'middle', marginRight: 4 }}>
              {isExpense ? '−₹' : '+₹'}
            </span>
            <input
              {...register('amount', { valueAsNumber: true })}
              ref={e => { register('amount').ref(e); amountRef.current = e }}
              inputMode="decimal"
              placeholder="0"
              onFocus={e => e.target.select()}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: 160, textAlign: 'center', font: '800 44px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Description</label>
              <input {...register('description')} placeholder={isExpense ? 'e.g. Evening Tea' : 'e.g. Salary'}
                style={{ ...inputStyle, borderColor: errors.description ? c.bad : c.faint }} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Category {txType === 'income' && <span style={{ color: c.muted, fontWeight: 400 }}>(optional)</span>}</label>
                <CategorySelect
                  value={categoryVal}
                  onChange={v => setValue('category_id', v, { shouldValidate: true })}
                  state={state}
                  onAddCategory={onAddCategory}
                  style={inputStyle}
                  includeEmpty={txType === 'income'}
                  emptyLabel="No category"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Account</label>
                <select {...register('from_account_id')} style={inputStyle}>
                  {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" {...register('date')} style={inputStyle} />
            </div>
          </div>

          <button type="submit" disabled={!valid} style={{
            width: '100%', marginTop: 20, border: 'none', borderRadius: 15, padding: '15px 0',
            font: '800 16px Plus Jakarta Sans', cursor: valid ? 'pointer' : 'not-allowed',
            background: valid ? typeColor : c.faint, color: valid ? '#fff' : c.muted,
            boxShadow: valid ? `0 6px 16px ${typeColor}55` : 'none', transition: 'all 0.2s',
          }}>
            {valid ? `${isExpense ? 'Save Expense' : 'Add Income'}  ·  ${fmt(amountVal)}` : 'Enter amount & description'}
          </button>
        </form>
      </div>
    </div>
  )
}
