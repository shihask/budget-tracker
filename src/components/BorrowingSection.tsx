import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import { CategorySelect } from './CategorySelect'
import type { AppState, Borrowing } from '@/types'

type BForm = {
  person_name: string
  total_amount: string
  paid_amount: string
  notes: string
  direction: 'lent' | 'borrowed'
  account_id: string
}

type PayForm = {
  amount: string
  account_id: string
  category_id: string
  incoming: boolean
}

const EMPTY_BFORM: BForm = { person_name: '', total_amount: '', paid_amount: '0', notes: '', direction: 'lent', account_id: '' }
const EMPTY_PAY: PayForm = { amount: '', account_id: '', category_id: '', incoming: true }

interface Props {
  state: AppState
  onAdd: (form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' }, addTransaction: boolean, accountId: string | null) => Promise<void>
  onUpdate: (id: string, form: { person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' }) => Promise<void>
  onDelete: (id: string, deleteTransactions: boolean) => Promise<void>
  onPayment: (b: Borrowing, amount: number, accountId: string | null, incoming: boolean, categoryId: string | null, addTransaction: boolean) => Promise<void>
  onAddCategory: (name: string, group_name: string) => Promise<void>
}

export function BorrowingSection({ state, onAdd, onUpdate, onDelete, onPayment, onAddCategory }: Props) {
  const c = useTheme()
  const accounts = state.accounts.filter(a => a.is_active)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BForm>(EMPTY_BFORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState<string | null>(null)

  // Payment sheet
  const [payTarget, setPayTarget] = useState<Borrowing | null>(null)
  const [payForm, setPayForm] = useState<PayForm>(EMPTY_PAY)
  const [paying, setPaying] = useState(false)

  // Confirmation modals
  const [addConfirm, setAddConfirm] = useState(false)       // new entry: record as income?
  const [payConfirm, setPayConfirm] = useState(false)       // payment: record as expense/income?
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null) // delete: also delete txns?
  const [pendingAddForm, setPendingAddForm] = useState<{ person_name: string; total_amount: number; paid_amount: number; notes: string | null; direction: 'lent' | 'borrowed' } | null>(null)

  const openAdd = () => { setEditingId(null); setForm({ ...EMPTY_BFORM, account_id: accounts[0]?.id || '' }); setSheetOpen(true) }
  const openEdit = (b: Borrowing) => {
    setEditingId(b.id)
    setForm({ person_name: b.person_name, total_amount: String(b.total_amount), paid_amount: String(b.paid_amount), notes: b.notes || '', direction: b.direction || 'lent', account_id: accounts[0]?.id || '' })
    setSheetOpen(true)
  }
  const closeSheet = () => { setSheetOpen(false); setEditingId(null); setForm(EMPTY_BFORM) }

  const openPay = (b: Borrowing) => {
    setPayTarget(b)
    const incoming = (b.direction || 'lent') === 'lent'
    setPayForm({ amount: String(b.remaining_amount || 0), account_id: accounts[0]?.id || '', category_id: '', incoming })
  }
  const closePay = () => { setPayTarget(null); setPayForm(EMPTY_PAY) }

  // ── Save new/edit entry ───────────────────────────────────────────────────────
  const handleSave = async () => {
    const total = parseFloat(form.total_amount)
    const paid = parseFloat(form.paid_amount) || 0
    if (!form.person_name.trim() || isNaN(total) || total <= 0) return
    const payload = { person_name: form.person_name.trim(), total_amount: total, paid_amount: paid, notes: form.notes || null, direction: form.direction }

    if (!editingId && form.direction === 'borrowed') {
      // New borrowed entry — ask if we should record as income
      setPendingAddForm(payload)
      setAddConfirm(true)
      return
    }

    setSaving(true)
    try {
      if (editingId) await onUpdate(editingId, payload)
      else await onAdd(payload, false, null)
      closeSheet()
    } catch (_) {}
    setSaving(false)
  }

  const doAdd = async (addAsIncome: boolean) => {
    if (!pendingAddForm) return
    setSaving(true)
    setAddConfirm(false)
    try {
      await onAdd(pendingAddForm, addAsIncome, addAsIncome ? form.account_id || null : null)
      closeSheet()
    } catch (_) {}
    setSaving(false)
    setPendingAddForm(null)
  }

  // ── Delete entry ─────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    setDeleteConfirm(id)
  }

  const doDelete = async (id: string, deleteTransactions: boolean) => {
    setDeleting(id)
    setDeleteConfirm(null)
    try { await onDelete(id, deleteTransactions) } catch (_) {}
    setDeleting(null)
  }

  // ── Record payment ───────────────────────────────────────────────────────────
  const handlePayment = async () => {
    if (!payTarget) return
    const amt = parseFloat(payForm.amount)
    if (isNaN(amt) || amt <= 0) return
    setPayConfirm(true)
  }

  const doPayment = async (addTransaction: boolean) => {
    if (!payTarget) return
    const amt = parseFloat(payForm.amount)
    setPaying(true)
    setPayConfirm(false)
    try {
      await onPayment(payTarget, amt, payForm.account_id || null, payForm.incoming, payForm.category_id || null, addTransaction)
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

  const ConfirmModal = ({ title, message, yesLabel, noLabel, onYes, onNo, yesColor }: {
    title: string; message: React.ReactNode; yesLabel: string; noLabel: string
    onYes: () => void; onNo: () => void; yesColor?: string
  }) => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onNo} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>{title}</div>
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onYes} style={{ width: '100%', background: yesColor || c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
            {yesLabel}
          </button>
          <button onClick={onNo} style={{ width: '100%', background: c.surface2, color: c.muted, border: 'none', borderRadius: 12, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
            {noLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: state.borrowings.length ? 16 : 0 }}>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Borrowing Tracker</div>
          <button onClick={openAdd} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
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
              const direction = b.direction || 'lent'
              const remaining = fmt(b.remaining_amount ?? (b.total_amount - b.paid_amount))
              const infoText = direction === 'lent'
                ? `You gave money to ${b.person_name}. ${done ? 'Fully paid back.' : `${b.person_name} owes you ${remaining}.`}`
                : `${b.person_name} gave money to you. ${done ? 'Fully repaid.' : `You owe ${b.person_name} ${remaining}.`}`

              return (
                <div
                  key={b.id}
                  onClick={() => openEdit(b)}
                  style={{ opacity: isDeleting ? 0.4 : 1, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0, background: col + '22', color: col, font: '800 15px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {b.person_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{b.person_name}</span>
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: direction === 'lent' ? c.good : c.bad, background: direction === 'lent' ? c.goodSoft : c.badSoft, borderRadius: 999, padding: '2px 7px' }}>
                          {direction === 'lent' ? 'Lent' : 'Borrowed'}
                        </span>
                        <button type="button" onClick={e => { e.stopPropagation(); setInfoOpen(infoOpen === b.id ? null : b.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: c.muted }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                          </svg>
                        </button>
                        {done && <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, background: c.goodSoft, borderRadius: 999, padding: '2px 7px' }}>Cleared</span>}
                      </div>
                      {infoOpen === b.id && (
                        <div style={{ marginTop: 6, background: c.surface2, borderRadius: 10, padding: '8px 10px', font: '600 12px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5, border: `1px solid ${c.faint}` }}>
                          {infoText}
                        </div>
                      )}
                      {b.notes && <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{b.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ font: '800 16px Plus Jakarta Sans', color: done ? c.good : c.bad }}>
                        {fmt(b.remaining_amount ?? (b.total_amount - b.paid_amount))}
                      </div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>remaining</div>
                    </div>
                  </div>

                  <div style={{ height: 8, borderRadius: 999, background: c.surface2, overflow: 'hidden' }}>
                    <div style={{ width: Math.min(100, pct) + '%', height: '100%', borderRadius: 999, background: done ? c.good : col, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ font: '600 11.5px Plus Jakarta Sans', color: c.good }}>Paid {fmt(b.paid_amount)}</span>
                    <span style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>of {fmt(b.total_amount)} · {pct}%</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    {!done && (
                      <button onClick={e => { e.stopPropagation(); openPay(b) }} style={{ background: c.goodSoft, color: c.good, border: 'none', borderRadius: 8, padding: '5px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}>
                        ₹ Record Payment
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(b.id) }}
                      disabled={isDeleting}
                      style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginLeft: 'auto' }}
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
      </Card>

      {/* ── Add / Edit Sheet ──────────────────────────────────────────────────── */}
      {sheetOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={closeSheet} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', maxWidth: 600, width: '100%', margin: '0 auto', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto', maxHeight: '88svh' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>
              {editingId ? 'Edit Entry' : 'Add Borrowing'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Direction */}
              <div>
                <label style={lbl}>Type</label>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {(['lent', 'borrowed'] as const).map(d => (
                    <button key={d} type="button" onClick={() => setForm(f => ({ ...f, direction: d }))} style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px',
                      font: '700 12px Plus Jakarta Sans',
                      background: form.direction === d ? (d === 'lent' ? c.good : c.bad) : 'transparent',
                      color: form.direction === d ? '#fff' : c.muted, cursor: 'pointer',
                    }}>
                      {d === 'lent' ? '↑ I gave money' : '↓ I received money'}
                    </button>
                  ))}
                </div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
                  {form.direction === 'lent' ? 'You gave money — they owe you' : 'You received money — you owe them'}
                </div>
              </div>
              <div>
                <label style={lbl}>Person name</label>
                <input value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))}
                  placeholder="e.g. Noushad" style={inp} />
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
              {/* Account — shown for new borrowed entries */}
              {!editingId && form.direction === 'borrowed' && (
                <div>
                  <label style={lbl}>Account received into (for income record)</label>
                  <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} style={inp}>
                    <option value="">No account</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
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

      {/* ── Record Payment Sheet ──────────────────────────────────────────────── */}
      {payTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={closePay} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', maxWidth: 600, width: '100%', margin: '0 auto', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Record Payment</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 3, marginBottom: 16 }}>
              {payTarget.person_name} · Remaining {fmt(payTarget.remaining_amount ?? (payTarget.total_amount - payTarget.paid_amount))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Payment amount</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0" min="0" step="0.01" style={inp} />
              </div>
              <div>
                <label style={lbl}>Direction</label>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {([true, false] as const).map(v => (
                    <button key={String(v)} type="button" onClick={() => setPayForm(f => ({ ...f, incoming: v }))} style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px',
                      font: '700 12px Plus Jakarta Sans',
                      background: payForm.incoming === v ? (v ? c.good : c.bad) : 'transparent',
                      color: payForm.incoming === v ? '#fff' : c.muted, cursor: 'pointer',
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
                <label style={lbl}>Account</label>
                <select value={payForm.account_id} onChange={e => setPayForm(f => ({ ...f, account_id: e.target.value }))} style={inp}>
                  <option value="">No account update</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Category (optional)</label>
                <CategorySelect value={payForm.category_id} onChange={v => setPayForm(f => ({ ...f, category_id: v }))}
                  state={state} onAddCategory={onAddCategory} style={inp} includeEmpty emptyLabel="No category" />
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

      {/* ── Confirm: new borrowed entry → record as income? ───────────────────── */}
      {addConfirm && pendingAddForm && (
        <ConfirmModal
          title="Record as income?"
          message={<><strong style={{ color: c.ink }}>{pendingAddForm.person_name}</strong> gave you <strong style={{ color: c.ink }}>{fmt(pendingAddForm.total_amount)}</strong>. Do you want to add this as an income transaction?</>}
          yesLabel="✓ Yes, add as income"
          noLabel="No, just track it"
          yesColor={c.good}
          onYes={() => doAdd(true)}
          onNo={() => doAdd(false)}
        />
      )}

      {/* ── Confirm: payment → record as expense/income? ──────────────────────── */}
      {payConfirm && payTarget && (
        <ConfirmModal
          title={payForm.incoming ? 'Record as income?' : 'Record as expense?'}
          message={
            payForm.incoming
              ? <><strong style={{ color: c.ink }}>{payTarget.person_name}</strong> paid you back <strong style={{ color: c.ink }}>{fmt(parseFloat(payForm.amount))}</strong>. Add this to your income transactions?</>
              : <>You're paying <strong style={{ color: c.ink }}>{fmt(parseFloat(payForm.amount))}</strong> to <strong style={{ color: c.ink }}>{payTarget.person_name}</strong>. Add this as an expense transaction?</>
          }
          yesLabel={payForm.incoming ? '✓ Yes, add as income' : '✓ Yes, add as expense'}
          noLabel="No, just update tracker"
          yesColor={payForm.incoming ? c.good : c.accent}
          onYes={() => doPayment(true)}
          onNo={() => doPayment(false)}
        />
      )}

      {/* ── Confirm: delete entry → also delete transactions? ─────────────────── */}
      {deleteConfirm && (
        <ConfirmModal
          title="Delete borrowing entry?"
          message="Do you also want to delete all transactions linked to this borrowing entry?"
          yesLabel="Delete entry + transactions"
          noLabel="Delete entry only"
          yesColor={c.bad}
          onYes={() => doDelete(deleteConfirm, true)}
          onNo={() => doDelete(deleteConfirm, false)}
        />
      )}
    </>
  )
}
