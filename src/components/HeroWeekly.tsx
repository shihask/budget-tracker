import { useState, useMemo, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, iso, TODAY, getWeekStart, getMonthStart } from '@/lib/utils'
import { ProgressRing } from './ProgressRing'
import { BottomSheet, HelpText } from './BottomSheet'
import type { DerivedMetrics, AppState, WeeklyBudgetScope } from '@/types'

interface HeroWeeklyProps {
  d: DerivedMetrics
  settings: AppState['settings']
  categories: AppState['categories']
  groups: AppState['groups']
  transactions: AppState['transactions']
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  editOpen: boolean
  onEditClose: () => void
  onEditOpen: () => void
}

function computeCycle(salaryDate: number) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const day = today.getDate()
  let start: Date, end: Date
  if (day >= salaryDate) {
    start = new Date(y, m, salaryDate)
    end = new Date(y, m + 1, salaryDate - 1)
  } else {
    start = new Date(y, m - 1, salaryDate)
    end = new Date(y, m, salaryDate - 1)
  }
  const todayMid = new Date(y, m, day)
  const msDay = 86400000
  const daysRemaining = Math.max(1, Math.round((end.getTime() - todayMid.getTime()) / msDay) + 1)
  const weeksRemaining = daysRemaining / 7
  const fmtD = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return { start, end, daysRemaining, weeksRemaining, startLabel: fmtD(start), endLabel: fmtD(end) }
}

function Row({ label, value, muted, accent, bad, bold }: { label: string; value: string; muted?: boolean; accent?: boolean; bad?: boolean; bold?: boolean }) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ font: '600 13px Plus Jakarta Sans', color: muted ? c.muted : c.ink }}>{label}</span>
      <span style={{ font: `${bold ? '800' : '700'} 14px Plus Jakarta Sans`, color: bad ? c.bad : accent ? c.accent : muted ? c.muted : c.ink }}>{value}</span>
    </div>
  )
}

const DEFAULT_SCOPE_GROUPS = ['Lifestyle']

function scopeLabel(scope: WeeklyBudgetScope | null | undefined, categories: AppState['categories']): string {
  if (!scope || (scope.groups.length === 0 && scope.categoryIds.length === 0)) return 'Lifestyle'
  const parts: string[] = []
  if (scope.groups.length > 0) parts.push(...scope.groups)
  if (scope.categoryIds.length > 0) {
    const catNames = scope.categoryIds.map(id => categories.find(c => c.id === id)?.name).filter(Boolean)
    parts.push(...(catNames as string[]))
  }
  if (parts.length === 0) return 'Lifestyle'
  if (parts.length <= 2) return parts.join(', ')
  return `${parts.slice(0, 2).join(', ')} +${parts.length - 2}`
}

