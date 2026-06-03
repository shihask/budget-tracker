import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { ACC_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { Glyph } from './Glyph'
import type { AppState } from '@/types'
import type { GlyphName } from './Glyph'

const TYPE_ICON: Record<string, GlyphName> = {
  bank: 'shield', cash: 'wallet', credit_card: 'doc',
}
const TYPE_LABEL: Record<string, string> = {
  bank: 'Bank account', cash: 'Cash in hand', credit_card: 'Credit card',
}

interface AccountsSectionProps {
  state: AppState
  onAdjustBalance: (accountId: string, newBalance: number) => Promise<void>
}

export function AccountsSection({ state, onAdjustBalance }: AccountsSectionProps) {
  const c = useTheme()
  const accs = state.accounts.filter(a => a.is_active)
  const total = accs.reduce((s, a) => s + a.current_balance, 0) || 1

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = (id: string, current: number) => {
    setEditingId(id)
    setEditValue(String(current))
  }

  const cancelEdit = () => { setEditingId(null); setEditValue('') }

  const confirmEdit = async (id: string) => {
    const n = parseFloat(editValue)
    if (isNaN(n)) return
    setSaving(true)
    try { await onAdjustBalance(id, n) } catch (_) {}
    setSaving(false)
    setEditingId(null)
    setEditValue('')
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Accounts</div>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(total)}</div>
      </div>

      {/* distribution bar */}
      <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
        {accs.map(a => {
          const color = ACC_COLORS[a.name] || c.accent
          return (
            <div key={a.id} style={{ width: (a.current_balance / total) * 100 + '%', background: color }} />
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {accs.map(a => {
          const color = ACC_COLORS[a.name] || c.accent
          const share = Math.round((a.current_balance / total) * 100)
          const isEditing = editingId === a.id

          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: color + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
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
                    autoFocus
                    type="number"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmEdit(a.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    style={{
                      width: 100, background: c.surface2, border: `1.5px solid ${c.accent}`,
                      borderRadius: 8, padding: '5px 8px',
                      font: '700 13px Plus Jakarta Sans', color: c.ink,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={() => confirmEdit(a.id)}
                    disabled={saving}
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: 'none',
                      background: c.good, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: 'none',
                      background: c.surface2, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>
                    {fmt(a.current_balance, { decimals: a.current_balance % 1 ? 2 : 0 })}
                  </div>
                  <button
                    onClick={() => startEdit(a.id, a.current_balance)}
                    title="Adjust balance"
                    style={{
                      width: 26, height: 26, borderRadius: 8, border: 'none',
                      background: c.surface2, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
