import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { BottomSheet } from '@/components/BottomSheet'
import { connectAaBank } from '../lib/connect'
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

export function ConnectBankSheet({ open, onClose, userId, onOpenAccountLinkReview, onOpenDedupReview }: Props) {
  const c = useTheme()
  const { connections, loading, refetch } = useAaSyncData(userId)
  const [mobile, setMobile] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aa-connect?connectionId=${connectionId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {})
      refetch()
    }
    // Small delay first — give the webhook a real chance before asking directly.
    const t = setTimeout(reconcile, 3000)
    return () => clearTimeout(t)
  }, [open])

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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    border: `1.5px solid ${c.faint}`, background: c.surface2,
    font: '600 15px Plus Jakarta Sans', color: c.ink,
    outline: 'none', boxSizing: 'border-box',
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
            {connections.map((conn: SyncConnectionWithHealth) => (
              <div
                key={conn.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 14,
                  border: `1.5px solid ${c.faint}`, background: c.surface2,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 999, background: HEALTH_DOT[conn.health], flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>
                    {(conn.provider_metadata?.vua as string | undefined)?.split('@')[0] ?? 'Bank account'}
                  </div>
                  <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted }}>{HEALTH_LABEL[conn.health]}</div>
                </div>
              </div>
            ))}
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
    </BottomSheet>
  )
}
