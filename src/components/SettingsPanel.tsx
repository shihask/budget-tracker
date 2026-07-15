import { useState, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { ACCENT_OPTIONS } from '@/lib/tokens'
import type { IncomePattern, Layout } from '@/types'
import { requestAndSubscribe, unsubscribeFromPush, getPermissionState, isPushSupported } from '@/lib/notifications'
import { INCOME_PATTERN_OPTIONS } from '@/lib/income-pattern'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { AmountOperatorRow } from './AmountOperatorRow'

interface SettingsPanelProps {
  accent: string
  dark: boolean
  layout: Layout
  incomePattern: IncomePattern
  salaryDate: number | null
  monthlySalary: number | null
  weeklyIncome: number | null
  incomeDay: number | null
  averageDailyIncome: number | null
  workingDaysPerWeek: number | null
  businessMonthlyDrawings: number | null
  historicalDailyIncome: number | null
  trackCreditCards: boolean
  trackBorrowings: boolean
  trackSavings: boolean
  trackProjects: boolean
  trackAaSync: boolean
  budgetStrategyEnabled: boolean
  challengeEnabled: boolean
  autopilotEnabled: boolean
  aiRequestsUsed: number
  aiRequestsResetAt: string | null
  notificationsEnabled: boolean
  notifyDailyReminder: boolean
  notifyBudgetAlert: boolean
  notifyCommitments: boolean
  notifyWeeklySummary: boolean
  notifyEveningRecap: boolean
  onAccent: (v: string) => void
  onDark: (v: boolean) => void
  onLayout: (v: Layout) => void
  onIncomePattern: (v: IncomePattern) => Promise<void>
  onSalaryDate: (v: number | null) => Promise<void>
  onMonthlySalary: (v: number | null) => Promise<void>
  onIncomeSettings: (patch: Record<string, unknown>) => Promise<void>
  onTrackCreditCards: (v: boolean) => Promise<void>
  onTrackBorrowings: (v: boolean) => Promise<void>
  onTrackSavings: (v: boolean) => Promise<void>
  onTrackProjects: (v: boolean) => Promise<void>
  onTrackAaSync: (v: boolean) => Promise<void>
  onOpenAaSync: () => void
  onBudgetStrategy: (v: boolean) => void
  onChallengeEnabled: (v: boolean) => Promise<void>
  onAutopilot: (v: boolean) => Promise<void>
  onNotificationsEnabled: (v: boolean) => Promise<void>
  onNotifyDailyReminder: (v: boolean) => Promise<void>
  onNotifyBudgetAlert: (v: boolean) => Promise<void>
  onNotifyCommitments: (v: boolean) => Promise<void>
  onNotifyWeeklySummary: (v: boolean) => Promise<void>
  onNotifyEveningRecap: (v: boolean) => Promise<void>
  onDashboardLayout: () => void
  tourHighlight?: boolean
}

export function SettingsPanel({ accent, dark, layout, incomePattern, salaryDate, monthlySalary, weeklyIncome, incomeDay, averageDailyIncome, workingDaysPerWeek, businessMonthlyDrawings, historicalDailyIncome, trackCreditCards, trackBorrowings, trackSavings, trackProjects, trackAaSync, budgetStrategyEnabled, challengeEnabled, autopilotEnabled, aiRequestsUsed, aiRequestsResetAt, notificationsEnabled, notifyDailyReminder, notifyBudgetAlert, notifyCommitments, notifyWeeklySummary, notifyEveningRecap, onAccent, onDark, onLayout, onIncomePattern, onSalaryDate, onMonthlySalary, onIncomeSettings, onTrackCreditCards, onTrackBorrowings, onTrackSavings, onTrackProjects, onTrackAaSync, onOpenAaSync, onBudgetStrategy, onChallengeEnabled, onAutopilot, onNotificationsEnabled, onNotifyDailyReminder, onNotifyBudgetAlert, onNotifyCommitments, onNotifyWeeklySummary, onNotifyEveningRecap, onDashboardLayout, tourHighlight }: SettingsPanelProps) {
  const c = useTheme()
  const [salaryInput, setSalaryInput] = useState(String(salaryDate || ''))
  const [salaryAmountInput, setSalaryAmountInput] = useState(monthlySalary != null ? String(monthlySalary) : '')
  const [weeklyIncomeInput, setWeeklyIncomeInput] = useState(weeklyIncome != null ? String(weeklyIncome) : '')
  const [incomeDayInput, setIncomeDayInput] = useState(incomeDay ?? 5)
  const [avgDailyInput, setAvgDailyInput] = useState(averageDailyIncome != null ? String(averageDailyIncome) : '')
  const [workingDaysInput, setWorkingDaysInput] = useState(workingDaysPerWeek ?? 6)
  const [businessDrawingsInput, setBusinessDrawingsInput] = useState(businessMonthlyDrawings != null ? String(businessMonthlyDrawings) : '')
  const salaryAmountRef = useRef<HTMLInputElement | null>(null)
  const weeklyIncomeRef = useRef<HTMLInputElement | null>(null)
  const avgDailyRef = useRef<HTMLInputElement | null>(null)
  const businessDrawingsRef = useRef<HTMLInputElement | null>(null)
  const [salaryAmountFocused, setSalaryAmountFocused] = useState(false)
  const [weeklyIncomeFocused, setWeeklyIncomeFocused] = useState(false)
  const [avgDailyFocused, setAvgDailyFocused] = useState(false)
  const [businessDrawingsFocused, setBusinessDrawingsFocused] = useState(false)
  const [savingSalary, setSavingSalary] = useState(false)
  const [savingIncomeSettings, setSavingIncomeSettings] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)

  const permState = getPermissionState()
  const pushSupported = isPushSupported()

  const handleEnableNotifications = async () => {
    setNotifLoading(true)
    setNotifError(null)
    const result = await requestAndSubscribe()
    if (result === 'subscribed') {
      await onNotificationsEnabled(true)
    } else if (result === 'denied') {
      setNotifError('Permission denied. Enable notifications in your browser settings.')
    } else if (result === 'unsupported') {
      setNotifError('Push notifications are not supported on this device/browser.')
    } else {
      setNotifError('Something went wrong. Please try again.')
    }
    setNotifLoading(false)
  }

  const handleDisableNotifications = async () => {
    setNotifLoading(true)
    await unsubscribeFromPush()
    await onNotificationsEnabled(false)
    setNotifLoading(false)
  }

  const handleSalarySave = async () => {
    const v = parseInt(salaryInput)
    const val = (!salaryInput || isNaN(v)) ? null : Math.min(31, Math.max(1, v))
    const amt = evaluateAmountExpression(salaryAmountInput)
    const salaryAmt = (!salaryAmountInput || amt === null) ? null : Math.round(amt)
    setSavingSalary(true)
    try {
      await onSalaryDate(val)
      await onMonthlySalary(salaryAmt)
    } catch (_) {}
    setSavingSalary(false)
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 0', borderBottom: `1px solid ${c.faint}`,
  }
  const labelStyle: React.CSSProperties = {
    font: '600 13px Plus Jakarta Sans', color: c.ink,
  }
  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '14px 0 6px',
  }

  const panelW = typeof window !== 'undefined' ? Math.min(280, window.innerWidth) : 280

  return (
    <div data-tour="settings" style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: panelW,
      background: c.surface, borderLeft: panelW < window.innerWidth ? `1px solid ${c.faint}` : 'none',
      padding: `calc(60px + env(safe-area-inset-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px))`,
      zIndex: tourHighlight ? 603 : 200,
      boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
      overflowY: 'auto',
    }}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Settings</div>
      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Customize your dashboard</div>

      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: '#3B82F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </span>
        Dashboard
      </div>
      <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={onDashboardLayout}>
        <div>
          <div style={labelStyle}>Dashboard Layout</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Reorder & show/hide sections</div>
        </div>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={c.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Card layout</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['grid', 'carousel', 'list'] as Layout[]).map(l => (
            <button
              key={l}
              onClick={() => onLayout(l)}
              style={{
                padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                font: '700 11px Plus Jakarta Sans',
                background: layout === l ? c.accent : c.surface2,
                color: layout === l ? '#fff' : c.muted,
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: c.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="16" />
            <line x1="10" y1="14" x2="14" y2="14" />
          </svg>
        </span>
        Budget
      </div>

      {/* Income Pattern selector */}
      <div style={{ paddingBottom: 8, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Income pattern</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {INCOME_PATTERN_OPTIONS.map(opt => {
            const sel = incomePattern === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onIncomePattern(opt.value)}
                style={{
                  padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  font: '700 11px Plus Jakarta Sans',
                  background: sel ? c.accent : c.surface2,
                  color: sel ? '#fff' : c.muted,
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pattern-specific fields */}
      <div style={{ paddingBottom: 4, borderBottom: `1px solid ${c.faint}` }}>
        {/* Monthly */}
        {incomePattern === 'monthly' && (<>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 8 }}>Salary credit date</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="number"
              value={salaryInput}
              onChange={e => setSalaryInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSalarySave()}
              placeholder="e.g. 28"
              min="1" max="31"
              style={{
                flex: 1, background: c.surface2, border: `1.5px solid ${c.faint}`,
                borderRadius: 11, padding: '11px 12px',
                font: '800 16px Plus Jakarta Sans', color: c.ink,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap' }}>of month</span>
          </div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 10 }}>Monthly salary</div>
          <input
            ref={salaryAmountRef}
            type="text"
            inputMode="decimal"
            value={salaryAmountInput}
            onChange={e => setSalaryAmountInput(e.target.value)}
            onFocus={() => setSalaryAmountFocused(true)}
            onBlur={e => {
              setSalaryAmountFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setSalaryAmountInput(String(Math.round(r)))
            }}
            onKeyDown={e => e.key === 'Enter' && handleSalarySave()}
            placeholder="e.g. 50000"
            style={{
              width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 11, padding: '11px 12px',
              font: '800 16px Plus Jakarta Sans', color: c.ink,
              outline: 'none', marginBottom: 8,
            }}
          />
          {salaryAmountFocused && <AmountOperatorRow inputRef={salaryAmountRef} onChange={setSalaryAmountInput} />}
          <button
            onClick={handleSalarySave}
            disabled={savingSalary}
            style={{
              width: '100%', background: c.accent, color: '#fff', border: 'none',
              borderRadius: 11, padding: '11px', marginBottom: 14,
              font: '700 13px Plus Jakarta Sans',
              cursor: savingSalary ? 'not-allowed' : 'pointer', opacity: savingSalary ? 0.6 : 1,
            }}
          >
            {savingSalary ? 'Saving...' : 'Save Salary Details'}
          </button>
        </>)}

        {/* Weekly */}
        {incomePattern === 'weekly' && (<>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 8 }}>Average weekly income</div>
          <input
            ref={weeklyIncomeRef}
            type="text"
            inputMode="decimal"
            value={weeklyIncomeInput}
            onChange={e => setWeeklyIncomeInput(e.target.value)}
            onFocus={() => setWeeklyIncomeFocused(true)}
            onBlur={e => {
              setWeeklyIncomeFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setWeeklyIncomeInput(String(Math.round(r)))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              if (r !== null) setWeeklyIncomeInput(String(Math.round(r)))
            }}
            placeholder="e.g. 12000"
            style={{
              width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 11, padding: '11px 12px',
              font: '800 16px Plus Jakarta Sans', color: c.ink,
              outline: 'none', marginBottom: 8,
            }}
          />
          {weeklyIncomeFocused && <AmountOperatorRow inputRef={weeklyIncomeRef} onChange={setWeeklyIncomeInput} />}
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 10 }}>Income day</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
              const sel = incomeDayInput === i
              return (
                <button key={i} onClick={() => setIncomeDayInput(i)} style={{
                  padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  font: '700 11px Plus Jakarta Sans',
                  background: sel ? c.accent : c.surface2,
                  color: sel ? '#fff' : c.muted,
                }}>
                  {d}
                </button>
              )
            })}
          </div>
          <button
            onClick={async () => {
              setSavingIncomeSettings(true)
              const wi = evaluateAmountExpression(weeklyIncomeInput)
              await onIncomeSettings({ weekly_income: wi !== null && wi > 0 ? Math.round(wi) : null, income_day: incomeDayInput })
              setSavingIncomeSettings(false)
            }}
            disabled={savingIncomeSettings}
            style={{
              width: '100%', background: c.accent, color: '#fff', border: 'none',
              borderRadius: 11, padding: '11px', marginBottom: 14,
              font: '700 13px Plus Jakarta Sans',
              cursor: savingIncomeSettings ? 'not-allowed' : 'pointer', opacity: savingIncomeSettings ? 0.6 : 1,
            }}
          >
            {savingIncomeSettings ? 'Saving...' : 'Save Income Details'}
          </button>
        </>)}

        {/* Variable */}
        {incomePattern === 'variable' && (<>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 8 }}>Average daily income</div>
          <input
            ref={avgDailyRef}
            type="text"
            inputMode="decimal"
            value={avgDailyInput}
            onChange={e => setAvgDailyInput(e.target.value)}
            onFocus={() => setAvgDailyFocused(true)}
            onBlur={e => {
              setAvgDailyFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setAvgDailyInput(String(Math.round(r)))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              if (r !== null) setAvgDailyInput(String(Math.round(r)))
            }}
            placeholder="e.g. 900"
            style={{
              width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 11, padding: '11px 12px',
              font: '800 16px Plus Jakarta Sans', color: c.ink,
              outline: 'none', marginBottom: 8,
            }}
          />
          {avgDailyFocused && <AmountOperatorRow inputRef={avgDailyRef} onChange={setAvgDailyInput} />}
          {historicalDailyIncome != null && historicalDailyIncome !== averageDailyIncome && (
            <div style={{ background: c.accentSoft, borderRadius: 11, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.accent }}>Based on your history</div>
                <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>₹{historicalDailyIncome.toLocaleString('en-IN')}/day</div>
              </div>
              <button
                onClick={() => setAvgDailyInput(String(historicalDailyIncome))}
                style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer', flexShrink: 0 }}
              >
                Use this
              </button>
            </div>
          )}
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 10 }}>Working days per week</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[5, 6, 7].map(d => {
              const sel = workingDaysInput === d
              return (
                <button key={d} onClick={() => setWorkingDaysInput(d)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  font: '700 13px Plus Jakarta Sans',
                  background: sel ? c.accent : c.surface2,
                  color: sel ? '#fff' : c.muted,
                }}>
                  {d}
                </button>
              )
            })}
          </div>
          <button
            onClick={async () => {
              setSavingIncomeSettings(true)
              const adi = evaluateAmountExpression(avgDailyInput)
              await onIncomeSettings({ average_daily_income: adi !== null && adi > 0 ? Math.round(adi) : null, working_days_per_week: workingDaysInput })
              setSavingIncomeSettings(false)
            }}
            disabled={savingIncomeSettings}
            style={{
              width: '100%', background: c.accent, color: '#fff', border: 'none',
              borderRadius: 11, padding: '11px', marginBottom: 14,
              font: '700 13px Plus Jakarta Sans',
              cursor: savingIncomeSettings ? 'not-allowed' : 'pointer', opacity: savingIncomeSettings ? 0.6 : 1,
            }}
          >
            {savingIncomeSettings ? 'Saving...' : 'Save Income Details'}
          </button>
        </>)}

        {/* Business */}
        {incomePattern === 'business' && (<>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: 8 }}>Average monthly take home</div>
          <input
            ref={businessDrawingsRef}
            type="text"
            inputMode="decimal"
            value={businessDrawingsInput}
            onChange={e => setBusinessDrawingsInput(e.target.value)}
            onFocus={() => setBusinessDrawingsFocused(true)}
            onBlur={e => {
              setBusinessDrawingsFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setBusinessDrawingsInput(String(Math.round(r)))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              if (r !== null) setBusinessDrawingsInput(String(Math.round(r)))
            }}
            placeholder="e.g. 30000"
            style={{
              width: '100%', boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 11, padding: '11px 12px',
              font: '800 16px Plus Jakarta Sans', color: c.ink,
              outline: 'none', marginBottom: 8,
            }}
          />
          {businessDrawingsFocused && <AmountOperatorRow inputRef={businessDrawingsRef} onChange={setBusinessDrawingsInput} />}
          <button
            onClick={async () => {
              setSavingIncomeSettings(true)
              const bd = evaluateAmountExpression(businessDrawingsInput)
              await onIncomeSettings({ business_monthly_drawings: bd !== null && bd > 0 ? Math.round(bd) : null })
              setSavingIncomeSettings(false)
            }}
            disabled={savingIncomeSettings}
            style={{
              width: '100%', background: c.accent, color: '#fff', border: 'none',
              borderRadius: 11, padding: '11px', marginBottom: 14,
              font: '700 13px Plus Jakarta Sans',
              cursor: savingIncomeSettings ? 'not-allowed' : 'pointer', opacity: savingIncomeSettings ? 0.6 : 1,
            }}
          >
            {savingIncomeSettings ? 'Saving...' : 'Save Income Details'}
          </button>
        </>)}
      </div>

      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: '#8B5CF6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="8" cy="6" r="2" fill="#fff" stroke="none" />
            <circle cx="16" cy="12" r="2" fill="#fff" stroke="none" />
            <circle cx="10" cy="18" r="2" fill="#fff" stroke="none" />
          </svg>
        </span>
        Features
      </div>
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Credit card tracking</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Track billing cycles & due dates</div>
        </div>
        <button
          onClick={() => onTrackCreditCards(!trackCreditCards)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: trackCreditCards ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackCreditCards ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={labelStyle}>Lend & Borrow tracker</div>
            <div style={{ position: 'relative', display: 'inline-flex' }} className="info-tooltip-wrap">
              <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke={c.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'default', flexShrink: 0 }}>
                <circle cx="10" cy="10" r="8" />
                <line x1="10" y1="9" x2="10" y2="14" />
                <circle cx="10" cy="6.5" r="0.8" fill={c.muted} stroke="none" />
              </svg>
              <span style={{
                position: 'absolute', left: '50%', bottom: '120%',
                transform: 'translateX(-50%)',
                background: c.ink, color: c.surface,
                font: '600 10px Plus Jakarta Sans',
                borderRadius: 7, padding: '5px 9px',
                whiteSpace: 'nowrap', pointerEvents: 'none',
                opacity: 0, transition: 'opacity 0.15s',
                zIndex: 999,
              }} className="info-tooltip">
                Track money you lent to others or borrowed from them
              </span>
            </div>
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Track money lent & borrowed</div>
        </div>
        <button
          onClick={() => onTrackBorrowings(!trackBorrowings)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: trackBorrowings ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackBorrowings ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Savings & Investments</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Track SIPs, gold schemes, RDs & FDs</div>
        </div>
        <button
          onClick={() => onTrackSavings(!trackSavings)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: trackSavings ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackSavings ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Bank Auto-Sync</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {trackAaSync ? 'Connect a bank account via Account Aggregator (sandbox only)' : 'Coming soon — requires production bank data access, not yet available'}
          </div>
        </div>
        {/* Only ever toggleable off, never on, unless it's already on — this
            is sandbox-only and requires Setu production KYC/onboarding
            (a business/compliance process, not a code flag) before it can
            be offered generally. An already-enabled account (internal
            testing) keeps working normally. */}
        <button
          onClick={() => trackAaSync && onTrackAaSync(false)}
          disabled={!trackAaSync}
          title={trackAaSync ? undefined : 'Coming soon'}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: trackAaSync ? 'pointer' : 'not-allowed', background: trackAaSync ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: trackAaSync ? 1 : 0.6 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackAaSync ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>
      {trackAaSync && (
        <button
          onClick={onOpenAaSync}
          style={{ width: '100%', textAlign: 'left', padding: '10px 0 4px', background: 'none', border: 'none', cursor: 'pointer', font: '700 13px Plus Jakarta Sans', color: c.accent }}
        >
          Manage connected banks →
        </button>
      )}

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Projects</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Track renovations, events & shared goals</div>
        </div>
        <button
          onClick={() => onTrackProjects(!trackProjects)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: trackProjects ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackProjects ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Budget Strategy</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Allocate income across Needs, Wants & Savings</div>
        </div>
        <button
          onClick={() => onBudgetStrategy(!budgetStrategyEnabled)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: budgetStrategyEnabled ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: budgetStrategyEnabled ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Daily Challenge Mode</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Get a daily spending target based on your available money</div>
        </div>
        <button
          onClick={() => onChallengeEnabled(!challengeEnabled)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: challengeEnabled ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: challengeEnabled ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      {/* Mint card — all-in-one */}
      {(() => {
        const now = new Date()
        const resetAt = aiRequestsResetAt ? new Date(aiRequestsResetAt) : null
        const isToday = resetAt != null &&
          resetAt.getFullYear() === now.getFullYear() &&
          resetAt.getMonth() === now.getMonth() &&
          resetAt.getDate() === now.getDate()
        const used = isToday ? (aiRequestsUsed ?? 0) : 0
        const LIMIT = 100
        const pct = Math.min(100, (used / LIMIT) * 100)
        const barColor = pct >= 85 ? '#EF4444' : pct >= 60 ? '#F59E0B' : c.accent
        return (
          <div style={{ background: `linear-gradient(145deg, ${c.surface} 55%, rgba(22,201,138,0.06))`, borderRadius: 18, padding: '14px 16px', marginBottom: 16, border: `1px solid rgba(22,201,138,0.18)`, position: 'relative', overflow: 'hidden' }}>
            {/* Watermark: Mint leaf — echo */}
            <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"
              style={{ position: 'absolute', right: -44, bottom: -48, width: 200, height: 200, pointerEvents: 'none', transform: 'rotate(18deg)' }}>
              <path d="M101 395.49C236.782 395.49 330.786 318.895 363.861 177.89C228.078 177.89 134.075 254.485 101 395.49Z" fill="rgba(22,201,138,0.06)"/>
            </svg>
            {/* Watermark: Mint leaf — primary */}
            <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"
              style={{ position: 'absolute', right: -14, bottom: -22, width: 155, height: 155, pointerEvents: 'none', transform: 'rotate(8deg)' }}>
              <path d="M101 395.49C236.782 395.49 330.786 318.895 363.861 177.89C228.078 177.89 134.075 254.485 101 395.49Z" fill="rgba(22,201,138,0.16)"/>
              <path opacity="0.7" d="M119.93 377.33C187.33 296.93 259.29 245.87 354.43 186.33" stroke="rgba(22,201,138,0.12)" strokeWidth="12.288" strokeLinecap="round"/>
              <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z" fill="rgba(22,201,138,0.12)"/>
            </svg>
            {/* Sparkles */}
            <svg viewBox="0 0 512 512" fill="rgba(22,201,138,0.28)" stroke="none" style={{ position: 'absolute', right: 100, top: 8, width: 44, height: 44, pointerEvents: 'none', transform: 'rotate(-12deg)' }}>
              <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
            </svg>
            <svg viewBox="0 0 512 512" fill="rgba(22,201,138,0.18)" stroke="none" style={{ position: 'absolute', right: 62, bottom: 8, width: 28, height: 28, pointerEvents: 'none', transform: 'rotate(25deg)' }}>
              <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
            </svg>
            <svg viewBox="0 0 512 512" fill="rgba(22,201,138,0.13)" stroke="none" style={{ position: 'absolute', right: 160, top: 10, width: 20, height: 20, pointerEvents: 'none', transform: 'rotate(45deg)' }}>
              <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
            </svg>
            <svg viewBox="0 0 512 512" fill="rgba(22,201,138,0.09)" stroke="none" style={{ position: 'absolute', right: 200, bottom: 10, width: 15, height: 15, pointerEvents: 'none', transform: 'rotate(-20deg)' }}>
              <path d="M384.93 117C387.208 136.875 389.692 144.535 411.43 150.125C389.692 155.715 387.208 163.375 384.93 183.25C382.653 163.375 380.169 155.715 358.43 150.125C380.169 144.535 382.653 136.875 384.93 117Z"/>
            </svg>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
                  <img src="/mint-ai-logo.svg" width="34" height="34" alt="Mint AI" style={{ display: 'block' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Mint AI</span>
                    <span style={{ font: '700 7px Plus Jakarta Sans', color: '#F97316', background: '#F9731622', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.05em' }}>BETA</span>
                  </div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>Enable all AI features (chat, insights, categorization)</div>
                </div>
              </div>
              <button
                onClick={() => onAutopilot(!autopilotEnabled)}
                style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: autopilotEnabled ? c.accent : c.faint, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: autopilotEnabled ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: c.faint, marginBottom: 12 }} />

            {/* Quota */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ font: '600 11px Plus Jakarta Sans', color: c.ink }}>
                <span style={{ font: '700 13px Plus Jakarta Sans' }}>{used}</span>
                <span style={{ color: c.muted }}> / {LIMIT} today</span>
              </span>
              <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Resets tomorrow</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: c.surface, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: barColor, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: pct >= 85 ? barColor : c.muted, marginTop: 5 }}>
              {pct >= 100 ? 'Daily limit reached. Try again tomorrow.' : `${LIMIT - used} requests remaining`}
            </div>
          </div>
        )
      })()}

      {/* ── Notifications ──────────────────────────────────────────────────── */}
      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: c.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        Notifications
      </div>

      {!pushSupported ? (
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, padding: '8px 0 12px' }}>
          Push notifications require installing MoneyPlant as an app (Add to Home Screen).
        </div>
      ) : permState === 'denied' ? (
        <div style={{ font: '600 11px Plus Jakarta Sans', color: '#EF4444', padding: '8px 0 12px' }}>
          Notifications blocked in browser settings. Open site permissions to re-enable.
        </div>
      ) : !notificationsEnabled ? (
        /* Onboarding card */
        <div style={{ background: `linear-gradient(135deg, rgba(22,201,138,0.08), rgba(22,201,138,0.04))`, border: `1px solid rgba(22,201,138,0.22)`, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Stay on track with Mint</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 12, lineHeight: 1.5 }}>
            Get daily reminders, budget alerts &amp; weekly insights — so you never lose sight of your finances.
          </div>
          {notifError && (
            <div style={{ font: '600 11px Plus Jakarta Sans', color: '#EF4444', marginBottom: 8 }}>{notifError}</div>
          )}
          <button
            onClick={handleEnableNotifications}
            disabled={notifLoading}
            style={{
              width: '100%', background: c.accent, color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px', cursor: notifLoading ? 'not-allowed' : 'pointer',
              font: '700 13px Plus Jakarta Sans', opacity: notifLoading ? 0.7 : 1,
            }}
          >
            {notifLoading ? 'Enabling…' : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                Enable Notifications
              </span>
            )}
          </button>
        </div>
      ) : (
        /* Enabled — show toggles */
        <>
          <div style={{ ...rowStyle }}>
            <div>
              <div style={labelStyle}>Notifications</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Receive push notifications</div>
            </div>
            <button
              onClick={handleDisableNotifications}
              disabled={notifLoading}
              style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: c.accent, position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: notifLoading ? 0.6 : 1 }}
            >
              <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', left: 21, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          <div style={{ paddingLeft: 12, borderLeft: `2px solid ${c.faint}` }}>
            {[
              { label: 'Evening recap', sub: 'Daily spending summary at 9 PM', val: notifyEveningRecap, fn: onNotifyEveningRecap },
              { label: 'Daily reminder', sub: 'If no expense recorded by 8 PM', val: notifyDailyReminder, fn: onNotifyDailyReminder },
              { label: 'Budget alerts', sub: 'When weekly spend exceeds 90%', val: notifyBudgetAlert, fn: onNotifyBudgetAlert },
              { label: 'Commitment dues', sub: 'Reminders for upcoming payments', val: notifyCommitments, fn: onNotifyCommitments },
              { label: 'Weekly summary', sub: 'Every Monday morning insight', val: notifyWeeklySummary, fn: onNotifyWeeklySummary },
            ].map(({ label, sub, val, fn }) => (
              <div key={label} style={{ ...rowStyle, padding: '10px 0' }}>
                <div>
                  <div style={{ ...labelStyle, fontSize: 12 }}>{label}</div>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{sub}</div>
                </div>
                <button
                  onClick={() => fn(!val)}
                  style={{ width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', background: val ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: val ? 19 : 2, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: '#F59E0B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
        Theme
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Accent color</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {ACCENT_OPTIONS.map(a => (
            <button
              key={a}
              onClick={() => onAccent(a)}
              style={{
                width: 24, height: 24, borderRadius: 999, border: 'none',
                background: a, cursor: 'pointer',
                outline: a === accent ? `2px solid ${c.ink}` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Dark mode</span>
        <button
          onClick={() => onDark(!dark)}
          style={{
            width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: dark ? c.accent : c.surface2,
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999,
            background: '#fff', transition: 'left 0.2s',
            left: dark ? 21 : 3,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

    </div>
  )
}
