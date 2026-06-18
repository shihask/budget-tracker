import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { weeklyTrend, weeklyBars, categorySplit, monthTimeline, journeyData } from '@/lib/data'
import { AreaTrend } from './Charts'
import { analyticsInsightWithAI } from '@/lib/gemini'
import type { AppState, DerivedMetrics, JourneyMilestone } from '@/types'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell as PieCell,
} from 'recharts'

type Tab = 'trend' | 'weeks' | 'category' | 'timeline' | 'journey'
const TABS: [Tab, string][] = [['trend', 'Trend'], ['weeks', 'Weekly'], ['category', 'Category'], ['timeline', 'Timeline'], ['journey', '🌱 Journey']]
const GROUP_PALETTE = ['#F59E0B', '#10B981', '#7C3AED', '#0EA5E9', '#EF4444', '#F97316', '#EC4899', '#6366F1']
const BAR_MAX_H = 72
const DAY_W = 32
const J = { seed: '#D97706', roots: '#059669', stem: '#16A34A', branch: '#0D9488', flower: '#D946EF' }

interface Props {
  state: AppState
  d: DerivedMetrics
  onClose: () => void
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
}


function JourneyMilestones({ items, section, color }: { items: JourneyMilestone[]; section: JourneyMilestone['section']; color: string }) {
  const relevant = items.filter(m => m.section === section)
  if (relevant.length === 0) return null
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {relevant.map(m => (
        <div key={m.text} style={{ display: 'flex', alignItems: 'center', gap: 8, background: color + '14', borderRadius: 10, padding: '7px 10px' }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>{m.emoji}</span>
          <span style={{ font: '600 11px Plus Jakarta Sans', color }}>{m.text}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineDayRuler({ daysInMonth, todayDay, mutedColor, accentColor }: { daysInMonth: number; todayDay: number; mutedColor: string; accentColor: string }) {
  const markers: number[] = []
  for (let d = 1; d <= daysInMonth; d += 5) markers.push(d)
  if (markers[markers.length - 1] !== daysInMonth) markers.push(daysInMonth)
  return (
    <div style={{ position: 'relative', height: 18, marginTop: 6 }}>
      {markers.map(d => (
        <div key={d} style={{
          position: 'absolute',
          left: `${((d - 0.5) / daysInMonth) * 100}%`,
          transform: 'translateX(-50%)',
          font: '500 9px ui-monospace, monospace',
          color: d === todayDay ? accentColor : mutedColor,
          opacity: 0.7,
        }}>{d}</div>
      ))}
    </div>
  )
}

export function AnalyticsPage({ state, d, onClose, onUpdateSettings }: Props) {
  const c = useTheme()
  const [tab, setTab] = useState<Tab>('trend')
  const [insight, setInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [timelineView, setTimelineView] = useState<'day' | 'category' | 'group'>('day')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Swipe-back gesture
  const [dragX, setDragX] = useState(0)
  const [closing, setClosing] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const dragXRef = useRef(0)
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number } | null>(null)
  const W = typeof window !== 'undefined' ? window.innerWidth : 400

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const triggerClose = () => {
    setClosing(true)
    setTimeout(onClose, 290)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (closing) return
    const t = e.touches[0]
    if (t.clientX > 28) return
    gestureRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dy = Math.abs(t.clientY - gestureRef.current.startY)
    if (dy > Math.abs(dx) + 5 && Math.abs(dx) < 15) {
      gestureRef.current = null; setDragX(0); return
    }
    gestureRef.current = { ...gestureRef.current, lastX: t.clientX, lastT: Date.now() }
    const x = Math.max(0, dx)
    dragXRef.current = x
    setDragX(x)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!gestureRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - gestureRef.current.startX
    const dt = Date.now() - gestureRef.current.lastT
    const vx = dt > 0 ? (t.clientX - gestureRef.current.lastX) / dt : 0
    gestureRef.current = null
    if (dx > W * 0.38 || (dx > 50 && vx > 0.5)) {
      triggerClose()
    } else {
      setSnapping(true); setDragX(0); dragXRef.current = 0
      setTimeout(() => setSnapping(false), 300)
    }
  }

  const trend    = useMemo(() => weeklyTrend(state), [state])
  const bars     = useMemo(() => weeklyBars(state), [state])
  const cats     = useMemo(() => categorySplit(state), [state])
  const timeline = useMemo(() => monthTimeline(state), [state])
  const maxDayTotal = useMemo(() => Math.max(...timeline.byDay.map(d => d.total), 1), [timeline])
  const journey  = useMemo(() => journeyData(state), [state])

  useEffect(() => {
    if (tab === 'timeline' && timelineView === 'day' && scrollRef.current) {
      const containerW = scrollRef.current.clientWidth
      scrollRef.current.scrollLeft = (timeline.todayDay - 1) * DAY_W - containerW / 2 + DAY_W / 2
    }
  }, [tab, timelineView, timeline.todayDay])

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
      }, (n) => onUpdateSettings?.({ ai_requests_used: n }))
      if (result) setInsight(result)
      else setInsightError('Could not generate insight. Try again.')
    } catch {
      setInsightError('Something went wrong.')
    }
    setLoadingInsight(false)
  }

  const tabStyle = (k: Tab): React.CSSProperties => ({
    flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '7px 10px',
    font: '700 11px Plus Jakarta Sans', transition: 'all 0.2s', whiteSpace: 'nowrap',
    background: tab === k ? c.surface : 'transparent',
    color: tab === k ? c.ink : c.muted,
    boxShadow: tab === k ? c.cardShadow : 'none',
  })

  return createPortal(
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: c.bg, display: 'flex', flexDirection: 'column',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        willChange: 'transform',
        ...(closing
          ? { transform: 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)' }
          : dragX > 0
          ? { transform: `translateX(${dragX}px)`, boxShadow: '-8px 0 24px rgba(0,0,0,0.18)' }
          : snapping
          ? { transform: 'translateX(0)', transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' }
          : { transform: 'translateX(0)' }
        ),
      }}
    >
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
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))' }}>

        {/* Tabs */}
        <div className="tab-scroll" style={{ display: 'flex', gap: 4, background: c.surface2, borderRadius: 12, padding: 4, marginBottom: 20, overflowX: 'auto', scrollbarWidth: 'none' as any }}>
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

        {/* ── Timeline ──────────────────────────────────────── */}
        {tab === 'timeline' && (
          <div>
            {/* Month total */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink }}>{fmt(timeline.totalSpent)}</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>{timeline.monthLabel}</div>
            </div>

            {/* Sub-toggle */}
            <div style={{ display: 'flex', gap: 3, background: c.surface2, borderRadius: 10, padding: 3, marginBottom: 20 }}>
              {(['day', 'category', 'group'] as const).map(v => (
                <button key={v} onClick={() => { setTimelineView(v); setSelectedDay(null) }} style={{
                  flex: 1, border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 0',
                  font: '700 11px Plus Jakarta Sans', transition: 'all 0.18s',
                  background: timelineView === v ? c.surface : 'transparent',
                  color: timelineView === v ? c.ink : c.muted,
                  boxShadow: timelineView === v ? c.cardShadow : 'none',
                }}>
                  {v === 'day' ? 'By Day' : v === 'category' ? 'By Category' : 'By Group'}
                </button>
              ))}
            </div>

            {/* ── By Day ── */}
            {timelineView === 'day' && (
              <div>
                <div ref={scrollRef} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: timeline.daysInMonth * DAY_W }}>
                    {timeline.byDay.map(d => {
                      const isToday = d.day === timeline.todayDay
                      const isSel   = selectedDay === d.day
                      const barH    = d.total > 0 ? Math.max(4, Math.round((d.total / maxDayTotal) * BAR_MAX_H)) : 0
                      return (
                        <div key={d.day} data-day={d.day}
                          onClick={() => !d.isFuture && setSelectedDay(isSel ? null : d.day)}
                          style={{ width: DAY_W, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: d.isFuture ? 'default' : 'pointer', opacity: d.isFuture ? 0.28 : 1 }}>
                          {/* bar column */}
                          <div style={{ height: BAR_MAX_H + 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', width: '100%' }}>
                            {barH > 0
                              ? <div style={{ width: 18, height: barH, borderRadius: '5px 5px 2px 2px', background: isSel ? c.accent : isToday ? c.accent : c.barDim, opacity: isSel || isToday ? 1 : 0.75, transition: 'height 0.3s ease' }} />
                              : <div style={{ width: 2, height: 2, borderRadius: '50%', background: c.faint }} />
                            }
                          </div>
                          {/* day number */}
                          <div style={{ font: `${isToday ? '800' : '500'} 9px ui-monospace, monospace`, color: isToday ? c.accent : isSel ? c.ink : c.muted, marginTop: 3 }}>
                            {d.day}
                          </div>
                          {/* today dot */}
                          <div style={{ height: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isToday && <div style={{ width: 3, height: 3, borderRadius: '50%', background: c.accent }} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Selected day detail */}
                {selectedDay !== null && (() => {
                  const dayData = timeline.byDay.find(d => d.day === selectedDay)
                  if (!dayData) return null
                  return (
                    <div style={{ marginTop: 14, background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>
                          {new Date(dayData.isoDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(dayData.total)}</div>
                      </div>
                      {dayData.transactions.length === 0
                        ? <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No expenses</div>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {dayData.transactions.map(t => {
                              const theCat = state.categories.find(cc => cc.id === t.category_id)
                              const dotColor = theCat ? (CAT_COLORS[theCat.name] || c.accent) : c.muted
                              return (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: 2, background: dotColor, flexShrink: 0 }} />
                                  <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>{t.description}</span>
                                  <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(t.amount)}</span>
                                </div>
                              )
                            })}
                          </div>
                      }
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── By Category ── */}
            {timelineView === 'category' && (
              timeline.byCategory.length === 0
                ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>No expenses this month yet.</div>
                : <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {timeline.byCategory.map(lane => {
                        const maxAmt   = Math.max(...lane.days.map(d => d.amount), 1)
                        const laneColor = colorOf(lane.name)
                        return (
                          <div key={lane.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: laneColor, flexShrink: 0 }} />
                              <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>{lane.name}</span>
                              <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(lane.total)}</span>
                            </div>
                            <div style={{ position: 'relative', height: 18, background: c.faint, borderRadius: 999 }}>
                              {/* today line */}
                              <div style={{ position: 'absolute', left: `${(timeline.todayDay / timeline.daysInMonth) * 100}%`, top: -3, bottom: -3, width: 1.5, background: c.accent, borderRadius: 1, opacity: 0.5 }} />
                              {lane.days.map(d => {
                                const left = ((d.day - 0.5) / timeline.daysInMonth) * 100
                                const size = Math.max(7, Math.min(15, Math.round((d.amount / maxAmt) * 10) + 6))
                                return (
                                  <div key={d.day} style={{ position: 'absolute', left: `${left}%`, top: '50%', transform: 'translate(-50%,-50%)', width: size, height: size, borderRadius: '50%', background: laneColor, opacity: 0.85, zIndex: 1 }} />
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <TimelineDayRuler daysInMonth={timeline.daysInMonth} todayDay={timeline.todayDay} mutedColor={c.muted} accentColor={c.accent} />
                  </div>
            )}

            {/* ── By Group ── */}
            {timelineView === 'group' && (
              timeline.byGroup.length === 0
                ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>No expenses this month yet.</div>
                : <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {timeline.byGroup.map((lane, gi) => {
                        const maxAmt    = Math.max(...lane.days.map(d => d.amount), 1)
                        const laneColor = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                        return (
                          <div key={lane.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: laneColor, flexShrink: 0 }} />
                              <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>{lane.name}</span>
                              <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(lane.total)}</span>
                            </div>
                            <div style={{ position: 'relative', height: 18, background: c.faint, borderRadius: 999 }}>
                              <div style={{ position: 'absolute', left: `${(timeline.todayDay / timeline.daysInMonth) * 100}%`, top: -3, bottom: -3, width: 1.5, background: c.accent, borderRadius: 1, opacity: 0.5 }} />
                              {lane.days.map(d => {
                                const left = ((d.day - 0.5) / timeline.daysInMonth) * 100
                                const size = Math.max(7, Math.min(15, Math.round((d.amount / maxAmt) * 10) + 6))
                                return (
                                  <div key={d.day} style={{ position: 'absolute', left: `${left}%`, top: '50%', transform: 'translate(-50%,-50%)', width: size, height: size, borderRadius: '50%', background: laneColor, opacity: 0.85, zIndex: 1 }} />
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <TimelineDayRuler daysInMonth={timeline.daysInMonth} todayDay={timeline.todayDay} mutedColor={c.muted} accentColor={c.accent} />
                  </div>
            )}
          </div>
        )}

        {/* ── Journey ───────────────────────────────────────── */}
        {tab === 'journey' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>
                {journey.cycleLabel} Journey
              </div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                Where did your money grow?
              </div>
            </div>

            {/* Hero metric — one big number */}
            <div style={{ background: `linear-gradient(135deg, ${J.branch}12, ${J.flower}12)`, borderRadius: 20, padding: '18px 18px 16px', marginBottom: 20, border: `1px solid ${J.branch}1E` }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                {journey.heroLabel}
              </div>
              <div style={{ font: '800 36px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {journey.heroValue > 0 ? fmt(journey.heroValue) : '—'}
              </div>
              {journey.heroValue > 0 && journey.totalIncome > 0 && journey.heroValue !== journey.totalIncome && (
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 7 }}>
                  from {fmt(journey.totalIncome)} income this cycle
                </div>
              )}
            </div>

            {/* Mini flow strip */}
            <div style={{ background: c.surface2, borderRadius: 14, padding: '10px 8px', marginBottom: 22, display: 'flex', alignItems: 'center' }}>
              {([
                { e: '🌰', v: journey.totalIncome > 0 ? fmt(journey.totalIncome) : '—', color: J.seed },
                { e: '🌱', v: journey.rootsTotal > 0 ? `${journey.rootsPct}%` : '—', color: J.roots },
                { e: '🌿', v: journey.challengeEnabled ? `${journey.streak}d` : '—', color: J.stem },
                { e: '🌳', v: journey.totalWealth > 0 ? fmt(journey.totalWealth) : '—', color: J.branch },
                { e: '🌺', v: journey.activeGoals > 0 ? `${journey.activeGoals}` : '—', color: J.flower },
              ] as const).map((item, i, arr) => (
                <>
                  <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                    <div style={{ fontSize: 16, lineHeight: '1.2' }}>{item.e}</div>
                    <div style={{ font: '700 9px ui-monospace,monospace', color: item.color, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.v}</div>
                  </div>
                  {i < arr.length - 1 && <div key={`a${i}`} style={{ font: '600 9px Plus Jakarta Sans', color: c.faint, flexShrink: 0 }}>›</div>}
                </>
              ))}
            </div>

            {/* ===== SEED ===== */}
            <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${J.seed}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.incomeItems.length > 0 ? 12 : 0 }}>
                <span style={{ fontSize: 26, lineHeight: '1' }}>🌰</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: J.seed }}>Seed</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Income this cycle</div>
                </div>
                <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{journey.totalIncome > 0 ? fmt(journey.totalIncome) : '—'}</div>
              </div>
              {journey.incomeItems.length > 0
                ? <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {journey.incomeItems.map(item => (
                      <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{item.name}</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No income logged this cycle yet</div>
              }
              <JourneyMilestones items={journey.milestones} section="seed" color={J.seed} />
            </div>

            {/* Connector → Roots (shows flow quantities) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 0' }}>
              <div style={{ width: 2, height: 8, background: J.seed, opacity: 0.35, borderRadius: 1 }} />
              <div style={{ background: c.surface2, borderRadius: 14, padding: '9px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, margin: '2px 0', minWidth: 170 }}>
                <div style={{ font: '700 11px ui-monospace, monospace', color: J.seed }}>
                  🌰 {journey.totalIncome > 0 ? fmt(journey.totalIncome) : '—'}
                </div>
                <div style={{ width: 1.5, height: 8, background: `linear-gradient(to bottom,${J.seed},${J.roots})`, opacity: 0.45, borderRadius: 1 }} />
                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>
                  {journey.rootsPct > 0 ? `${journey.rootsPct}% directed to future` : '↓'}
                </div>
                <div style={{ width: 1.5, height: 8, background: `linear-gradient(to bottom,${J.seed},${J.roots})`, opacity: 0.45, borderRadius: 1 }} />
                <div style={{ font: '700 11px ui-monospace, monospace', color: J.roots }}>
                  🌱 {journey.rootsTotal > 0 ? fmt(journey.rootsTotal) : '—'}
                </div>
              </div>
              <div style={{ width: 2, height: 8, background: J.roots, opacity: 0.35, borderRadius: 1 }} />
            </div>

            {/* ===== ROOTS ===== */}
            <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${J.roots}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 26, lineHeight: '1' }}>🌱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: J.roots }}>Roots</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Future wealth directed</div>
                </div>
                <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{journey.rootsTotal > 0 ? fmt(journey.rootsTotal) : '—'}</div>
              </div>
              {[
                { label: 'Commitments', amt: journey.commitmentsPaid },
                { label: 'Savings',     amt: journey.savingsContributed },
                { label: 'Goals',       amt: journey.goalsContributed },
              ].some(r => r.amt > 0)
                ? <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {[
                      { label: 'Commitments', amt: journey.commitmentsPaid },
                      { label: 'Savings',     amt: journey.savingsContributed },
                      { label: 'Goals',       amt: journey.goalsContributed },
                    ].filter(r => r.amt > 0).map(r => (
                      <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{r.label}</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(r.amt)}</span>
                      </div>
                    ))}
                  </div>
                : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No roots built yet this cycle</div>
              }
              <JourneyMilestones items={journey.milestones} section="roots" color={J.roots} />
            </div>

            {/* Connector → Stem */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
              <div style={{ width: 2, height: 28, background: `linear-gradient(to bottom,${J.roots},${J.stem})`, opacity: 0.35, borderRadius: 1 }} />
            </div>

            {/* ===== STEM ===== */}
            <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${J.stem}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.challengeEnabled ? 12 : 0 }}>
                <span style={{ fontSize: 26, lineHeight: '1' }}>🌿</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: J.stem }}>Stem</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Daily habits & discipline</div>
                </div>
                {journey.challengeEnabled && journey.streak > 0 && (
                  <div style={{ font: '800 14px Plus Jakarta Sans', color: J.stem }}>{journey.streak}d streak</div>
                )}
              </div>
              {!journey.challengeEnabled
                ? <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Enable the Daily Challenge to grow your stem</div>
                : <>
                    {journey.totalDays > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Success rate</span>
                          <span style={{ font: '700 11px Plus Jakarta Sans', color: c.ink }}>{journey.successDays} / {journey.totalDays} days · {journey.successRate}%</span>
                        </div>
                        <div style={{ height: 5, background: c.faint, borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${journey.successRate}%`, background: J.stem, borderRadius: 999, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { label: 'Leaves', value: journey.leavesEarned },
                        { label: 'Streak', value: `${journey.streak}d` },
                        ...(journey.successRate > 0 ? [{ label: 'Success', value: `${journey.successRate}%` }] : []),
                      ].map(item => (
                        <div key={item.label} style={{ flex: 1, background: c.surface2, borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
                          <div style={{ font: '800 15px Plus Jakarta Sans', color: J.stem }}>{item.value}</div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <JourneyMilestones items={journey.milestones} section="stem" color={J.stem} />
                  </>
              }
            </div>

            {/* Connector → Branches */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
              <div style={{ width: 2, height: 28, background: `linear-gradient(to bottom,${J.stem},${J.branch})`, opacity: 0.35, borderRadius: 1 }} />
            </div>

            {/* ===== BRANCHES ===== */}
            <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${J.branch}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.wealthItems.length > 0 ? 12 : 0 }}>
                <span style={{ fontSize: 26, lineHeight: '1' }}>🌳</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: J.branch }}>Branches</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Wealth growing</div>
                </div>
                {journey.totalWealth > 0 && <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink }}>{fmt(journey.totalWealth)}</div>}
              </div>
              {journey.wealthItems.length === 0
                ? <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                    {state.settings.track_savings ? 'No active investments yet' : 'Enable savings tracking to see your branches'}
                  </div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {journey.wealthItems.map(item => (
                      <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{item.type}</div>
                        </div>
                        <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(item.value)}</div>
                      </div>
                    ))}
                  </div>
              }
              <JourneyMilestones items={journey.milestones} section="branch" color={J.branch} />
            </div>

            {/* Connector → Flowers */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
              <div style={{ width: 2, height: 28, background: `linear-gradient(to bottom,${J.branch},${J.flower})`, opacity: 0.35, borderRadius: 1 }} />
            </div>

            {/* ===== FLOWERS ===== */}
            <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${J.flower}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.goalItems.length > 0 ? 12 : 0 }}>
                <span style={{ fontSize: 26, lineHeight: '1' }}>🌺</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '700 14px Plus Jakarta Sans', color: J.flower }}>Flowers</div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Goals & milestones</div>
                </div>
                {journey.activeGoals > 0 && <div style={{ font: '800 14px Plus Jakarta Sans', color: c.ink }}>{journey.activeGoals} active</div>}
              </div>
              {journey.goalItems.length === 0
                ? <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                    Set a goal to see your first flower bloom
                  </div>
                : <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {journey.goalItems.map(g => (
                        <div key={g.name}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                            {g.completed
                              ? <span style={{ font: '700 10px Plus Jakarta Sans', color: J.flower, background: J.flower + '18', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>🌺 Bloomed</span>
                              : <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{g.pct}%</span>
                            }
                          </div>
                          <div style={{ height: 5, background: c.faint, borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${g.pct}%`, background: g.completed ? J.flower : J.flower + 'AA', borderRadius: 999, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {journey.completedGoals > 0 && (
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: J.flower, textAlign: 'center', marginTop: 12 }}>
                        {journey.completedGoals} goal{journey.completedGoals > 1 ? 's' : ''} bloomed this cycle
                      </div>
                    )}
                    <JourneyMilestones items={journey.milestones} section="flower" color={J.flower} />
                  </>
              }
            </div>

            {/* ===== CYCLE COMPARISON ===== */}
            {journey.hasPrevData && (
              <div style={{ marginTop: 16, background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 12 }}>Compared to Last Cycle</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Roots',   curr: journey.rootsTotal,        prev: journey.prevRootsTotal,        color: J.roots  },
                    { label: 'Savings', curr: journey.savingsContributed, prev: journey.prevSavingsContributed, color: J.branch },
                  ].filter(row => row.prev > 0 || row.curr > 0).map(row => {
                    const diff = row.prev > 0 ? Math.round(((row.curr - row.prev) / row.prev) * 100) : null
                    return (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: row.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>{row.label}</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(row.curr)}</span>
                        {diff !== null && (
                          <span style={{
                            font: '700 11px Plus Jakarta Sans',
                            color: diff >= 0 ? '#16A34A' : '#EF4444',
                            background: diff >= 0 ? '#16A34A18' : '#EF444418',
                            borderRadius: 6, padding: '2px 8px', minWidth: 44, textAlign: 'center', flexShrink: 0,
                          }}>
                            {diff >= 0 ? '+' : ''}{diff}%
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {journey.activeGoals > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: J.flower, flexShrink: 0 }} />
                      <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>Flowers</span>
                      <span style={{ font: '600 11px Plus Jakarta Sans', color: J.flower }}>
                        {journey.activeGoals} active{journey.completedGoals > 0 ? ` · ${journey.completedGoals} bloomed` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Mint Analytics AI ─────────────────────────────── */}
        {(state.settings.autopilot_enabled ?? false) && tab !== 'journey' && (
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${c.faint}` }}>

          {!insight && !loadingInsight && (
            <button
              onClick={handleInsight}
              style={{
                width: '100%', border: 'none', borderRadius: 18, padding: '14px 20px',
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Watermark: Mint leaf — echo (behind) */}
              <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"
                style={{ position: 'absolute', right: -36, bottom: -40, width: 200, height: 200, pointerEvents: 'none', transform: 'rotate(18deg)' }}>
                <path d="M101 395.49C236.782 395.49 330.786 318.895 363.861 177.89C228.078 177.89 134.075 254.485 101 395.49Z" fill="rgba(255,255,255,0.07)"/>
              </svg>
              {/* Watermark: Mint leaf — primary */}
              <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"
                style={{ position: 'absolute', right: -16, bottom: -24, width: 165, height: 165, pointerEvents: 'none', transform: 'rotate(10deg)' }}>
                <path d="M101 395.49C236.782 395.49 330.786 318.895 363.861 177.89C228.078 177.89 134.075 254.485 101 395.49Z" fill="rgba(255,255,255,0.22)"/>
                <path opacity="0.7" d="M119.93 377.33C187.33 296.93 259.29 245.87 354.43 186.33" stroke="rgba(255,255,255,0.18)" strokeWidth="12.288" strokeLinecap="round"/>
                <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z" fill="rgba(255,255,255,0.18)"/>
              </svg>
              {/* Sparkles */}
              <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.28)" stroke="none" style={{ position: 'absolute', right: 88, top: 6, width: 52, height: 52, pointerEvents: 'none', transform: 'rotate(-10deg)' }}>
                <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
              </svg>
              <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.18)" stroke="none" style={{ position: 'absolute', right: 44, bottom: 6, width: 36, height: 36, pointerEvents: 'none', transform: 'rotate(22deg)' }}>
                <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
              </svg>
              <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.14)" stroke="none" style={{ position: 'absolute', right: 148, top: 8, width: 26, height: 26, pointerEvents: 'none', transform: 'rotate(45deg)' }}>
                <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
              </svg>
              <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.10)" stroke="none" style={{ position: 'absolute', left: '44%', bottom: 8, width: 20, height: 20, pointerEvents: 'none', transform: 'rotate(-20deg)' }}>
                <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
              </svg>
              <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.08)" stroke="none" style={{ position: 'absolute', right: 200, bottom: 5, width: 16, height: 16, pointerEvents: 'none', transform: 'rotate(60deg)' }}>
                <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
              </svg>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, overflow: 'hidden', flexShrink: 0 }}>
                  <img src="/mint-ai-logo.svg" width="42" height="42" alt="Mint AI" style={{ display: 'block' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ font: '800 16px Plus Jakarta Sans', letterSpacing: '-0.01em' }}>Mint Analytics</span>
                    <span style={{ font: '700 10px Plus Jakarta Sans', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.92)', borderRadius: 6, padding: '2px 7px', border: '1px solid rgba(255,255,255,0.25)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/></svg>AI Insights
                    </span>
                  </div>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>AI insight on your spending patterns</div>
                </div>
              </div>

              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: 'relative' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}

          {loadingInsight && (
            <div style={{ borderRadius: 16, padding: '16px', background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)', border: '1px solid #6366F122' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  <img src="/mint-ai-logo.svg" width="28" height="28" alt="Mint AI" style={{ display: 'block' }} />
                </div>
                <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint Analytics is thinking…</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[100, 80, 60].map(w => (
                  <div key={w} style={{ height: 10, width: `${w}%`, background: '#6366F118', borderRadius: 999, animation: 'pulse 1.4s ease-in-out infinite' }} />
                ))}
              </div>
            </div>
          )}

          {insight && (
            <div style={{ borderRadius: 16, padding: '16px', background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)', border: '1px solid #6366F130' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  <img src="/mint-ai-logo.svg" width="28" height="28" alt="Mint AI" style={{ display: 'block' }} />
                </div>
                <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: -1, marginRight: 4 }}><path d="M12 2l2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/></svg>Mint Analytics</span>
                <button
                  onClick={() => { setInsight(null); setInsightError(null) }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', font: '600 11px Plus Jakarta Sans', padding: 0, opacity: 0.7 }}
                >
                  Regenerate ↺
                </button>
              </div>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.7 }}>{insight}</div>
            </div>
          )}

          {insightError && (
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, padding: '8px 0' }}>{insightError}</div>
          )}
        </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } .tab-scroll::-webkit-scrollbar{display:none}`}</style>
    </div>,
    document.body
  )
}
