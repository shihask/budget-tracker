import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sprout, Leaf, Flame, TreeDeciduous, Flower2, Coins, TrendingUp, Target, ShoppingCart, UtensilsCrossed, Lightbulb, Fuel, ShoppingBag, Hospital, CircleDot, ChevronDown, Coffee, Landmark, Package, Wrench, Zap, Users, ChefHat, Home } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { weeklyTrend, weeklyBars, categorySplit, monthTimeline, journeyData, monthLabelForOffset } from '@/lib/data'
import { AreaTrend } from './Charts'
import { analyticsInsightWithAI } from '@/lib/gemini'
import type { AppState, DerivedMetrics, JourneyMilestone } from '@/types'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell as PieCell,
} from 'recharts'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  sprout: Sprout, leaf: Leaf, flame: Flame, tree: TreeDeciduous, flower: Flower2,
  coins: Coins, 'trending-up': TrendingUp, target: Target, 'shopping-cart': ShoppingCart,
  utensils: UtensilsCrossed, lightbulb: Lightbulb, fuel: Fuel, 'shopping-bag': ShoppingBag,
  hospital: Hospital, 'circle-dot': CircleDot,
}
function IconByName({ name, size = 16, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  const Icon = ICON_MAP[name]
  return Icon ? <Icon size={size} style={style} /> : null
}

// Icons for Timeline's By Category / By Group lanes — falls back to a group-type icon, then a generic dot.
const TIMELINE_CAT_ICON: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  'Food': UtensilsCrossed, 'Tea & Snacks': Coffee, 'Groceries': ShoppingCart, 'Fuel': Fuel,
  'Shopping': ShoppingBag, 'Medical': Hospital, 'Utilities': Lightbulb, 'Kitchen': ChefHat,
  'Granite': Package, 'Electrical': Zap, 'Plumbing': Wrench, 'Family': Users,
  'Other': Package, 'Borrow Repayment': Landmark, 'Borrowing': Landmark,
}
const GROUP_TYPE_ICON: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  essential: Home, commitment: Landmark, discretionary: ShoppingBag, savings: Coins,
}
function iconForLane(name: string, groupType?: string) {
  return TIMELINE_CAT_ICON[name] || (groupType && GROUP_TYPE_ICON[groupType]) || CircleDot
}
// Consistent taxonomy so By Category and By Group agree on color: essentials green, lifestyle/discretionary orange, commitments blue, everything else gray.
function groupTypeColor(groupType: string | undefined, c: { good: string; warn: string; muted: string }): string {
  switch (groupType) {
    case 'essential': return c.good
    case 'discretionary': return c.warn
    case 'commitment': return '#3B82F6'
    case 'savings': return '#14B8A6'
    default: return c.muted
  }
}

type Tab = 'trend' | 'weeks' | 'category' | 'timeline' | 'journey'
type TrendRange = 7 | 15 | 30
const TABS: [Tab, string][] = [['trend', 'Trend'], ['weeks', 'Weekly'], ['category', 'Category'], ['timeline', 'Timeline'], ['journey', 'Journey']]
const TREND_RANGES: [TrendRange, string][] = [[7, '7D'], [15, '15D'], [30, '30D']]
const BAR_MAX_H = 72
const DAY_W = 32
const WEEK_BAR_W = 46
const WEEKS_HISTORY = 20
const MAX_MONTHS_BACK = 36
const MAX_CYCLES_BACK = 24
const J = { seed: '#D97706', roots: '#059669', stem: '#16A34A', branch: '#0D9488', flower: '#D946EF' }

function NavChevron({ dir, disabled, onClick }: { dir: 'left' | 'right'; disabled?: boolean; onClick: () => void }) {
  const c = useTheme()
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'left' ? 'Previous' : 'Next'}
      style={{
        width: 30, height: 30, borderRadius: 9, border: 'none', flexShrink: 0,
        background: c.surface2, color: disabled ? c.faint : c.ink,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  )
}