export function HeroWeekly({ d, settings, categories, groups, transactions, onUpdateSettings, editOpen, onEditClose, onEditOpen }: HeroWeeklyProps) {
  const c = useTheme()
  const pct = d.weeklyPct
  const status = pct > 100
    ? { t: 'Over budget', col: c.bad }
    : pct >= 75
    ? { t: 'Watch spending', col: c.warn }
    : { t: 'On track', col: c.good }

  const [salaryDateInput, setSalaryDateInput] = useState(String(settings.salary_date || ''))
  const [budgetInput, setBudgetInput] = useState(String(settings.weekly_budget))
  const [budgetPeriod, setBudgetPeriod] = useState<'daily' | 'weekly' | 'monthly'>(settings.budget_period ?? 'weekly')
  const [weeklyStartDay, setWeeklyStartDay] = useState(settings.weekly_start_day ?? 1)
  const [monthlyStartDate, setMonthlyStartDate] = useState(String(settings.monthly_start_date ?? 1))
  const [saving, setSaving] = useState(false)
  const [popup, setPopup] = useState<'budget' | 'spent' | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const initScopeGroups = () => {
    const s = settings.weekly_budget_scope
    if (!s || (s.groups.length === 0 && s.categoryIds.length === 0 && (!s.transactionIds || s.transactionIds.length === 0))) return DEFAULT_SCOPE_GROUPS
    return s.groups
  }
  const [scopeGroups, setScopeGroups] = useState<string[]>(initScopeGroups)
  const [scopeCategoryIds, setScopeCategoryIds] = useState<string[]>(settings.weekly_budget_scope?.categoryIds ?? [])
  const [scopeTransactionIds, setScopeTransactionIds] = useState<string[]>(settings.weekly_budget_scope?.transactionIds ?? [])
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [showTxnPicker, setShowTxnPicker] = useState(false)

  useEffect(() => {
    if (editOpen) {
      setSalaryDateInput(String(settings.salary_date || ''))
      setBudgetInput(String(settings.weekly_budget))
      setBudgetPeriod(settings.budget_period ?? 'weekly')
      setWeeklyStartDay(settings.weekly_start_day ?? 1)
      setMonthlyStartDate(String(settings.monthly_start_date ?? 1))
      const s = settings.weekly_budget_scope
      const isEmpty = !s || (s.groups.length === 0 && s.categoryIds.length === 0 && (!s.transactionIds || s.transactionIds.length === 0))
      setScopeGroups(isEmpty ? DEFAULT_SCOPE_GROUPS : s!.groups)
      setScopeCategoryIds(s?.categoryIds ?? [])
      setScopeTransactionIds(s?.transactionIds ?? [])
      setShowCatPicker(false)
      setShowTxnPicker(false)
    }
  }, [editOpen, settings.salary_date, settings.weekly_budget, settings.weekly_budget_scope, settings.budget_period, settings.weekly_start_day, settings.monthly_start_date])

  // Expense transactions within the current budget period
  const activePeriod = settings.budget_period ?? 'weekly'
  const thisWeekTxns = useMemo(() => {
    const start = activePeriod === 'daily'
      ? new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())
      : activePeriod === 'monthly'
      ? getMonthStart(TODAY, settings.monthly_start_date ?? 1)
      : getWeekStart(TODAY, settings.weekly_start_day ?? 1)
    return transactions
      .filter(t => t.transaction_type === 'expense' && new Date(t.transaction_date) >= start)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  }, [transactions, activePeriod, settings.weekly_start_day, settings.monthly_start_date])

  // Returns true if a transaction is already covered by the current group/category scope
  const isCoveredByScope = (t: AppState['transactions'][0]) => {
    const cat = categories.find(cat => cat.id === t.category_id)
    if (!cat) return false
    return scopeGroups.includes(cat.group_name) || scopeCategoryIds.includes(t.category_id ?? '')
  }

  const cycle = useMemo(() => {
    const sd = parseInt(salaryDateInput)
    if (!sd || sd < 1 || sd > 31) return null
    return computeCycle(sd)
  }, [salaryDateInput])

  const cycleForDisplay = useMemo(() => {
    const sd = settings.salary_date
    if (!sd) return null
    return computeCycle(sd)
  }, [settings.salary_date])

  const suggested = cycle
    ? budgetPeriod === 'daily'
      ? Math.round(d.realFreeMoney / cycle.daysRemaining)
      : budgetPeriod === 'monthly'
      ? Math.round(d.realFreeMoney)
      : Math.round(d.realFreeMoney / cycle.weeksRemaining)
    : null
  const suggestedUnit = budgetPeriod === 'daily' ? 'day' : budgetPeriod === 'monthly' ? 'month' : 'week'

  const handleSave = async () => {
    const budget = parseFloat(budgetInput)
    const sd = parseInt(salaryDateInput) || null
    if (isNaN(budget) || budget <= 0) return
    setSaving(true)
    try {
      const scope: WeeklyBudgetScope = { groups: scopeGroups, categoryIds: scopeCategoryIds, transactionIds: scopeTransactionIds }
      const msd = parseInt(monthlyStartDate)
      await onUpdateSettings({
        weekly_budget: budget,
        salary_date: sd,
        weekly_budget_scope: scope,
        budget_period: budgetPeriod,
        weekly_start_day: weeklyStartDay,
        monthly_start_date: (!isNaN(msd) && msd >= 1 && msd <= 31) ? msd : 1,
      })
      onEditClose()
    } catch (_) {}
    setSaving(false)
  }

  const toggleGroup = (name: string) => {
    setScopeGroups(prev => {
      const next = prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
      // When adding a group, drop any hand-picked transactions now covered by it
      if (!prev.includes(name)) {
        setScopeTransactionIds(ids => ids.filter(id => {
          const t = transactions.find(tx => tx.id === id)
          const cat = categories.find(cat => cat.id === t?.category_id)
          return cat?.group_name !== name
        }))
      }
      return next
    })
  }

  const toggleCategory = (id: string) => {
    setScopeCategoryIds(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      // When adding a category, drop any hand-picked transactions now covered by it
      if (!prev.includes(id)) {
        setScopeTransactionIds(ids => ids.filter(txId => {
          const t = transactions.find(tx => tx.id === txId)
          return t?.category_id !== id
        }))
      }
      return next
    })
  }

  const toggleTransaction = (id: string) => {
    setScopeTransactionIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const expenseGroups = groups.filter(g => !g.is_system)

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '700 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  return (
    <>
      <div style={{
        borderRadius: 26, padding: 20, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(145deg, ${c.heroA} 0%, ${c.heroB} 100%)`,
        boxShadow: c.heroShadow,
      }}>
        <div style={{ position: 'absolute', right: -40, top: -50, width: 180, height: 180, borderRadius: 999, background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: -18, bottom: -22, width: 140, height: 140, transform: 'rotate(-25deg)', pointerEvents: 'none' }}>
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ font: '600 13px Plus Jakarta Sans', color: 'rgba(255,255,255,0.82)', letterSpacing: '0.02em' }}>{activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Remaining</div>
              <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.65)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </button>
              <button onClick={onEditOpen} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
              </button>
            </div>
            <div style={{ font: '800 40px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 6 }}>
              {fmt(d.weeklyRemaining)}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />
              <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{status.t}</span>
            </div>
          </div>

          <ProgressRing pct={pct} color="#fff" track="rgba(255,255,255,0.28)" size={104} stroke={10}>
            <div style={{ font: '800 22px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>{Math.round(pct)}%</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>used</div>
          </ProgressRing>
        </div>

        {/* Budget / Spent tiles */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'relative' }}>
          <div onClick={() => setPopup('budget')} style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>{activePeriod === 'daily' ? 'Today' : activePeriod === 'monthly' ? 'Month' : 'Week'} Budget ⓘ</div>
            <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(d.weeklyBudget)}</div>
            {settings.salary_date && (
              <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Salary: {settings.salary_date}th</div>
            )}
          </div>
          <div onClick={() => setPopup('spent')} style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>{activePeriod === 'daily' ? 'Today' : activePeriod === 'monthly' ? 'Month' : 'Week'} Spent ⓘ</div>
            <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(d.weeklySpent)}</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{scopeLabel(settings.weekly_budget_scope, categories)}</div>
          </div>
        </div>
      </div>

      {/* Section info popup */}
      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>{activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Budget Tracker</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M8 8h8M8 16h5"/></svg>,
                  title: `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} spending limit`,
                  desc: activePeriod === 'daily' ? 'Your budget for today. Resets at midnight.' : activePeriod === 'monthly' ? 'Your spending budget for the current month.' : 'Your free money is divided by the weeks left in your salary cycle to give a per-week allowance.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                  title: `This ${activePeriod === 'daily' ? 'day' : activePeriod === 'monthly' ? 'month' : 'week'}'s spend`,
                  desc: `${activePeriod === 'daily' ? 'Expenses today' : activePeriod === 'monthly' ? 'Expenses this month' : 'Expenses from Monday to Sunday'} under: ${scopeLabel(settings.weekly_budget_scope, categories)}. Configure in budget settings.`,
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12M12 12L7 17M12 12l5 5"/><path d="M20 7a4 4 0 00-8 0"/><path d="M4 7a4 4 0 018 0"/></svg>,
                  title: 'Salary cycle',
                  desc: 'Set your salary date so the tracker resets each month and calculates the right weekly slice.',
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
                Tap <strong style={{ color: c.ink }}>Budget ⓘ</strong> or <strong style={{ color: c.ink }}>Spent ⓘ</strong> tiles below to see the exact numbers behind each figure.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* Calculation popup */}
      {popup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setPopup(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '800 17px Plus Jakarta Sans', color: c.ink }}>
                {popup === 'budget' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M8 8h8M8 16h5"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M12 6v6l4 2"/>
                  </svg>
                )}
                {popup === 'budget' ? `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Budget` : `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Spent`}
              </div>
              <button onClick={() => setPopup(null)} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 28, height: 28, cursor: 'pointer', font: '700 14px Plus Jakarta Sans', color: c.muted }}>✕</button>
            </div>

            {popup === 'budget' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Total account balance" value={fmt(d.actualBalance)} />
                <Row label="Emergency fund reserve" value={`− ${fmt(d.emergencyFund)}`} muted />
                <Row label="Remaining commitments" value={`− ${fmt(d.remainingCommitments)}`} muted />
                <div style={{ height: 1, background: c.faint }} />
                <Row label="Free money" value={fmt(d.realFreeMoney)} accent />
                {cycleForDisplay ? (
                  <>
                    <Row
                      label={activePeriod === 'daily' ? 'Days left in cycle' : activePeriod === 'monthly' ? 'Months left in cycle' : 'Weeks left in cycle'}
                      value={activePeriod === 'daily' ? `÷ ${cycleForDisplay.daysRemaining} days` : activePeriod === 'monthly' ? '÷ 1 month' : `÷ ${cycleForDisplay.weeksRemaining.toFixed(1)} weeks`}
                      muted
                    />
                    <div style={{ height: 1, background: c.faint }} />
                    <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} budget`} value={fmt(d.weeklyBudget)} accent bold />
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '8px 10px', marginTop: 4 }}>
                      Cycle: {cycleForDisplay.startLabel} → {cycleForDisplay.endLabel} · {cycleForDisplay.daysRemaining} days left
                    </div>
                  </>
                ) : (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '10px 12px' }}>
                    Set salary date in budget settings to see cycle-based calculation.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
                  Expenses {activePeriod === 'daily' ? 'today' : activePeriod === 'monthly' ? 'this month' : 'this week'} from: <strong style={{ color: c.ink }}>{scopeLabel(settings.weekly_budget_scope, categories)}</strong>
                </div>
                <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} spent`} value={fmt(d.weeklySpent)} bold />
                <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} budget`} value={fmt(d.weeklyBudget)} muted />
                <div style={{ height: 1, background: c.faint }} />
                <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} remaining`} value={fmt(d.weeklyRemaining)} accent={d.weeklyRemaining >= 0} bad={d.weeklyRemaining < 0} bold />
                <Row label="Usage" value={`${Math.round(d.weeklyPct)}%`} muted />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget Edit Sheet */}
      <BottomSheet open={editOpen} onClose={onEditClose} maxHeight="90svh">
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.02em' }}>Budget Settings</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 18 }}>Set period, scope, and salary cycle</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Period selector */}
              <div>
                <label style={lbl}>Budget period</label>
                <HelpText>How frequently your budget resets — daily, weekly, or monthly.</HelpText>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['daily', 'weekly', 'monthly'] as const).map(p => (
                    <button key={p} onClick={() => setBudgetPeriod(p)} style={{
                      flex: 1, background: budgetPeriod === p ? c.accent : c.surface2,
                      color: budgetPeriod === p ? '#fff' : c.ink,
                      border: `1.5px solid ${budgetPeriod === p ? c.accent : c.faint}`,
                      borderRadius: 10, padding: '8px 0',
                      font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Week start day */}
              {budgetPeriod === 'weekly' && (
                <div>
                  <label style={lbl}>Week starts on</label>
                  <HelpText>Which day your week begins for budget calculations.</HelpText>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]] as [string, number][]).map(([label, day]) => (
                      <button key={day} onClick={() => setWeeklyStartDay(day)} style={{
                        flex: 1, background: weeklyStartDay === day ? c.accent : c.surface2,
                        color: weeklyStartDay === day ? '#fff' : c.ink,
                        border: `1.5px solid ${weeklyStartDay === day ? c.accent : c.faint}`,
                        borderRadius: 8, padding: '7px 0',
                        font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
                      }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly start date */}
              {budgetPeriod === 'monthly' && (
                <div>
                  <label style={lbl}>Month starts on</label>
                  <HelpText>Which date your monthly budget cycle starts.</HelpText>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="number" value={monthlyStartDate} onChange={e => setMonthlyStartDate(e.target.value)}
                      placeholder="e.g. 1" min="1" max="31" style={{ ...inp, width: 100 }} />
                    <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of every month</span>
                  </div>
                </div>
              )}
              <div>
                <label style={lbl}>Salary credit date (day of month)</label>
                <HelpText>When your salary arrives each month. Helps MoneyPlant understand your financial cycle.</HelpText>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" value={salaryDateInput} onChange={e => setSalaryDateInput(e.target.value)}
                    placeholder="e.g. 28" min="1" max="31" style={{ ...inp, width: 100 }} />
                  <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of every month</span>
                </div>
              </div>

              {cycle && (
                <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>
                    Current cycle: {cycle.startLabel} → {cycle.endLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent }}>{cycle.daysRemaining}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>days left</div>
                    </div>
                    <div>
                      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent }}>{cycle.weeksRemaining.toFixed(1)}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>weeks left</div>
                    </div>
                    <div>
                      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink }}>{fmt(d.realFreeMoney)}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>free money</div>
                    </div>
                  </div>
                  {suggested !== null && suggested > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.faint}` }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>
                        {fmt(d.realFreeMoney)} ÷ {budgetPeriod === 'daily' ? `${cycle.daysRemaining} days` : budgetPeriod === 'monthly' ? '1 month' : `${cycle.weeksRemaining.toFixed(1)} weeks`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Suggested budget</div>
                          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.good, letterSpacing: '-0.02em' }}>{fmt(suggested)}<span style={{ font: '600 12px Plus Jakarta Sans' }}>/{suggestedUnit}</span></div>
                        </div>
                        <button onClick={() => setBudgetInput(String(suggested))}
                          style={{ background: c.goodSoft, color: c.good, border: 'none', borderRadius: 10, padding: '8px 14px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}>
                          Use this ↓
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scope selector */}
              <div>
                <label style={lbl}>Track spending from</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {expenseGroups.map(g => {
                    const active = scopeGroups.includes(g.name)
                    return (
                      <button key={g.id} onClick={() => toggleGroup(g.name)} style={{
                        background: active ? c.accent : c.surface2,
                        color: active ? '#fff' : c.ink,
                        border: `1.5px solid ${active ? c.accent : c.faint}`,
                        borderRadius: 999, padding: '6px 14px',
                        font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        {g.name}
                      </button>
                    )
                  })}
                </div>

                {/* Specific categories expander */}
                <button onClick={() => setShowCatPicker(p => !p)} style={{
                  marginTop: 10, background: 'none', border: 'none', padding: 0,
                  font: '600 12px Plus Jakarta Sans', color: c.accent, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: showCatPicker ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  {scopeCategoryIds.length > 0 ? `${scopeCategoryIds.length} specific categor${scopeCategoryIds.length === 1 ? 'y' : 'ies'} selected` : 'Pick specific categories'}
                </button>

                {showCatPicker && (
                  <div style={{ marginTop: 10, background: c.surface2, borderRadius: 14, padding: '10px 12px', maxHeight: 220, overflowY: 'auto' }}>
                    {expenseGroups.map(g => {
                      const groupCats = categories.filter(cat => cat.group_name === g.name)
                      if (groupCats.length === 0) return null
                      return (
                        <div key={g.id} style={{ marginBottom: 10 }}>
                          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{g.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {groupCats.map(cat => {
                              const active = scopeCategoryIds.includes(cat.id)
                              return (
                                <button key={cat.id} onClick={() => toggleCategory(cat.id)} style={{
                                  background: active ? c.accentSoft : c.surface,
                                  color: active ? c.accent : c.ink,
                                  border: `1.5px solid ${active ? c.accent : c.faint}`,
                                  borderRadius: 8, padding: '4px 10px',
                                  font: '600 12px Plus Jakarta Sans', cursor: 'pointer',
                                }}>
                                  {cat.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {scopeCategoryIds.length > 0 && (
                      <button onClick={() => setScopeCategoryIds([])} style={{
                        marginTop: 4, background: 'none', border: 'none', padding: 0,
                        font: '600 11px Plus Jakarta Sans', color: c.bad, cursor: 'pointer',
                      }}>
                        Clear category selection
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Transaction picker */}
              <div>
                <button onClick={() => setShowTxnPicker(p => !p)} style={{
                  background: 'none', border: 'none', padding: 0,
                  font: '600 12px Plus Jakarta Sans', color: c.accent, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: showTxnPicker ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  {scopeTransactionIds.length > 0
                    ? `${scopeTransactionIds.length} specific transaction${scopeTransactionIds.length === 1 ? '' : 's'} added`
                    : `Add specific transactions this ${budgetPeriod === 'daily' ? 'day' : budgetPeriod === 'monthly' ? 'month' : 'week'}`}
                </button>

                {showTxnPicker && (
                  <div style={{ marginTop: 10, background: c.surface2, borderRadius: 14, padding: '10px 12px', maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {thisWeekTxns.length === 0 && (
                      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '12px 0' }}>No expense transactions this {budgetPeriod === 'daily' ? 'day' : budgetPeriod === 'monthly' ? 'month' : 'week'}</div>
                    )}
                    {thisWeekTxns.map(t => {
                      const cat = categories.find(cat => cat.id === t.category_id)
                      const covered = isCoveredByScope(t)
                      const selected = scopeTransactionIds.includes(t.id)
                      const disabled = covered

                      return (
                        <button
                          key={t.id}
                          disabled={disabled}
                          onClick={() => !disabled && toggleTransaction(t.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            background: selected ? c.accentSoft : c.surface,
                            border: `1.5px solid ${selected ? c.accent : covered ? c.faint : c.faint}`,
                            borderRadius: 10, padding: '8px 10px', cursor: disabled ? 'default' : 'pointer',
                            opacity: covered ? 0.5 : 1, textAlign: 'left',
                          }}
                        >
                          {/* Checkbox indicator */}
                          <div style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                            border: `2px solid ${selected ? c.accent : covered ? c.muted : c.faint}`,
                            background: selected ? c.accent : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: '600 13px Plus Jakarta Sans', color: covered ? c.muted : c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.description || '—'}
                            </div>
                            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1, display: 'flex', gap: 6 }}>
                              <span>{iso(new Date(t.transaction_date)).slice(5).replace('-', '/')}</span>
                              {cat && <span style={{ background: covered ? c.surface2 : c.accentSoft, color: covered ? c.muted : c.accent, borderRadius: 4, padding: '0 5px' }}>{cat.name}</span>}
                              {covered && <span style={{ color: c.muted }}>· via {cat?.group_name ?? 'scope'}</span>}
                            </div>
                          </div>

                          <div style={{ font: '700 13px Plus Jakarta Sans', color: selected ? c.accent : covered ? c.muted : c.ink, flexShrink: 0 }}>
                            {fmt(t.amount)}
                          </div>
                        </button>
                      )
                    })}
                    {scopeTransactionIds.length > 0 && (
                      <button onClick={() => setScopeTransactionIds([])} style={{
                        marginTop: 2, background: 'none', border: 'none', padding: 0,
                        font: '600 11px Plus Jakarta Sans', color: c.bad, cursor: 'pointer', alignSelf: 'flex-start',
                      }}>
                        Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={lbl}>{budgetPeriod === 'daily' ? 'Daily' : budgetPeriod === 'monthly' ? 'Monthly' : 'Weekly'} budget</label>
                <HelpText>How much you plan to spend in this budget period.</HelpText>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                  <input type="number" inputMode="decimal" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="0" min="0"
                    style={{ ...inp, paddingLeft: 28 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={onEditClose} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Budget'}
              </button>
            </div>
      </BottomSheet>
    </>
  )
}
