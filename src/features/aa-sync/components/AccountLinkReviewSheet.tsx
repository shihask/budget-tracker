import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { BottomSheet } from '@/components/BottomSheet'
import { suggestAccountLink, defaultAccountName } from '../lib/accountLinking'
import type { Account } from '@/types'

interface UnlinkedSyncAccount {
  provider: string
  provider_connection_id: string
  provider_account_id: string
  masked_acc_number: string | null
  pending_count: number
  oldest_pending_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  accounts: Pick<Account, 'id' | 'name' | 'type'>[]
  onLinked: () => void // re-triggers useSyncPromotion.drain — linking writes account_connections, not sync_events, so the promotion loop's own realtime subscription never fires for it
}

export function AccountLinkReviewSheet({ open, onClose, accounts, onLinked }: Props) {
  const c = useTheme()
  const [rows, setRows] = useState<UnlinkedSyncAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [creatingKey, setCreatingKey] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase.rpc('mp_list_unlinked_sync_accounts')
    if (!error) setRows((data as UnlinkedSyncAccount[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (open) fetchRows()
  }, [open])

  const rowKey = (r: UnlinkedSyncAccount) => `${r.provider_connection_id}:${r.provider_account_id}`

  async function linkExisting(row: UnlinkedSyncAccount, accountId: string) {
    setBusyKey(rowKey(row))
    setError(null)
    try {
      const { error } = await supabase.rpc('mp_link_sync_account', {
        p_provider: row.provider,
        p_provider_connection_id: row.provider_connection_id,
        p_provider_account_id: row.provider_account_id,
        p_existing_account_id: accountId,
        p_new_account: null,
        p_provider_metadata: row.masked_acc_number ? { maskedAccNumber: row.masked_acc_number } : {},
      })
      if (error) throw error
      setRows(prev => prev.filter(r => rowKey(r) !== rowKey(row)))
      onLinked()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link account')
    } finally {
      setBusyKey(null)
    }
  }

  async function createSeparate(row: UnlinkedSyncAccount) {
    const name = newName.trim() || defaultAccountName(row.masked_acc_number ?? '')
    setBusyKey(rowKey(row))
    setError(null)
    try {
      const { error } = await supabase.rpc('mp_link_sync_account', {
        p_provider: row.provider,
        p_provider_connection_id: row.provider_connection_id,
        p_provider_account_id: row.provider_account_id,
        p_existing_account_id: null,
        p_new_account: { name, type: 'bank', current_balance: 0 },
        p_provider_metadata: row.masked_acc_number ? { maskedAccNumber: row.masked_acc_number } : {},
      })
      if (error) throw error
      setRows(prev => prev.filter(r => rowKey(r) !== rowKey(row)))
      setCreatingKey(null)
      setNewName('')
      onLinked()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create account')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Confirm bank accounts</div>
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
          These synced accounts look like ones you already track manually. Confirm the match or keep them separate.
        </div>

        {loading && rows.length === 0 && (
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '16px 0' }}>Loading…</div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '16px 0' }}>
            Nothing waiting on review.
          </div>
        )}

        {error && (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: '#ef4444', marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(row => {
            const key = rowKey(row)
            const suggestion = row.masked_acc_number ? suggestAccountLink(row.masked_acc_number, accounts) : null
            const suggestedAccount = suggestion ? accounts.find(a => a.id === suggestion.accountId) : null
            const isBusy = busyKey === key
            const isCreating = creatingKey === key

            return (
              <div key={key} style={{ padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${c.faint}`, background: c.surface2 }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                  Bank account {row.masked_acc_number ? `···${row.masked_acc_number.match(/[^X]+$/)?.[0] ?? ''}` : ''}
                </div>
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginBottom: 10 }}>
                  {row.pending_count} item{row.pending_count === 1 ? '' : 's'} waiting — balances, transactions, or profile updates
                </div>

                {suggestedAccount && !isCreating && (
                  <button
                    onClick={() => linkExisting(row, suggestedAccount.id)}
                    disabled={isBusy}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                      background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans',
                      cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1, marginBottom: 8,
                    }}
                  >
                    {isBusy ? 'Linking…' : `This is "${suggestedAccount.name}"`}
                  </button>
                )}

                {!isCreating ? (
                  <button
                    onClick={() => { setCreatingKey(key); setNewName(defaultAccountName(row.masked_acc_number ?? '')) }}
                    disabled={isBusy}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10, border: `1.5px solid ${c.faint}`,
                      background: 'transparent', color: c.muted, font: '700 13px Plus Jakarta Sans',
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Keep as a separate account
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Account name"
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10,
                        border: `1.5px solid ${c.faint}`, background: c.surface,
                        font: '600 13px Plus Jakarta Sans', color: c.ink, outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => createSeparate(row)}
                      disabled={isBusy || !newName.trim()}
                      style={{
                        padding: '10px 16px', borderRadius: 10, border: 'none',
                        background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans',
                        cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.7 : 1, flexShrink: 0,
                      }}
                    >
                      {isBusy ? '…' : 'Create'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
