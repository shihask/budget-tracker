import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import type { AppState } from '@/types'

interface Props {
  state: AppState
  onSeeAll: () => void
  onAdd: () => void
}

export function SavingsSection({ state, onSeeAll, onAdd }: Props) {
  const c = useTheme()
  const [infoOpen, setInfoOpen] = useState(false)

  const active = state.savings.filter(s => s.is_active)

  const monthlyTotal = active
    .filter(s => s.is_recurring && s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0)

  const totalContributed = active.filter(s => !s.is_prized).reduce((sum, s) => sum + (s.is_recurring ? s.current_installment * s.amount : s.amount), 0)

  const totalCurrentValue = active.reduce((sum, s) => sum + (s.current_value || 0), 0)

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: active.length ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Savings & Investments</div>
              <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
            <button onClick={onAdd} aria-label="Add investment" style={{ width: 28, height: 28, borderRadius: 9, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 18px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>+</button>
          </div>
        </div>

        {active.length === 0 ? (
          <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><TrendingUp size={28} color="#A09890" /></div>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Build Your Future</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>Watch your wealth grow over time. Track SIPs, gold schemes, RDs and investments.</div>
            <button onClick={onAdd} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Add investment</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }} onClick={onSeeAll}>
            <div style={{ flex: 1, background: 'rgba(16,185,129,0.1)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: '#10B981', marginTop: 3 }}>{fmt(monthlyTotal)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
                {active.length} plan{active.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ flex: 1, background: c.surface2, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {totalCurrentValue > 0 ? 'Current Value' : 'Invested'}
              </div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 3 }}>
                {fmt(totalCurrentValue > 0 ? totalCurrentValue : totalContributed)}
              </div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>
                {totalCurrentValue > 0
                  ? `${fmt(totalContributed)} invested`
                  : 'total invested'
                }
              </div>
            </div>
          </div>
        )}
      </Card>

      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                  <polyline points="17 6 23 6 23 12"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>Savings & Investments</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { title: 'SIP & Mutual Funds', desc: 'Track monthly investments, units, and current portfolio value.' },
                { title: 'Gold & RD', desc: 'Record recurring contributions and see total corpus grow.' },
                { title: 'FD & PPF / NPS', desc: 'Track maturity date, interest rate, and expected return.' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
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
                Savings live completely separate from bills & expenses — tracked in their own dedicated table.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
