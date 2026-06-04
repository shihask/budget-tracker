import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import type { AppState, Borrowing } from '@/types'

type BForm = {
  person_name: string
  total_amount: string
  paid_amount: string
  notes: string
}

type PayForm = {
  amount: string
  account_id: string
  category_id: string
  incoming: boolean
}

const EMPTY_BFORM: BForm = { person_name: '', total_amount: '', paid_amount: '0', notes: '' }
const EMPTY_PAY: PayForm = { amount: '', account_id: '', category_id: '', incoming: true }

interface Props {
  state: AppState
  onAdd: (form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null }) => Promise<void>
  onUpdate: (id: string, form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onPayment: (b: Borrowing, amount: number, accountId: string | null, incoming: boolean, categoryId: string | null) => Promise<void>
}

export function BorrowingSection({ state, onAdd, onUpdate, onDelete, onPayment }: Props) {
  const c = useTheme()
  const accounts = state.accounts.filter(a => a.is_active)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BForm>(EMPTY_BFORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [payTarget, setPayTarget] = useState<Borrowing | null>(null)
  const [payForm, setPayForm] = useState<PayForm>(EMPTY_PAY)
  const [paying, setPaying] = useState(false)

  const openAdd = () => { setEditingId(null); setForm(EMPTY_BFORM); setSheetOpen(true) }
  const openEdit = (b: Borrowing) => {
    setEditingId(b.id)
    setForm({ person_name: b.person_name, total_amount: String(b.total_amount), paid_amount: String(b.paid_amount), notes: b.notes || '' })
    setSheetOpen(true)
  }
  const closeSheet = () => { setSheetOpen(false); setEditingId(null); setForm(EMPTY_BFORM) }

  const openPay = (b: Borrowing) => {
    setPayTarget(b)
    setPayForm({ amount: String(b.remaining_amount || 0), account_id: accounts[0]?.id || '', incoming: true })
  }
  const closePay = () => { setPayTarget(null); setPayForm(EMPTY_PAY) }

  const handleSave = async () => {
    const total = parseFloat(form.total_amount)
    const paid = parseFloat(form.paid_amount) || 0
    if (!form.person_name.trim() || isNaN(total) || total <= 0) return
    setSaving(true)
    try {
      const payload = { person_name: form.person_name.trim(), total_amount: total, paid_amount: paid, notes: form.notes || null }
      if (editingId) await onUpdate(editingId, payload)
      else await onAdd(payload)
      closeSheet()
    } catch (_) {}
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this borrowing entry?')) return
    setDeleting(id)
    try { await onDelete(id) } catch (_) {}
    setDeleting(null)
  }

  const handlePayment = async () => {
    if (!payTarget) return
    const amt = parseFloat(payForm.amount)
    if (isNaN(amt) || amt <= 0) return
    setPaying(true)
    try {
      await onPayment(payTarget, amt, payForm.account_id || null, payForm.incoming, payForm.category_id || null)
      closePay()
    } catch (_) {}
    setPaying(false)
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

  const avatarColors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899']
  const colorFor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length]

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: state.borrowings.length ? 16 : 0 }}>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Borrowing Tracker</div>
          <button
            onClick={openAdd}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: c.accentSoft, color: c.accent, cursor: 'pointer',
              font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>

        {state.borrowings.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>No entries yet. Tap + to add.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {state.borrowings.map(b => {
              const pct = b.total_amount > 0 ? Math.round((b.paid_amount / b.total_amount) * 100) : 0
              const done = (b.remaining_amount ?? (b.total_amount - b.paid_amount)) <= 0
              const col = colorFor(b.person_name)
              const isDeleting = deleting === b.id

              return (
                <div key={b.id} style={{ opacity: isDeleting ? 0.4 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                      background: col + '22', color: col,
                      font: '800 15px Plus Jakarta Sans',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {b.person_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{b.person_name}</span>
                        {done && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 999, padding: '2px 7px' }}>
                            Cleared
                          </span>
                        )}
                      </div>
                      {b.notes && <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{b.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ font: '800 16px Plus Jakarta Sans', color: done ? c.good : c.bad }}>
                        {fmt(b.remaining_amount ?? (b.total_amount - b.paid_amount))}
                      </div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>remaining</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 8, borderRadius: 999, background: c.surface2, overflow: 'hidden' }}>
                    <div style={{ width: Math.min(100, pct) + '%', height: '100%', borderRadius: 999, background: done ? c.good : col, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ font: '600 11.5px Plus Jakarta Sans', color: c.good }}>Paid {fmt(b.paid_amount)}</span>
                    <span style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>of {fmt(b.total_amount)} · {pct}%</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {!done && (
                      <button
                        onClick={() => openPay(b)}
                        style={{
                          background: c.goodSoft, color: c.good, border: 'none',
                          borderRadius: 8, padding: '5px 10px',
                          font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
                        }}
                      >
                        ₹ Record Payment
                      </button>
                    )}
                    <button onClick={() => openEdit(b)} style={{ background: c.surface2, color: c.muted, border: 'none', borderRadius: 8, padding: '5px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(b.id)} style={{ background: 'none', color: c.bad + '99', border: 'none', borderRadius: 8, padding: '5px 0', font: '600 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Add / Edit Sheet */}
      {sheetOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={closeSheet} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto', maxHeight: '88svh' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>
              {editingId ? 'Edit Entry' : 'Add Borrowing'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Person name</label>
                <input value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))}
                  placeholder="e.g. Rahul, Noushad" style={inp} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Total amount</label>
                  <input type="number" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                    placeholder="0" min="0" step="0.01" style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Already paid</label>
                  <input type="number" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))}
                    placeholder="0" min="0" step="0.01" style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Notes (optional)</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Lent in April, repaying monthly" style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeSheet} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Sheet */}
      {payTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={closePay} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Record Payment</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3, marginBottom: 16 }}>
              {payTarget.person_name} · Remaining {fmt(payTarget.remaining_amount ?? (payTarget.total_amount - payTarget.paid_amount))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Payment amount</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0" min="0" step="0.01" style={inp} autoFocus />
              </div>

              <div>
                <label style={lbl}>Direction</label>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {([true, false] as const).map(v => (
                    <button key={String(v)} type="button" onClick={() => setPayForm(f => ({ ...f, incoming: v }))} style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px',
                      font: '700 12px Plus Jakarta Sans',
                      background: payForm.incoming === v ? (v ? c.good : c.bad) : 'transparent',
                      color: payForm.incoming === v ? '#fff' : c.muted,
                      cursor: 'pointer',
                    }}>
                      {v ? '↓ Receiving' : '↑ Paying out'}
                    </button>
                  ))}
                </div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
                  {payForm.incoming ? 'They paid you back → your balance increases' : 'You paid them → your balance decreases'}
                </div>
              </div>

              <div>
                <label style={lbl}>Account (optional)</label>
                <select value={payForm.account_id} onChange={e => setPayForm(f => ({ ...f, account_id: e.target.value }))} style={inp}>
                  <option value="">No account update</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Category (optional)</label>
                <select value={payForm.category_id} onChange={e => setPayForm(f => ({ ...f, category_id: e.target.value }))} style={inp}>
                  <option value="">No category</option>
                  {state.groups.map(g => (
                    <optgroup key={g.id} label={g.name}>
                      {state.categories.filter(c => c.group_name === g.name).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closePay} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handlePayment} disabled={paying} style={{ flex: 2, background: c.good, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.7 : 1 }}>
                {paying ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
