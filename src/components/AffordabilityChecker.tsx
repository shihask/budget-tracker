import { useState, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from './BottomSheet'
import { affordabilityInsightWithAI } from '@/lib/gemini'
import type { DerivedMetrics, Settings, Transaction } from '@/types'

interface Props {
  d: DerivedMetrics
  settings: Settings
  transactions: Transaction[]
}

function daysUntil(dayOfMonth: number): number {
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
  const target = thisMonth > today ? thisMonth : nextMonth
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function generateChips(freeMoney: number): number[] {
  const pool = [500, 1000, 2000, 5000, 10000, 15000, 20000, 25000, 30000, 50000, 75000, 100000]
  const below = pool.filter(a => a <= freeMoney * 0.9)
  const selected = below.slice(-5)
  const roundTo = freeMoney >= 5000 ? 1000 : 100
  const maxChip = Math.floor(freeMoney / roundTo) * roundTo
  if (maxChip > 0 && !selected.includes(maxChip)) selected.push(maxChip)
  return selected.slice(0, 6)
}

function StatusIcon({ tier, color }: { tier: 'safe' | 'risky' | 'no'; color: string }) {
  if (tier === 'safe') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
    </svg>
  )
  if (tier === 'risky') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill={color}/>
    </svg>
  )
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9 9l6 6M15 9l-6 6"/>
    </svg>
  )
}

