import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import type { AppState } from '@/types'
import { getRemainingObligations } from '@/lib/obligations'

interface Props {
  state: AppState
  onSeeAll: () => void
  onAdd: () => void
}

export function CommitmentsSection({ state, onSeeAll, onAdd }: Props) {
  const c = useTheme()
  const [infoOpen, setInfoOpen] = useState(false)

  const active = state.commitments.filter(cm => cm.is_active !== false)

  const obligations = getRemainingObligations(state)
  const unpaidTotal = obligations.commitments + obligations.creditCardBills
  const ccBillCount = obligations.creditCardItems.length

  const monthlyTotal = active
    .filter(cm => cm.is_recurring && cm.frequency === 'monthly')
    .reduce((s, cm) => s + cm.amount, 0)

  const recurringCount = active.filter(cm => cm.is_recurring).length
  const totalCount = active.length + ccBillCount

  return (
    <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: totalCount ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Bills & Obligations</div>
              <button
                onClick={() => setInfoOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
            <button onClick={onAdd} aria-label="Add bill" style={{ width: 28, height: 28, borderRadius: 9, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 18px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>+</button>
          </div>
        </div>

        {totalCount === 0 ? (
          <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><ClipboardList size={28} color="#A09890" /></div>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Stay Ahead of Bills</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>Never miss another payment. Track rent, EMIs, subscriptions and recurring bills in one place.</div>
            <button onClick={onAdd} style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Add a bill</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12 }} onClick={onSeeAll}>
            <div style={{ flex: 1, background: 'rgba(139,92,246,0.1)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unpaid</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: '#8B5CF6', marginTop: 3 }}>{fmt(unpaidTotal)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{totalCount} bill{totalCount !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ flex: 1, background: c.surface2, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginTop: 3 }}>{fmt(monthlyTotal)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{recurringCount} recurring</div>
            </div>
          </div>
        )}
      </Card>

      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Bills & Obligations</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.5 9A9 9 0 005.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 013.5 15"/></svg>,
                  title: 'Recurring bills',
                  desc: 'Electricity, internet, rent, mobile recharge, subscriptions — anything that repeats monthly, weekly or yearly.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2h-2"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg>,
                  title: 'One-time payments',
                  desc: 'A single payment you still owe — insurance premium, annual fees, hospital bill, any upcoming due.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><rect x="2" y="10" width="20" height="12" rx="1"/><path d="M12 2L2 10h20L12 2z"/><line x1="9" y1="15" x2="9" y2="22"/><line x1="15" y1="15" x2="15" y2="22"/></svg>,
                  title: 'Loan EMIs',
                  desc: 'Home loan, car loan, personal loan — enter EMI amount, tenure and how many you\'ve paid. Remaining is auto-calculated.',
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
                Unpaid amounts here are deducted from your <strong style={{ color: c.ink }}>Spendable Balance</strong> to show your <strong style={{ color: c.ink }}>Real Free Money</strong>. For SIPs, chit funds and investments, use the <strong style={{ color: c.ink }}>Savings & Investments</strong> section.
              </div>
            </div>
            <button
              onClick={() => setInfoOpen(false)}
              style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
