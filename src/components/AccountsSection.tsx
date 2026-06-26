import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { fmt } from '@/lib/utils'
import { ACCOUNT_PALETTE } from '@/lib/tokens'
import { Card } from './Card'
import { Glyph } from './Glyph'
import { BottomSheet, HelpText } from './BottomSheet'
import type { AppState, AccountType } from '@/types'
import type { GlyphName } from './Glyph'

const TYPE_ICON: Record<string, GlyphName> = {
  bank: 'shield', cash: 'wallet', credit_card: 'doc', wallet: 'spark',
}
const TYPE_LABEL: Record<string, string> = {
  bank: 'Bank account', cash: 'Cash in hand', credit_card: 'Credit card', wallet: 'Wallet',
}

type AForm = { name: string; type: AccountType; current_balance: string }
const EMPTY: AForm = { name: '', type: 'bank', current_balance: '' }

interface AccountsSectionProps {
  state: AppState
  onUpdateAccount: (id: string, form: { name: string; type: string; current_balance: number }) => Promise<void>
  onAddAccount: (form: { name: string; type: string; current_balance: number }) => Promise<void>
  onDeleteAccount: (id: string) => Promise<void>
  onAdjustBalance: (accountId: string, actualBalance: number) => Promise<void>
  onAddTransaction?: () => void
}

