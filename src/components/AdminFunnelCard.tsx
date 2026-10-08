import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fetchAdminFunnel, type FunnelDailyRow } from '@/lib/adminApi'

/** The sign-up path, in order. Each bar is shown as a share of landing views. */
const MAIN_STEPS: { step: string; label: string }[] = [
  { step: 'landing_view', label: 'Saw landing page' },
  { step: 'signup_opened', label: 'Opened Sign Up' },
  { step: 'signup_code_sent', label: 'Code sent' },
  { step: 'signup_code_verified', label: 'Code verified' },
  { step: 'account_created', label: 'Account created' },
]
const SIDE_STEPS: { step: string; label: string }[] = [
  { step: 'signin_opened', label: 'Opened Sign In' },
  { step: 'signin_success', label: 'Signed in' },
  { step: 'google_clicked', label: 'Google tapped' },
  { step: 'code_send_failed', label: 'Code failed' },
]

type Range = 1 | 7 | 30
const RANGES: { days: Range; label: string }[] = [
  { days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' },
]

/** IST calendar date `n` days before today — the view groups by IST day. */
function istDay(daysAgo: number) {
  const d = new Date(Date.now() + 330 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

/**
 * Admin → Sign-up funnel: the anonymous funnel_events counts (see the
 * funnel_events migration). Loads on its own so a failure here never blocks
 * the account list; `refreshKey` changes when the page's Refresh is tapped.
 */
export function AdminFunnelCard({ refreshKey }: { refreshKey: number }) {
  const c = useTheme()
  const [rows, setRows] = useState<FunnelDailyRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>(7)
  const [source, setSource] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    fetchAdminFunnel(30)
      .then(r => { if (!cancelled) { setRows(r); setError(null) } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'load_failed') })
    return () => { cancelled = true }
  }, [refreshKey])

  const sources = useMemo(() => [...new Set((rows ?? []).map(r => r.source))].sort(), [rows])

  const totals = useMemo(() => {
    const since = istDay(range - 1)
    const map = new Map<string, { total: number; android: number; ios: number; inApp: number }>()
    for (const r of rows ?? []) {
      if (r.day < since || (source !== 'all' && r.source !== source)) continue
      const t = map.get(r.step) ?? { total: 0, android: 0, ios: 0, inApp: 0 }
      t.total += r.total; t.android += r.android; t.ios += r.ios; t.inApp += r.in_app
      map.set(r.step, t)
    }
    return map
  }, [rows, range, source])

  const base = totals.get('landing_view')?.total ?? 0

  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? c.accent : c.faint}`, background: active ? `${c.accent}18` : c.surface,
    color: active ? c.accent : c.sub, borderRadius: 999, padding: '4px 10px',
    font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ marginTop: 22, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Sign-up funnel
      </div>

      {error && <div style={{ marginTop: 10, font: '600 12px Plus Jakarta Sans', color: c.bad }}>Couldn't load the funnel: {error}</div>}
      {!error && rows === null && <div style={{ marginTop: 10, font: '600 12px Plus Jakarta Sans', color: c.muted }}>Loading funnel…</div>}

      {rows && (
        <div style={{ marginTop: 10, borderRadius: 14, padding: '12px 14px', background: c.surface, border: `1px solid ${c.faint}` }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RANGES.map(r => <button key={r.days} onClick={() => setRange(r.days)} style={chip(range === r.days)}>{r.label}</button>)}
          </div>
          {sources.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <button onClick={() => setSource('all')} style={chip(source === 'all')}>All sources</button>
              {sources.map(s => <button key={s} onClick={() => setSource(s)} style={chip(source === s)}>{s}</button>)}
            </div>
          )}

          {base === 0 && totals.size === 0 ? (
            <div style={{ marginTop: 12, font: '600 12px Plus Jakarta Sans', color: c.muted }}>No visits recorded in this range yet.</div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MAIN_STEPS.map(({ step, label }) => {
                const t = totals.get(step)
                const n = t?.total ?? 0
                const pct = base > 0 ? Math.round((n / base) * 100) : 0
                return (
                  <div key={step}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>{label}</span>
                      <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>
                        {n}{step !== 'landing_view' && base > 0 && <span style={{ color: c.muted, fontWeight: 600 }}> · {pct}%</span>}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: c.faint, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${step === 'landing_view' ? (n > 0 ? 100 : 0) : pct}%`, background: c.accent }} />
                    </div>
                    {n > 0 && (
                      <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
                        Android {t!.android} · iOS {t!.ios} · in-app {t!.inApp}
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8, borderTop: `1px solid ${c.faint}` }}>
                {SIDE_STEPS.map(({ step, label }) => (
                  <span key={step} style={{ font: '600 11px Plus Jakarta Sans', color: step === 'code_send_failed' && (totals.get(step)?.total ?? 0) > 0 ? c.bad : c.sub }}>
                    {label}: <strong style={{ color: c.ink }}>{totals.get(step)?.total ?? 0}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{ font: '500 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 10, lineHeight: 1.5 }}>
            Anonymous counts, once per step per visit. Google sign-ups skip "Account created".
          </div>
        </div>
      )}
    </div>
  )
}
