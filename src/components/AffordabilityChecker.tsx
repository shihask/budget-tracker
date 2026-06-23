import { useState, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from './BottomSheet'
import { affordabilityInsightWithAI, goalPlanAdviceWithAI } from '@/lib/gemini'
import { simulatePurchase, forecastReady, getForecastDrivers, estimateForecastSalary, daysUntil as forecastDaysUntil } from '@/lib/cashflow'
import { LOW_CUSHION } from './CashFlowForecastCard'
import type { AppState, DerivedMetrics, Settings, Transaction } from '@/types'

interface SaveGoalData {
  name: string
  goal_amount: number
  current_saved: number
  monthly_target: number
  target_date: string
}

interface Props {
  state: AppState
  d: DerivedMetrics
  settings: Settings
  transactions: Transaction[]
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
  onSaveGoal?: (data: SaveGoalData) => void
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

function StatusIcon({ tier, color }: { tier: 'safe' | 'tight' | 'risky' | 'critical'; color: string }) {
  if (tier === 'safe') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
    </svg>
  )
  if (tier === 'tight' || tier === 'risky') return (
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

export function AffordabilityChecker({ state, d, settings, transactions, onUpdateSettings, onSaveGoal }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [checked, setChecked] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showGoalPlan, setShowGoalPlan] = useState(false)
  const [goalPlanAI, setGoalPlanAI] = useState<string | null>(null)
  const [goalPlanAILoading, setGoalPlanAILoading] = useState(false)

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

  const calcGoalPlan = (goalAmount: number) => {
    const currentSavings = Math.max(0, freeMoney)
    const required = Math.max(0, goalAmount - currentSavings)
    const monthlyBudgetAllocation = (weeklyBudget * 52) / 12
    const monthlyCapacity = Math.max(500, Math.round(monthlyBudgetAllocation - spendingData.totalSpent30d))
    const monthsNeeded = required > 0 ? Math.ceil(required / monthlyCapacity) : 0
    const targetDate = new Date()
    targetDate.setMonth(targetDate.getMonth() + monthsNeeded)
    const targetLabel = targetDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    const targetISO = targetDate.toISOString().slice(0, 10)

    const skipGroups = new Set(['Income', 'Transfer', 'Commitment'])
    const reductions = Object.entries(spendingData.spendingByGroup)
      .filter(([g]) => !skipGroups.has(g))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([group, spend]) => ({ group, monthlySpend: Math.round(spend), suggestion: Math.max(100, Math.round(spend * 0.15)) }))
      .filter(r => r.suggestion >= 100)

    const totalReductionSavings = reductions.reduce((s, r) => s + r.suggestion, 0)
    const improvedCapacity = monthlyCapacity + totalReductionSavings
    const improvedMonths = required > 0 ? Math.ceil(required / improvedCapacity) : 0
    const improvedDate = new Date()
    improvedDate.setMonth(improvedDate.getMonth() + improvedMonths)
    const improvedLabel = improvedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

    return { currentSavings, required, monthlyCapacity, monthsNeeded, targetLabel, targetISO, reductions, improvedCapacity, improvedMonths, improvedLabel }
  }

  const getGoalPlanAI = async (plan: ReturnType<typeof calcGoalPlan>) => {
    const a = parseFloat(amount)
    if (isNaN(a)) return
    setGoalPlanAILoading(true)
    setGoalPlanAI(null)
    const advice = await goalPlanAdviceWithAI({
      item,
      goalAmount: a,
      currentSavings: plan.currentSavings,
      required: plan.required,
      monthlyCapacity: plan.monthlyCapacity,
      monthsNeeded: plan.monthsNeeded,
      targetDate: plan.targetLabel,
      reductions: plan.reductions,
    }, (n) => onUpdateSettings?.({ ai_requests_used: n }))
    setGoalPlanAI(advice ?? "Mint couldn't respond right now. Try again.")
    setGoalPlanAILoading(false)
  }

  const reset = () => { setItem(''); setAmount(''); setChecked(false); setShowWhy(false); setAiInsight(null); setAiLoading(false); setShowGoalPlan(false); setGoalPlanAI(null); setGoalPlanAILoading(false) }
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
      forecastVerdict: status?.label,
      forecastLowest: simResult?.lowestBalance,
      forecastLowestDate: simResult?.lowestBalanceDate,
      forecastRecoveryDate: simResult?.recoveryDate,
      forecastDrivers: simDrivers.length > 0 ? simDrivers : undefined,
    }, (n) => onUpdateSettings?.({ ai_requests_used: n }))
    setAiInsight(insight ?? "Mint couldn't respond right now. Try again.")
    setAiLoading(false)
  }

  const amt = parseFloat(amount)
  const canForecast = forecastReady(state)

  // Phase 1: Forecast simulation
  const simResult = useMemo(() => {
    if (!checked || isNaN(amt) || amt <= 0 || !canForecast) return null
    return simulatePurchase(state, d, amt)
  }, [checked, amt, canForecast, state, d])

  const simDrivers = useMemo(() => {
    if (!simResult) return []
    return getForecastDrivers(simResult.projections, 3)
  }, [simResult])

  // Phase 3: Post-salary simulation
  const timingAdvice = useMemo(() => {
    if (!checked || isNaN(amt) || amt <= 0 || !canForecast || !simResult) return null
    const salaryDate = simResult.nextSalaryDate
    if (!salaryDate) return null
    const daysAway = forecastDaysUntil(salaryDate)
    if (daysAway <= 0 || daysAway > 30) return null
    const salaryAmt = estimateForecastSalary(state).amount
    if (!salaryAmt) return null
    const postSalaryForecast = simulatePurchase(state, {
      ...d,
      availableBalance: d.availableBalance + salaryAmt,
    }, amt)
    if (postSalaryForecast.lowestBalance <= (simResult.lowestBalance + LOW_CUSHION)) return null
    const postHealth = postSalaryForecast.lowestBalance < 0 ? 'critical' : postSalaryForecast.lowestBalance < LOW_CUSHION ? 'tight' : 'safe'
    return { daysAway, salaryDate, postLowest: postSalaryForecast.lowestBalance, postHealth }
  }, [checked, amt, canForecast, simResult, state, d])

  type Tier = 'safe' | 'tight' | 'risky' | 'critical'

  const getStatus = () => {
    if (!checked || isNaN(amt)) return null

    // Snapshot checks
    const exceedsFreeMoney = amt > freeMoney
    const exceedsSPP = safePurchasingPower <= 0 || amt > safePurchasingPower

    // Forecast check — can override snapshot
    const simLowest = simResult?.lowestBalance ?? null
    const forecastGoesNegative = simLowest != null && simLowest < 0
    const forecastTight = simLowest != null && simLowest >= 0 && simLowest < LOW_CUSHION

    // CRITICAL: exceeds free money OR forecast goes negative
    if (exceedsFreeMoney) return {
      tier: 'critical' as Tier,
      color: c.bad, bg: '#FEE2E2',
      label: 'Not Affordable',
      sub: 'This purchase exceeds your available free money.',
    }
    if (forecastGoesNegative) return {
      tier: 'critical' as Tier,
      color: c.bad, bg: '#FEE2E2',
      label: 'Will Cause Shortfall',
      sub: `Affordable today, but your balance is projected to go negative${simResult?.lowestBalanceDate ? ` around ${shortDate(simResult.lowestBalanceDate)}` : ''} before payday.`,
    }

    // RISKY: dips into reserved weekly budget
    if (exceedsSPP) return {
      tier: 'risky' as Tier,
      color: '#D97706', bg: '#FEF3C7',
      label: 'Risky Purchase',
      sub: hasWeeklyContext
        ? `You can afford this, but it uses money reserved for your remaining ${weeksRemaining}-week budget.`
        : 'You can afford this, but think carefully.',
    }

    // TIGHT: affordable + forecast cushion is thin
    if (forecastTight) return {
      tier: 'tight' as Tier,
      color: '#D97706', bg: '#FEF3C7',
      label: 'Tight — Cuts It Close',
      sub: `Affordable, but your projected balance dips to ${fmt(simLowest!)}${simResult?.lowestBalanceDate ? ` around ${shortDate(simResult.lowestBalanceDate)}` : ''} before payday.`,
    }

    // SAFE
    return {
      tier: 'safe' as Tier,
      color: c.good, bg: '#DCFCE7',
      label: 'Safe Purchase',
      sub: canForecast
        ? 'This purchase fits comfortably. Your forecast remains healthy.'
        : 'This purchase does not affect your remaining weekly budget.',
    }
  }

  const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

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
        <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.14)" stroke="none" style={{ position: 'absolute', right: 150, top: 8, width: 26, height: 26, pointerEvents: 'none', transform: 'rotate(45deg)' }}>
          <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
        </svg>
        <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.10)" stroke="none" style={{ position: 'absolute', left: '42%', bottom: 8, width: 20, height: 20, pointerEvents: 'none', transform: 'rotate(-18deg)' }}>
          <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
        </svg>
        <svg viewBox="0 0 512 512" fill="rgba(255,255,255,0.08)" stroke="none" style={{ position: 'absolute', right: 195, bottom: 5, width: 16, height: 16, pointerEvents: 'none', transform: 'rotate(60deg)' }}>
          <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
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
                  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/></svg>Mint Insights
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

            {/* Phase 2: Forecast Impact */}
            {simResult && (
              <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 14, border: `1px solid ${c.faint}` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Forecast Impact</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Row label="Balance today" value={fmt(simResult.currentBalance + amt)} />
                  <Row label="After purchase" value={fmt(simResult.currentBalance)} />
                  <Divider />
                  <Row
                    label={`Lowest projected${simResult.lowestBalanceDate ? ` · ${shortDate(simResult.lowestBalanceDate)}` : ''}`}
                    value={fmt(simResult.lowestBalance)}
                    bold
                    color={simResult.lowestBalance < 0 ? c.bad : simResult.lowestBalance < LOW_CUSHION ? '#D97706' : c.good}
                  />
                  {simResult.recoveryDate && simResult.recoveryBalance != null && (
                    <Row
                      label={`Recovery · ${shortDate(simResult.recoveryDate)}`}
                      value={fmt(simResult.recoveryBalance)}
                      color={c.good}
                    />
                  )}
                  {!simResult.recoveryDate && simResult.nextSalaryDate && simResult.lowestBalance >= 0 && (
                    <Row
                      label={`After salary · ${shortDate(simResult.nextSalaryDate)}`}
                      value={fmt(simResult.projections.length > 0 ? simResult.projections[simResult.projections.length - 1].balanceAfter : simResult.currentBalance)}
                      color={c.good}
                    />
                  )}
                </div>

                {/* Main Pressure */}
                {status!.tier !== 'safe' && simDrivers.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.faint}` }}>
                    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 6 }}>Main Pressure</div>
                    {simDrivers.map((dr, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 5, height: 5, borderRadius: 999, background: status!.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.ink }}>{dr.title}</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(dr.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Phase 3: Timing Advisor */}
            {timingAdvice && status!.tier !== 'safe' && (
              <div style={{ background: c.good + '10', borderRadius: 16, padding: 14, marginBottom: 14, border: `1px solid ${c.good}30` }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Purchase Timing</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: status!.bg, borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4 }}>Today</div>
                    <div style={{ font: '800 14px Plus Jakarta Sans', color: status!.color }}>{status!.tier === 'critical' ? 'Shortfall' : status!.tier === 'risky' ? 'Risky' : 'Tight'}</div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Lowest: {fmt(simResult!.lowestBalance)}</div>
                  </div>
                  <div style={{ background: c.good + '18', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4 }}>After Salary</div>
                    <div style={{ font: '800 14px Plus Jakarta Sans', color: c.good }}>{timingAdvice.postHealth === 'safe' ? 'Safe' : timingAdvice.postHealth === 'tight' ? 'Tight' : 'Risky'}</div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Lowest: {fmt(timingAdvice.postLowest)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, padding: '8px 12px', background: c.good + '14', borderRadius: 10 }}>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: c.good }}>
                    Wait {timingAdvice.daysAway} day{timingAdvice.daysAway !== 1 ? 's' : ''} until salary ({shortDate(timingAdvice.salaryDate)})
                  </span>
                </div>
              </div>
            )}

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

            {/* How Can I Afford This? */}
            {status!.tier === 'critical' && (() => {
              const plan = calcGoalPlan(amt)
              return (
                <>
                  {!showGoalPlan ? (
                    <button
                      onClick={() => { setShowGoalPlan(true); if (settings.autopilot_enabled) getGoalPlanAI(plan) }}
                      style={{
                        width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: c.surface, border: `1.5px solid ${c.faint}`,
                        borderRadius: 14, padding: '13px 16px',
                        font: '700 13px Plus Jakarta Sans', color: c.ink, cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={c.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4l3 3" />
                        </svg>
                        How Can I Afford This?
                      </span>
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={c.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  ) : (
                    <div style={{ marginBottom: 14 }}>
                      {/* Plan card */}
                      <div style={{ background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
                        <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Goal Plan</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <Row label="Goal Amount" value={fmt(amt)} bold />
                          {plan.currentSavings > 0 && <Row label="You Currently Have" value={fmt(plan.currentSavings)} accent />}
                          <Row label="Still Needed" value={fmt(plan.required)} />
                          <Divider />
                          <Row label="Monthly Capacity" value={fmt(plan.monthlyCapacity)} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>Target Date</span>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ font: '800 13px Plus Jakarta Sans', color: c.accent }}>{plan.targetLabel}</div>
                              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{plan.monthsNeeded} month{plan.monthsNeeded !== 1 ? 's' : ''} away</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Reduction suggestions */}
                      {plan.reductions.length > 0 && (
                        <div style={{ background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
                          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Spending Opportunities</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {plan.reductions.map(r => (
                              <div key={r.group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>Reduce {r.group}</div>
                                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                                    Currently ₹{r.monthlySpend.toLocaleString('en-IN')}/mo — save {fmt(r.suggestion)}/mo
                                  </div>
                                </div>
                                <div style={{ font: '700 11px Plus Jakarta Sans', color: c.accent, background: c.accent + '18', borderRadius: 8, padding: '4px 8px', flexShrink: 0 }}>
                                  −{plan.monthsNeeded - plan.improvedMonths > 0 ? `${plan.monthsNeeded - plan.improvedMonths}mo` : '<1mo'}
                                </div>
                              </div>
                            ))}
                          </div>
                          {plan.improvedMonths < plan.monthsNeeded && (
                            <div style={{ marginTop: 10, padding: '8px 10px', background: c.accent + '12', borderRadius: 10 }}>
                              <span style={{ font: '600 11px Plus Jakarta Sans', color: c.accent }}>
                                With all reductions: {plan.improvedLabel} ({plan.improvedMonths} month{plan.improvedMonths !== 1 ? 's' : ''})
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Save as Goal */}
                      {onSaveGoal && (
                        <button
                          onClick={() => {
                            onSaveGoal({
                              name: item || '',
                              goal_amount: amt,
                              current_saved: Math.max(0, Math.round(plan.currentSavings)),
                              monthly_target: plan.monthlyCapacity,
                              target_date: plan.targetISO,
                            })
                          }}
                          style={{
                            width: '100%', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 7, background: '#10B98114', border: '1px solid #10B98130',
                            borderRadius: 14, padding: '12px',
                            font: '700 13px Plus Jakarta Sans', color: '#10B981', cursor: 'pointer',
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                          </svg>
                          Save as Goal
                        </button>
                      )}

                      {/* Mint AI coaching */}
                      {(settings.autopilot_enabled ?? false) && goalPlanAILoading && (
                        <div style={{ borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)', border: '1px solid #6366F122', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 7, background: '#6366F122', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            </div>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint is thinking…</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {[100, 80, 60].map(w => (
                              <div key={w} style={{ height: 10, borderRadius: 999, background: '#6366F118', width: `${w}%` }} />
                            ))}
                          </div>
                        </div>
                      )}

                      {(settings.autopilot_enabled ?? false) && !goalPlanAI && !goalPlanAILoading && (
                        <button
                          onClick={() => getGoalPlanAI(plan)}
                          style={{
                            width: '100%', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 7, background: 'linear-gradient(135deg,#6366F114,#8B5CF614)',
                            border: '1px solid #6366F130', borderRadius: 14, padding: '12px',
                            font: '700 13px Plus Jakarta Sans', color: '#6366F1', cursor: 'pointer',
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                          Ask Mint for Advice
                        </button>
                      )}

                      {goalPlanAI && (
                        <div style={{ borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)', border: '1px solid #6366F130', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 7, background: '#6366F122', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            </div>
                            <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint's Advice</span>
                          </div>
                          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6 }}>{goalPlanAI}</div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
            })()}

            {/* AI Insight */}
            {(settings.autopilot_enabled ?? false) && !aiInsight && !aiLoading && (
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
                  title: 'Forecast-aware verdict',
                  desc: 'Four outcomes: Safe (fits your plan), Tight (balance gets low before payday), Risky (dips into future budget), Critical (will cause a shortfall).',
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
