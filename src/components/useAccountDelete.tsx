import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import type { Account, AppState } from '@/types'

/** Remove an account: blocked while it has transactions, otherwise confirm → delete.
 *  Returns the trigger, the id being deleted, and the dialogs to render (portalled, so
 *  they're safe inside a page with `will-change: transform`). */
export function useAccountDelete(state: AppState, onDeleteAccount: (id: string) => Promise<void>) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ name: string; count: number } | null>(null)

  const requestDelete = async (a: Pick<Account, 'id' | 'name'>) => {
    const count = state.transactions.filter(t => t.from_account_id === a.id || t.to_account_id === a.id).length
    if (count > 0) { setBlocked({ name: a.name, count }); return }
    if (!await confirm(`Remove "${a.name}"? This cannot be undone.`, { confirmLabel: 'Remove' })) return
    setDeletingId(a.id)
    try { await onDeleteAccount(a.id) } catch { /* the row stays; nothing was removed */ }
    setDeletingId(null)
  }

  const deleteNode = (
    <>
      {blocked && createPortal(
        <div onClick={() => setBlocked(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
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
              <strong style={{ color: c.ink }}>{blocked.name}</strong> has {blocked.count} transaction{blocked.count !== 1 ? 's' : ''} associated with it.
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
            <button onClick={() => setBlocked(null)} style={{ width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>,
        document.body,
      )}
      {dialogNode}
    </>
  )

  return { requestDelete, deletingId, deleteNode }
}
