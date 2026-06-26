import { useState, useMemo, useEffect } from 'react'
import { X, BarChart3 } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, iso, TODAY, addDays, getWeekStart, getMonthStart } from '@/lib/utils'
import { ProgressRing } from './ProgressRing'
import { BottomSheet, HelpText } from './BottomSheet'
import type { DerivedMetrics, AppState, WeeklyBudgetScope } from '@/types'
import { getIncomePattern } from '@/lib/income-pattern'

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
  const pattern = getIncomePattern(settings)
  const isAutoMode = (settings.budget_mode ?? 'manual') === 'auto'
  const hasIncomeCycle = pattern === 'monthly' ? !!settings.salary_date : pattern === 'weekly' || pattern === 'variable' || pattern === 'business'

  // ── Edit form state ──────────────────────────────────────────────────────────
  const [salaryDateInput, setSalaryDateInput] = useState(String(settings.salary_date || ''))
  const [budgetInput, setBudgetInput] = useState(String(settings.weekly_budget))
  const [budgetPeriod, setBudgetPeriod] = useState<'daily' | 'weekly' | 'monthly'>(settings.budget_period ?? 'weekly')
  const [weeklyStartDay, setWeeklyStartDay] = useState(settings.weekly_start_day ?? 1)
  const [monthlyStartDate, setMonthlyStartDate] = useState(String(settings.monthly_start_date ?? 1))
  const [budgetMode, setBudgetMode] = useState<'auto' | 'manual'>(settings.budget_mode ?? 'manual')
  const [saving, setSaving] = useState(false)
  const [popup, setPopup] = useState<'budget' | 'spent' | 'safeUntil' | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [showScopeSystemGroups, setShowScopeSystemGroups] = useState(false)

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
      setBudgetMode(settings.budget_mode ?? 'manual')
      const s = settings.weekly_budget_scope
      const isEmpty = !s || (s.groups.length === 0 && s.categoryIds.length === 0 && (!s.transactionIds || s.transactionIds.length === 0))
      setScopeGroups(isEmpty ? DEFAULT_SCOPE_GROUPS : s!.groups)
      setScopeCategoryIds(s?.categoryIds ?? [])
      setScopeTransactionIds(s?.transactionIds ?? [])
      setShowCatPicker(false)
      setShowTxnPicker(false)
      setShowScopeSystemGroups(false)
    }
  }, [editOpen, settings.salary_date, settings.weekly_budget, settings.weekly_budget_scope, settings.budget_period, settings.weekly_start_day, settings.monthly_start_date, settings.budget_mode])

  // ── Derived values for edit form ─────────────────────────────────────────────
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
    if (budgetMode === 'manual' && (isNaN(budget) || budget <= 0)) return
    setSaving(true)
    try {
      const scope: WeeklyBudgetScope = { groups: scopeGroups, categoryIds: scopeCategoryIds, transactionIds: scopeTransactionIds }
      const msd = parseInt(monthlyStartDate)
      await onUpdateSettings({
        weekly_budget: budgetMode === 'manual' ? budget : (settings.weekly_budget),
        salary_date: sd,
        weekly_budget_scope: scope,
        budget_period: budgetPeriod,
        weekly_start_day: weeklyStartDay,
        monthly_start_date: (!isNaN(msd) && msd >= 1 && msd <= 31) ? msd : 1,
        budget_mode: budgetMode,
      })
      onEditClose()
    } catch (_) {}
    setSaving(false)
  }

  const toggleGroup = (name: string) => {
    setScopeGroups(prev => {
      const next = prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
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

  const streak = useMemo(() => {
    if (transactions.length === 0) return 0
    const dates = new Set(transactions.map(t => t.transaction_date.slice(0, 10)))
    const todayStr = iso(TODAY)
    const yesterStr = iso(addDays(TODAY, -1))
    const startStr = dates.has(todayStr) ? todayStr : dates.has(yesterStr) ? yesterStr : null
    if (!startStr) return 0
    let count = 0
    let check = new Date(startStr)
    while (dates.has(iso(check))) {
      count++
      check = addDays(check, -1)
      if (count > 366) break
    }
    return count
  }, [transactions])

  // Scope groups for the edit sheet
  const userGroups    = groups.filter(g => !g.is_system)
  const systemGroups  = groups.filter(g => g.is_system)
  const scopeAllGroups = showScopeSystemGroups ? [...userGroups, ...systemGroups] : userGroups

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '700 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }
  const sectionDiv: React.CSSProperties = {
    height: 1, background: c.faint, margin: '6px 0 16px',
  }

  // ── Manual mode card values ───────────────────────────────────────────────────
  const manualPct = d.weeklyPct
  const manualStatus = manualPct > 100
    ? { t: 'Over budget', col: c.bad }
    : manualPct >= 75
    ? { t: 'Watch spending', col: c.warn }
    : { t: 'On track', col: c.good }

  // ── Auto mode card values ─────────────────────────────────────────────────────
  const cyclePct = d.realFreeMoney > 0 ? Math.min((d.cycleSpent / d.realFreeMoney) * 100, 999) : 0
  const autoStatus = cyclePct > 100
    ? { t: 'Over budget', col: c.bad }
    : cyclePct >= 75
    ? { t: 'Watch spending', col: c.warn }
    : { t: 'On track', col: c.good }
  const hasSalaryDate = hasIncomeCycle

  // ── Shared chip row ───────────────────────────────────────────────────────────
  const StreakChip = () => streak >= 2 ? (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{streak}-day streak</span>
    </div>
  ) : null

  return (
    <>
      {/* ── AUTO MODE CARD ──────────────────────────────────────────────────────── */}
      {isAutoMode ? (
        <div style={{
          borderRadius: 26, padding: 20, position: 'relative', overflow: 'hidden',
          background: `linear-gradient(145deg, ${c.heroA} 0%, ${c.heroB} 100%)`,
          boxShadow: c.heroShadow,
        }}>
          {/* decorative blobs */}
          <div style={{ position: 'absolute', right: -40, top: -50, width: 180, height: 180, borderRadius: 999, background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: -18, bottom: -22, width: 140, height: 140, transform: 'rotate(-25deg)', pointerEvents: 'none' }}>
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
          </svg>

          {/* No salary date prompt */}
          {!hasSalaryDate ? (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ font: '600 13px Plus Jakarta Sans', color: 'rgba(255,255,255,0.82)' }}>Auto Budget</div>
                <button onClick={onEditOpen} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                </button>
              </div>
              <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '16px' }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: '#fff', marginBottom: 6 }}>
                  {pattern === 'monthly' ? 'Set your salary date' : 'Configure your income'}
                </div>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, marginBottom: 12 }}>
                  {pattern === 'monthly'
                    ? 'MoneyPlant needs your salary credit date to calculate your safe daily and weekly spend automatically.'
                    : 'Set up your income details in Settings to enable automatic budget calculations.'}
                </div>
                <button onClick={onEditOpen} style={{ background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: 10, padding: '9px 18px', font: '700 13px Plus Jakarta Sans', color: '#fff', cursor: 'pointer' }}>
                  {pattern === 'monthly' ? 'Set Salary Date' : 'Open Settings'}
                </button>
              </div>
            </div>
          ) : (pattern === 'variable' || pattern === 'business') ? (
            <>
              {/* Variable/Business hero — Safe Until + today/week summary */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: 'rgba(255,255,255,0.82)' }}>
                    {pattern === 'variable' ? 'Variable Income' : 'Business Income'}
                  </div>
                  <button onClick={onEditOpen} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  </button>
                </div>

                {/* Safe Until — primary metric (tappable for breakdown) */}
                <div style={{ marginTop: 10, cursor: 'pointer' }} onClick={() => setPopup('safeUntil')}>
                  {(d.avgDailySpending ?? 0) === 0 && (d.avgDailyIncome ?? 0) === 0 ? (
                    <div>
                      <div style={{ font: '800 28px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        Learning your pattern
                      </div>
                      <div style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.7)', marginTop: 6, lineHeight: 1.5 }}>
                        Record your earnings and expenses for a few days. MoneyPlant will calculate your safe spending automatically.
                      </div>
                    </div>
                  ) : (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ font: '800 40px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                      {(d.safeUntilDays ?? 0) > 90 ? '90+' : (d.safeUntilDays ?? 0)} days
                    </div>
                    <span style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.5)' }}>safe</span>
                  </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px',
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: 999,
                        background: (d.safeUntilDays ?? 0) > 14 ? '#4ade80' : (d.safeUntilDays ?? 0) > 7 ? '#fbbf24' : '#f87171',
                      }} />
                      <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>
                        {(d.safeUntilDays ?? 0) > 14 ? 'Comfortable' : (d.safeUntilDays ?? 0) > 7 ? 'Watch spending' : 'Low runway'}
                      </span>
                    </div>
                    {d.incomeConfidence && d.incomeConfidence !== 'none' && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '4px 10px',
                      }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.7)' }}>
                          {d.incomeConfidence === 'high' ? 'High' : d.incomeConfidence === 'medium' ? 'Med' : 'Low'} confidence
                        </span>
                      </div>
                    )}
                    <StreakChip />
                  </div>
                </div>

                {/* Today + This Week tiles */}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px' }}>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>Today</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)' }}>In</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: '#4ade80' }}>{fmt(d.todayIncome ?? 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)' }}>Out</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{fmt(d.todaySpending ?? 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)' }}>Saved</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>{fmt(d.todaySaving ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px' }}>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>This Week</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)' }}>Earned</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: '#4ade80' }}>{fmt(d.weekEarned ?? 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)' }}>Spent</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{fmt(d.weekSpent ?? 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)' }}>Saved</span>
                        <span style={{ font: '700 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>{fmt(d.weekSaved ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom info row */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.9)' }}>
                    Free Money {fmt(d.realFreeMoney)}
                  </span>
                  {(d.avgDailyIncome ?? 0) > 0 && (
                    <>
                      <span style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.4)' }}>·</span>
                      <span style={{ font: '700 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.9)' }}>
                        Avg Daily {fmt(d.avgDailyIncome ?? 0)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: 'rgba(255,255,255,0.82)', letterSpacing: '0.02em' }}>Budget Remaining</div>
                    <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.65)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    </button>
                    <button onClick={onEditOpen} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                    </button>
                  </div>
                  <div style={{ font: '800 40px Plus Jakarta Sans', color: d.cycleRemaining < 0 ? 'rgba(255,150,150,1)' : '#fff', letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 6 }}>
                    {d.cycleRemaining < 0 ? '-' : ''}{fmt(Math.abs(d.cycleRemaining))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />
                      <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{autoStatus.t}</span>
                    </div>
                    <StreakChip />
                  </div>
                </div>

                <ProgressRing pct={cyclePct} color="#fff" track="rgba(255,255,255,0.28)" size={104} stroke={10}>
                  <div style={{ font: '800 22px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>{Math.round(Math.min(cyclePct, 999))}%</div>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>used</div>
                </ProgressRing>
              </div>

              {/* Tiles */}
              <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'relative' }}>
                <div onClick={() => setPopup('budget')} style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>Free Money ⓘ</div>
                  <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(d.realFreeMoney)}</div>
                  {hasIncomeCycle && (
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                      {pattern === 'monthly' && settings.salary_date ? `Salary: ${settings.salary_date}th` : pattern === 'weekly' ? `Income: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][settings.income_day ?? 5]}` : ''}
                    </div>
                  )}
                </div>
                <div onClick={() => setPopup('spent')} style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>Cycle Spent ⓘ</div>
                  <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(d.cycleSpent)}</div>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{scopeLabel(settings.weekly_budget_scope, categories)}</div>
                </div>
              </div>

              {/* Safe spend row */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ font: '700 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.9)' }}>
                  Safe Daily {fmt(d.safeDailySpend)}
                </span>
                <span style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.4)' }}>·</span>
                <span style={{ font: '700 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.9)' }}>
                  Safe Weekly {fmt(d.safeWeeklySpend)}
                </span>
                {cycleForDisplay && (
                  <>
                    <span style={{ font: '600 12px Plus Jakarta Sans', color: 'rgba(255,255,255,0.4)' }}>·</span>
                    <span style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.6)' }}>
                      {d.cycleDaysLeft}d left
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── MANUAL MODE CARD (unchanged) ───────────────────────────────────────── */
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>
                <button onClick={onEditOpen} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                </button>
              </div>
              <div style={{ font: '800 40px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 6 }}>
                {fmt(d.weeklyRemaining)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{manualStatus.t}</span>
                </div>
                <StreakChip />
              </div>
            </div>

            <ProgressRing pct={manualPct} color="#fff" track="rgba(255,255,255,0.28)" size={104} stroke={10}>
              <div style={{ font: '800 22px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>{Math.round(manualPct)}%</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>used</div>
            </ProgressRing>
          </div>

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
      )}

      {/* ── Section info popup ───────────────────────────────────────────────────── */}
      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
                {isAutoMode ? 'Auto Budget Tracker' : `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Budget Tracker`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(isAutoMode ? [
                { title: 'Budget Remaining', desc: `Your current free money — what's left to spend for the rest of this ${pattern === 'weekly' ? 'week' : 'income cycle'} after emergency fund and obligations.` },
                { title: 'Safe Daily Spend', desc: 'Budget remaining ÷ days left in the cycle. Recalculates every day automatically.' },
                { title: 'Safe Weekly Spend', desc: 'Budget remaining ÷ weeks left in the cycle. Useful for planning the week ahead.' },
              ] : [
                { title: `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} spending limit`, desc: activePeriod === 'daily' ? 'Your budget for today. Resets at midnight.' : activePeriod === 'monthly' ? 'Your spending budget for the current month.' : `Your free money is divided by the ${pattern === 'weekly' ? 'days' : 'weeks'} left in your income cycle to give a per-${activePeriod === 'weekly' ? 'week' : 'period'} allowance.` },
                { title: `This ${activePeriod === 'daily' ? 'day' : activePeriod === 'monthly' ? 'month' : 'week'}'s spend`, desc: `${activePeriod === 'daily' ? 'Expenses today' : activePeriod === 'monthly' ? 'Expenses this month' : 'Expenses from Monday to Sunday'} under: ${scopeLabel(settings.weekly_budget_scope, categories)}. Configure in budget settings.` },
                { title: 'Income cycle', desc: pattern === 'monthly' ? 'Set your salary date so the tracker resets each month and calculates the right weekly slice.' : pattern === 'weekly' ? 'Your budget resets each week on your income day.' : 'Configure your income pattern in Settings.' },
              ]).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{item.title}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* ── Calculation popup ────────────────────────────────────────────────────── */}
      {popup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setPopup(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink }}>
                {popup === 'safeUntil' ? 'Safe Until — How It Works'
                  : popup === 'budget'
                  ? (isAutoMode ? 'Free Money' : `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Budget`)
                  : (isAutoMode ? 'Cycle Spent' : `${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} Spent`)
                }
              </div>
              <button onClick={() => setPopup(null)} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 28, height: 28, cursor: 'pointer', font: '700 14px Plus Jakarta Sans', color: c.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
            </div>

            {popup === 'safeUntil' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Current free money" value={fmt(d.realFreeMoney)} accent />
                <Row label="Avg daily spending (30d)" value={fmt(d.avgDailySpending ?? 0)} muted />
                <div style={{ height: 1, background: c.faint }} />
                <Row label="Safe for" value={`${d.safeUntilDays ?? 0} days`} bold />
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '8px 10px', marginTop: 4, lineHeight: 1.6 }}>
                  Free money ÷ average daily spending = days your balance can sustain current spending.
                </div>
                {(d.avgDailyIncome ?? 0) > 0 && (
                  <>
                    <div style={{ height: 1, background: c.faint }} />
                    <Row label="Avg daily income" value={fmt(d.avgDailyIncome ?? 0)} />
                    <Row label="Confidence" value={d.incomeConfidence === 'high' ? 'High' : d.incomeConfidence === 'medium' ? 'Medium' : d.incomeConfidence === 'low' ? 'Low' : 'No data'} muted />
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '8px 10px', lineHeight: 1.6 }}>
                      {d.incomeConfidence === 'high' ? 'Based on consistent income over 20+ working days with low variation.'
                        : d.incomeConfidence === 'medium' ? 'Based on 10+ working days of income data. Some variation in amounts.'
                        : d.incomeConfidence === 'low' ? 'Limited income history. Estimate may be less accurate.'
                        : 'No income history available. Using your manual estimate.'}
                    </div>
                  </>
                )}
              </div>
            ) : popup === 'budget' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Total account balance" value={fmt(d.actualBalance)} />
                <Row label="Emergency fund reserve" value={`− ${fmt(d.emergencyFund)}`} muted />
                <Row label="Remaining commitments" value={`− ${fmt(d.remainingCommitments)}`} muted />
                <div style={{ height: 1, background: c.faint }} />
                <Row label="Free money" value={fmt(d.realFreeMoney)} accent />
                {isAutoMode ? (
                  cycleForDisplay ? (
                    <>
                      <div style={{ height: 1, background: c.faint }} />
                      <Row label="Cycle budget" value={fmt(d.realFreeMoney + d.cycleSpent)} muted />
                      <Row label="Cycle spent" value={`− ${fmt(d.cycleSpent)}`} muted />
                      <div style={{ height: 1, background: c.faint }} />
                      <Row label="Budget remaining" value={fmt(d.cycleRemaining)} accent={d.cycleRemaining >= 0} bad={d.cycleRemaining < 0} bold />
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '8px 10px', marginTop: 4 }}>
                        Cycle: {cycleForDisplay.startLabel} → {cycleForDisplay.endLabel} · {d.cycleDaysLeft} days left
                      </div>
                    </>
                  ) : null
                ) : (
                  cycleForDisplay ? (
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
                      {pattern === 'monthly' ? 'Set salary date in budget settings to see cycle-based calculation.' : 'Configure your income in Settings to see cycle-based calculation.'}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
                  {isAutoMode
                    ? <>Expenses since <strong style={{ color: c.ink }}>{cycleForDisplay?.startLabel}</strong> from: <strong style={{ color: c.ink }}>{scopeLabel(settings.weekly_budget_scope, categories)}</strong></>
                    : <>Expenses {activePeriod === 'daily' ? 'today' : activePeriod === 'monthly' ? 'this month' : 'this week'} from: <strong style={{ color: c.ink }}>{scopeLabel(settings.weekly_budget_scope, categories)}</strong></>
                  }
                </div>
                {isAutoMode ? (
                  <>
                    <Row label="Cycle spent" value={fmt(d.cycleSpent)} bold />
                    <Row label="Free money" value={fmt(d.realFreeMoney)} muted />
                    <div style={{ height: 1, background: c.faint }} />
                    <Row label="Budget remaining" value={fmt(d.cycleRemaining)} accent={d.cycleRemaining >= 0} bad={d.cycleRemaining < 0} bold />
                    <Row label="Safe daily spend" value={fmt(d.safeDailySpend)} muted />
                    <Row label="Safe weekly spend" value={fmt(d.safeWeeklySpend)} muted />
                  </>
                ) : (
                  <>
                    <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} spent`} value={fmt(d.weeklySpent)} bold />
                    <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} budget`} value={fmt(d.weeklyBudget)} muted />
                    <div style={{ height: 1, background: c.faint }} />
                    <Row label={`${activePeriod === 'daily' ? 'Daily' : activePeriod === 'monthly' ? 'Monthly' : 'Weekly'} remaining`} value={fmt(d.weeklyRemaining)} accent={d.weeklyRemaining >= 0} bad={d.weeklyRemaining < 0} bold />
                    <Row label="Usage" value={`${Math.round(d.weeklyPct)}%`} muted />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Budget Edit Sheet ─────────────────────────────────────────────────────── */}
      <BottomSheet open={editOpen} onClose={onEditClose} maxHeight="90svh">
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.02em' }}>Budget Settings</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>
          {(pattern === 'variable' || pattern === 'business') ? 'Income estimate, spending scope, and budget mode' : 'Income cycle, spending scope, and budget mode'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* ── Section 1: Income / Cycle ────────────────────────────────────── */}
          {(pattern === 'variable' || pattern === 'business') ? (<>
            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Your Income</div>

            {(d.avgDailyIncome ?? 0) > 0 ? (
              <div style={{ background: c.accentSoft, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimated Daily Income</div>
                    <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 2 }}>{fmt(d.avgDailyIncome ?? 0)}</div>
                  </div>
                  {d.incomeConfidence && d.incomeConfidence !== 'none' && (
                    <div style={{
                      background: d.incomeConfidence === 'high' ? c.goodSoft : d.incomeConfidence === 'medium' ? c.warnSoft : c.badSoft,
                      color: d.incomeConfidence === 'high' ? c.good : d.incomeConfidence === 'medium' ? c.warn : c.bad,
                      borderRadius: 8, padding: '4px 10px',
                      font: '700 11px Plus Jakarta Sans',
                    }}>
                      {d.incomeConfidence === 'high' ? 'High' : d.incomeConfidence === 'medium' ? 'Medium' : 'Low'} confidence
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Avg daily spending</span>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(d.avgDailySpending ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Safe for</span>
                  <span style={{ font: '700 12px Plus Jakarta Sans', color: (d.safeUntilDays ?? 0) > 14 ? c.good : (d.safeUntilDays ?? 0) > 7 ? c.warn : c.bad }}>{d.safeUntilDays ?? 0} days</span>
                </div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 10, lineHeight: 1.5 }}>
                  {settings.average_daily_income ? 'Based on your manual estimate.' : 'Based on the last 60 days of earnings. Uses median to avoid outlier influence.'}
                </div>
              </div>
            ) : (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '16px', marginBottom: 14, textAlign: 'center' }}>
                <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}><BarChart3 size={24} color="#A09890" /></div>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Learning your income</div>
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
                  Record your earnings for about two weeks. MoneyPlant will build your budget automatically.
                </div>
              </div>
            )}
          </>) : (<>
            <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {pattern === 'monthly' ? 'Salary Cycle' : 'Weekly Cycle'}
            </div>

            {pattern === 'monthly' && (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Salary credit date (day of month)</label>
                <HelpText>When your salary arrives each month — drives safe spend calculations in Auto mode.</HelpText>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" value={salaryDateInput} onChange={e => setSalaryDateInput(e.target.value)}
                    placeholder="e.g. 28" min="1" max="31" style={{ ...inp, width: 100 }} />
                  <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of every month</span>
                </div>
              </div>
            )}
            {pattern === 'weekly' && (
              <div style={{ marginBottom: 14, background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                  Your budget cycle resets weekly on your income day. Configure income details in Settings.
                </div>
              </div>
            )}

            {cycle && (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>
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
              </div>
            )}
          </>)}

          <div style={sectionDiv} />

          {/* ── Section 2: Budget Includes ─────────────────────────────────────── */}
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Budget Includes</div>

          <div style={{ marginBottom: 10 }}>
            <HelpText>Which spending groups count toward your budget. Non-selected groups are still tracked but excluded from the budget calculation.</HelpText>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {scopeAllGroups.map(g => {
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

            {/* System groups toggle */}
            <button onClick={() => setShowScopeSystemGroups(p => !p)} style={{
              marginTop: 10, background: 'none', border: 'none', padding: 0,
              font: '600 12px Plus Jakarta Sans', color: c.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showScopeSystemGroups ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              {showScopeSystemGroups ? 'Hide system groups' : 'Show system groups'}
            </button>
          </div>

          {/* Specific categories expander */}
          <button onClick={() => setShowCatPicker(p => !p)} style={{
            marginBottom: 8, background: 'none', border: 'none', padding: 0,
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
            <div style={{ marginBottom: 10, background: c.surface2, borderRadius: 14, padding: '10px 12px', maxHeight: 220, overflowY: 'auto' }}>
              {scopeAllGroups.map(g => {
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

          {/* Transaction picker */}
          <button onClick={() => setShowTxnPicker(p => !p)} style={{
            marginBottom: 8, background: 'none', border: 'none', padding: 0,
            font: '600 12px Plus Jakarta Sans', color: c.accent, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showTxnPicker ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {scopeTransactionIds.length > 0
              ? `${scopeTransactionIds.length} specific transaction${scopeTransactionIds.length === 1 ? '' : 's'} added`
              : `Add specific transactions`}
          </button>

          {showTxnPicker && (
            <div style={{ marginBottom: 10, background: c.surface2, borderRadius: 14, padding: '10px 12px', maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {thisWeekTxns.length === 0 && (
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, textAlign: 'center', padding: '12px 0' }}>No expense transactions in this period</div>
              )}
              {thisWeekTxns.map(t => {
                const cat = categories.find(cat => cat.id === t.category_id)
                const covered = isCoveredByScope(t)
                const selected = scopeTransactionIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    disabled={covered}
                    onClick={() => !covered && toggleTransaction(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      background: selected ? c.accentSoft : c.surface,
                      border: `1.5px solid ${selected ? c.accent : c.faint}`,
                      borderRadius: 10, padding: '8px 10px', cursor: covered ? 'default' : 'pointer',
                      opacity: covered ? 0.5 : 1, textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${selected ? c.accent : c.faint}`,
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

          <div style={sectionDiv} />

          {/* ── Section 3: Budget Mode ─────────────────────────────────────────── */}
          <div style={{ font: '700 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Budget Mode</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['auto', 'manual'] as const).map(mode => (
              <button key={mode} onClick={() => setBudgetMode(mode)} style={{
                flex: 1,
                background: budgetMode === mode ? c.accent : c.surface2,
                color: budgetMode === mode ? '#fff' : c.ink,
                border: `1.5px solid ${budgetMode === mode ? c.accent : c.faint}`,
                borderRadius: 10, padding: '10px 0',
                font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
              }}>
                {mode === 'auto' ? ((pattern === 'variable' || pattern === 'business') ? 'Adaptive' : 'Auto') : 'Manual'}
              </button>
            ))}
          </div>

          {budgetMode === 'auto' ? (
            (pattern === 'variable' || pattern === 'business') ? (
              <div style={{ background: c.accentSoft, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.accent, marginBottom: 10 }}>
                  Budget adapts to your earnings
                </div>
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
                  Your spending targets update as you record income. Needs, Wants, and Savings are calculated from your earning history.
                </div>
              </div>
            ) : cycle ? (
              <div style={{ background: c.accentSoft, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ font: '700 12px Plus Jakarta Sans', color: c.accent, marginBottom: 10 }}>
                  MoneyPlant calculates automatically
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Free Money</span>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(d.realFreeMoney)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>Days remaining</span>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{cycle.daysRemaining}</span>
                  </div>
                  <div style={{ height: 1, background: c.faint }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Safe Daily Spend</span>
                    <span style={{ font: '800 14px Plus Jakarta Sans', color: c.accent }}>{fmt(Math.round(d.safeDailySpend))}<span style={{ font: '600 11px' }}>/day</span></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Safe Weekly Spend</span>
                    <span style={{ font: '800 14px Plus Jakarta Sans', color: c.accent }}>{fmt(Math.round(d.safeWeeklySpend))}<span style={{ font: '600 11px' }}>/week</span></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                {pattern === 'monthly' ? 'Set your salary date above to see automatic safe spend calculations.' : 'Configure your income in Settings to see automatic safe spend calculations.'}
              </div>
            )
          ) : (
            /* Manual mode: period selector + budget input */
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>{(pattern === 'variable' || pattern === 'business') ? 'Planning view' : 'Budget period'}</label>
                <HelpText>{(pattern === 'variable' || pattern === 'business') ? 'Choose how you want to review your spending progress.' : 'How frequently your budget resets.'}</HelpText>
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

              {budgetPeriod === 'weekly' && pattern !== 'variable' && pattern !== 'business' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Week starts on</label>
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

              {budgetPeriod === 'monthly' && pattern !== 'variable' && pattern !== 'business' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Month starts on</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="number" value={monthlyStartDate} onChange={e => setMonthlyStartDate(e.target.value)}
                      placeholder="e.g. 1" min="1" max="31" style={{ ...inp, width: 100 }} />
                    <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of every month</span>
                  </div>
                </div>
              )}

              {/* Suggested budget from cycle — not shown for variable/business */}
              {cycle && suggested !== null && suggested > 0 && pattern !== 'variable' && pattern !== 'business' && (
                <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
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

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>{(pattern === 'variable' || pattern === 'business') ? `${budgetPeriod === 'daily' ? 'Daily' : budgetPeriod === 'monthly' ? 'Monthly' : 'Weekly'} spending target` : `${budgetPeriod === 'daily' ? 'Daily' : budgetPeriod === 'monthly' ? 'Monthly' : 'Weekly'} budget`}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                  <input type="number" inputMode="decimal" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="0" min="0"
                    style={{ ...inp, paddingLeft: 28 }} />
                </div>
              </div>
            </>
          )}
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
