import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { DerivedMetrics } from '@/types'

interface Props {
  d: DerivedMetrics
}

export function AffordabilityChecker({ d }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState<null | { remaining: number; pct: number }>(null)

  const freeMoney = d.realFreeMoney

  const check = () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return
    const remaining = freeMoney - amt
    const pct = Math.round((amt / freeMoney) * 100)
    setResult({ remaining, pct })
  }

  const reset = () => { setItem(''); setAmount(''); setResult(null) }
  const close = () => { setOpen(false); reset() }

  const getStatus = () => {
    if (!result) return null
    if (result.remaining < 0) return { color: c.bad, bg: '#FEE2E2', emoji: '🔴', label: 'NO — Exceeds your free money', sub: `You'd be short by ${fmt(Math.abs(result.remaining))}` }
    if (result.pct > 60) return { color: '#D97706', bg: '#FEF3C7', emoji: '🟡', label: 'Possible, but think carefully', sub: `This uses ${result.pct}% of your free money` }
    return { color: c.good, bg: '#DCFCE7', emoji: '🟢', label: 'Yes, you can afford this!', sub: `You'll still have ${fmt(result.remaining)} left` }
  }

  const status = getStatus()

  const quickAmounts = [500, 2000, 5000, 10000, 25000, 50000]

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  return (
    <>
      {/* Dashboard button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', border: 'none', borderRadius: 18, padding: '14px 20px',
          background: `linear-gradient(135deg, #6366F1, #8B5CF6)`,
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ font: '800 16px Plus Jakarta Sans', letterSpacing: '-0.01em' }}>💰 Can I Afford This?</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            Based on real free money · {fmt(freeMoney)}
          </div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 600, padding: '8px 20px calc(40px + env(safe-area-inset-bottom, 0px))', maxHeight: '90svh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 20px' }} />

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>💰 Can I Afford This?</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Checks against Real Free Money, not bank balance</div>
              </div>
              <button onClick={close} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', font: '700 14px Plus Jakarta Sans', color: c.muted }}>✕</button>
            </div>

            {/* Your position */}
            <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 18, border: `1px solid ${c.faint}` }}>
              <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Your Current Position</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Actual Balance', value: fmt(d.actualBalance), muted: false },
                  { label: 'Emergency Fund', value: `− ${fmt(d.emergencyFund)}`, muted: true },
                  { label: 'Available Balance', value: fmt(d.availableBalance), muted: false },
                  { label: 'Remaining Commitments', value: `− ${fmt(d.remainingCommitments)}`, muted: true },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ font: '600 12px Plus Jakarta Sans', color: row.muted ? c.muted : c.ink }}>{row.label}</span>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: row.muted ? c.muted : c.ink }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Real Free Money</span>
                  <span style={{ font: '800 15px Plus Jakarta Sans', color: c.accent }}>{fmt(freeMoney)}</span>
                </div>
              </div>
            </div>

            {/* Input form */}
            {!result ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>What do you want to buy?</label>
                    <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Bluetooth Headset" style={inp} />
                  </div>
                  <div>
                    <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Amount (₹)</label>
                    <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
                      onFocus={e => e.target.select()} placeholder="0" style={inp} />
                  </div>
                </div>

                {/* Quick amounts */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Quick check</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {quickAmounts.map(amt => {
                      const rem = freeMoney - amt
                      const pct = Math.round((amt / freeMoney) * 100)
                      const qColor = rem < 0 ? c.bad : pct > 60 ? '#D97706' : c.good
                      return (
                        <button key={amt} onClick={() => { setAmount(String(amt)); setResult({ remaining: rem, pct }) }}
                          style={{ background: qColor + '18', color: qColor, border: `1px solid ${qColor}30`, borderRadius: 999, padding: '5px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}>
                          {rem < 0 ? '🔴' : pct > 60 ? '🟡' : '🟢'} ₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button onClick={check} disabled={!amount} style={{ width: '100%', background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '800 15px Plus Jakarta Sans', cursor: 'pointer', opacity: !amount ? 0.5 : 1 }}>
                  Check Affordability
                </button>
              </>
            ) : (
              <>
                {/* Result */}
                <div style={{ background: status!.bg, borderRadius: 16, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ font: '700 28px Plus Jakarta Sans' }}>{status!.emoji}</div>
                  <div style={{ font: '800 17px Plus Jakarta Sans', color: status!.color, marginTop: 6 }}>{status!.label}</div>
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: status!.color + 'CC', marginTop: 4 }}>{status!.sub}</div>
                </div>

                {/* Breakdown */}
                <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 18, border: `1px solid ${c.faint}` }}>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>If You Buy {item || 'This'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>Real Free Money</span>
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(freeMoney)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>{item || 'Purchase'}</span>
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: c.muted }}>− {fmt(parseFloat(amount))}</span>
                    </div>
                    <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Remaining Free Money</span>
                      <span style={{ font: '800 15px Plus Jakarta Sans', color: status!.color }}>{fmt(result.remaining)}</span>
                    </div>
                    {freeMoney > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ height: 6, borderRadius: 999, background: c.surface2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, result.pct)}%`, height: '100%', borderRadius: 999, background: status!.color }} />
                        </div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>Uses {result.pct}% of free money</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={reset} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Check Another</button>
                  <button onClick={close} style={{ flex: 1, background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
