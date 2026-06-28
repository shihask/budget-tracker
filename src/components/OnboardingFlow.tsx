import React, { useState } from 'react'
import { SplashScreen } from './SplashScreen'
import { FeatureOnboarding } from './FeatureOnboarding'
import type { IncomePattern, Settings } from '@/types'
import { INCOME_PATTERN_OPTIONS, suggestBudgetByIncomePattern } from '@/lib/income-pattern'

type AccountType = 'bank' | 'cash' | 'wallet'
type FeatureKey = 'track_credit_cards' | 'track_borrowings' | 'track_savings' | 'autopilot_enabled' | 'notifications_enabled'

interface AccountDraft {
  name: string
  type: AccountType
  balance: string
}

interface Props {
  onAddAccount: (a: { name: string; type: string; current_balance: number }) => Promise<void>
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  onComplete: () => void
  userId: string
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'wallet', label: 'Wallet' },
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  )
}

// Steps: 1=Splash, 2=IncomePattern, 3=Accounts, 4=PatternSetup, 5=FeatureOnboarding, 6=InstallApp
type Step = 1 | 2 | 3 | 4 | 5 | 6

function getDeviceType(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true
}

export function OnboardingFlow({ onAddAccount, onUpdateSettings, onComplete, userId }: Props) {
  const [step, setStep]       = useState<Step>(1)
  const [splashPhase, setSplashPhase] = useState<1 | 2 | 3>(1)

  // Income pattern
  const [incomePattern, setIncomePattern] = useState<IncomePattern>('monthly')

  // Accounts
  const [accounts, setAccounts] = useState<AccountDraft[]>([
    { name: '', type: 'bank', balance: '' },
  ])

  // Monthly fields
  const [salaryDay, setSalaryDay]       = useState('1')
  const [monthlyIncome, setMonthlyIncome] = useState('')

  // Weekly fields
  const [weeklyIncome, setWeeklyIncome] = useState('')
  const [incomeDay, setIncomeDay]       = useState(5) // Friday

  // Variable fields
  const [avgDailyIncome, setAvgDailyIncome]     = useState('')
  const [workingDays, setWorkingDays]             = useState('6')

  // Business fields
  const [businessDrawings, setBusinessDrawings] = useState('')

  const [saving, setSaving] = useState(false)

  // Account helpers
  const addAccount    = () => setAccounts(prev => [...prev, { name: '', type: 'bank', balance: '' }])
  const removeAccount = (i: number) => setAccounts(prev => prev.filter((_, j) => j !== i))
  const updateAccount = (i: number, patch: Partial<AccountDraft>) =>
    setAccounts(prev => prev.map((a, j) => j === i ? { ...a, ...patch } : a))
  const hasValidAccount = accounts.some(a => a.name.trim())

  const finish = async (features: Record<FeatureKey, boolean>) => {
    setSaving(true)
    try {
      for (const acc of accounts) {
        if (acc.name.trim()) {
          await onAddAccount({
            name: acc.name.trim(),
            type: acc.type,
            current_balance: parseFloat(acc.balance) || 0,
          })
        }
      }
      const patch: Partial<Settings> = { income_pattern: incomePattern }

      switch (incomePattern) {
        case 'monthly': {
          const day = parseInt(salaryDay)
          if (day >= 1 && day <= 31) patch.salary_date = day
          const salary = parseFloat(monthlyIncome)
          if (salary > 0) patch.monthly_salary = Math.round(salary)
          const budget = suggestBudgetByIncomePattern('monthly', salary || null)
          if (budget) patch.weekly_budget = budget
          break
        }
        case 'weekly': {
          const wi = parseFloat(weeklyIncome)
          if (wi > 0) patch.weekly_income = Math.round(wi)
          patch.income_day = incomeDay
          const budget = suggestBudgetByIncomePattern('weekly', wi || null)
          if (budget) patch.weekly_budget = budget
          break
        }
        case 'variable': {
          const adi = parseFloat(avgDailyIncome)
          if (adi > 0) patch.average_daily_income = Math.round(adi)
          const wd = parseInt(workingDays)
          if (wd >= 1 && wd <= 7) patch.working_days_per_week = wd
          break
        }
        case 'business': {
          const bd = parseFloat(businessDrawings)
          if (bd > 0) patch.business_monthly_drawings = Math.round(bd)
          break
        }
      }

      Object.assign(patch, features)
      if (Object.keys(patch).length) await onUpdateSettings(patch)
    } catch (_) {}
    try { localStorage.setItem('mp_onboarded_' + userId, '1') } catch (_) {}
    const device = getDeviceType()
    if (device !== 'desktop' && !isStandalone()) {
      setSaving(false)
      setStep(6)
    } else {
      onComplete()
    }
  }

  const BG      = '#EDE7DD'
  const INK     = '#1C1410'
  const ACCENT  = '#16C98A'
  const MUTED   = '#8A8178'
  const SURFACE = '#FBF8F4'
  const BORDER  = '#E0D9D0'

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: SURFACE, border: `1.5px solid ${BORDER}`,
    borderRadius: 12, padding: '13px 14px',
    font: '600 15px "Plus Jakarta Sans"',
    color: INK, outline: 'none',
  }
  const primary: React.CSSProperties = {
    width: '100%', background: INK, color: BG,
    border: 'none', borderRadius: 14, padding: '16px',
    font: '700 15px "Plus Jakarta Sans"',
    cursor: saving ? 'default' : 'pointer',
    opacity: saving ? 0.6 : 1,
    letterSpacing: '-0.01em',
  }
  const ghost: React.CSSProperties = {
    width: '100%', background: 'none', color: MUTED,
    border: 'none', borderRadius: 12, padding: '11px',
    font: '600 13px "Plus Jakarta Sans"',
    cursor: 'pointer', marginTop: 6,
  }
  const fieldLabel: React.CSSProperties = {
    font: '700 11px "Plus Jakarta Sans"',
    color: MUTED, letterSpacing: '0.05em',
    textTransform: 'uppercase', marginBottom: 7, display: 'block',
  }
  const backBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: MUTED, padding: '8px 0',
    display: 'flex', alignItems: 'center', gap: 4,
    font: '600 13px "Plus Jakarta Sans"',
    marginBottom: 18,
  }

  // Full-screen steps
  if (step === 1) return (
    <SplashScreen
      onContinue={() => setStep(2)}
      initialPhase={splashPhase}
    />
  )
  if (step === 5) return (
    <FeatureOnboarding
      onComplete={f => finish(f)}
      onBack={() => setStep(4)}
    />
  )
  if (step === 6) return (
    <InstallAppStep onComplete={onComplete} />
  )

  // Progress: 3 segments for steps 2, 3, 4
  const progressStep = step - 1 // 1, 2, 3

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: BG,
      display: 'flex', justifyContent: 'center',
      overflowY: 'auto', overscrollBehavior: 'contain',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: `calc(24px + env(safe-area-inset-top,0px)) 20px calc(36px + env(safe-area-inset-bottom,0px))`,
      animation: 'ofFadeIn 0.28s ease both',
    }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column' }}>

        {/* Progress bar — 3 segments */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: 3.5, borderRadius: 999,
              background: s <= progressStep ? ACCENT : BORDER,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* ── Step 2: Income Pattern ───────────────────────────────────── */}
        {step === 2 && (
          <div>
            <button
              style={backBtn}
              onClick={() => { setSplashPhase(3); setStep(1) }}
            >
              <BackArrow /> Back
            </button>

            <div style={{ marginBottom: 22 }}>
              <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                How do you usually receive income?
              </div>
              <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                This helps MoneyPlant tailor budgets and forecasts to your situation.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {INCOME_PATTERN_OPTIONS.map(opt => {
                const selected = incomePattern === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setIncomePattern(opt.value)}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: selected ? 'rgba(22,201,138,0.08)' : SURFACE,
                      border: `1.5px solid ${selected ? ACCENT : BORDER}`,
                      borderRadius: 14, padding: '14px 16px',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      font: `${selected ? '700' : '600'} 14px "Plus Jakarta Sans"`,
                      color: selected ? ACCENT : INK,
                      marginBottom: 3,
                    }}>
                      {opt.label}
                    </div>
                    <div style={{
                      font: '500 12px "Plus Jakarta Sans"',
                      color: MUTED,
                    }}>
                      {opt.description}
                    </div>
                  </button>
                )
              })}
            </div>

            <button style={primary} onClick={() => setStep(3)}>
              Continue
            </button>
          </div>
        )}

        {/* ── Step 3: Account Setup ────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <button style={backBtn} onClick={() => setStep(2)}>
              <BackArrow /> Back
            </button>

            <div style={{ marginBottom: 22 }}>
              <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Where do you keep your money?
              </div>
              <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                Add your accounts. You can add more any time.
              </div>
            </div>

            {accounts.map((acc, i) => (
              <div key={i} style={{
                background: SURFACE, borderRadius: 16,
                border: `1.5px solid ${BORDER}`,
                padding: '14px 14px 16px',
                marginBottom: 10,
              }}>
                {accounts.length > 1 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 10,
                  }}>
                    <span style={{
                      font: '700 11px "Plus Jakarta Sans"', color: MUTED,
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>
                      Account {i + 1}
                    </span>
                    <button
                      onClick={() => removeAccount(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#C0B9B1', font: '600 12px "Plus Jakarta Sans"',
                        padding: '2px 6px',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                <div style={{ marginBottom: 10 }}>
                  <span style={fieldLabel}>Account Name</span>
                  <input
                    type="search"
                    value={acc.name}
                    onChange={e => updateAccount(i, { name: e.target.value })}
                    placeholder="e.g. HDFC Savings"
                    style={{ ...inp, WebkitAppearance: 'none' } as React.CSSProperties}
                    autoFocus={i === 0}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <span style={fieldLabel}>Type</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {ACCOUNT_TYPES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => updateAccount(i, { type: t.value })}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 12,
                          border: `1.5px solid ${acc.type === t.value ? ACCENT : BORDER}`,
                          background: acc.type === t.value ? 'rgba(22,201,138,0.08)' : BG,
                          color: acc.type === t.value ? ACCENT : INK,
                          font: `${acc.type === t.value ? '700' : '600'} 13px "Plus Jakarta Sans"`,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span style={fieldLabel}>Current Balance</span>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      font: '600 15px "Plus Jakarta Sans"', color: MUTED,
                    }}>₹</span>
                    <input
                      value={acc.balance}
                      onChange={e => updateAccount(i, { balance: e.target.value.replace(/\D/g, '') })}
                      placeholder="0"
                      inputMode="numeric"
                      onFocus={e => e.target.select()}
                      style={{ ...inp, paddingLeft: 30 }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addAccount}
              style={{
                width: '100%', background: 'none',
                border: `1.5px dashed ${BORDER}`, borderRadius: 14,
                padding: '12px', marginBottom: 22,
                font: '600 13px "Plus Jakarta Sans"', color: MUTED,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              Add another account
            </button>

            <button
              style={{ ...primary, opacity: !hasValidAccount || saving ? 0.4 : 1, cursor: !hasValidAccount ? 'default' : 'pointer' }}
              onClick={() => setStep(4)}
              disabled={!hasValidAccount}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 4: Pattern-specific Setup ────────────────────────────── */}
        {step === 4 && (
          <div>
            <button style={backBtn} onClick={() => setStep(3)}>
              <BackArrow /> Back
            </button>

            {/* Monthly Salary */}
            {incomePattern === 'monthly' && (
              <>
                <div style={{ marginBottom: 26 }}>
                  <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    When do you get paid?
                  </div>
                  <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                    Helps with affordability planning and budget suggestions.
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <span style={fieldLabel}>Salary Credit Date</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      value={salaryDay}
                      onChange={e => setSalaryDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="1"
                      inputMode="numeric"
                      maxLength={2}
                      onFocus={e => e.target.select()}
                      style={{
                        ...inp, width: 90, textAlign: 'center',
                        fontSize: 22, fontWeight: '800', padding: '12px',
                      }}
                    />
                    <span style={{ font: '500 14px "Plus Jakarta Sans"', color: MUTED }}>of every month</span>
                  </div>
                </div>

                <div style={{ marginBottom: 28 }}>
                  <span style={fieldLabel}>
                    Monthly Income{' '}
                    <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      font: '600 15px "Plus Jakarta Sans"', color: MUTED,
                    }}>₹</span>
                    <input
                      value={monthlyIncome}
                      onChange={e => setMonthlyIncome(e.target.value.replace(/\D/g, ''))}
                      placeholder="50,000"
                      inputMode="numeric"
                      onFocus={e => e.target.select()}
                      style={{ ...inp, paddingLeft: 30 }}
                    />
                  </div>
                  {(() => {
                    const budget = suggestBudgetByIncomePattern('monthly', parseFloat(monthlyIncome) || null)
                    return budget ? (
                      <div style={{ marginTop: 8, font: '500 12px "Plus Jakarta Sans"', color: ACCENT }}>
                        Suggested weekly budget: ₹{budget.toLocaleString('en-IN')}
                      </div>
                    ) : null
                  })()}
                </div>
              </>
            )}

            {/* Weekly Income */}
            {incomePattern === 'weekly' && (
              <>
                <div style={{ marginBottom: 26 }}>
                  <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    Your weekly income
                  </div>
                  <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                    Helps set your weekly budget and forecast.
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <span style={fieldLabel}>Average Weekly Income</span>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      font: '600 15px "Plus Jakarta Sans"', color: MUTED,
                    }}>₹</span>
                    <input
                      value={weeklyIncome}
                      onChange={e => setWeeklyIncome(e.target.value.replace(/\D/g, ''))}
                      placeholder="12,000"
                      inputMode="numeric"
                      onFocus={e => e.target.select()}
                      style={{ ...inp, paddingLeft: 30 }}
                    />
                  </div>
                  {(() => {
                    const budget = suggestBudgetByIncomePattern('weekly', parseFloat(weeklyIncome) || null)
                    return budget ? (
                      <div style={{ marginTop: 8, font: '500 12px "Plus Jakarta Sans"', color: ACCENT }}>
                        Suggested weekly budget: ₹{budget.toLocaleString('en-IN')}
                      </div>
                    ) : null
                  })()}
                </div>

                <div style={{ marginBottom: 28 }}>
                  <span style={fieldLabel}>Income Day</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {DAY_NAMES.map((name, i) => {
                      const selected = incomeDay === i
                      return (
                        <button
                          key={i}
                          onClick={() => setIncomeDay(i)}
                          style={{
                            padding: '9px 14px', borderRadius: 10,
                            border: `1.5px solid ${selected ? ACCENT : BORDER}`,
                            background: selected ? 'rgba(22,201,138,0.08)' : SURFACE,
                            color: selected ? ACCENT : INK,
                            font: `${selected ? '700' : '600'} 13px "Plus Jakarta Sans"`,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          {name.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Daily / Variable Income */}
            {incomePattern === 'variable' && (
              <>
                <div style={{ marginBottom: 26 }}>
                  <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    Your daily income
                  </div>
                  <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                    A rough estimate helps with forecasting. You can skip this and MoneyPlant will learn from your history.
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <span style={fieldLabel}>
                    Average Daily Income{' '}
                    <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      font: '600 15px "Plus Jakarta Sans"', color: MUTED,
                    }}>₹</span>
                    <input
                      value={avgDailyIncome}
                      onChange={e => setAvgDailyIncome(e.target.value.replace(/\D/g, ''))}
                      placeholder="900"
                      inputMode="numeric"
                      onFocus={e => e.target.select()}
                      style={{ ...inp, paddingLeft: 30 }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 28 }}>
                  <span style={fieldLabel}>Working Days Per Week</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[5, 6, 7].map(d => {
                      const selected = parseInt(workingDays) === d
                      return (
                        <button
                          key={d}
                          onClick={() => setWorkingDays(String(d))}
                          style={{
                            flex: 1, padding: '12px 8px', borderRadius: 12,
                            border: `1.5px solid ${selected ? ACCENT : BORDER}`,
                            background: selected ? 'rgba(22,201,138,0.08)' : SURFACE,
                            color: selected ? ACCENT : INK,
                            font: `${selected ? '700' : '600'} 15px "Plus Jakarta Sans"`,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ font: '500 12px "Plus Jakarta Sans"', color: MUTED, marginTop: 6 }}>
                    days per week
                  </div>
                </div>
              </>
            )}

            {/* Business Owner */}
            {incomePattern === 'business' && (
              <>
                <div style={{ marginBottom: 26 }}>
                  <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    Your business income
                  </div>
                  <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                    How much do you typically take home each month? You can skip this and update later.
                  </div>
                </div>

                <div style={{ marginBottom: 28 }}>
                  <span style={fieldLabel}>
                    Average Monthly Take Home{' '}
                    <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      font: '600 15px "Plus Jakarta Sans"', color: MUTED,
                    }}>₹</span>
                    <input
                      value={businessDrawings}
                      onChange={e => setBusinessDrawings(e.target.value.replace(/\D/g, ''))}
                      placeholder="30,000"
                      inputMode="numeric"
                      onFocus={e => e.target.select()}
                      style={{ ...inp, paddingLeft: 30 }}
                    />
                  </div>
                </div>
              </>
            )}

            <button style={primary} onClick={() => setStep(5)}>Continue</button>
            <button style={ghost} onClick={() => setStep(5)}>Skip for now</button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes ofFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ofFadeUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}

// ── Install App Step ────────────────────────────────────────────────────────

const IOS_STEPS = [
  { num: '1', text: 'Tap ··· at the bottom right of Safari', icon: <MenuDotsIcon /> },
  { num: '2', text: 'Tap "Add to Home Screen"', icon: <PlusSquareIcon /> },
  { num: '3', text: 'Tap "Add" to confirm', icon: null },
]

const ANDROID_STEPS = [
  { num: '1', text: 'Tap the menu button (⋮) in Chrome', icon: <MenuDotsIcon /> },
  { num: '2', text: 'Tap "Install App" or "Add to Home Screen"', icon: <PlusSquareIcon /> },
  { num: '3', text: 'Tap "Install" to confirm', icon: null },
]

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function PlusSquareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function MenuDotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  )
}

function InstallAppStep({ onComplete }: { onComplete: () => void }) {
  const device = getDeviceType()
  const steps = device === 'ios' ? IOS_STEPS : ANDROID_STEPS

  const BG      = '#EDE7DD'
  const INK     = '#1C1410'
  const ACCENT  = '#16C98A'
  const MUTED   = '#8A8178'
  const SURFACE = '#FBF8F4'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: BG,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: `calc(24px + env(safe-area-inset-top,0px)) 24px calc(36px + env(safe-area-inset-bottom,0px))`,
      animation: 'ofFadeIn 0.3s ease both',
    }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        {/* App icon */}
        <div style={{
          width: 72, height: 72, borderRadius: 20, margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #16C98A, #0A7A56)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(22, 201, 138, 0.3)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" />
          </svg>
        </div>

        <div style={{ font: '800 24px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Use MoneyPlant as an App
        </div>
        <div style={{ font: '500 14px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.5, marginBottom: 28 }}>
          {device === 'ios'
            ? 'Stay on top of your money. Add to Home Screen for a faster, full-screen experience with offline access and timely reminders.'
            : device === 'android'
            ? 'Stay on top of your money. Install the app for a faster, full-screen experience with push notifications and offline access.'
            : 'Install MoneyPlant as a desktop app for quick access and offline support.'}
        </div>

        {device !== 'desktop' ? (
          <div style={{
            background: SURFACE, borderRadius: 18,
            border: '1.5px solid #E0D9D0',
            padding: '20px',
            textAlign: 'left',
            marginBottom: 28,
          }}>
            <div style={{ font: '800 12px "Plus Jakarta Sans"', color: ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
              {device === 'ios' ? 'In Safari' : 'In Chrome'}
            </div>
            {steps.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                marginBottom: i < steps.length - 1 ? 18 : 0,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: `${ACCENT}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  font: '800 14px "Plus Jakarta Sans"', color: ACCENT,
                }}>
                  {s.num}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ font: '600 14px "Plus Jakarta Sans"', color: INK, lineHeight: 1.4 }}>
                    {s.text}
                  </div>
                  {s.icon && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center',
                      gap: 6, marginTop: 6,
                      background: '#EDE7DD', borderRadius: 8,
                      padding: '5px 10px',
                      color: MUTED,
                      font: '600 11px "Plus Jakarta Sans"',
                    }}>
                      {s.icon}
                      {device === 'ios' && i === 0 && 'at the bottom'}
                      {device === 'android' && i === 0 && 'top right corner'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            background: SURFACE, borderRadius: 18,
            border: '1.5px solid #E0D9D0',
            padding: '20px',
            textAlign: 'left',
            marginBottom: 28,
          }}>
            <div style={{ font: '600 14px "Plus Jakarta Sans"', color: INK, lineHeight: 1.5 }}>
              Look for the install icon in your browser's address bar, or use the browser menu to install MoneyPlant as an app.
            </div>
          </div>
        )}

        <button
          onClick={onComplete}
          style={{
            width: '100%', padding: '16px',
            background: INK, color: BG,
            border: 'none', borderRadius: 16,
            font: '700 15px "Plus Jakarta Sans"',
            cursor: 'pointer', letterSpacing: '-0.01em',
          }}
        >
          Go to Dashboard
        </button>
        <button
          onClick={onComplete}
          style={{
            width: '100%', background: 'none', color: MUTED,
            border: 'none', borderRadius: 12, padding: '12px',
            font: '600 13px "Plus Jakarta Sans"',
            cursor: 'pointer', marginTop: 4,
          }}
        >
          I'll do this later
        </button>
      </div>

      <style>{`
        @keyframes ofFadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )
}
