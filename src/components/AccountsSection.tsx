import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { ACC_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { Glyph } from './Glyph'
import type { AppState, AccountType } from '@/types'
import type { GlyphName } from './Glyph'

const TYPE_ICON: Record<string, GlyphName> = {
  bank: 'shield', cash: 'wallet', credit_card: 'doc',
}
const TYPE_LABEL: Record<string, string> = {
  bank: 'Bank account', cash: 'Cash in hand', credit_card: 'Credit card',
}

type AForm = { name: string; type: AccountType; current_balance: string }
const EMPTY: AForm = { name: '', type: 'bank', current_balance: '' }

interface AccountsSectionProps {
  state: AppState
  onAdjustBalance: (id: string, n: number) => Promise<void>
  onAddAccount: (form: { name: string; type: string; current_balance: number }) => Promise<void>
  onDeleteAccount: (id: string) => Promise<void>
}

export function AccountsSection({ state, onAdjustBalance, onAddAccount, onDeleteAccount }: AccountsSectionProps) {
  const c = useTheme()
  const accs = state.accounts.filter(a => a.is_active)
  const totalPos = accs.reduce((s, a) => s + Math.max(0, a.current_balance), 0) || 1
  const total = accs.reduce((s, a) => s + a.current_balance, 0)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<AForm>(EMPTY)
  const [adding, setAdding] = useState(false)

  const startEdit = (id: string, current: number) => { setEditingId(id); setEditValue(String(current)) }
  const cancelEdit = () => { setEditingId(null); setEditValue('') }

  const confirmEdit = async (id: string) => {
    const n = parseFloat(editValue)
    if (isNaN(n)) return
    setSaving(true)
    try { await onAdjustBalance(id, n) } catch (_) {}
    setSaving(false)
    setEditingId(null); setEditValue('')
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? Its transaction history will be kept.`)) return
    setDeleting(id)
    try { await onDeleteAccount(id) } catch (_) {}
    setDeleting(null)
  }

  const handleAdd = async () => {
    const bal = parseFloat(form.current_balance) || 0
    if (!form.name.trim()) return
    setAdding(true)
    try {
      await onAddAccount({ name: form.name.trim(), type: form.type, current_balance: bal })
      setSheetOpen(false); setForm(EMPTY)
    } catch (_) {}
    setAdding(false)
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

  return (
    <>
      <Card>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Accounts</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{fmt(total)}</div>
          </div>
          <button
            onClick={() => { setForm(EMPTY); setSheetOpen(true) }}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: c.accentSoft, color: c.accent, cursor: 'pointer',
              font: '700 20px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>

        {/* Distribution bar */}
        {accs.length > 0 && (
          <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
            {accs.map(a => {
              const color = ACC_COLORS[a.name] || c.accent
              const w = Math.max(0, a.current_balance) / totalPos * 100
              return <div key={a.id} style={{ width: w + '%', background: color }} />
            })}
          </div>
        )}

        {accs.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '8px 0' }}>
            No accounts yet. Tap + to add one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accs.map(a => {
              const color = ACC_COLORS[a.name] || c.accent
              const share = Math.round(Math.max(0, a.current_balance) / totalPos * 100)
              const isEditing = editingId === a.id
              const isDeleting = deleting === a.id

              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: isDeleting ? 0.4 : 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Glyph name={TYPE_ICON[a.type] || 'wallet'} color={color} size={18} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{a.name}</div>
                    <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>
                      {TYPE_LABEL[a.type]} · {share}%
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>₹</span>
                      <input
                        type="number" value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmEdit(a.id); if (e.key === 'Escape') cancelEdit() }}
                        style={{ width: 100, background: c.surface2, border: `1.5px solid ${c.accent}`, borderRadius: 8, padding: '5px 8px', font: '700 13px Plus Jakarta Sans', color: c.ink, outline: 'none', boxSizing: 'border-box' }}
                      />
                      <button onClick={() => confirmEdit(a.id)} disabled={saving} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: c.good, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </button>
                      <button onClick={cancelEdit} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>
                        {fmt(a.current_balance, { decimals: a.current_balance % 1 ? 2 : 0 })}
                      </div>
                      {/* Edit balance */}
                      <button onClick={() => startEdit(a.id, a.current_balance)} title="Adjust balance"
                        style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      {/* Delete */}
                      <button onClick={() => handleDelete(a.id, a.name)} disabled={isDeleting} title="Remove account"
                        style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.bad + 'BB'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Add Account Sheet */}
      {sheetOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setSheetOpen(false)} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', maxWidth: 600, width: '100%', margin: '0 auto', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Add Account</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Account name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Axis Bank, Cash" style={inp} />
              </div>

              <div>
                <label style={lbl}>Type</label>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {(['bank', 'cash'] as AccountType[]).map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px 4px',
                      font: '700 11px Plus Jakarta Sans',
                      background: form.type === t ? c.accent : 'transparent',
                      color: form.type === t ? '#fff' : c.muted,
                      cursor: 'pointer',
                    }}>
                      {t === 'bank' ? 'Bank' : 'Cash'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Opening balance</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                  <input type="number" value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="0" min="0" step="0.01"
                    style={{ ...inp, paddingLeft: 28 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setSheetOpen(false)} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={adding || !form.name.trim()} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.7 : 1 }}>
                {adding ? 'Adding...' : 'Add Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