export function AccountsSection({ state, onUpdateAccount, onAddAccount, onDeleteAccount, onAdjustBalance, onAddTransaction }: AccountsSectionProps) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const accs = state.accounts.filter(a => a.is_active)
  const totalPos = accs.reduce((s, a) => s + Math.max(0, a.current_balance), 0) || 1
  const total = accs.reduce((s, a) => s + a.current_balance, 0)

  const [deleting, setDeleting] = useState<string | null>(null)
  const [blockSheet, setBlockSheet] = useState<{ name: string; count: number } | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<AForm>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<AForm>(EMPTY)
  const [saving, setSaving] = useState(false)

  const [adjustSheetOpen, setAdjustSheetOpen] = useState(false)
  const [adjustAccount, setAdjustAccount] = useState<AppState['accounts'][0] | null>(null)
  const [adjustInput, setAdjustInput] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustDone, setAdjustDone] = useState(false)

  const openAdjust = (a: AppState['accounts'][0]) => {
    setAdjustAccount(a)
    setAdjustInput(String(a.current_balance))
    setAdjustDone(false)
    setAdjustSheetOpen(true)
  }

  const handleAdjust = async () => {
    if (!adjustAccount) return
    const actual = parseFloat(adjustInput)
    if (isNaN(actual)) return
    setAdjusting(true)
    try {
      await onAdjustBalance(adjustAccount.id, actual)
      setAdjustDone(true)
    } catch (_) {}
    setAdjusting(false)
  }

  const openEditSheet = (a: { id: string; name: string; type: AccountType; current_balance: number }) => {
    setEditingId(a.id)
    setEditForm({ name: a.name, type: a.type, current_balance: String(a.current_balance) })
    setEditSheetOpen(true)
  }
  const closeEditSheet = () => { setEditSheetOpen(false); setEditingId(null) }

  const handleEditSave = async () => {
    if (!editingId) return
    const bal = parseFloat(editForm.current_balance)
    if (!editForm.name.trim() || isNaN(bal)) return
    setSaving(true)
    try {
      await onUpdateAccount(editingId, { name: editForm.name.trim(), type: editForm.type, current_balance: bal })
      closeEditSheet()
    } catch (_) {}
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    const txCount = state.transactions.filter(
      t => t.from_account_id === id || t.to_account_id === id
    ).length
    if (txCount > 0) {
      setBlockSheet({ name, count: txCount })
      return
    }
    if (!await confirm(`Remove "${name}"? This cannot be undone.`, { confirmLabel: 'Remove' })) return
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="22" x2="21" y2="22"/><rect x="2" y="10" width="20" height="12" rx="1"/><path d="M12 2L2 10h20L12 2z"/><line x1="8" y1="14" x2="8" y2="22"/><line x1="16" y1="14" x2="16" y2="22"/>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Accounts</div>
                <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </button>
              </div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{fmt(total)}</div>
            </div>
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
            {accs.map((a, i) => {
              const color = ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]
              const w = Math.max(0, a.current_balance) / totalPos * 100
              return <div key={a.id} style={{ width: w + '%', background: color }} />
            })}
          </div>
        )}

        {accs.length === 0 ? (
          <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><Landmark size={28} color="#A09890" /></div>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>No accounts yet</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>Add a bank account or cash wallet to track where your money lives.</div>
            <button
              onClick={() => setSheetOpen(true)}
              style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              Add Account
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accs.map((a, i) => {
              const color = ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]
              const share = Math.round(Math.max(0, a.current_balance) / totalPos * 100)
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>
                      {fmt(a.current_balance, { decimals: a.current_balance % 1 ? 2 : 0 })}
                    </div>
                    <button onClick={() => openAdjust(a)} title="Adjust balance"
                      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                      </svg>
                    </button>
                    <button onClick={() => openEditSheet(a)} title="Edit account"
                      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(a.id, a.name)} disabled={isDeleting} title="Remove account"
                      style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: c.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.bad + 'BB'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Info popup */}
      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Accounts</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
                  title: 'Bank & Cash',
                  desc: 'Add every account you own — savings, current, wallet, or cash in hand. The total is your Actual Balance.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
                  title: 'Adjust balance',
                  desc: 'Use the edit pencil to correct a balance at any time — transactions are kept, only the snapshot changes.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
                  title: 'Balance bar',
                  desc: 'The coloured bar shows how your wealth is distributed across accounts proportionally.',
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
                Account balances feed directly into <strong style={{ color: c.ink }}>Actual Balance</strong> and all downstream metrics.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* Block delete — account has transactions */}
      {blockSheet && (
        <div onClick={() => setBlockSheet(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.bad + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.bad} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>Cannot delete account</div>
            </div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 12 }}>
              <strong style={{ color: c.ink }}>{blockSheet.name}</strong> has {blockSheet.count} transaction{blockSheet.count !== 1 ? 's' : ''} associated with it.
            </div>
            <div style={{ background: c.surface2, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>To delete this account, first:</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.8 }}>
                • Move transactions to another account, or<br />
                • Delete those transactions
              </div>
            </div>
            <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Account deletion is only allowed for accounts with no transaction history.
            </div>
            <button onClick={() => setBlockSheet(null)} style={{ width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* Edit Account Sheet */}
      <BottomSheet open={editSheetOpen} onClose={closeEditSheet}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Edit Account</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Account name</label>
                <HelpText>A recognizable name for this account. e.g. Axis Bank, SBI Savings, Cash.</HelpText>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Axis Bank" style={inp} />
              </div>

              <div>
                <label style={lbl}>Type</label>
                <HelpText>Bank: savings or current account. Cash: physical cash. Wallet: UPI wallets like PhonePe or GPay.</HelpText>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {(['bank', 'cash', 'wallet'] as AccountType[]).map(t => (
                    <button key={t} type="button" onClick={() => setEditForm(f => ({ ...f, type: t }))} style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px 4px',
                      font: '700 11px Plus Jakarta Sans',
                      background: editForm.type === t ? c.accent : 'transparent',
                      color: editForm.type === t ? '#fff' : c.muted,
                      cursor: 'pointer',
                    }}>
                      {t === 'bank' ? 'Bank' : t === 'cash' ? 'Cash' : 'Wallet'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Balance</label>
                <HelpText>Current balance in this account right now.</HelpText>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                  <input type="number" inputMode="decimal" value={editForm.current_balance}
                    onChange={e => setEditForm(f => ({ ...f, current_balance: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                    placeholder="0" min="0" step="0.01"
                    style={{ ...inp, paddingLeft: 28 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeEditSheet} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleEditSave} disabled={saving || !editForm.name.trim()} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
      </BottomSheet>

      {/* Adjust Balance Sheet */}
      <BottomSheet open={adjustSheetOpen} onClose={() => { setAdjustSheetOpen(false); setAdjustDone(false) }}>
        {adjustAccount && (() => {
          const actual = parseFloat(adjustInput)
          const diff = isNaN(actual) ? null : actual - adjustAccount.current_balance
          const diffFmt = diff === null ? null
            : diff === 0 ? 'No change'
            : (diff > 0 ? '+' : '−') + '₹' + Math.abs(diff).toLocaleString('en-IN')
          const diffColor = diff === null || diff === 0 ? c.muted : diff > 0 ? c.good : c.bad

          return adjustDone ? (
            <div style={{ paddingBottom: 8 }}>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 6, letterSpacing: '-0.01em' }}>Balance updated</div>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20, lineHeight: 1.6 }}>
                A <strong style={{ color: c.ink }}>Balance Adjustment</strong> transaction was recorded for audit purposes. It won't affect your spending reports or budget strategy.
              </div>
              <div style={{ background: c.surface2, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>New balance</span>
                  <span style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>₹{actual.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Adjustment</span>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: diffColor }}>{diffFmt}</span>
                </div>
              </div>
              <button onClick={() => { setAdjustSheetOpen(false); setAdjustDone(false) }}
                style={{ width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          ) : (
            <div style={{ paddingBottom: 8 }}>
              <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.01em' }}>Adjust Balance</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 18, lineHeight: 1.6 }}>
                Enter the actual balance from your bank statement. A Balance Adjustment transaction will be created for the difference.
              </div>

              {/* Current vs actual */}
              <div style={{ background: c.surface2, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${c.faint}` }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>MoneyPlant balance</span>
                  <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>₹{adjustAccount.current_balance.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: diff !== null && diff !== 0 ? 10 : 0 }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Actual balance</span>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', font: '700 13px Plus Jakarta Sans', color: c.muted }}>₹</span>
                    <input
                      type="number" inputMode="decimal"
                      value={adjustInput}
                      onChange={e => setAdjustInput(e.target.value)}
                      style={{
                        background: c.surface, border: `1.5px solid ${c.faint}`,
                        borderRadius: 10, padding: '8px 10px 8px 24px',
                        font: '700 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
                        width: 130, textAlign: 'right', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
                {diff !== null && diff !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
                    <span style={{ font: '700 12px Plus Jakarta Sans', color: c.muted }}>Difference</span>
                    <span style={{ font: '800 14px Plus Jakarta Sans', color: diffColor }}>{diffFmt}</span>
                  </div>
                )}
              </div>

              {/* Two options */}
              {diff !== null && diff !== 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    How to handle this difference?
                  </div>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, padding: '10px 12px', background: c.surface2, borderRadius: 12 }}>
                    <div style={{ marginBottom: 6 }}>
                      <strong style={{ color: c.ink }}>Create Balance Adjustment</strong> — Records an adjustment transaction for audit trail. Use when you don't know the cause.
                    </div>
                    <div>
                      <strong style={{ color: c.ink }}>Add Transaction Instead</strong> — If you know what caused the difference (e.g. interest credited, bank charge), record a proper Income or Expense transaction and then return here.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                {diff !== null && diff !== 0 && onAddTransaction && (
                  <button
                    onClick={() => { setAdjustSheetOpen(false); onAddTransaction() }}
                    style={{ flex: 1, padding: '13px', borderRadius: 12, border: `1.5px solid ${c.faint}`, background: 'transparent', color: c.muted, font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
                  >
                    Add Transaction
                  </button>
                )}
                <button
                  onClick={handleAdjust}
                  disabled={adjusting || diff === null || diff === 0}
                  style={{
                    flex: 2, padding: '13px', borderRadius: 12, border: 'none',
                    background: diff !== null && diff !== 0 ? c.accent : c.faint,
                    color: diff !== null && diff !== 0 ? '#fff' : c.muted,
                    font: '700 13px Plus Jakarta Sans',
                    cursor: adjusting || diff === null || diff === 0 ? 'not-allowed' : 'pointer',
                    opacity: adjusting ? 0.7 : 1,
                  }}
                >
                  {adjusting ? 'Adjusting…' : diff === 0 ? 'No change' : 'Create Balance Adjustment'}
                </button>
              </div>
            </div>
          )
        })()}
      </BottomSheet>

      {/* Add Account Sheet */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 16, letterSpacing: '-0.02em' }}>Add Account</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Account name</label>
                <HelpText>A recognizable name for this account. e.g. Axis Bank, SBI Savings, Cash.</HelpText>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Axis Bank, Cash" style={inp} />
              </div>

              <div>
                <label style={lbl}>Type</label>
                <HelpText>Bank: savings or current account. Cash: physical cash. Wallet: UPI wallets like PhonePe or GPay.</HelpText>
                <div style={{ display: 'flex', background: c.surface2, borderRadius: 12, padding: 3, gap: 3 }}>
                  {(['bank', 'cash', 'wallet'] as AccountType[]).map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                      flex: 1, border: 'none', borderRadius: 10, padding: '9px 4px',
                      font: '700 11px Plus Jakarta Sans',
                      background: form.type === t ? c.accent : 'transparent',
                      color: form.type === t ? '#fff' : c.muted,
                      cursor: 'pointer',
                    }}>
                      {t === 'bank' ? 'Bank' : t === 'cash' ? 'Cash' : 'Wallet'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Opening balance</label>
                <HelpText>Current balance in this account right now.</HelpText>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                  <input type="number" inputMode="decimal" value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))}
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
      </BottomSheet>
      {dialogNode}
    </>
  )
}