function PeriodNav({ label, onPrev, onNext, prevDisabled, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean }) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
      <NavChevron dir="left" onClick={onPrev} disabled={prevDisabled} />
      <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink, textAlign: 'center', flex: 1, letterSpacing: '-0.01em' }}>{label}</div>
      <NavChevron dir="right" onClick={onNext} disabled={nextDisabled} />
    </div>
  )
}

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
          <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><IconByName name={m.emoji} size={14} /></span>
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
  const [trendRange, setTrendRange] = useState<TrendRange>(7)
  const [insight, setInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [timelineView, setTimelineView] = useState<'day' | 'category' | 'group'>('day')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [replayExpanded, setReplayExpanded] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [journeyView, setJourneyView] = useState<'flow' | 'timeline' | 'plant'>(() => {
    try { return (localStorage.getItem('mp-journey-view') as 'flow' | 'timeline' | 'plant') || 'flow' } catch { return 'flow' }
  })
  const switchJourneyView = (v: 'flow' | 'timeline' | 'plant') => {
    setJourneyView(v); try { localStorage.setItem('mp-journey-view', v) } catch {}
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const barsScrollRef = useRef<HTMLDivElement>(null)

  // Past-period navigation — Category/Timeline share a calendar-month offset, Journey has its own cycle offset
  const [monthOffset, setMonthOffset] = useState(0)
  const [cycleOffset, setCycleOffset] = useState(0)
  useEffect(() => { setSelectedDay(null) }, [monthOffset])
  const goPrevMonth = () => setMonthOffset(o => Math.min(MAX_MONTHS_BACK, o + 1))
  const goNextMonth = () => setMonthOffset(o => Math.max(0, o - 1))
  const goPrevCycle = () => setCycleOffset(o => Math.min(MAX_CYCLES_BACK, o + 1))
  const goNextCycle = () => setCycleOffset(o => Math.max(0, o - 1))

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

  const trend    = useMemo(() => weeklyTrend(state, trendRange), [state, trendRange])
  const bars     = useMemo(() => weeklyBars(state, WEEKS_HISTORY), [state])
  const cats     = useMemo(() => categorySplit(state, monthOffset), [state, monthOffset])
  const timeline = useMemo(() => monthTimeline(state, monthOffset), [state, monthOffset])
  const catsMonthLabel = monthOffset === 0 ? 'This month' : monthLabelForOffset(monthOffset)
  const maxDayTotal = useMemo(() => Math.max(...timeline.byDay.map(d => d.total), 1), [timeline])
  const journey  = useMemo(() => journeyData(state, cycleOffset), [state, cycleOffset])

  useEffect(() => {
    if (tab === 'weeks' && barsScrollRef.current) {
      const el = barsScrollRef.current
      requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth })
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'timeline' && timelineView === 'day' && scrollRef.current) {
      const containerW = scrollRef.current.clientWidth
      scrollRef.current.scrollLeft = timeline.isCurrentMonth
        ? (timeline.todayDay - 1) * DAY_W - containerW / 2 + DAY_W / 2
        : 0
    }
  }, [tab, timelineView, timeline.todayDay, timeline.isCurrentMonth])

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
        <button onClick={onClose} aria-label="Go back" style={{
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink }}>{fmt(trendTotal)}</div>
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
            {trendRange === 7 && (
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
            )}
          </div>
        )}

        {/* ── Weekly ────────────────────────────────────────── */}
        {tab === 'weeks' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Lifestyle spend per week</div>
              <div style={{ font: '500 10.5px Plus Jakarta Sans', color: c.muted }}>← scroll for older weeks</div>
            </div>
            <div ref={barsScrollRef} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
              <div style={{ width: Math.max(bars.length * WEEK_BAR_W, 300) }}>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={bars} margin={{ top: 22, right: 4, left: 4, bottom: 0 }} barSize={24}>
                    <XAxis dataKey="label" tick={{ fontSize: 9.5, fontFamily: 'ui-monospace, monospace', fill: c.muted }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10, fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: c.ink }}
                      formatter={(v) => [fmt(Number(v)), 'Spent']}
                      cursor={{ fill: c.faint }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 8, 8]}
                      label={{ position: 'top', fontSize: 9.5, fontFamily: 'ui-monospace, monospace', fontWeight: 700, fill: c.muted }}>
                      {bars.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

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
          <div>
            <PeriodNav
              label={catsMonthLabel}
              onPrev={goPrevMonth}
              onNext={goNextMonth}
              prevDisabled={monthOffset >= MAX_MONTHS_BACK}
              nextDisabled={monthOffset === 0}
            />
            {cats.length === 0 ? (
              <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>
                No lifestyle spend in {monthOffset === 0 ? 'this month' : catsMonthLabel} yet.
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
                      <div style={{ font: '500 10px ui-monospace, monospace', color: c.muted }}>{catsMonthLabel.toUpperCase()}</div>
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
            )}
          </div>
        )}

        {/* ── Timeline ──────────────────────────────────────── */}
        {tab === 'timeline' && (
          <div>
            <PeriodNav
              label={timeline.monthLabel}
              onPrev={goPrevMonth}
              onNext={goNextMonth}
              prevDisabled={monthOffset >= MAX_MONTHS_BACK}
              nextDisabled={monthOffset === 0}
            />

            {/* Month total */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink }}>{fmt(timeline.totalSpent)}</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>total spent</div>
              </div>
              {timeline.txnCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, font: '600 11px Plus Jakarta Sans', color: c.muted }}>
                  <span>{timeline.txnCount} transaction{timeline.txnCount !== 1 ? 's' : ''}</span>
                  {timeline.byCategory[0] && (
                    <>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span>Top: <span style={{ color: c.ink, fontWeight: 700 }}>{timeline.byCategory[0].name}</span> ({Math.round((timeline.byCategory[0].total / timeline.totalSpent) * 100)}%)</span>
                    </>
                  )}
                </div>
              )}
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
                      const isToday = timeline.isCurrentMonth && d.day === timeline.todayDay
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
                ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>No expenses in {timeline.monthLabel} yet.</div>
                : <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {timeline.byCategory.map(lane => {
                        const maxAmt    = Math.max(...lane.days.map(d => d.amount), 1)
                        const groupType = state.groups.find(g => g.name === lane.group)?.type
                        const laneColor = groupTypeColor(groupType, c)
                        const LaneIcon  = iconForLane(lane.name, groupType)
                        return (
                          <div key={lane.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <span style={{ width: 26, height: 26, borderRadius: 8, background: laneColor + '1F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <LaneIcon size={13} style={{ color: laneColor }} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.name}</div>
                                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>{lane.count} txn{lane.count !== 1 ? 's' : ''}</div>
                              </div>
                              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(lane.total)}</span>
                            </div>
                            <div style={{ position: 'relative', height: 18, background: c.faint, borderRadius: 999 }}>
                              {/* today line */}
                              {timeline.isCurrentMonth && (
                                <div style={{ position: 'absolute', left: `${(timeline.todayDay / timeline.daysInMonth) * 100}%`, top: -3, bottom: -3, width: 1.5, background: c.accent, borderRadius: 1, opacity: 0.5 }} />
                              )}
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
                    <TimelineDayRuler daysInMonth={timeline.daysInMonth} todayDay={timeline.isCurrentMonth ? timeline.todayDay : -1} mutedColor={c.muted} accentColor={c.accent} />
                  </div>
            )}

            {/* ── By Group ── */}
            {timelineView === 'group' && (
              timeline.byGroup.length === 0
                ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>No expenses in {timeline.monthLabel} yet.</div>
                : <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {timeline.byGroup.map(lane => {
                        const maxAmt    = Math.max(...lane.days.map(d => d.amount), 1)
                        const groupType = state.groups.find(g => g.name === lane.name)?.type
                        const laneColor = groupTypeColor(groupType, c)
                        const LaneIcon  = iconForLane(lane.name, groupType)
                        return (
                          <div key={lane.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <span style={{ width: 26, height: 26, borderRadius: 8, background: laneColor + '1F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <LaneIcon size={13} style={{ color: laneColor }} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.name}</div>
                                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>{lane.count} txn{lane.count !== 1 ? 's' : ''}</div>
                              </div>
                              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(lane.total)}</span>
                            </div>
                            <div style={{ position: 'relative', height: 18, background: c.faint, borderRadius: 999 }}>
                              {timeline.isCurrentMonth && (
                                <div style={{ position: 'absolute', left: `${(timeline.todayDay / timeline.daysInMonth) * 100}%`, top: -3, bottom: -3, width: 1.5, background: c.accent, borderRadius: 1, opacity: 0.5 }} />
                              )}
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
                    <TimelineDayRuler daysInMonth={timeline.daysInMonth} todayDay={timeline.isCurrentMonth ? timeline.todayDay : -1} mutedColor={c.muted} accentColor={c.accent} />
                  </div>
            )}
          </div>
        )}

        {/* ── Journey ───────────────────────────────────────── */}
        {tab === 'journey' && (() => {
          const plantStage = journey.healthScore < 20 ? 1 : journey.healthScore < 40 ? 2 : journey.healthScore < 60 ? 3 : journey.healthScore < 80 ? 4 : 5
          const stageLabel  = ['Seedling', 'Sprouting', 'Young Plant', 'Growing', 'Blooming'][plantStage - 1]
          const nextLabel   = ['Sprouting', 'Young Plant', 'Growing', 'Blooming', '—'][plantStage - 1]
          const nextPts     = plantStage < 5 ? [20,40,60,80,100][plantStage - 1] - journey.healthScore : 0
          const PlantIcon   = [Sprout, Leaf, TreeDeciduous, TreeDeciduous, Flower2][plantStage - 1]
          const hColor      = journey.healthScore >= 80 ? '#D946EF' : journey.healthScore >= 60 ? '#0D9488' : journey.healthScore >= 40 ? '#16A34A' : journey.healthScore >= 20 ? '#D97706' : '#9CA3AF'
          const treeStages = [
            { icon: 'flower', label: 'Flowers', value: journey.activeGoals > 0 ? `${journey.activeGoals} active` : '—', color: J.flower, has: journey.activeGoals > 0 },
            { icon: 'tree', label: 'Branches', value: journey.totalWealth > 0 ? fmt(journey.totalWealth) : '—', color: J.branch, has: journey.totalWealth > 0 },
            { icon: 'leaf', label: 'Stem', value: journey.challengeEnabled && journey.successDays > 0 ? `${journey.successDays} wins` : '—', color: J.stem, has: journey.challengeEnabled && journey.successDays > 0 },
            { icon: 'sprout', label: 'Roots', value: journey.rootsTotal > 0 ? fmt(journey.rootsTotal) : '—', color: J.roots, has: journey.rootsTotal > 0 },
            { icon: 'circle-dot', label: 'Seed', value: journey.totalIncome > 0 ? fmt(journey.totalIncome) : '—', color: J.seed, has: journey.totalIncome > 0 },
          ]
          return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* Header + view switcher */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <NavChevron dir="left" onClick={goPrevCycle} disabled={cycleOffset >= MAX_CYCLES_BACK} />
                <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', flex: 1, textAlign: 'center' }}>
                  {journey.cycleLabel} Journey
                </div>
                <NavChevron dir="right" onClick={goNextCycle} disabled={cycleOffset === 0} />
              </div>
              <div style={{ display: 'flex', gap: 3, background: c.surface2, borderRadius: 12, padding: 3 }}>
                {(['flow', 'timeline', 'plant'] as const).map(v => (
                  <button key={v} onClick={() => switchJourneyView(v)} style={{
                    flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '8px 0',
                    font: '700 11.5px Plus Jakarta Sans', transition: 'all 0.2s', whiteSpace: 'nowrap',
                    background: journeyView === v ? c.surface : 'transparent',
                    color: journeyView === v ? c.ink : c.muted,
                    boxShadow: journeyView === v ? c.cardShadow : 'none',
                  }}>
                    {v === 'flow' ? 'Flow' : v === 'timeline' ? 'Timeline' : 'Plant'}
                  </button>
                ))}
              </div>
            </div>

            {/* ─────── FLOW VIEW ─────── */}
            {journeyView === 'flow' && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>

                {/* Income */}
                <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${c.faint}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.incomeItems.length > 0 ? 12 : 0 }}>
                    <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><Coins size={22} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Income</div>
                      <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{journey.totalIncome > 0 ? fmt(journey.totalIncome) : '—'}</div>
                    </div>
                  </div>
                  {journey.incomeItems.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {journey.incomeItems.map(item => (
                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{item.name}</span>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No income logged this cycle</div>
                  }
                </div>

                {/* → Savings connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 0' }}>
                  <div style={{ width: 1.5, height: 8, background: '#10B981', opacity: 0.35, borderRadius: 1 }} />
                  {journey.rootsPct > 0 && (
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 8, padding: '2px 10px', margin: '2px 0' }}>
                      ↓ {journey.rootsPct}% to savings
                    </div>
                  )}
                  <div style={{ width: 1.5, height: 8, background: '#10B981', opacity: 0.35, borderRadius: 1 }} />
                </div>

                {/* Saved & Invested */}
                <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid #10B98120` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><Sprout size={22} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Saved & Invested</div>
                      <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{journey.rootsTotal > 0 ? fmt(journey.rootsTotal) : '—'}</div>
                    </div>
                    {journey.rootsPct > 0 && <div style={{ font: '700 13px Plus Jakarta Sans', color: '#10B981' }}>{journey.rootsPct}%</div>}
                  </div>
                  {journey.totalIncome > 0 && journey.rootsTotal > 0 && (
                    <div style={{ height: 4, background: c.faint, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, journey.rootsPct)}%`, background: '#10B981', borderRadius: 999, transition: 'width 0.8s ease' }} />
                    </div>
                  )}
                  {journey.savedBreakdown.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {journey.savedBreakdown.map(item => (
                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{item.name}</span>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Nothing saved this cycle yet</div>
                  }
                </div>

                {/* → Lifestyle connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 0' }}>
                  <div style={{ width: 1.5, height: 8, background: '#F59E0B', opacity: 0.35, borderRadius: 1 }} />
                  {journey.spendingPct > 0 && (
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 8, padding: '2px 10px', margin: '2px 0' }}>
                      ↓ {journey.spendingPct}% to lifestyle
                    </div>
                  )}
                  <div style={{ width: 1.5, height: 8, background: '#F59E0B', opacity: 0.35, borderRadius: 1 }} />
                </div>

                {/* Lifestyle Spending */}
                <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid #F59E0B20` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.lifestyleCategories.length > 0 ? 10 : 0 }}>
                    <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><ShoppingCart size={22} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Lifestyle Spending</div>
                      <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{journey.lifestyleSpending > 0 ? fmt(journey.lifestyleSpending) : '—'}</div>
                    </div>
                    {journey.spendingPct > 0 && <div style={{ font: '700 13px Plus Jakarta Sans', color: '#F59E0B' }}>{journey.spendingPct}%</div>}
                  </div>
                  {journey.totalIncome > 0 && journey.lifestyleSpending > 0 && (
                    <div style={{ height: 4, background: c.faint, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, journey.spendingPct)}%`, background: '#F59E0B', borderRadius: 999, transition: 'width 0.8s ease' }} />
                    </div>
                  )}
                  {journey.lifestyleCategories.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {journey.lifestyleCategories.map(item => (
                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{item.name}</span>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>No lifestyle spending this cycle</div>
                  }
                </div>

                {/* → Wealth connector */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
                  <div style={{ width: 1.5, height: 26, background: 'linear-gradient(to bottom,#6366F1,#8B5CF6)', opacity: 0.3, borderRadius: 1 }} />
                </div>

                {/* Wealth Built */}
                <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid #6366F120` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.wealthItems.length > 0 ? 12 : 0 }}>
                    <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><TrendingUp size={22} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Wealth Built</div>
                      <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{journey.totalWealth > 0 ? fmt(journey.totalWealth) : '—'}</div>
                    </div>
                    {journey.efficiencyPct > 0 && journey.totalWealth !== journey.totalIncome && (
                      <div style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>{journey.efficiencyPct}% eff.</div>
                    )}
                  </div>
                  {journey.wealthItems.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {journey.wealthItems.slice(0, 4).map(item => (
                          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                              <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{item.type}</div>
                            </div>
                            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, flexShrink: 0 }}>{fmt(item.value)}</div>
                          </div>
                        ))}
                      </div>
                    : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                        {state.settings.track_savings ? 'No active investments yet' : 'Enable savings tracking to see your wealth'}
                      </div>
                  }
                </div>

                {/* → Goals connector */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
                  <div style={{ width: 1.5, height: 26, background: 'linear-gradient(to bottom,#D946EF,#EC4899)', opacity: 0.3, borderRadius: 1 }} />
                </div>

                {/* Goals */}
                <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid #D946EF20` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: journey.goalItems.length > 0 ? 12 : 0 }}>
                    <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><Target size={22} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Goals</div>
                      <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{journey.activeGoals > 0 ? `${journey.activeGoals} Active` : '—'}</div>
                    </div>
                  </div>
                  {journey.goalItems.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {journey.goalItems.map(g => (
                          <div key={g.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>{g.name}</span>
                              {g.completed
                                ? <span style={{ font: '700 10px Plus Jakarta Sans', color: '#D946EF', background: '#D946EF18', borderRadius: 5, padding: '1px 7px' }}>Done</span>
                                : <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{g.pct}%</span>
                              }
                            </div>
                            <div style={{ height: 4, background: c.faint, borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${g.pct}%`, background: g.completed ? '#D946EF' : '#D946EF88', borderRadius: 999, transition: 'width 0.8s ease' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    : <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Set a goal to track progress here</div>
                  }
                </div>

                {/* vs Last Cycle */}
                {journey.hasPrevData && (
                  <div style={{ marginTop: 14, background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${c.faint}` }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 12 }}>vs Last Cycle</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { label: 'Saved & Invested', curr: journey.rootsTotal, prev: journey.prevRootsTotal, color: '#10B981' },
                        { label: 'Savings', curr: journey.savingsContributed, prev: journey.prevSavingsContributed, color: '#6366F1' },
                      ].filter(r => r.prev > 0 || r.curr > 0).map(row => {
                        const diff = row.prev > 0 ? Math.round(((row.curr - row.prev) / row.prev) * 100) : null
                        return (
                          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: row.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>{row.label}</span>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(row.curr)}</span>
                            {diff !== null && (
                              <span style={{ font: '700 11px Plus Jakarta Sans', color: diff >= 0 ? '#16A34A' : '#EF4444', background: diff >= 0 ? '#16A34A18' : '#EF444418', borderRadius: 6, padding: '2px 8px', minWidth: 44, textAlign: 'center', flexShrink: 0 }}>
                                {diff >= 0 ? '+' : ''}{diff}%
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ─────── TIMELINE VIEW ─────── */}
            {journeyView === 'timeline' && (
              <div>
                {journey.replayEvents.length === 0
                  ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>No events to replay this cycle yet.</div>
                  : (() => {
                      const grouped: Record<string, typeof journey.replayEvents> = {}
                      journey.replayEvents.forEach(ev => {
                        if (!grouped[ev.date]) grouped[ev.date] = []
                        grouped[ev.date].push(ev)
                      })
                      const dates = Object.keys(grouped).sort()
                      return (
                        <div style={{ background: c.surface, borderRadius: 18, padding: '14px 16px', boxShadow: c.cardShadow }}>
                          {dates.map((date, di) => {
                            const evs = grouped[date]
                            const isLast = di === dates.length - 1
                            const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                            const nonExpenses = evs.filter(e => e.eventType !== 'expense')
                            const expenses = evs.filter(e => e.eventType === 'expense').sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
                            const shownExpenses = expenses.slice(0, 2)
                            const hiddenExpenses = expenses.slice(2)
                            const hiddenTotal = hiddenExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)
                            const isDayExpanded = expandedDays.has(date)
                            const alwaysShown = [...nonExpenses, ...shownExpenses]
                            const toggleDay = () => setExpandedDays(prev => {
                              const next = new Set(prev)
                              isDayExpanded ? next.delete(date) : next.add(date)
                              return next
                            })
                            return (
                              <div key={date} style={{ display: 'flex', gap: 12 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
                                  <div style={{ font: '700 10px ui-monospace, monospace', color: c.muted, textAlign: 'center', lineHeight: 1.3, marginTop: 3, whiteSpace: 'nowrap' }}>{dateLabel}</div>
                                  {!isLast && <div style={{ width: 1.5, flex: 1, marginTop: 5, background: c.faint, borderRadius: 1 }} />}
                                </div>
                                <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {alwaysShown.map((ev, ei) => (
                                    <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <span style={{ lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}><IconByName name={ev.emoji} size={17} /></span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                                        {ev.subtitle && <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{ev.subtitle}</div>}
                                      </div>
                                      {ev.amount != null && (
                                        <div style={{ font: '700 12px Plus Jakarta Sans', color: ev.eventType === 'income' ? '#10B981' : c.ink, flexShrink: 0 }}>
                                          {ev.eventType === 'income' ? '+' : ''}{fmt(ev.amount)}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {hiddenExpenses.length > 0 && (
                                    <>
                                      <div style={{ display: 'grid', gridTemplateRows: isDayExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 280ms ease' }}>
                                        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, opacity: isDayExpanded ? 1 : 0, transition: `opacity ${isDayExpanded ? '220ms ease 60ms' : '120ms ease'}` }}>
                                          {hiddenExpenses.map((ev, ei) => (
                                            <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                              <span style={{ lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}><IconByName name={ev.emoji} size={17} /></span>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                                                {ev.subtitle && <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{ev.subtitle}</div>}
                                              </div>
                                              {ev.amount != null && (
                                                <div style={{ font: '700 12px Plus Jakarta Sans', color: ev.eventType === 'income' ? '#10B981' : c.ink, flexShrink: 0 }}>
                                                  {ev.eventType === 'income' ? '+' : ''}{fmt(ev.amount)}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <button onClick={toggleDay} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                                        <span style={{ lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}><ShoppingCart size={17} color={c.muted} /></span>
                                        <div style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                                          {isDayExpanded ? 'Show less' : `${hiddenExpenses.length} more expense${hiddenExpenses.length > 1 ? 's' : ''}`}
                                        </div>
                                        {!isDayExpanded && <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>{fmt(hiddenTotal)}</div>}
                                        <ChevronDown size={14} color={c.muted} style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isDayExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()
                }
              </div>
            )}

            {/* ─────── PLANT VIEW ─────── */}
            {journeyView === 'plant' && (
              <div>
                {/* Plant + score */}
                <div style={{ background: c.surface, borderRadius: 20, padding: '28px 20px 22px', boxShadow: c.cardShadow, border: `1px solid ${hColor}22`, marginBottom: 14, textAlign: 'center' }}>
                  <div style={{ lineHeight: 1, marginBottom: 14, display: 'inline-flex', animation: 'sway 3s ease-in-out infinite', transformOrigin: 'bottom center' }}>
                    <PlantIcon size={72} color={hColor} />
                  </div>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Growth Score</div>
                  <div style={{ font: '800 42px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 2 }}>{journey.healthScore}</div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginBottom: 14 }}>/ 100</div>
                  <div style={{ height: 6, background: c.faint, borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: `${journey.healthScore}%`, background: `linear-gradient(to right,#10B981,${hColor})`, borderRadius: 999, transition: 'width 1s ease' }} />
                  </div>
                  <div style={{ font: '700 15px Plus Jakarta Sans', color: hColor }}>Stage: {stageLabel}</div>
                  {plantStage < 5
                    ? <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>Next: {nextLabel} · {nextPts} pts away</div>
                    : <div style={{ font: '600 11px Plus Jakarta Sans', color: '#D946EF', marginTop: 5 }}><Flower2 size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Fully bloomed — keep growing!</div>
                  }
                </div>

                {/* Key metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Income', value: journey.totalIncome > 0 ? fmt(journey.totalIncome) : '—', icon: 'coins' },
                    { label: 'Saved', value: journey.rootsTotal > 0 ? fmt(journey.rootsTotal) : '—', icon: 'sprout' },
                    { label: 'Wealth', value: journey.totalWealth > 0 ? fmt(journey.totalWealth) : '—', icon: 'trending-up' },
                    { label: 'Goals', value: journey.activeGoals > 0 ? `${journey.activeGoals} active` : '—', icon: 'target' },
                  ].map(item => (
                    <div key={item.label} style={{ background: c.surface, borderRadius: 14, padding: '12px 14px', boxShadow: c.cardShadow, border: `1px solid ${c.faint}` }}>
                      <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}><IconByName name={item.icon} size={12} /> {item.label}</div>
                      <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Growth factors */}
                <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${c.faint}`, marginBottom: journey.milestones.length > 0 ? 14 : 0 }}>
                  <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 12 }}>Growth Factors</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {journey.healthBreakdown.map(b => (
                      <div key={b.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>{b.label}</span>
                          <span style={{ font: '700 11px Plus Jakarta Sans', color: c.ink }}>{b.score} / {b.max}</span>
                        </div>
                        <div style={{ height: 4, background: c.faint, borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(b.score / b.max) * 100}%`, background: hColor, borderRadius: 999, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Achievements */}
                {journey.milestones.length > 0 && (
                  <div style={{ background: c.surface, borderRadius: 18, padding: 16, boxShadow: c.cardShadow, border: `1px solid ${c.faint}` }}>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Achievements</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {journey.milestones.map(m => (
                        <div key={m.text} style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.surface2, borderRadius: 10, padding: '8px 12px' }}>
                          <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}><IconByName name={m.emoji} size={14} /></span>
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>{m.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ─────── OLD ANIMATED GROWTH TREE (UNUSED PLACEHOLDER) ─────── */}
            {false && <div style={{ background: c.surface, borderRadius: 20, padding: '20px 20px 18px', boxShadow: c.cardShadow, border: `1px solid ${c.faint}`, marginBottom: 14 }}>
              {/* ── Animated Growth Tree ── */}
            <div style={{ background: c.surface, borderRadius: 20, padding: '20px 20px 18px', boxShadow: c.cardShadow, border: `1px solid ${c.faint}`, marginBottom: 14 }}>
              {treeStages.map((stage, i, arr) => (
                <div key={stage.icon}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, animation: `growUp 0.4s ease ${(arr.length - 1 - i) * 120}ms both`, opacity: stage.has ? 1 : 0.3 }}>
                    <span style={{ lineHeight: 1, width: 32, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconByName name={stage.icon} size={26} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stage.label}</div>
                      <div style={{ font: '800 15px Plus Jakarta Sans', color: stage.has ? stage.color : c.muted, letterSpacing: '-0.01em' }}>{stage.value}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ paddingLeft: 15, animation: `growUp 0.3s ease ${(arr.length - 1.5 - i) * 120}ms both` }}>
                      <div style={{ width: 2, height: 20, background: `linear-gradient(to bottom,${stage.color},${arr[i + 1].color})`, opacity: (stage.has || arr[i + 1].has) ? 0.45 : 0.15, borderRadius: 1 }} />
                    </div>
                  )}
                </div>
              ))}
            </div></div>}


          </div>
          )
        })()}

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

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes growUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} @keyframes sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}} .tab-scroll::-webkit-scrollbar{display:none}`}</style>
    </div>,
    document.body
  )
}
