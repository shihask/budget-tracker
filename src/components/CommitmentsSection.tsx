import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { catById as buildCatById } from '@/lib/data'
import { CategorySelect } from './CategorySelect'
import { BottomSheet } from './BottomSheet'
import type { AppState, DerivedMetrics, Commitment } from '@/types'

type Freq = 'monthly' | 'weekly' | 'yearly'

type CForm = {
  name: string
  amount: string
  remaining: string
  total_amount: string
  category_id: string
  is_recurring: boolean
  frequency: Freq
  due_day: string
  from_account_id: string
  total_installments: string
  current_installment: string
}

const EMPTY_FORM: CForm = {
  name: '', amount: '', remaining: '', total_amount: '',
  category_id: '', is_recurring: false,
  frequency: 'monthly', due_day: '', from_account_id: '',
  total_installments: '', current_installment: '0',
}

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

interface Props {
  state: AppState
  d: DerivedMetrics
  onMarkPaid: (c: Commitment, recordExpense: boolean, accountId: string | null) => Promise<void>
  onAdd: (form: Omit<Commitment, 'id'>) => Promise<void>
  onUpdate: (id: string, form: Omit<Commitment, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<string>
}

export function CommitmentsSection({ state, d, onMarkPaid, onAdd, onUpdate, onDelete, onAddCategory }: Props) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)
  const accounts = state.accounts.filter(a => a.is_active)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const INITIAL_VISIBLE = 3
  const [confirmPay, setConfirmPay] = useState<Commitment | null>(null)
  const [confirmAccountId, setConfirmAccountId] = useState('')

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSheetOpen(true)
  }

  const openEdit = (cm: Commitment) => {
    setEditingId(cm.id)
    setForm({
      name: cm.name,
      amount: String(cm.amount),
      remaining: String(cm.remaining),
      category_id: cm.category_id || '',
      is_recurring: cm.is_recurring,
      frequency: cm.frequency || 'monthly',
      due_day: cm.due_day ? String(cm.due_day) : '',
      from_account_id: cm.from_account_id || '',
      total_installments: cm.total_installments ? String(cm.total_installments) : '',
      current_installment: String(cm.current_installment || 0),
      total_amount: (cm.total_installments && cm.amount) ? String(Math.round(cm.total_installments * cm.amount)) : '',
    })
    setSheetOpen(true)
  }

  const closeSheet = () => { setSheetOpen(false); setForm(EMPTY_FORM); setEditingId(null) }

  const set = (key: keyof CForm, val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }))

  // Auto-calculate: EMI × tenure = total, total ÷ tenure = EMI, total ÷ EMI = tenure
  const handleAmountChange = (val: string) => {
    const emi = parseFloat(val)
    const tenure = parseFloat(form.total_installments)
    setForm(f => ({
      ...f, amount: val,
      total_amount: (!isNaN(emi) && !isNaN(tenure)) ? String(Math.round(emi * tenure)) : f.total_amount,
    }))
  }

  const handleTotalChange = (val: string) => {
    const total = parseFloat(val)
    const tenure = parseFloat(form.total_installments)
    const emi = parseFloat(form.amount)
    setForm(f => ({
      ...f, total_amount: val,
      amount: (!isNaN(total) && !isNaN(tenure) && tenure > 0) ? String(Math.round(total / tenure)) : f.amount,
      remaining: (!isNaN(total) && !isNaN(emi) && emi > 0) ? String(Math.round((total / emi - parseFloat(f.current_installment || '0')) * emi)) : f.remaining,
    }))
  }

  const handleTenureChange = (val: string) => {
    const tenure = parseFloat(val)
    const emi = parseFloat(form.amount)
    const total = parseFloat(form.total_amount)
    setForm(f => ({
      ...f, total_installments: val,
      total_amount: (!isNaN(tenure) && !isNaN(emi)) ? String(Math.round(tenure * emi)) : (!isNaN(tenure) && !isNaN(total)) ? f.total_amount : f.total_amount,
      amount: (!isNaN(tenure) && !isNaN(total) && tenure > 0 && !(!isNaN(emi) && emi > 0)) ? String(Math.round(total / tenure)) : f.amount,
    }))
  }

  const handleSave = async () => {
    const amount = parseFloat(form.amount)
    if (!form.name.trim() || isNaN(amount) || amount <= 0) return
    const remaining = form.is_recurring ? amount : (parseFloat(form.remaining) || amount)
    const payload: Omit<Commitment, 'id'> = {
      name: form.name.trim(),
      amount,
      remaining,
      category_id: form.category_id || null,
      is_recurring: form.is_recurring,
      frequency: form.is_recurring ? form.frequency : null,
      due_day: (form.is_recurring && form.frequency === 'monthly' && form.due_day)
        ? parseInt(form.due_day) : null,
      from_account_id: form.from_account_id || null,
      is_active: true,
      last_paid_date: null,
      total_installments: form.total_installments ? parseInt(form.total_installments) : null,
      current_installment: parseInt(form.current_installment) || 0,
    }
    setSaving(true)
    try {
      if (editingId) await onUpdate(editingId, payload)
      else await onAdd(payload)
      closeSheet()
    } catch (_) {}
    setSaving(false)
  }

  const handleMarkPaid = async (cm: Commitment) => {
    const isCreditCard = (state.credit_cards || []).some(c => c.id === cm.from_account_id)
    if (isCreditCard) {
      setConfirmPay(cm)
    } else {
      setConfirmAccountId(cm.from_account_id || accounts[0]?.id || '')
      setConfirmPay(cm)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this commitment?')) return
    setDeleting(id)
    try { await onDelete(id) } catch (_) {}
    setDeleting(null)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  const active = state.commitments.filter(c => c.is_active !== false)
  const visible = showAll ? active : active.slice(0, INITIAL_VISIBLE)
  const hasMore = active.length > INITIAL_VISIBLE

  return (
    <>
      <Card>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
              </svg>
            </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Bills & Obligations</div>
              <button
                onClick={() => setInfoOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </button>
            </div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
              Total: {fmt(d.remainingCommitments)}
            </div>
          </div>
          </div>
          <button
            onClick={openAdd}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: c.accentSoft, color: c.accent, cursor: 'pointer',
              font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>

        {active.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '8px 0' }}>
            No commitments yet. Tap + to add one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map((cm, i) => {
              const cat = catMap[cm.category_id!]
              const col = (cat && CAT_COLORS[cat.name]) || c.accent
              const completed = !cm.is_recurring && cm.remaining <= 0
              const amount = cm.amount || cm.remaining || 0
              const isPaying = paying === cm.id
              const isDeleting = deleting === cm.id

              // Check if already paid this month (for recurring)
              const paidThisMonth = cm.is_recurring && cm.last_paid_date
                ? (() => {
                    const paid = new Date(cm.last_paid_date)
                    const now = new Date()
                    return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()
                  })()
                : false

              return (
                <div
                  key={cm.id}
                  onClick={() => !isPaying && !isDeleting && openEdit(cm)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 11,
                    paddingTop: i === 0 ? 0 : 12, paddingBottom: 12,
                    borderBottom: i < visible.length - 1 ? `1px solid ${c.faint}` : 'none',
                    opacity: isDeleting ? 0.4 : 1,
                    cursor: 'pointer',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    background: completed ? c.surface2 : col + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {completed ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    )}
                  </div>

                  {/* Info + actions */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{cm.name}</span>
                      {cm.is_recurring && (
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accentSoft, borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15"/>
                          </svg>
                          {cm.frequency}
                        </span>
                      )}
                      {cm.total_installments && (
                        <span style={{ font: '700 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 999, padding: '2px 7px' }}>
                          {(cm.current_installment || 0)}/{cm.total_installments}
                        </span>
                      )}
                      {completed && (
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 999, padding: '2px 7px' }}>
                          Completed
                        </span>
                      )}
                    </div>

                  <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                    {cm.is_recurring
                      ? paidThisMonth
                        ? `✓ Paid on ${new Date(cm.last_paid_date!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : (cm.due_day ? `Due ${ord(cm.due_day)} every month` : `Recurring · ${cm.frequency}`)
                      : completed ? 'All paid up' : `Remaining: ${fmt(cm.remaining)}`
                    }
                  </div>
                  {/* Total and remaining for installment-based */}
                  {cm.total_installments && cm.amount && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      <div>
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Total </span>
                        <span style={{ font: '700 11px Plus Jakarta Sans', color: c.ink }}>{fmt(cm.total_installments * cm.amount)}</span>
                      </div>
                      <div>
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Remaining </span>
                        <span style={{ font: '700 11px Plus Jakarta Sans', color: c.bad }}>
                          {fmt((cm.total_installments - (cm.current_installment || 0)) * cm.amount)}
                        </span>
                      </div>
                    </div>
                  )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                      {!completed && !paidThisMonth && (
                        <button
                          onClick={e => { e.stopPropagation(); handleMarkPaid(cm) }}
                          disabled={isPaying}
                          style={{ background: c.goodSoft, color: c.good, border: 'none', borderRadius: 8, padding: '5px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer', opacity: isPaying ? 0.6 : 1 }}
                        >
                          {isPaying ? '...' : '✓ Mark Paid'}
                        </button>
                      )}
                      {paidThisMonth && (
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 8, padding: '5px 10px' }}>
                          ✓ Paid this month
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount + delete */}
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div>
                      <div style={{ font: '800 15px Plus Jakarta Sans', color: completed ? c.muted : c.ink }}>
                        {fmt(amount)}
                      </div>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                        {cm.total_installments ? 'EMI/mo' : cm.is_recurring ? `/${cm.frequency?.slice(0, 2)}` : 'each'}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(cm.id) }}
                      disabled={isDeleting}
                      style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {hasMore && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              marginTop: 10, width: '100%', background: 'none', border: `1.5px solid ${c.faint}`,
              borderRadius: 10, padding: '8px', font: '700 12px Plus Jakarta Sans',
              color: c.muted, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 5,
            }}
          >
            {showAll ? (
              <>
                Show less
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </>
            ) : (
              <>
                Show {active.length - INITIAL_VISIBLE} more
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </>
            )}
          </button>
        )}
      </Card>

      {/* Add / Edit Sheet */}
      <BottomSheet open={sheetOpen} onClose={closeSheet}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>
              {editingId ? 'Edit Commitment' : 'Add Commitment'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Name */}
              <div>
                <label style={lbl}>Name</label>
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="e.g. SIP, Kuri, Loan EMI" style={inp} />
              </div>

              {/* Loan calculator fields */}
              <div style={{ background: c.surface2, borderRadius: 14, padding: 12 }}>
                <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Fill any 2 → third auto-calculates
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>EMI Amount</label>
                    <input type="number" inputMode="decimal" onFocus={e => e.target.select()}
                      value={form.amount} onChange={e => handleAmountChange(e.target.value)}
                      placeholder="₹" min="0" style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Total Months</label>
                    <input type="number" inputMode="numeric" onFocus={e => e.target.select()}
                      value={form.total_installments} onChange={e => handleTenureChange(e.target.value)}
                      placeholder="e.g. 12" min="1" style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Total Amount</label>
                    <input type="number" inputMode="decimal" onFocus={e => e.target.select()}
                      value={form.total_amount} onChange={e => handleTotalChange(e.target.value)}
                      placeholder="₹" min="0" style={inp} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Paid so far (months)</label>
                    <input type="number" inputMode="numeric" onFocus={e => e.target.select()}
                      value={form.current_installment} onChange={e => set('current_installment', e.target.value)}
                      placeholder="0" min="0" style={inp} />
                  </div>
                  {form.amount && form.total_installments && form.current_installment !== '' && (
                    <div style={{ flex: 1, background: c.accentSoft, borderRadius: 11, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, textTransform: 'uppercase' }}>Remaining</div>
                      <div style={{ font: '800 15px Plus Jakarta Sans', color: c.accent, marginTop: 2 }}>
                        {fmt((parseFloat(form.total_installments) - parseFloat(form.current_installment || '0')) * parseFloat(form.amount))}
                      </div>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, marginTop: 1 }}>
                        {parseFloat(form.total_installments) - parseFloat(form.current_installment || '0')} months left
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* One-time / Recurring toggle */}
              <div>
                <label style={lbl}>Type</label>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {([false, true] as const).map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => set('is_recurring', v)}
                      style={{
                        flex: 1, border: 'none', borderRadius: 10, padding: '9px',
                        font: '700 13px Plus Jakarta Sans',
                        background: form.is_recurring === v ? c.accent : 'transparent',
                        color: form.is_recurring === v ? '#fff' : c.muted,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {v ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                        )}
                        {v ? 'Recurring' : 'One-time'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurring: frequency + due day */}
              {form.is_recurring && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Frequency</label>
                    <select value={form.frequency} onChange={e => set('frequency', e.target.value)} style={inp}>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  {form.frequency === 'monthly' && (
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Due day (1–31)</label>
                      <input type="number" value={form.due_day} onChange={e => set('due_day', e.target.value)}
                        placeholder="e.g. 5" min="1" max="31" style={inp} />
                    </div>
                  )}
                </div>
              )}

              {/* One-time: total remaining */}
              {!form.is_recurring && (
                <div>
                  <label style={lbl}>Total remaining balance</label>
                  <input type="number" value={form.remaining} onChange={e => set('remaining', e.target.value)}
                    placeholder="Total amount still owed" min="0" step="0.01" style={inp} />
                </div>
              )}

              {/* Category + Account */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Category</label>
                  <CategorySelect value={form.category_id} onChange={v => set('category_id', v)} state={state} onAddCategory={onAddCategory} style={inp} includeEmpty emptyLabel="None" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Pay from account</label>
                  <select value={form.from_account_id} onChange={e => set('from_account_id', e.target.value)} style={inp}>
                    <option value="">None</option>
                    <optgroup label="Bank / Cash">
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                    {(state.credit_cards || []).length > 0 && (
                      <optgroup label="Credit Cards">
                        {(state.credit_cards || []).map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeSheet} style={{
                flex: 1, background: c.surface2, color: c.muted, border: 'none',
                borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, background: c.accent, color: '#fff', border: 'none',
                borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Commitment'}
              </button>
            </div>
      </BottomSheet>

      {/* Confirmation modal */}
      {confirmPay && (() => {
        const isCreditCard = (state.credit_cards || []).some(c => c.id === confirmPay.from_account_id)
        const cardName = isCreditCard ? (state.credit_cards || []).find(c => c.id === confirmPay.from_account_id)?.name : null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={() => setConfirmPay(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
                {isCreditCard ? 'Add to card outstanding?' : 'Record as expense?'}
              </div>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 16 }}>
                {isCreditCard
                  ? <>Marking <strong style={{ color: c.ink }}>{confirmPay.name}</strong> ({fmt(confirmPay.amount)}) paid via <strong style={{ color: c.ink }}>{cardName}</strong>.<br /><br />
                    Tap <strong style={{ color: c.ink }}>Yes</strong> if this amount is <strong style={{ color: c.ink }}>not yet</strong> in your card outstanding (adds it now).<br />
                    Tap <strong style={{ color: c.ink }}>No</strong> if the bank already added it to your statement.</>
                  : <>Mark <strong style={{ color: c.ink }}>{confirmPay.name}</strong> ({fmt(confirmPay.amount)}) as paid.
                    Do you want to record this as an expense and deduct from your account?</>
                }
              </div>

              {!isCreditCard && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Pay from account</label>
                  <select value={confirmAccountId} onChange={e => setConfirmAccountId(e.target.value)}
                    style={{ width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px', font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none' }}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={async () => {
                    const cm = confirmPay; setConfirmPay(null)
                    setPaying(cm.id)
                    try { await onMarkPaid(cm, true, isCreditCard ? null : confirmAccountId) } catch (_) {}
                    setPaying(null)
                  }}
                  style={{ width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
                >
                  {isCreditCard ? '✓ Yes, add to outstanding' : '✓ Yes, record as expense'}
                </button>
                <button
                  onClick={async () => {
                    const cm = confirmPay; setConfirmPay(null)
                    setPaying(cm.id)
                    try { await onMarkPaid(cm, false, null) } catch (_) {}
                    setPaying(null)
                  }}
                  style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}
                >
                  {isCreditCard ? 'No, already in statement' : 'No, just mark as paid'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Info popup */}
      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Bills & Obligations</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15"/></svg>,
                  title: 'Recurring bills',
                  desc: 'Electricity, internet, rent, subscriptions — anything that repeats monthly, weekly or yearly.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2h-2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg>,
                  title: 'One-time payments',
                  desc: 'A single large payment you still owe — insurance, annual fees, upcoming dues.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><rect x="2" y="10" width="20" height="12" rx="1"/><path d="M12 2L2 10h20L12 2z"/><line x1="9" y1="15" x2="9" y2="22"/><line x1="15" y1="15" x2="15" y2="22"/></svg>,
                  title: 'Loan EMIs & SIPs',
                  desc: 'Track installments with total amount, tenure and paid count. Auto-calculates remaining.',
                },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {item.svg}
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{item.title}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '12px', background: c.surface2, borderRadius: 12 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                The total unpaid amount here is deducted from your <strong style={{ color: c.ink }}>Spendable Balance</strong> to give you your <strong style={{ color: c.ink }}>Real Free Money</strong>.
              </div>
            </div>
            <button
              onClick={() => setInfoOpen(false)}
              style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
