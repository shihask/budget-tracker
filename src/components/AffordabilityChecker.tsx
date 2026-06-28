import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from './BottomSheet'
import { affordabilityInsightWithAI, goalPlanAdviceWithAI } from '@/lib/gemini'
import { simulatePurchase, forecastReady, getForecastDrivers, estimateForecastSalary, daysUntil as forecastDaysUntil } from '@/lib/cashflow'
import { LOW_CUSHION } from './CashFlowForecastCard'
import { getIncomePattern } from '@/lib/income-pattern'
import { getCurrentFinancialCycle } from '@/lib/financial-cycle'
import type { AppState, DerivedMetrics, Settings, Transaction, PlannedExpense } from '@/types'

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
  onAddPlannedExpense?: (form: Omit<PlannedExpense, 'id' | 'created_at'>) => Promise<void>
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

export function AffordabilityChecker({ state, d, settings, transactions, onUpdateSettings, onSaveGoal, onAddPlannedExpense }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [checked, setChecked] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [expandedHelp, setExpandedHelp] = useState<string | null>(null)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showGoalPlan, setShowGoalPlan] = useState(false)
  const [showUpcoming, setShowUpcoming] = useState(false)
  const [goalPlanAI, setGoalPlanAI] = useState<string | null>(null)
  const [addedToForecast, setAddedToForecast] = useState(false)
  const [forecastDate, setForecastDate] = useState('')
  const [showForecastDate, setShowForecastDate] = useState(false)
  const [goalPlanAILoading, setGoalPlanAILoading] = useState(false)

  const EXCLUDED_TX_TYPES = new Set(['income', 'transfer', 'savings_contribution', 'savings_withdrawal', 'borrowing', 'borrowing_repayment', 'opening_balance', 'balance_adjustment', 'credit_card_payment', 'cc_opening_balance', 'cc_balance_adjustment'])

  const spendingData = useMemo(() => {
    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30)
    const cutoff60 = new Date(); cutoff60.setDate(cutoff60.getDate() - 60)
    const lifestyle60 = transactions.filter(t =>
      !EXCLUDED_TX_TYPES.has(t.transaction_type) && new Date(t.transaction_date) >= cutoff60
    )
    const lifestyle30 = lifestyle60.filter(t => new Date(t.transaction_date) >= cutoff30)
    const byGroup: Record<string, number> = {}
    for (const t of lifestyle30) {
      const g = t.category?.group_name ?? 'Other'
      byGroup[g] = (byGroup[g] ?? 0) + t.amount
    }
    const total60 = lifestyle60.reduce((s, t) => s + t.amount, 0)
    const months60 = lifestyle60.length > 0 && lifestyle60.some(t => new Date(t.transaction_date) < cutoff30) ? 2 : 1
    return {
      spendingByGroup: byGroup,
      totalSpent30d: lifestyle30.reduce((s, t) => s + t.amount, 0),
      avgMonthlySpending: Math.round(total60 / months60),
    }
  }, [transactions])

  const freeMoney = d.realFreeMoney
  const weeklyBudget = d.weeklyBudget
  const pattern = getIncomePattern(settings)
  const cycle = useMemo(() => d.financialCycle ?? getCurrentFinancialCycle(state), [d.financialCycle, state])
  const weeksRemaining = (pattern === 'variable' || pattern === 'business')
    ? 0
    : Math.ceil(cycle.daysRemaining / 7)
  const reservedBudget = weeksRemaining * weeklyBudget
  const safePurchasingPower = freeMoney - reservedBudget
  const hasWeeklyContext = weeksRemaining > 0 && weeklyBudget > 0

  const check = () => {
    const a = parseFloat(amount)
    if (isNaN(a) || a <= 0) return
    setChecked(true)
    setAddedToForecast(false)
    setShowForecastDate(false)
    setForecastDate('')
  }

  const salaryEstimate = useMemo(() => estimateForecastSalary(state), [state])

  const monthlyObligations = useMemo(() => {
    const commitmentTotal = state.commitments
      .filter(c => c.is_active && c.is_recurring)
      .reduce((s, c) => s + c.amount, 0)
    const savingsTotal = state.savings
      .filter(sv => sv.is_active && sv.is_recurring)
      .reduce((s, sv) => s + sv.amount, 0)
    return { commitmentTotal, savingsTotal, total: commitmentTotal + savingsTotal }
  }, [state.commitments, state.savings])

  const calcPurchasePlan = (goalAmount: number) => {
    const salary = salaryEstimate.amount
    if (salary == null) {
      return { hasSalary: false as const, canSaveMonthly: 0, required: goalAmount, monthsNeeded: 0, targetLabel: '', targetISO: '', reductions: [] as { group: string; monthlySpend: number; suggestion: number }[], improvedMonths: 0, improvedLabel: '', salary: 0, commitments: 0, savings: 0, typicalSpending: 0 }
    }
    const commitments = monthlyObligations.commitmentTotal
    const savings = monthlyObligations.savingsTotal
    const typicalSpending = spendingData.avgMonthlySpending
    const surplus = salary - commitments - savings - typicalSpending
    const canSaveMonthly = Math.max(0, Math.round(surplus))

    const required = goalAmount
    const monthsNeeded = canSaveMonthly > 0 ? Math.ceil(required / canSaveMonthly) : 0
    const targetDate = new Date()
    targetDate.setMonth(targetDate.getMonth() + monthsNeeded)
    const targetLabel = canSaveMonthly > 0 ? targetDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ''
    const targetISO = canSaveMonthly > 0 ? targetDate.toISOString().slice(0, 10) : ''

    const skipGroups = new Set(['Income', 'Transfer', 'Commitment', 'Savings & Investments'])
    const reductions = Object.entries(spendingData.spendingByGroup)
      .filter(([g]) => !skipGroups.has(g))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([group, spend]) => ({ group, monthlySpend: Math.round(spend), suggestion: Math.max(100, Math.round(spend * 0.15)) }))
      .filter(r => r.suggestion >= 100)

    const totalReductionSavings = reductions.reduce((s, r) => s + r.suggestion, 0)
    const improvedCapacity = canSaveMonthly + totalReductionSavings
    const improvedMonths = improvedCapacity > 0 && required > 0 ? Math.ceil(required / improvedCapacity) : 0
    const improvedDate = new Date()
    improvedDate.setMonth(improvedDate.getMonth() + improvedMonths)
    const improvedLabel = improvedCapacity > 0 ? improvedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ''

    return { hasSalary: true as const, canSaveMonthly, required, monthsNeeded, targetLabel, targetISO, reductions, improvedMonths, improvedLabel, salary, commitments, savings, typicalSpending }
  }

  const getGoalPlanAI = async (plan: ReturnType<typeof calcPurchasePlan>) => {
    const a = parseFloat(amount)
    if (isNaN(a)) return
    setGoalPlanAILoading(true)
    setGoalPlanAI(null)
    const advice = await goalPlanAdviceWithAI({
      item,
      goalAmount: a,
      currentSavings: 0,
      required: plan.required,
      monthlyCapacity: plan.canSaveMonthly,
      monthsNeeded: plan.monthsNeeded,
      targetDate: plan.targetLabel,
      reductions: plan.reductions,
    }, (n) => onUpdateSettings?.({ ai_requests_used: n }))
    setGoalPlanAI(advice ?? "Mint couldn't respond right now. Try again.")
    setGoalPlanAILoading(false)
  }

  const reset = () => { setItem(''); setAmount(''); setChecked(false); setShowWhy(false); setShowDetails(false); setShowCalc(false); setExpandedHelp(null); setAiInsight(null); setAiLoading(false); setShowGoalPlan(false); setGoalPlanAI(null); setGoalPlanAILoading(false); setShowUpcoming(false) }
  const close = () => { setOpen(false); reset() }

  const getAIInsight = async () => {
    const a = parseFloat(amount)
    if (isNaN(a)) return
    setAiLoading(true)
    setAiInsight(null)
    const daysLeft = (pattern === 'variable' || pattern === 'business')
      ? null
      : cycle.daysRemaining
    const insight = await affordabilityInsightWithAI(item, a, {
      freeMoney,
      safePurchasingPower,
      daysUntilSalary: daysLeft,
      incomePatternLabel: pattern === 'monthly' ? 'salary' : 'income',
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

  // Sum of expense events due before salary in the simulation
  const prePaydayExpenses = useMemo(() => {
    if (!simResult) return 0
    const salaryDate = simResult.nextSalaryDate
    return simResult.projections
      .filter(p => p.event.type === 'expense' && (!salaryDate || p.event.date < salaryDate))
      .reduce((s, p) => s + p.event.amount, 0)
  }, [simResult])

  const getStatus = () => {
    if (!checked || isNaN(amt)) return null

    const exceedsFreeMoney = amt > freeMoney
    const exceedsSPP = safePurchasingPower <= 0 || amt > safePurchasingPower
    const simLowest = simResult?.lowestBalance ?? null
    const forecastGoesNegative = simLowest != null && simLowest < 0
    const forecastTight = simLowest != null && simLowest >= 0 && simLowest < LOW_CUSHION
    const balance = Math.round(d.availableBalance)

    if (exceedsFreeMoney) {
      const sub = simResult && prePaydayExpenses > 0
        ? `You have ${fmt(balance)} available. Before your ${pattern === 'monthly' ? 'next salary' : pattern === 'weekly' ? 'next income' : 'upcoming'} payments, ${fmt(prePaydayExpenses)} in payments are due. Buying this now could leave you short by ${fmt(Math.abs(simResult.lowestBalance))}.`
        : `You have ${fmt(balance)} available but this purchase costs ${fmt(amt)}.`
      return { tier: 'critical' as Tier, color: c.bad, bg: '#FEE2E2', label: 'Not Affordable', sub }
    }
    if (forecastGoesNegative) {
      return {
        tier: 'critical' as Tier, color: c.bad, bg: '#FEE2E2',
        label: 'Will Cause Shortfall',
        sub: `You can cover this today, but ${fmt(prePaydayExpenses)} in payments are due before ${pattern === 'monthly' ? 'salary' : 'your next income'}. Your balance would drop to ${fmt(simResult!.lowestBalance)}${simResult?.lowestBalanceDate ? ` around ${shortDate(simResult.lowestBalanceDate)}` : ''}.`,
      }
    }
    if (exceedsSPP) return {
      tier: 'risky' as Tier, color: '#D97706', bg: '#FEF3C7',
      label: 'Risky Purchase',
      sub: hasWeeklyContext
        ? `You can afford this, but it uses ${fmt(amt - safePurchasingPower)} from money reserved for your ${weeksRemaining}-week budget.`
        : 'You can afford this, but it uses most of your available money.',
    }
    if (forecastTight) return {
      tier: 'tight' as Tier, color: '#D97706', bg: '#FEF3C7',
      label: 'Tight — Cuts It Close',
      sub: `You can afford this, but your balance drops to ${fmt(simLowest!)}${simResult?.lowestBalanceDate ? ` around ${shortDate(simResult.lowestBalanceDate)}` : ''} before ${pattern === 'monthly' ? 'payday' : 'your next income'}.`,
    }
    return {
      tier: 'safe' as Tier, color: c.good, bg: '#DCFCE7',
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

  const helpKey = (label: string) => label.toLowerCase().replace(/[^a-z]/g, '')
  const toggleHelp = (label: string) => setExpandedHelp(v => v === helpKey(label) ? null : helpKey(label))

  const HelpIcon = ({ id }: { id: string }) => (
    <button onClick={() => toggleHelp(id)} style={{ background: 'none', border: 'none', padding: '0 0 0 4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <svg viewBox="0 0 20 20" width={13} height={13} fill="none" stroke={expandedHelp === helpKey(id) ? c.accent : c.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="8" /><line x1="10" y1="9" x2="10" y2="14" /><circle cx="10" cy="6.5" r="0.8" fill={expandedHelp === helpKey(id) ? c.accent : c.muted} stroke="none" />
      </svg>
    </button>
  )

  const HelpText = ({ id, text }: { id: string; text: string }) => (
    expandedHelp === helpKey(id) ? (
      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, padding: '4px 0 2px', marginTop: 2 }}>{text}</div>
    ) : null
  )

  const Row = ({ label, value, bold, accent, muted, color, info }: {
    label: string; value: string; bold?: boolean; accent?: boolean; muted?: boolean; color?: string; info?: string
  }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ font: `${bold ? '700' : '600'} 12px Plus Jakarta Sans`, color: muted ? c.muted : c.ink, display: 'flex', alignItems: 'center' }}>
          {label}{info && <HelpIcon id={label} />}
        </span>
        <span style={{ font: `${bold ? '800' : '700'} 13px Plus Jakarta Sans`, color: color ?? (accent ? c.accent : muted ? c.muted : c.ink) }}>
          {value}
        </span>
      </div>
      {info && <HelpText id={label} text={info} />}
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
                : `Available money · ${fmt(freeMoney)}`}
            </div>
          </div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round"
          style={{ position: 'relative', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <BottomSheet open={open} onClose={close} maxHeight="90svh" zIndex={400} showHelpButton={false}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Can I Afford This?</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
              {hasWeeklyContext ? 'Includes your upcoming budget' : 'Based on your available money'}
            </div>
          </div>
          <button onClick={close} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', font: '700 14px Plus Jakarta Sans', color: c.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
        </div>

        {!checked ? (
          <>
            {/* Safe to Spend card */}
            <div style={{
              background: `linear-gradient(135deg, ${c.accent}14, ${c.accent}07)`,
              border: `1px solid ${c.accent}30`,
              borderRadius: 16, padding: '14px 16px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Safe to Spend
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
                  <Row label="After emergency fund" value={fmt(d.availableBalance)} info="Balance after keeping your emergency fund aside" />
                  <Row label="Upcoming commitments" value={`− ${fmt(d.remainingCommitments)}`} muted info="Bills and obligations due this cycle" />
                  <Divider />
                  <Row label="Available money" value={fmt(freeMoney)} bold info="What you have after all commitments" />
                  {hasWeeklyContext && (
                    <>
                      <Row label={`Weekly Budget × ${weeksRemaining}w`} value={`− ${fmt(reservedBudget)}`} muted info={pattern === 'monthly' ? 'Reserved until your next salary.' : pattern === 'weekly' ? 'Reserved until your next income.' : 'Reserved to support your spending plan.'} />
                      <Divider />
                      <Row label="Safe to Spend" value={fmt(Math.max(0, safePurchasingPower))} bold accent info="What you can spend right now without affecting your budget" />
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
                Quick check · safe to spend {fmt(Math.max(0, safePurchasingPower))}
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

            {/* Add to Forecast */}
            {onAddPlannedExpense && checked && !addedToForecast && (
              <div style={{ marginBottom: 14 }}>
                {!showForecastDate ? (
                  <button
                    onClick={() => { setShowForecastDate(true); setForecastDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: c.accentSoft, border: `1px solid ${c.accent}30`, borderRadius: 14, padding: '12px', font: '700 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add to Forecast
                  </button>
                ) : (
                  <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                    <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>When do you plan to spend this?</div>
                    <input type="date" value={forecastDate} onChange={e => setForecastDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: c.bg, border: `1.5px solid ${c.faint}`, borderRadius: 10, padding: '10px 12px', font: '700 14px Plus Jakarta Sans', color: c.ink, outline: 'none', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={async () => {
                          if (!forecastDate) return
                          await onAddPlannedExpense({ title: item.trim() || 'Planned Purchase', amount: parseFloat(amount), planned_date: forecastDate, category_id: null, notes: null, is_completed: false })
                          setAddedToForecast(true)
                          setShowForecastDate(false)
                        }}
                        style={{ flex: 1, background: c.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
                      >
                        Confirm
                      </button>
                      <button onClick={() => setShowForecastDate(false)} style={{ flex: 1, background: c.surface2, color: c.ink, border: `1px solid ${c.faint}`, borderRadius: 10, padding: '10px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {addedToForecast && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: c.goodSoft, borderRadius: 14, marginBottom: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ font: '700 13px Plus Jakarta Sans', color: c.good }}>Added to forecast</span>
              </div>
            )}

            {/* What happens if you buy this — chronological timeline */}
            {simResult && (() => {
              const salaryDate = simResult.nextSalaryDate
              const beforeSalary = simResult.projections.filter(p => p.event.type === 'expense' && (!salaryDate || p.event.date < salaryDate))
              const afterSalary = simResult.projections.filter(p => p.event.type === 'expense' && salaryDate && p.event.date >= salaryDate)
              const salaryEvent = simResult.projections.find(p => p.event.source === 'salary')
              const lowestColor = simResult.lowestBalance < 0 ? c.bad : simResult.lowestBalance < LOW_CUSHION ? '#D97706' : c.good
              const allUpcoming = [...beforeSalary, ...afterSalary]
              const totalUpcoming = allUpcoming.reduce((s, p) => s + p.event.amount, 0)
              const lastProjection = simResult.projections[simResult.projections.length - 1]

              const TimelineRow = ({ label, amount, balance, date, isIncome, isLowest, isRecovery }: {
                label: string; amount?: number; balance: number; date?: string; isIncome?: boolean; isLowest?: boolean; isRecovery?: boolean
              }) => {
                const balColor = isLowest ? lowestColor : isRecovery ? c.good : balance < 0 ? c.bad : c.ink
                return (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '5px 0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ font: `${isLowest || isRecovery ? '700' : '600'} 12px Plus Jakarta Sans`, color: isLowest ? lowestColor : isRecovery ? c.good : c.ink }}>{label}</span>
                      {date && <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginLeft: 6 }}>{date}</span>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                      {amount != null && (
                        <div style={{ font: '600 11px Plus Jakarta Sans', color: isIncome ? c.good : c.muted }}>
                          {isIncome ? '+' : '−'}{fmt(amount)}
                        </div>
                      )}
                      <div style={{ font: `${isLowest || isRecovery ? '800' : '700'} 13px Plus Jakarta Sans`, color: balColor }}>
                        {fmt(balance)}
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div style={{ background: c.surface, borderRadius: 16, padding: 14, marginBottom: 14, border: `1px solid ${c.faint}` }}>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>What happens if you buy this</div>

                  {/* Starting balance */}
                  <TimelineRow label="You have now" balance={simResult.currentBalance + amt} />
                  <div style={{ height: 1, background: c.faint, margin: '2px 0' }} />

                  {/* Purchase */}
                  <TimelineRow label={item || 'This purchase'} amount={amt} balance={simResult.currentBalance} />

                  {/* Upcoming payments summary */}
                  {allUpcoming.length > 0 && (
                    <>
                      <div style={{ height: 1, background: c.faint, margin: '2px 0' }} />
                      <button
                        onClick={() => setShowUpcoming(v => !v)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
                        }}
                      >
                        <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {allUpcoming.length} upcoming payment{allUpcoming.length !== 1 ? 's' : ''}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showUpcoming ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>−{fmt(totalUpcoming)}</div>
                          <div style={{ font: '700 13px Plus Jakarta Sans', color: lastProjection ? (lastProjection.balanceAfter < 0 ? c.bad : c.ink) : c.ink }}>
                            {lastProjection ? fmt(lastProjection.balanceAfter) : ''}
                          </div>
                        </div>
                      </button>

                      {/* Expanded timeline */}
                      {showUpcoming && (
                        <div style={{ paddingLeft: 10, borderLeft: `2px solid ${c.faint}`, marginBottom: 4 }}>
                          {beforeSalary.map((p, i) => (
                            <TimelineRow
                              key={`pre-${i}`}
                              label={p.event.title}
                              amount={p.event.amount}
                              balance={p.balanceAfter}
                              date={shortDate(p.event.date)}
                              isLowest={!!simResult.lowestBalanceDate && p.event.date === simResult.lowestBalanceDate && p.balanceAfter === simResult.lowestBalance}
                            />
                          ))}

                          {/* Lowest point marker */}
                          {simResult.lowestBalance < simResult.currentBalance && !beforeSalary.some(p => p.balanceAfter === simResult.lowestBalance) && (
                            <>
                              <div style={{ height: 1, background: lowestColor + '40', margin: '2px 0' }} />
                              <TimelineRow label="Lowest point" balance={simResult.lowestBalance} date={simResult.lowestBalanceDate ? shortDate(simResult.lowestBalanceDate) : undefined} isLowest />
                            </>
                          )}

                          {/* Salary */}
                          {salaryEvent && (
                            <>
                              <div style={{ height: 1, background: c.good + '40', margin: '4px 0' }} />
                              <TimelineRow label={pattern === 'monthly' ? 'Salary' : 'Income'} amount={salaryEvent.event.amount} balance={salaryEvent.balanceAfter} date={shortDate(salaryEvent.event.date)} isIncome isRecovery />
                            </>
                          )}

                          {afterSalary.map((p, i) => (
                            <TimelineRow key={`post-${i}`} label={p.event.title} amount={p.event.amount} balance={p.balanceAfter} date={shortDate(p.event.date)} />
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Lowest point (when no upcoming events but lowest is notable) */}
                  {allUpcoming.length === 0 && simResult.lowestBalance < simResult.currentBalance && (
                    <>
                      <div style={{ height: 1, background: lowestColor + '40', margin: '2px 0' }} />
                      <TimelineRow label="Lowest point" balance={simResult.lowestBalance} date={simResult.lowestBalanceDate ? shortDate(simResult.lowestBalanceDate) : undefined} isLowest />
                    </>
                  )}
                </div>
              )
            })()}

            {/* Recommendation */}
            {timingAdvice && status!.tier !== 'safe' && (
              <div style={{ background: '#FFF7ED', borderRadius: 16, padding: 14, marginBottom: 14, border: `1px solid #FDBA7430` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </div>
                  <div style={{ font: '800 14px Plus Jakarta Sans', color: '#92400E' }}>Recommendation</div>
                </div>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: '#92400E', marginBottom: 10 }}>
                  {pattern === 'monthly'
                    ? `Wait ${timingAdvice.daysAway} day${timingAdvice.daysAway !== 1 ? 's' : ''} until your next salary (${shortDate(timingAdvice.salaryDate)}).`
                    : pattern === 'weekly'
                    ? `Wait ${timingAdvice.daysAway} day${timingAdvice.daysAway !== 1 ? 's' : ''} until your next income (${shortDate(timingAdvice.salaryDate)}).`
                    : 'Wait a few more earning days before making this purchase.'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {simResult && simResult.lowestBalance < 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.bad} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10"/><path d="M9 9l6 6M15 9l-6 6"/>
                      </svg>
                      <span style={{ font: '600 13px Plus Jakarta Sans', color: '#92400E', lineHeight: 1.5 }}>
                        Buying today would create a shortfall of {fmt(Math.abs(simResult.lowestBalance))}.
                      </span>
                    </div>
                  )}
                  {simResult && simResult.lowestBalance >= 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill="#D97706"/>
                      </svg>
                      <span style={{ font: '600 13px Plus Jakarta Sans', color: '#92400E', lineHeight: 1.5 }}>
                        Buying today drops your balance to {fmt(simResult.lowestBalance)}.
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>
                    </svg>
                    <span style={{ font: '600 13px Plus Jakarta Sans', color: '#92400E', lineHeight: 1.5 }}>
                      {pattern === 'monthly'
                        ? `After your next salary, this purchase becomes affordable with an estimated balance of ${fmt(timingAdvice.postLowest)}.`
                        : pattern === 'weekly'
                        ? `After your next income, this purchase becomes affordable with an estimated balance of ${fmt(timingAdvice.postLowest)}.`
                        : `After your next expected earnings, this purchase becomes affordable with an estimated balance of ${fmt(timingAdvice.postLowest)}.`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Details — collapsed by default */}
            <button
              onClick={() => setShowDetails(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', marginBottom: showDetails ? 0 : 14 }}
            >
              <span style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showDetails && (
              <div style={{ background: c.surface, borderRadius: '0 0 14px 14px', padding: '10px 14px 14px', marginBottom: 14, marginTop: -1, border: `1px solid ${c.faint}`, borderTop: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Row label="Available money" value={fmt(freeMoney)} info="What you have after commitments and emergency fund" />
                  {hasWeeklyContext && (
                    <>
                      <Row label="Weeks remaining" value={`${weeksRemaining} weeks`} muted />
                      <Row label="Weekly budget" value={fmt(weeklyBudget)} muted info="Your planned weekly spending limit" />
                      <Row label="Reserved for budget" value={`− ${fmt(reservedBudget)}`} muted info={pattern === 'monthly' ? 'Kept aside until your next salary.' : pattern === 'weekly' ? 'Kept aside until your next income.' : 'Reserved for your spending plan.'} />
                      <Divider />
                      <Row label="Safe to spend" value={fmt(Math.max(0, safePurchasingPower))} bold info="What you can spend right now without affecting your budget" />
                    </>
                  )}
                  <Divider />
                  <Row label={item || 'Purchase amount'} value={fmt(amt)} />
                  {budgetImpact !== null && (
                    <Row label="Uses from budget" value={fmt(budgetImpact)} color={status!.color} />
                  )}

                  {/* Progress indicator */}
                  {freeMoney > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 8, borderRadius: 999, background: c.surface2, overflow: 'hidden', position: 'relative' }}>
                        {hasWeeklyContext && safePurchasingPower > 0 && (
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (safePurchasingPower / freeMoney) * 100)}%`, background: c.good + '30' }} />
                        )}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (amt / freeMoney) * 100)}%`, background: status!.color, borderRadius: 999 }} />
                        {hasWeeklyContext && safePurchasingPower > 0 && safePurchasingPower < freeMoney && (
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${(safePurchasingPower / freeMoney) * 100}% - 1px)`, width: 2, background: c.good }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 6 }}>
                        {hasWeeklyContext && safePurchasingPower > 0 ? (
                          safePct !== null && safePct <= 100 ? (
                            <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>{safePct}% of safe limit used</span>
                          ) : (
                            <span style={{ font: '600 10px Plus Jakarta Sans', color: status!.color }}>Exceeds safe limit by {fmt(amt - safePurchasingPower)}</span>
                          )
                        ) : (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Uses {Math.round((amt / freeMoney) * 100)}% of available money</span>
                        )}
                        {hasWeeklyContext && safePurchasingPower > 0 && (
                          <span style={{ font: '600 10px Plus Jakarta Sans', color: c.good, flexShrink: 0, marginLeft: 8 }}>Safe: {fmt(safePurchasingPower)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* How Can I Afford This? */}
            {status!.tier === 'critical' && (() => {
              const plan = calcPurchasePlan(amt)
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
                      {!plan.hasSalary ? (
                        /* No salary — can't compute plan */
                        <div style={{ background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
                          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Purchase Plan</div>
                          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                            We need income information to estimate when you could afford this purchase.
                          </div>
                          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 10, lineHeight: 1.5 }}>
                            {pattern === 'monthly'
                              ? <>Add your salary details in <strong style={{ color: c.ink }}>Settings</strong>.</>
                              : pattern === 'weekly'
                              ? <>Add your weekly income details in <strong style={{ color: c.ink }}>Settings</strong>.</>
                              : pattern === 'variable'
                              ? 'Add your estimated daily income or record a few days of earnings.'
                              : 'Add your monthly drawings or record income transactions.'}
                          </div>
                        </div>
                      ) : plan.canSaveMonthly === 0 ? (
                        /* Zero surplus — can't save */
                        <div style={{ background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
                          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Purchase Plan</div>
                          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                            Right now, your income is fully used by bills, savings, and spending. There's nothing left to save toward this purchase.
                          </div>
                          <button
                            onClick={() => setShowCalc(v => !v)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '10px 0 0', cursor: 'pointer', borderTop: `1px solid ${c.faint}`, marginTop: 10 }}
                          >
                            <span style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase' }}>How is this calculated?</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showCalc ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                          {showCalc && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                              <Row label={pattern === 'monthly' ? 'Salary' : 'Income'} value={fmt(plan.salary)} />
                              <Row label="Commitments" value={`− ${fmt(plan.commitments)}`} muted />
                              <Row label="Savings plans" value={`− ${fmt(plan.savings)}`} muted />
                              <Row label="Typical spending" value={`− ${fmt(plan.typicalSpending)}`} muted />
                              <Divider />
                              <Row label="Can save monthly" value={fmt(0)} bold color={c.bad} />
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Has surplus — show full plan */
                        <div style={{ background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
                          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Purchase Plan</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <Row label="Purchase amount" value={fmt(amt)} bold />
                            <Divider />
                            <Row label="Can save monthly" value={fmt(plan.canSaveMonthly)} accent info="What you can set aside each month after all regular expenses" />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, display: 'flex', alignItems: 'center' }}>Earliest by<HelpIcon id="earliest-by" /></span>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ font: '800 13px Plus Jakarta Sans', color: c.accent }}>{plan.targetLabel}</div>
                                <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{plan.monthsNeeded} month{plan.monthsNeeded !== 1 ? 's' : ''} away</div>
                              </div>
                            </div>
                            <HelpText id="earliest-by" text="The earliest month you can afford this if you save consistently." />
                          </div>
                          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 10, lineHeight: 1.5 }}>
                            At your current pace, you could afford this around <strong style={{ color: c.ink }}>{plan.targetLabel}</strong>.
                          </div>
                          {/* Calculation — collapsed */}
                          <button
                            onClick={() => setShowCalc(v => !v)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '10px 0 0', cursor: 'pointer', borderTop: `1px solid ${c.faint}`, marginTop: 10 }}
                          >
                            <span style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.03em', textTransform: 'uppercase' }}>How is this calculated?</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showCalc ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                          {showCalc && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                              <Row label={pattern === 'monthly' ? 'Salary' : 'Income'} value={fmt(plan.salary)} info="Your estimated monthly income" />
                              <Row label="Commitments" value={`− ${fmt(plan.commitments)}`} muted info="Recurring bills like EMI, rent, insurance" />
                              <Row label="Savings plans" value={`− ${fmt(plan.savings)}`} muted info="SIP, gold, chit fund contributions" />
                              <Row label="Typical spending" value={`− ${fmt(plan.typicalSpending)}`} muted info="Your average monthly lifestyle spending" />
                              <Divider />
                              <Row label="Can save monthly" value={fmt(plan.canSaveMonthly)} bold accent />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Where to Cut Back */}
                      {plan.reductions.length > 0 && (
                        <div style={{ background: c.surface, border: `1.5px solid ${c.faint}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
                          <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Where to Cut Back</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {plan.reductions.map(r => (
                              <div key={r.group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>Reduce {r.group}</div>
                                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                                    Currently ₹{r.monthlySpend.toLocaleString('en-IN')}/mo — save {fmt(r.suggestion)}/mo
                                  </div>
                                </div>
                                {plan.canSaveMonthly > 0 && plan.monthsNeeded > 0 && plan.monthsNeeded > plan.improvedMonths && (
                                  <div style={{ font: '700 11px Plus Jakarta Sans', color: c.accent, background: c.accent + '18', borderRadius: 8, padding: '4px 8px', flexShrink: 0 }}>
                                    −{plan.monthsNeeded - plan.improvedMonths > 0 ? `${plan.monthsNeeded - plan.improvedMonths}mo` : '<1mo'}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {plan.canSaveMonthly > 0 && plan.improvedMonths > 0 && plan.improvedMonths < plan.monthsNeeded && (
                            <div style={{ marginTop: 10, padding: '8px 10px', background: c.accent + '12', borderRadius: 10 }}>
                              <span style={{ font: '600 11px Plus Jakarta Sans', color: c.accent }}>
                                With all reductions: {plan.improvedLabel} ({plan.improvedMonths} month{plan.improvedMonths !== 1 ? 's' : ''})
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Save as Goal */}
                      {onSaveGoal && plan.canSaveMonthly > 0 && (
                        <button
                          onClick={() => {
                            onSaveGoal({
                              name: item || '',
                              goal_amount: amt,
                              current_saved: 0,
                              monthly_target: plan.canSaveMonthly,
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

    </>
  )
}