export function AffordabilityChecker({ d, settings, transactions }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [checked, setChecked] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const spendingData = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const recent = transactions.filter(t =>
      t.transaction_type === 'expense' && new Date(t.transaction_date) >= cutoff
    )
    const byGroup: Record<string, number> = {}
    for (const t of recent) {
      const g = t.category?.group_name ?? 'Other'
      byGroup[g] = (byGroup[g] ?? 0) + t.amount
    }
    return { spendingByGroup: byGroup, totalSpent30d: recent.reduce((s, t) => s + t.amount, 0) }
  }, [transactions])

  const freeMoney = d.realFreeMoney
  const weeklyBudget = d.weeklyBudget
  const weeksRemaining = settings.salary_date
    ? Math.ceil(daysUntil(settings.salary_date) / 7)
    : 0
  const reservedBudget = weeksRemaining * weeklyBudget
  const safePurchasingPower = freeMoney - reservedBudget
  const hasWeeklyContext = weeksRemaining > 0 && weeklyBudget > 0

  const check = () => {
    const a = parseFloat(amount)
    if (isNaN(a) || a <= 0) return
    setChecked(true)
  }

  const reset = () => { setItem(''); setAmount(''); setChecked(false); setShowWhy(false); setAiInsight(null); setAiLoading(false) }
  const close = () => { setOpen(false); reset() }

  const getAIInsight = async () => {
    const a = parseFloat(amount)
    if (isNaN(a)) return
    setAiLoading(true)
    setAiInsight(null)
    const daysLeft = settings.salary_date ? daysUntil(settings.salary_date) : null
    const insight = await affordabilityInsightWithAI(item, a, {
      freeMoney,
      safePurchasingPower,
      daysUntilSalary: daysLeft,
      weeklyBudget,
      weeklySpent: d.weeklySpent,
      spendingByGroup: spendingData.spendingByGroup,
      totalSpent30d: spendingData.totalSpent30d,
    })
    setAiInsight(insight ?? "Mint couldn't respond right now. Try again.")
    setAiLoading(false)
  }

  const amt = parseFloat(amount)

  const getStatus = () => {
    if (!checked || isNaN(amt)) return null
    if (amt > freeMoney) return {
      tier: 'no' as const,
      color: c.bad, bg: '#FEE2E2',
      label: 'Not Affordable',
      sub: `This purchase exceeds your available free money.`,
    }
    if (safePurchasingPower <= 0 || amt > safePurchasingPower) return {
      tier: 'risky' as const,
      color: '#D97706', bg: '#FEF3C7',
      label: 'Risky Purchase',
      sub: hasWeeklyContext
        ? `You can afford this, but it uses money reserved for your remaining ${weeksRemaining}-week budget.`
        : `You can afford this, but think carefully.`,
    }
    return {
      tier: 'safe' as const,
      color: c.good, bg: '#DCFCE7',
      label: 'Safe Purchase',
      sub: `This purchase does not affect your remaining weekly budget.`,
    }
  }

  const status = getStatus()

  const budgetImpact = checked && !isNaN(amt) && status?.tier === 'risky' && safePurchasingPower > 0
    ? amt - safePurchasingPower
    : null
  const safePct = hasWeeklyContext && safePurchasingPower > 0 && checked && !isNaN(amt)
    ? Math.round((amt / safePurchasingPower) * 100)
    : null

  const quickAmounts = generateChips(freeMoney)

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  const Row = ({ label, value, bold, accent, muted, color }: {
    label: string; value: string; bold?: boolean; accent?: boolean; muted?: boolean; color?: string
  }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ font: `${bold ? '700' : '600'} 12px Plus Jakarta Sans`, color: muted ? c.muted : c.ink }}>
        {label}
      </span>
      <span style={{ font: `${bold ? '800' : '700'} 13px Plus Jakarta Sans`, color: color ?? (accent ? c.accent : muted ? c.muted : c.ink) }}>
        {value}
      </span>
    </div>
  )

  const Divider = () => <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', border: 'none', borderRadius: 18, padding: '14px 20px',
          background: `linear-gradient(135deg, #6366F1, #8B5CF6)`,
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Watermark sparkles */}
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.09)" stroke="none"
          style={{ position: 'absolute', right: -14, bottom: -18, width: 100, height: 100, pointerEvents: 'none', transform: 'rotate(15deg)' }}>
          <path d="M12 2c0 0 2.2 7.8 10 10-7.8 2.2-10 10-10 10s-2.2-7.8-10-10c7.8-2.2 10-10 10-10z"/>
        </svg>
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.07)" stroke="none"
          style={{ position: 'absolute', right: 100, top: -22, width: 64, height: 64, pointerEvents: 'none', transform: 'rotate(-10deg)' }}>
          <path d="M12 2c0 0 2.2 7.8 10 10-7.8 2.2-10 10-10 10s-2.2-7.8-10-10c7.8-2.2 10-10 10-10z"/>
        </svg>
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.06)" stroke="none"
          style={{ position: 'absolute', right: 52, bottom: -10, width: 40, height: 40, pointerEvents: 'none', transform: 'rotate(30deg)' }}>
          <path d="M12 2c0 0 2.2 7.8 10 10-7.8 2.2-10 10-10 10s-2.2-7.8-10-10c7.8-2.2 10-10 10-10z"/>
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2z"/>
              <path d="M3 10h18"/>
              <path d="M8 7V5a1 1 0 011-1h6a1 1 0 011 1v2"/>
              <circle cx="16" cy="15" r="1" fill="#fff" stroke="none"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ font: '800 16px Plus Jakarta Sans', letterSpacing: '-0.01em' }}>Can I Afford This?</span>
              {settings.autopilot_enabled && (
                <span style={{
                  font: '700 10px Plus Jakarta Sans', letterSpacing: '0.04em',
                  background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.92)',
                  borderRadius: 6, padding: '2px 7px', border: '1px solid rgba(255,255,255,0.25)',
                }}>
                  ✦ Mint Insights
                </span>
              )}
            </div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
              {hasWeeklyContext
                ? `Safe to spend · ${fmt(Math.max(0, safePurchasingPower))}`
                : `Based on real free money · ${fmt(freeMoney)}`}
            </div>
          </div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round"
          style={{ position: 'relative', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <BottomSheet open={open} onClose={close} maxHeight="90svh" zIndex={400}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Can I Afford This?</div>
              <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </button>
            </div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
              {hasWeeklyContext ? 'Accounts for your remaining weekly budget' : 'Checks against Real Free Money'}
            </div>
          </div>
          <button onClick={close} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', font: '700 14px Plus Jakarta Sans', color: c.muted }}>✕</button>
        </div>

        {!checked ? (
          <>
            {/* Safe Purchasing Power card */}
            <div style={{
              background: `linear-gradient(135deg, ${c.accent}14, ${c.accent}07)`,
              border: `1px solid ${c.accent}30`,
              borderRadius: 16, padding: '14px 16px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {hasWeeklyContext ? 'Safe Purchasing Power' : 'Can Afford Up To'}
                </div>
                <div style={{ font: '800 26px Plus Jakarta Sans', color: c.accent, marginTop: 2, letterSpacing: '-0.02em' }}>
                  {fmt(Math.max(0, safePurchasingPower))}
                </div>
                {hasWeeklyContext && (
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 4 }}>
                    After reserving {fmt(reservedBudget)} for {weeksRemaining}w
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowWhy(v => !v)}
                style={{
                  font: '700 12px Plus Jakarta Sans', color: c.accent,
                  background: c.accent + '18', border: `1px solid ${c.accent}30`,
                  borderRadius: 999, padding: '6px 14px', cursor: 'pointer', flexShrink: 0,
                }}
              >
                Why? {showWhy ? '↑' : '↓'}
              </button>
            </div>

            {/* Why? collapsible */}
            {showWhy && (
              <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 16, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>How It's Calculated</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Row label="Actual Balance" value={fmt(d.actualBalance)} />
                  <Row label="Emergency Fund" value={`− ${fmt(d.emergencyFund)}`} muted />
                  <Row label="Spendable Balance" value={fmt(d.availableBalance)} />
                  <Row label="Remaining Commitments" value={`− ${fmt(d.remainingCommitments)}`} muted />
                  <Divider />
                  <Row label="Real Free Money" value={fmt(freeMoney)} bold />
                  {hasWeeklyContext && (
                    <>
                      <Row label={`Weekly Budget × ${weeksRemaining}w`} value={`− ${fmt(reservedBudget)}`} muted />
                      <Divider />
                      <Row label="Safe Purchasing Power" value={fmt(Math.max(0, safePurchasingPower))} bold accent />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>What do you want to buy?</label>
                <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Bluetooth Headset" style={inp} />
              </div>
              <div>
                <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Amount (₹)</label>
                <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                  onFocus={e => e.target.select()} placeholder="0" style={inp} />
              </div>
            </div>

            {/* Quick chips */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>
                Quick check · safe up to {fmt(Math.max(0, safePurchasingPower))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {quickAmounts.map(a => {
                  const qColor = a > freeMoney ? c.bad : a > safePurchasingPower ? '#D97706' : c.good
                  return (
                    <button key={a}
                      onClick={() => { setAmount(String(a)); setChecked(true) }}
                      style={{ background: qColor + '18', color: qColor, border: `1px solid ${qColor}30`, borderRadius: 999, padding: '5px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: qColor, display: 'inline-block', flexShrink: 0 }} />
                      ₹{a >= 1000 ? `${a / 1000}k` : a}
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
            {/* Result card */}
            <div style={{ background: status!.bg, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <StatusIcon tier={status!.tier} color={status!.color} />
                <span style={{ font: '800 20px Plus Jakarta Sans', color: status!.color, letterSpacing: '-0.01em' }}>
                  {status!.label}
                </span>
              </div>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: status!.color + 'CC', lineHeight: 1.5 }}>
                {status!.sub}
              </div>
              {budgetImpact !== null && (
                <div style={{ marginTop: 8, font: '700 12px Plus Jakarta Sans', color: status!.color }}>
                  This purchase uses {fmt(budgetImpact)} from your reserved future budget.
                </div>
              )}
            </div>

            {/* Breakdown */}
            <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 14, border: `1px solid ${c.faint}` }}>
              <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Row label="Real Free Money" value={fmt(freeMoney)} />
                {hasWeeklyContext && (
                  <>
                    <Row label="Weeks Remaining" value={`${weeksRemaining} weeks`} muted />
                    <Row label="Weekly Budget" value={fmt(weeklyBudget)} muted />
                    <Row label="Reserved Future Budget" value={`− ${fmt(reservedBudget)}`} muted />
                    <Divider />
                    <Row label="Safe Purchasing Power" value={fmt(Math.max(0, safePurchasingPower))} bold />
                  </>
                )}
                <Divider />
                <Row label={item || 'Purchase Amount'} value={fmt(amt)} />
                {budgetImpact !== null && (
                  <Row label="Budget Impact" value={fmt(budgetImpact)} color={status!.color} />
                )}

                {/* Progress indicator */}
                {freeMoney > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 8, borderRadius: 999, background: c.surface2, overflow: 'hidden', position: 'relative' }}>
                      {/* Safe zone background tint */}
                      {hasWeeklyContext && safePurchasingPower > 0 && (
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${Math.min(100, (safePurchasingPower / freeMoney) * 100)}%`,
                          background: c.good + '30',
                        }} />
                      )}
                      {/* Purchase fill */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${Math.min(100, (amt / freeMoney) * 100)}%`,
                        background: status!.color, borderRadius: 999,
                      }} />
                      {/* Safe zone boundary line */}
                      {hasWeeklyContext && safePurchasingPower > 0 && safePurchasingPower < freeMoney && (
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0,
                          left: `calc(${(safePurchasingPower / freeMoney) * 100}% - 1px)`,
                          width: 2, background: c.good,
                        }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 6 }}>
                      {hasWeeklyContext && safePurchasingPower > 0 ? (
                        safePct !== null && safePct <= 100 ? (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>
                            Safe Spending Limit Used: {safePct}% of Safe Purchasing Power
                          </span>
                        ) : (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: status!.color }}>
                            Exceeded Safe Limit By: {fmt(amt - safePurchasingPower)}
                          </span>
                        )
                      ) : (
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>
                          Uses {Math.round((amt / freeMoney) * 100)}% of Real Free Money
                        </span>
                      )}
                      {hasWeeklyContext && safePurchasingPower > 0 && (
                        <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, flexShrink: 0, marginLeft: 8 }}>
                          Safe limit: {fmt(safePurchasingPower)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI Insight */}
            {!aiInsight && !aiLoading && (
              <button
                onClick={getAIInsight}
                style={{
                  width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 7, background: 'linear-gradient(135deg,#6366F114,#8B5CF614)',
                  border: '1px solid #6366F130', borderRadius: 14, padding: '12px',
                  font: '700 13px Plus Jakarta Sans', color: '#6366F1', cursor: 'pointer',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                Ask Mint Insights
              </button>
            )}

            {aiLoading && (
              <div style={{
                marginBottom: 14, borderRadius: 14, padding: '14px 16px',
                background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)',
                border: '1px solid #6366F122',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: '#6366F122', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </div>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint Insights is thinking…</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[100, 80, 60].map(w => (
                    <div key={w} style={{ height: 10, borderRadius: 999, background: '#6366F118', width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ))}
                </div>
              </div>
            )}

            {aiInsight && (
              <div style={{
                marginBottom: 14, borderRadius: 14, padding: '14px 16px',
                background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)',
                border: '1px solid #6366F130',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: '#6366F122', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </div>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint Insights</span>
                </div>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6 }}>
                  {aiInsight}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={reset} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Check Another</button>
              <button onClick={close} style={{ flex: 1, background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Done</button>
            </div>
          </>
        )}
      </BottomSheet>

      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Can I Afford This?</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>,
                  title: 'Instant affordability check',
                  desc: 'Enter any purchase amount to instantly see if you can safely afford it right now.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                  title: 'Safe purchasing power',
                  desc: 'Your Real Free Money minus the budget reserved for remaining weeks — the amount you can spend without affecting your weekly plan.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill="#6366F1"/></svg>,
                  title: 'Safe / Risky / No verdict',
                  desc: 'Three clear outcomes: Safe means it fits your plan, Risky means it dips into future budget, No means it exceeds free money.',
                },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
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
                Set your <strong style={{ color: c.ink }}>salary date</strong> and <strong style={{ color: c.ink }}>weekly budget</strong> for the most accurate results.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
