import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { BottomSheet } from '@/components/BottomSheet'
import { useAppDialog } from '@/components/AppDialog'
import { connectAaBank } from '../lib/connect'
import { trailingSuffix } from '../lib/accountLinking'
import { useAaSyncData, type SyncConnectionWithHealth } from '../hooks/useAaSyncData'
import type { ConnectionHealth } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  onOpenAccountLinkReview: () => void
  onOpenDedupReview: () => void
}

const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  healthy: 'Connected',
  degraded: 'Needs attention',
  failed: 'Connection failed',
  expired: 'Expired — reconnect',
  revoked: 'Disconnected — reconnect',
}

const HEALTH_DOT: Record<ConnectionHealth, string> = {
  healthy: '#22c55e',
  degraded: '#eab308',
  failed: '#ef4444',
  expired: '#ef4444',
  revoked: '#ef4444',
}

// Statuses where the connection has already stopped syncing — Remove
// Connection only makes sense here, and Reconnect replaces Disconnect.
const DISCONNECTED_STATUSES = new Set(['revoked', 'expired', 'error'])

export function ConnectBankSheet({ open, onClose, userId, onOpenAccountLinkReview, onOpenDedupReview }: Props) {
  const c = useTheme()
  const { confirm, alert, dialogNode } = useAppDialog()
  const { connections, loading, refetch } = useAaSyncData(userId)
  const [mobile, setMobile] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manageOpenId, setManageOpenId] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  // provider_connection_id -> masked account suffix, so rows can show
  // "Bank account ···af56" instead of a generic fallback once linked.
  const [maskedSuffixes, setMaskedSuffixes] = useState<Map<string, string>>(new Map())

  // Redirect-return fallback (Failure Recovery, Phase 1a plan): if we land
  // back here with ?success=true&id=... and the webhook hasn't caught up
  // yet, ask directly rather than waiting on a webhook that may never come.
  useEffect(() => {
    if (!open) return
    const params = new URLSearchParams(window.location.search)
    const connectionId = params.get('id')
    if (params.get('success') !== 'true' || !connectionId) return

    window.history.replaceState({}, '', window.location.pathname)

    const reconcile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      // Strip any trailing slash before concatenating — VITE_SUPABASE_URL
      // has one in some environments, producing a double-slash 404
      // (.co//functions/v1/...) that silently broke this reconciliation
      // call every time. Caught live via the browser console.
      const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
      await fetch(`${baseUrl}/functions/v1/aa-connect?connectionId=${connectionId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {})
      refetch()
    }
    // Small delay first — give the webhook a real chance before asking directly.
    const t = setTimeout(reconcile, 3000)
    return () => clearTimeout(t)
  }, [open])

  async function fetchMaskedSuffixes() {
    const { data } = await supabase
      .from('account_connections')
      .select('provider_connection_id, provider_metadata')
      .eq('user_id', userId)

    const map = new Map<string, string>()
    for (const row of data ?? []) {
      const masked = (row.provider_metadata as Record<string, unknown> | null)?.maskedAccNumber
      if (typeof masked === 'string') {
        const suffix = trailingSuffix(masked)
        if (suffix) map.set(row.provider_connection_id, suffix)
      }
    }
    setMaskedSuffixes(map)
  }

  useEffect(() => {
    if (!open) return
    fetchMaskedSuffixes()
  }, [open, connections.length])

  const handleConnect = async () => {
    if (!/^\d{10}$/.test(mobile) || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const { redirectUrl } = await connectAaBank(mobile)
      window.location.href = redirectUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start connection')
      setConnecting(false)
    }
  }

  function rowLabel(conn: SyncConnectionWithHealth): string {
    const suffix = maskedSuffixes.get(conn.provider_connection_id)
    if (suffix) return `Bank account ···${suffix}`
    return (conn.provider_metadata?.vua as string | undefined)?.split('@')[0] ?? 'Bank account'
  }

  async function handleDisconnect(conn: SyncConnectionWithHealth) {
    const ok = await confirm(
      `Disconnect ${rowLabel(conn)}? Future transactions won't sync automatically. Existing imported transactions will remain.`,
      { confirmLabel: 'Disconnect', danger: false }
    )
    if (!ok) return
    setActionBusyId(conn.id)
    try {
      await supabase.rpc('mp_disconnect_sync_connection', { p_connection_id: conn.id })
      setManageOpenId(null)
      await refetch()
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleRemove(conn: SyncConnectionWithHealth) {
    const ok = await confirm(
      `Remove this connection? This deletes only the sync connection. Your account and its transactions stay.`,
      { confirmLabel: 'Remove', danger: true }
    )
    if (!ok) return
    setActionBusyId(conn.id)
    try {
      await supabase.rpc('mp_remove_sync_connection', { p_connection_id: conn.id })
      setManageOpenId(null)
      await refetch()
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleDeleteImported(conn: SyncConnectionWithHealth) {
    setActionBusyId(conn.id)
    try {
      const { data: events } = await supabase
        .from('sync_events')
        .select('id')
        .eq('connection_id', conn.id)
        .eq('promotion_action', 'insert')

      const eventIds = (events ?? []).map(e => e.id)
      let previewCount = 0
      let previewTotal = 0
      if (eventIds.length > 0) {
        const { data: txns } = await supabase.from('transactions').select('amount').in('sync_event_id', eventIds)
        previewCount = txns?.length ?? 0
        previewTotal = (txns ?? []).reduce((s, t) => s + Number(t.amount), 0)
      }

      if (previewCount === 0) {
        await alert('No imported transactions to delete for this connection.')
        return
      }

      const ok = await confirm(
        `This will remove ${previewCount} imported transaction${previewCount === 1 ? '' : 's'}. Balance adjustment: −₹${previewTotal.toLocaleString('en-IN')}. This only removes transactions this specific sync created — not manual entries, not other accounts. Transactions merged with entries you already had are not affected.`,
        { confirmLabel: 'Delete', danger: true }
      )
      if (!ok) return

      const { data } = await supabase.rpc('mp_delete_synced_transactions', { p_connection_id: conn.id })
      const result = data as { deleted_count: number; total_amount: number }
      setManageOpenId(null)
      await refetch()
      await alert(`Deleted ${result.deleted_count} transaction${result.deleted_count === 1 ? '' : 's'}.`)
    } finally {
      setActionBusyId(null)
    }
  }

  function handleReconnect(conn: SyncConnectionWithHealth) {
    const vua = conn.provider_metadata?.vua as string | undefined
    const digits = vua?.split('@')[0]?.replace(/\D/g, '').slice(0, 10) ?? ''
    setMobile(digits)
    setManageOpenId(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 15px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
  }

  const actionButtonStyle: React.CSSProperties = {
    flex: 1, padding: '9px', borderRadius: 10, border: `1.5px solid ${c.faint}`,
    background: 'transparent', color: c.muted, font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Connect Bank</div>
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
          Securely link your bank account via India's RBI-regulated Account Aggregator framework. Sandbox only for now.
        </div>

        {connections.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {connections.map((conn: SyncConnectionWithHealth) => {
              const isDisconnected = DISCONNECTED_STATUSES.has(conn.status)
              const isBusy = actionBusyId === conn.id
              const isExpanded = manageOpenId === conn.id

              return (
                <div
                  key={conn.id}
                  style={{
                    padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${c.faint}`, background: c.surface2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: HEALTH_DOT[conn.health], flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rowLabel(conn)}
                      </div>
                      <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>{HEALTH_LABEL[conn.health]}</div>
                    </div>
                    <button
                      onClick={() => setManageOpenId(isExpanded ? null : conn.id)}
                      style={{
                        flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${c.faint}`,
                        background: 'transparent', color: c.muted, font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
                      }}
                    >
                      Manage
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {isDisconnected ? (
                        <>
                          <button disabled={isBusy} onClick={() => handleReconnect(conn)} style={actionButtonStyle}>Reconnect</button>
                          <button disabled={isBusy} onClick={() => handleRemove(conn)} style={actionButtonStyle}>Remove</button>
                        </>
                      ) : (
                        <button disabled={isBusy} onClick={() => handleDisconnect(conn)} style={actionButtonStyle}>Disconnect</button>
                      )}
                      <button disabled={isBusy} onClick={() => handleDeleteImported(conn)} style={{ ...actionButtonStyle, color: '#ef4444', borderColor: '#ef4444' }}>
                        {isBusy ? '…' : 'Delete data'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {connections.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              onClick={onOpenAccountLinkReview}
              style={{
                flex: 1, padding: '10px', borderRadius: 12, border: `1.5px solid ${c.faint}`,
                background: 'transparent', color: c.muted, font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
              }}
            >
              Confirm accounts
            </button>
            <button
              onClick={onOpenDedupReview}
              style={{
                flex: 1, padding: '10px', borderRadius: 12, border: `1.5px solid ${c.faint}`,
                background: 'transparent', color: c.muted, font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
              }}
            >
              Review duplicates
            </button>
          </div>
        )}

        <div>
          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Mobile number linked to your bank account
          </div>
          <input
            value={mobile}
            onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="9876543210"
            inputMode="numeric"
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: '#ef4444', marginTop: 10 }}>{error}</div>
        )}

        <button
          onClick={handleConnect}
          disabled={!/^\d{10}$/.test(mobile) || connecting}
          style={{
            width: '100%', marginTop: 20, padding: '14px', borderRadius: 14,
            border: 'none', background: /^\d{10}$/.test(mobile) ? c.accent : c.faint,
            color: '#fff', font: '700 16px Plus Jakarta Sans',
            cursor: /^\d{10}$/.test(mobile) && !connecting ? 'pointer' : 'default',
          }}
        >
          {connecting ? 'Connecting…' : 'Connect Bank'}
        </button>

        {loading && connections.length === 0 && (
          <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 12, textAlign: 'center' }}>Loading…</div>
        )}
      </div>
      {dialogNode}
    </BottomSheet>
  )
}
