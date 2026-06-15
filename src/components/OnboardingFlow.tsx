import React, { useState } from 'react'
import { SplashScreen } from './SplashScreen'
import { FeatureOnboarding } from './FeatureOnboarding'
import type { Settings } from '@/types'

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

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  )
}

export function OnboardingFlow({ onAddAccount, onUpdateSettings, onComplete, userId }: Props) {
  const [step, setStep]       = useState<1 | 2 | 3 | 4>(1)
  const [splashPhase, setSplashPhase] = useState<1 | 2 | 3>(1)

  const [accounts, setAccounts] = useState<AccountDraft[]>([
    { name: '', type: 'bank', balance: '' },
  ])
  const [salaryDay, setSalaryDay]       = useState('1')
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [saving, setSaving]             = useState(false)

  // Account helpers
  const addAccount    = () => setAccounts(prev => [...prev, { name: '', type: 'bank', balance: '' }])
  const removeAccount = (i: number) => setAccounts(prev => prev.filter((_, j) => j !== i))
  const updateAccount = (i: number, patch: Partial<AccountDraft>) =>
    setAccounts(prev => prev.map((a, j) => j === i ? { ...a, ...patch } : a))
  const hasValidAccount = accounts.some(a => a.name.trim())

  const suggestedBudget = (income: string) => {
    const n = parseFloat(income)
    if (!n || n <= 0) return null
    return Math.round(n / 4.3 / 500) * 500
  }

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
      const patch: Partial<Settings> = {}
      const day = parseInt(salaryDay)
      if (day >= 1 && day <= 31) patch.salary_date = day
      const budget = suggestedBudget(monthlyIncome)
      if (budget) patch.weekly_budget = budget
      Object.assign(patch, features)
      if (Object.keys(patch).length) await onUpdateSettings(patch)
    } catch (_) {}
    try { localStorage.setItem('mp_onboarded_' + userId, '1') } catch (_) {}
    onComplete()
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
  if (step === 4) return (
    <FeatureOnboarding
      onComplete={f => finish(f)}
      onBack={() => setStep(3)}
    />
  )

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

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          {[2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: 3.5, borderRadius: 999,
              background: s <= step ? ACCENT : BORDER,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* ── Step 2: Account Setup ─────────────────────────────────────── */}
        {step === 2 && (
          <div>
            {/* Back to splash welcome card */}
            <button
              style={backBtn}
              onClick={() => { setSplashPhase(3); setStep(1) }}
            >
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

            {/* Account cards */}
            {accounts.map((acc, i) => (
              <div key={i} style={{
                background: SURFACE, borderRadius: 16,
                border: `1.5px solid ${BORDER}`,
                padding: '14px 14px 16px',
                marginBottom: 10,
              }}>
                {/* Card header with remove button */}
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

            {/* Add another account */}
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
              onClick={() => setStep(3)}
              disabled={!hasValidAccount}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 3: Salary Setup ──────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <button style={backBtn} onClick={() => setStep(2)}>
              <BackArrow /> Back
            </button>

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
              {suggestedBudget(monthlyIncome) && (
                <div style={{ marginTop: 8, font: '500 12px "Plus Jakarta Sans"', color: ACCENT }}>
                  Suggested weekly budget: ₹{suggestedBudget(monthlyIncome)!.toLocaleString('en-IN')}
                </div>
              )}
            </div>

            <button style={primary} onClick={() => setStep(4)}>Continue</button>
            <button style={ghost} onClick={() => setStep(4)}>Skip for now</button>
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
