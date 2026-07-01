import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import { AreaTrend, WeeklyBars, CategoryDonut } from './Charts'
import type { AppState } from '@/types'
import { weeklyTrend, weeklyBars, categorySplit } from '@/lib/data'

type Tab = 'trend' | 'weeks' | 'category'
type TrendRange = 7 | 15 | 30
const TABS: [Tab, string][] = [['trend', 'Trend'], ['weeks', 'Weekly'], ['category', 'Category']]
const TREND_RANGES: [TrendRange, string][] = [[7, '7D'], [15, '15D'], [30, '30D']]

interface AnalyticsProps { state: AppState; onSeeAll?: () => void }

export function Analytics({ state, onSeeAll }: AnalyticsProps) {
  const c = useTheme()
  const [tab, setTab] = useState<Tab>('trend')
  const [trendRange, setTrendRange] = useState<TrendRange>(7)
  const [infoOpen, setInfoOpen] = useState(false)

  const trend = weeklyTrend(state, trendRange)
  const bars  = weeklyBars(state, 5)
  const cats  = categorySplit(state)
  const trendTotal = trend.reduce((s, x) => s + x.value, 0)

  return (
    <>
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="2" width="4" height="19" rx="1"/>
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Spending analytics</div>
        <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
        {onSeeAll && (
          <button onClick={onSeeAll} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, color: c.accent, font: '700 12px Plus Jakarta Sans', padding: 0 }}>
            See all
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, background: c.surface2, borderRadius: 12, padding: 4, marginTop: 12 }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '8px 0',
            font: '700 12.5px Plus Jakarta Sans', transition: 'all 0.2s',
            background: tab === k ? c.surface : 'transparent',
            color: tab === k ? c.ink : c.muted,
            boxShadow: tab === k ? c.cardShadow : 'none',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {tab === 'trend' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink }}>{fmt(trendTotal)}</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>last {trendRange} days</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: c.surface2, borderRadius: 8, padding: 3 }}>
                {TREND_RANGES.map(([r, l]) => (
                  <button key={r} onClick={() => setTrendRange(r)} style={{
                    border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 8px',
                    font: '700 10.5px Plus Jakarta Sans', transition: 'all 0.2s',
                    background: trendRange === r ? c.surface : 'transparent',
                    color: trendRange === r ? c.ink : c.muted,
                    boxShadow: trendRange === r ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <AreaTrend data={trend} />
          </div>
        )}
        {tab === 'weeks' && (
          <div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>Lifestyle spend per week</div>
            <WeeklyBars data={bars} />
          </div>
        )}
        {tab === 'category' && (
          cats.length === 0
            ? <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}><BarChart3 size={24} color="#A09890" /></div>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Start tracking your spending</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>Category insights will appear after your first lifestyle expense.</div>
              </div>
            : <CategoryDonut data={cats} />
        )}
      </div>
    </Card>

      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Spending Analytics</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                  title: 'Trend',
                  desc: 'Daily spending over the past 7, 15, or 30 days so you can spot your heaviest spending moments.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="17" y="11" width="4" height="10"/></svg>,
                  title: 'Weekly',
                  desc: 'Bar chart comparing your Lifestyle spend across the past few weeks to see if you\'re improving.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20"/><path d="M12 2v10l6 6"/></svg>,
                  title: 'Category',
                  desc: 'Donut chart showing which categories consumed the most of your spending this month.',
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
            <div style={{ marginTop: 16, padding: '12px', background: c.surface2, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                Only <strong style={{ color: c.ink }}>Lifestyle</strong> category expenses are counted here — bills and obligations are excluded.
              </div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                <strong style={{ color: c.ink }}>Transfers</strong> between accounts are excluded — they move money, not spend it.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
