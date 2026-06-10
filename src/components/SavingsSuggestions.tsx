import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState, DerivedMetrics } from '@/types'

interface Props {
  state: AppState
  d: DerivedMetrics
  autopilotEnabled: boolean
}

interface Suggestion {
  title: string
  detail: string
  saving: number | null
  type: 'reduce' | 'cut' | 'swap' | 'alert'
}

function analyzeSavings(state: AppState, d: DerivedMetrics): Suggestion[] {
  const suggestions: Suggestion[] = []
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const last30 = new Date(now)
  last30.setDate(now.getDate() - 30)

  // Category totals last 30 days (keyed by category id to avoid name collisions)
  const catTotals: Record<string, { total: number; count: number; name: string; group: string }> = {}
  state.transactions
    .filter(t => new Date(t.transaction_date) >= last30 && t.transaction_type === 'expense')
    .forEach(t => {
      const cat = state.categories.find(c => c.id === t.category_id)
      const key = cat?.id ?? 'uncategorized'
      const name = cat?.name ?? 'Uncategorized'
      const group = cat?.group_name ?? ''
      if (!catTotals[key]) catTotals[key] = { total: 0, count: 0, name, group }
      catTotals[key].total += t.amount
      catTotals[key].count++
    })

  const sorted = Object.values(catTotals).sort((a, b) => b.total - a.total)
  const totalSpent = sorted.reduce((s, c) => s + c.total, 0)

  // 1. Top spending category — suggest 20% reduction
  if (sorted[0] && sorted[0].total > 0) {
    const top = sorted[0]
    const saving = Math.round(top.total * 0.2)
    suggestions.push({
      type: 'reduce',
      title: `Reduce ${top.name} spending`,
      detail: `You spent ${fmt(top.total)} on ${top.name} last 30 days — your biggest category. Cutting 20% saves ${fmt(saving)}/month.`,
      saving,
    })
  }

  // 2. Lifestyle group daily habit cost (matches regardless of category names)
  const lifestyleTotal = sorted.filter(c => c.group === 'Lifestyle').reduce((s, c) => s + c.total, 0)
  if (lifestyleTotal > 2000) {
    suggestions.push({
      type: 'reduce',
      title: 'Daily lifestyle spending habit',
      detail: `You spend about ${fmt(Math.round(lifestyleTotal / 30))}/day on lifestyle expenses. That's ${fmt(lifestyleTotal)}/month. Small changes add up quickly.`,
      saving: Math.round(lifestyleTotal * 0.25),
    })
  }

  // 3. High credit card utilization
  const cards = state.credit_cards || []
  const highUtilCards = cards.filter(c => c.credit_limit > 0 && (c.current_balance / c.credit_limit) > 0.7)
  if (highUtilCards.length > 0) {
    const card = highUtilCards[0]
    const util = Math.round((card.current_balance / card.credit_limit) * 100)
    suggestions.push({
      type: 'alert',
      title: `${card.name} utilization is ${util}%`,
      detail: `High credit utilization affects your credit score. Try to keep it below 30%. Current outstanding: ${fmt(card.current_balance)} of ${fmt(card.credit_limit)} limit.`,
      saving: null,
    })
  }

  // 4. Free money vs commitments ratio
  if (d.remainingCommitments > d.realFreeMoney * 0.5) {
    suggestions.push({
      type: 'alert',
      title: 'Commitments eating your free money',
      detail: `Your remaining commitments (${fmt(d.remainingCommitments)}) are more than 50% of your real free money (${fmt(d.realFreeMoney)}). Consider if any can be closed or reduced.`,
      saving: null,
    })
  }

  // 5. Emergency fund gap
  if (d.actualBalance < d.emergencyFund * 1.2) {
    suggestions.push({
      type: 'alert',
      title: 'Emergency fund is thin',
      detail: `Your total balance (${fmt(d.actualBalance)}) is close to your emergency fund (${fmt(d.emergencyFund)}). Try to maintain at least 20% buffer above it.`,
      saving: null,
    })
  }

  // 6. Recurring small subscriptions
  const descCount: Record<string, { count: number; total: number }> = {}
  state.transactions
    .filter(t => new Date(t.transaction_date) >= new Date(now.getFullYear(), now.getMonth() - 3, 1) && t.transaction_type === 'expense' && t.amount < 1000)
    .forEach(t => {
      const key = t.description.toLowerCase().trim()
      if (!descCount[key]) descCount[key] = { count: 0, total: 0 }
      descCount[key].count++
      descCount[key].total += t.amount
    })
  const smallRecurring = Object.entries(descCount)
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3)

  if (smallRecurring.length > 0) {
    const totalSmall = smallRecurring.reduce((s, [, v]) => s + Math.round(v.total / 3), 0)
    const names = smallRecurring.map(([name]) => name).join(', ')
    suggestions.push({
      type: 'cut',
      title: 'Small recurring expenses',
      detail: `Found recurring small expenses: ${names}. These add up to ~${fmt(totalSmall)}/month. Review if all are necessary.`,
      saving: null,
    })
  }

  return suggestions.slice(0, 5)
}

export function SavingsSuggestions({ state, d, autopilotEnabled }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)

  const suggestions = analyzeSavings(state, d)

  const typeColor = (type: Suggestion['type']) => {
    if (type === 'alert') return { bg: '#FEF2F2', border: '#FECACA', icon: '#EF4444', text: '#991B1B' }
    if (type === 'cut') return { bg: '#FFF7ED', border: '#FED7AA', icon: '#F97316', text: '#9A3412' }
    return { bg: '#F0FDF4', border: '#BBF7D0', icon: '#16A34A', text: '#166534' }
  }

  const typeIcon = (type: Suggestion['type']) => {
    if (type === 'alert') return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    )
    if (type === 'cut') return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
    )
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </svg>
    )
  }

  return (
    <>
      {/* Dashboard button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', border: `1px solid ${c.faint}`, borderRadius: 18,
          padding: '14px 20px', background: c.surface, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: c.cardShadow,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>Savings Suggestions</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
              {suggestions.length} insights based on your spending
            </div>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {/* Sheet */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 350, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setOpen(false)} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', maxWidth: 600, width: '100%', margin: '0 auto', padding: '8px 16px calc(40px + env(safe-area-inset-bottom,0px))', maxHeight: '88svh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Savings Suggestions</div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Based on your last 30 days</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 30, height: 30, cursor: 'pointer', font: '700 14px', color: c.muted }}>✕</button>
            </div>

            {suggestions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', font: '600 14px Plus Jakarta Sans', color: c.muted }}>
                Not enough data yet. Keep tracking your expenses!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {suggestions.map((s, i) => {
                  const col = typeColor(s.type)
                  return (
                    <div key={i} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 16, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: col.icon + '20', color: col.icon, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {typeIcon(s.type)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: col.text }}>{s.title}</div>
                          <div style={{ font: '500 12px Plus Jakarta Sans', color: col.text + 'CC', marginTop: 4, lineHeight: 1.6 }}>{s.detail}</div>
                          {s.saving && (
                            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: col.icon + '18', borderRadius: 8, padding: '4px 10px' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={col.icon} strokeWidth="2.5" strokeLinecap="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                              <span style={{ font: '700 11px Plus Jakarta Sans', color: col.icon }}>Potential saving: {fmt(s.saving)}/month</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
