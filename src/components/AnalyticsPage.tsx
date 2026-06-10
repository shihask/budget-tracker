import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { weeklyTrend, weeklyBars, categorySplit } from '@/lib/data'
import { AreaTrend } from './Charts'
import { analyticsInsightWithAI } from '@/lib/gemini'
import type { AppState, DerivedMetrics } from '@/types'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell as PieCell,
} from 'recharts'

type Tab = 'trend' | 'weeks' | 'category'
const TABS: [Tab, string][] = [['trend', 'Trend'], ['weeks', 'Weekly'], ['category', 'Category']]

interface Props {
  state: AppState
  d: DerivedMetrics
  onClose: () => void
}

const MintLogo = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size}>
    <path d="M 50 24 C 36 24 27 34 27 47 C 27 61 38 70 50 76 L 50 24 Z" fill="#16C98A"/>
    <path d="M 50 24 C 64 24 73 34 73 47 C 73 61 62 70 50 76 L 50 24 Z" fill="#16C98A" fillOpacity="0.5"/>
    <path d="M 50 30 L 50 73" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round"/>
  </svg>
)

export function AnalyticsPage({ state, d, onClose }: Props) {
  const c = useTheme()
  const [tab, setTab] = useState<Tab>('trend')
  const [insight, setInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

  const trend = useMemo(() => weeklyTrend(state), [state])
  const bars  = useMemo(() => weeklyBars(state), [state])
  const cats  = useMemo(() => categorySplit(state), [state])

  const trendTotal = trend.reduce((s, x) => s + x.value, 0)
  const catTotal   = cats.reduce((s, x) => s + x.value, 0)
  const colorOf    = (name: string) => CAT_COLORS[name] || c.accent

  const barAvg    = bars.reduce((s, b) => s + b.value, 0) / (bars.length || 1)
  const barColors = bars.map((b, i) => {
    if (i === bars.length - 1) return c.accent
    if (b.value === 0) return c.barDim
    if (b.value <= barAvg * 0.9) return '#16A34A'
    if (b.value <= barAvg * 1.1) return '#F59E0B'
    return '#EF4444'
  })

  const handleInsight = async () => {
    setLoadingInsight(true)
    setInsight(null)
    setInsightError(null)
    try {
      const peakDay = trend.reduce(
        (max, t) => t.value > max.value ? t : max,
        trend[0] ?? { label: '—', date: '', value: 0 }
      )
      const result = await analyticsInsightWithAI({
        totalLast7Days: trendTotal,
        peakDay,
        weekBars: bars,
        topCategories: cats.slice(0, 5),
        totalThisMonth: catTotal,
        weeklyBudget: d.weeklyBudget,
        weeklySpent: d.weeklySpent,
      })
      if (result) setInsight(result)
      else setInsightError('Could not generate insight. Try again.')
    } catch {
      setInsightError('Something went wrong.')
    }
    setLoadingInsight(false)
  }

  const tabStyle = (k: Tab): React.CSSProperties => ({
    flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '8px 0',
    font: '700 12.5px Plus Jakarta Sans', transition: 'all 0.2s',
    background: tab === k ? c.surface : 'transparent',
    color: tab === k ? c.ink : c.muted,
    boxShadow: tab === k ? c.cardShadow : 'none',
  })

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150,
      background: c.bg, display: 'flex', flexDirection: 'column',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: `calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px`,
        borderBottom: `1px solid ${c.faint}`,
        display: 'flex', alignItems: 'center', gap: 12,
        background: c.bg, flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          background: c.surface2, border: 'none', borderRadius: 10,
          width: 36, height: 36, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: c.ink, flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Spending Analytics</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>Lifestyle spend · charts & AI insights</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: c.surface2, borderRadius: 12, padding: 4, marginBottom: 20 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={tabStyle(k)}>{l}</button>
          ))}
        </div>

        {/* ── Trend ─────────────────────────────────────────── */}
        {tab === 'trend' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink }}>{fmt(trendTotal)}</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>last 7 days</div>
            </div>
            <AreaTrend data={trend} />
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {trend.map(t => (
                <div key={t.date} style={{ background: c.surface2, borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>{t.label}</div>
                  <div style={{ font: '700 11px Plus Jakarta Sans', color: t.value > 0 ? c.ink : c.muted, marginTop: 3 }}>
                    {t.value > 0 ? `₹${Math.round(t.value / 1000) > 0 ? (t.value / 1000).toFixed(1) + 'k' : Math.round(t.value)}` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Weekly ────────────────────────────────────────── */}
        {tab === 'weeks' && (
          <div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>Lifestyle spend per week</div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={bars} margin={{ top: 22, right: 4, left: 4, bottom: 0 }} barSize={38}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', fill: c.muted }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10, fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: c.ink }}
                  formatter={(v) => [fmt(Number(v)), 'Spent']}
                  cursor={{ fill: c.faint }}
                />
                <Bar dataKey="value" radius={[8, 8, 8, 8]}
                  label={{ position: 'top', fontSize: 10, fontFamily: 'ui-monospace, monospace', fontWeight: 700, fill: c.muted }}>
                  {bars.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {[
                { color: '#16A34A', label: 'Below avg' },
                { color: '#F59E0B', label: 'Near avg' },
                { color: '#EF4444', label: 'Above avg' },
                { color: c.accent,  label: 'This week' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, background: c.surface2, borderRadius: 12, padding: '10px 14px' }}>
              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                Weekly average: <strong style={{ color: c.ink }}>{fmt(Math.round(barAvg))}</strong>
              </span>
            </div>
          </div>
        )}

        {/* ── Category ──────────────────────────────────────── */}
        {tab === 'category' && (
          cats.length === 0 ? (
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>
              No lifestyle spend this month yet.
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{ position: 'relative' }}>
                  <PieChart width={160} height={160}>
                    <Pie data={cats} cx={80} cy={80} innerRadius={54} outerRadius={72}
                      dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2} strokeWidth={0}>
                      {cats.map((_, i) => <PieCell key={i} fill={colorOf(cats[i].name)} />)}
                    </Pie>
                  </PieChart>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ font: '500 10px ui-monospace, monospace', color: c.muted }}>THIS MONTH</div>
                    <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{fmt(catTotal)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cats.map(x => {
                  const pct = catTotal > 0 ? Math.round((x.value / catTotal) * 100) : 0
                  return (
                    <div key={x.name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(x.name), flexShrink: 0 }} />
                        <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink }}>{x.name}</span>
                        <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(x.value)}</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                      </div>
                      <div style={{ height: 5, background: c.faint, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: colorOf(x.name), borderRadius: 999, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* ── Mint Analytics AI ─────────────────────────────── */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${c.faint}` }}>
          {!insight && !loadingInsight && (
            <button onClick={handleInsight} style={{
              width: '100%', background: '#111111', border: 'none', borderRadius: 14,
              padding: '14px 16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#1c1c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MintLogo size={18} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: '#fff' }}>Generate Mint Analytics</div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>AI insight on your spending patterns</div>
              </div>
              <span style={{ font: '700 9px Plus Jakarta Sans', color: '#16C98A', background: 'rgba(22,201,138,0.15)', borderRadius: 6, padding: '3px 7px', letterSpacing: '0.04em' }}>AI</span>
            </button>
          )}

          {loadingInsight && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px', background: c.surface2, borderRadius: 14 }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, border: `2.5px solid ${c.accent}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Mint is analysing your spending…</span>
            </div>
          )}

          {insight && (
            <div style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MintLogo size={14} />
                </div>
                <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Mint Analytics</span>
                <span style={{ font: '700 9px Plus Jakarta Sans', color: c.accent, background: `${c.accent}22`, borderRadius: 6, padding: '2px 6px', marginLeft: 2 }}>AI</span>
                <button
                  onClick={() => { setInsight(null); setInsightError(null) }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: c.muted, font: '600 11px Plus Jakarta Sans', padding: 0 }}
                >
                  Regenerate ↺
                </button>
              </div>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.7 }}>{insight}</div>
            </div>
          )}

          {insightError && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, padding: '8px 0' }}>{insightError}</div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>,
    document.body
  )
}
