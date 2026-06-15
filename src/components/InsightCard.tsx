import { useState, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { AppState, DerivedMetrics } from '@/types'

type Insight = { text: string; type: 'warning' | 'positive' | 'info' | 'celebrate' }

function computeInsight(state: AppState, d: DerivedMetrics): Insight | null {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

  const expenses = state.transactions.filter(t => t.transaction_type === 'expense')
  const thisMonth = expenses.filter(t => new Date(t.transaction_date) >= thisMonthStart)
  const lastToSameDay = expenses.filter(t => {
    const dt = new Date(t.transaction_date)
    return dt >= lastMonthStart && dt <= lastMonthSameDay
  })

  const thisMonthSpend = thisMonth.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpend = lastToSameDay.reduce((s, t) => s + t.amount, 0)

  const catName = (id: string | null) =>
    state.categories.find(c => c.id === id)?.name ?? 'Uncategorized'

  // 1. Weekly budget pace
  const budget = d.weeklyBudget
  const weekDay = now.getDay() || 7
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - weekDay + 1)
  const weekStartStr = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`
  const weeklySpend = expenses
    .filter(t => t.transaction_date >= weekStartStr)
    .reduce((s, t) => s + t.amount, 0)
  const weekPct = budget > 0 ? (weeklySpend / budget) * 100 : 0
  const weekProgress = (weekDay / 7) * 100
  if (weekPct > weekProgress * 1.25 && weekPct < 90 && weeklySpend > 100) {
    const projected = Math.round((weeklySpend / weekDay) * 7)
    const overshoot = projected - budget
    if (overshoot > 0) {
      return {
        text: `At this pace, you'll exceed your budget by ₹${overshoot.toLocaleString('en-IN')} this week.`,
        type: 'warning',
      }
    }
  }

  // 2. Category spike vs last month same point
  if (lastMonthSpend > 0) {
    const catThis: Record<string, number> = {}
    const catLast: Record<string, number> = {}
    thisMonth.forEach(t => { const n = catName(t.category_id); catThis[n] = (catThis[n] ?? 0) + t.amount })
    lastToSameDay.forEach(t => { const n = catName(t.category_id); catLast[n] = (catLast[n] ?? 0) + t.amount })

    let topSpike: { cat: string; pct: number; amount: number } | null = null
    for (const [cat, amount] of Object.entries(catThis)) {
      if (cat === 'Uncategorized' || cat === 'Transfer') continue
      const last = catLast[cat] ?? 0
      if (last > 200 && amount > 300) {
        const pct = ((amount - last) / last) * 100
        if (pct > 30 && (!topSpike || pct > topSpike.pct)) topSpike = { cat, pct, amount }
      }
    }
    if (topSpike) {
      return {
        text: `${topSpike.cat} is up ${Math.round(topSpike.pct)}% vs last month — ₹${Math.round(topSpike.amount).toLocaleString('en-IN')} so far.`,
        type: 'warning',
      }
    }
  }

  // 3. Good progress vs last month same point
  if (lastMonthSpend > 500 && thisMonthSpend < lastMonthSpend * 0.8) {
    const saved = Math.round(lastMonthSpend - thisMonthSpend)
    return {
      text: `You're spending ₹${saved.toLocaleString('en-IN')} less than this time last month. Nice work!`,
      type: 'positive',
    }
  }

  // 4. Tracking discipline — celebrate consistent logging when on track
  const txCount = thisMonth.length
  const daysTracked = new Set(thisMonth.map(t => t.transaction_date.slice(0, 10))).size
  const onTrack = weekPct <= weekProgress * 1.15
  if (txCount >= 6 && daysTracked >= 4 && onTrack) {
    const dayOfMonth = now.getDate()
    const isEndOfMonth = dayOfMonth >= 25
    if (isEndOfMonth) {
      return {
        text: `Strong month! You logged ${txCount} transactions across ${daysTracked} days. That kind of consistency is how you stay in control.`,
        type: 'celebrate',
      }
    }
    return {
      text: `${txCount} transactions logged across ${daysTracked} days this month — great tracking discipline.`,
      type: 'celebrate',
    }
  }

  // 5. Top category this month (neutral fallback)
  const catTotals: Record<string, number> = {}
  thisMonth.forEach(t => {
    const n = catName(t.category_id)
    if (n === 'Uncategorized' || n === 'Transfer') return
    catTotals[n] = (catTotals[n] ?? 0) + t.amount
  })
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]
  if (topCat && topCat[1] > 200) {
    return {
      text: `${topCat[0]} is your biggest spend this month — ₹${Math.round(topCat[1]).toLocaleString('en-IN')}.`,
      type: 'info',
    }
  }

  return null
}

interface InsightCardProps {
  state: AppState
  d: DerivedMetrics
}

export function InsightCard({ state, d }: InsightCardProps) {
  const c = useTheme()
  const [dismissed, setDismissed] = useState(false)

  const insight = useMemo(
    () => computeInsight(state, d),
    // recompute when transactions change or week spend changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions.length, state.transactions[0]?.id, d.weeklySpent],
  )

  if (!insight || dismissed) return null

  const { border, bg, icon } = {
    warning: {
      border: c.warn,
      bg: c.warnSoft,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.warn} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    positive: {
      border: c.good,
      bg: c.goodSoft,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
    },
    celebrate: {
      border: c.good,
      bg: c.goodSoft,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill={c.good} stroke="none">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
    },
    info: {
      border: c.accent,
      bg: c.accentSoft,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
    },
  }[insight.type]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: bg,
      border: `1px solid ${border}44`,
      borderLeft: `3px solid ${border}`,
      borderRadius: 12,
      padding: '10px 12px',
    }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</div>
      <span style={{ flex: 1, font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.45 }}>
        {insight.text}
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          padding: 4, cursor: 'pointer', color: c.muted,
          display: 'flex', alignItems: 'center',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
