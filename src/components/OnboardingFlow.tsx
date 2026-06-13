import React, { useState } from 'react'
import { SplashScreen } from './SplashScreen'
import { FeatureOnboarding } from './FeatureOnboarding'
import type { Settings } from '@/types'

type AccountType = 'bank' | 'cash' | 'wallet'
type FeatureKey = 'track_credit_cards' | 'track_borrowings' | 'autopilot_enabled' | 'notifications_enabled'

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

function parseDemo(text: string): { description: string; amount: number; category: string } {
  const amountMatch = text.match(/\d+(\.\d+)?/)
  const amount = amountMatch ? parseFloat(amountMatch[0]) : 0
  const description = text
    .replace(/\d+(\.\d+)?/, '')
    .replace(/\b(cash|bank|upi|card|wallet|gpay|paytm|phonepe)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const d = description.toLowerCase()
  let category = 'General'
  if (/tea|coffee|chai|food|eat|lunch|dinner|breakfast|snack|zomato|swiggy|restaurant|hotel/.test(d)) category = 'Food & Tea'
  else if (/uber|ola|bus|auto|metro|petrol|fuel|travel|cab/.test(d)) category = 'Fuel'
  else if (/netflix|movie|amazon|spotify|game|play|entertainment/.test(d)) category = 'Shopping'
  else if (/rent|electricity|water|wifi|internet|bill|recharge/.test(d)) category = 'Utilities'
  else if (/grocery|vegetables|fruits|market|bigbasket|blinkit|zepto/.test(d)) category = 'Groceries'
  else if (/medical|doctor|medicine|pharmacy|hospital/.test(d)) category = 'Medical'
  return { description: description || 'Expense', amount, category }
}

export function OnboardingFlow({ onAddAccount, onUpdateSettings, onComplete, userId }: Props) {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(1)
  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('bank')
  const [accountBalance, setAccountBalance] = useState('')
  const [salaryDay, setSalaryDay] = useState('')
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [features, setFeatures] = useState<Record<FeatureKey, boolean> | null>(null)
  const [tutorialInput, setTutorialInput] = useState('Tea 20 cash')
  const [tutorialParsed, setTutorialParsed] = useState<ReturnType<typeof parseDemo> | null>(null)
  const [saving, setSaving] = useState(false)

  const suggestedBudget = (income: string) => {
    const n = parseFloat(income)
    if (!n || n <= 0) return null
    return Math.round(n / 4.3 / 500) * 500
  }

  const finish = async () => {
    setSaving(true)
    try {
      if (accountName.trim()) {
        await onAddAccount({
          name: accountName.trim(),
          type: accountType,
          current_balance: parseFloat(accountBalance) || 0,
        })
      }
      const patch: Partial<Settings> = {}
      const day = parseInt(salaryDay)
      if (day >= 1 && day <= 31) patch.salary_date = day
      const budget = suggestedBudget(monthlyIncome)
      if (budget) patch.weekly_budget = budget
      if (features) Object.assign(patch, features)
      if (Object.keys(patch).length) await onUpdateSettings(patch)
    } catch (_) {}
    try { localStorage.setItem('mp_onboarded_' + userId, '1') } catch (_) {}
    onComplete()
  }

  const BG = '#EDE7DD'
  const INK = '#1C1410'
  const ACCENT = '#16C98A'
  const MUTED = '#8A8178'
  const SURFACE = '#FBF8F4'
  const BORDER = '#E0D9D0'

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
  const label: React.CSSProperties = {
    font: '700 11px "Plus Jakarta Sans"',
    color: MUTED, letterSpacing: '0.05em',
    textTransform: 'uppercase', marginBottom: 7, display: 'block',
  }

  // Full-screen steps that take over rendering
  if (step === 1) return <SplashScreen onContinue={() => setStep(2)} />
  if (step === 4) return <FeatureOnboarding onComplete={f => { setFeatures(f); setStep(5) }} />

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: BG,
      display: 'flex', justifyContent: 'center',
      overflowY: 'auto', overscrollBehavior: 'contain',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: `calc(32px + env(safe-area-inset-top,0px)) 20px calc(36px + env(safe-area-inset-bottom,0px))`,
      animation: 'ofFadeIn 0.28s ease both',
    }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column' }}>

        {/* Progress bar — shown on form steps only */}
        {(step === 2 || step === 3) && (
          <div style={{ display: 'flex', gap: 5, marginBottom: 28 }}>
            {[2, 3].map(s => (
              <div key={s} style={{
                flex: 1, height: 3.5, borderRadius: 999,
                background: s <= step ? ACCENT : BORDER,
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        )}

        {/* ── Step 2: Create Account ───────────────────────────────────── */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 26 }}>
              <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Where do you keep your money?
              </div>
              <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                Add your main account to get started. You can add more later.
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={label}>Account Name</span>
              <input
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="e.g. HDFC Savings"
                style={inp}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="account-label-x"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={label}>Type</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCOUNT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setAccountType(t.value)}
                    style={{
                      flex: 1, padding: '11px 8px', borderRadius: 12,
                      border: `1.5px solid ${accountType === t.value ? ACCENT : BORDER}`,
                      background: accountType === t.value ? 'rgba(22,201,138,0.08)' : SURFACE,
                      color: accountType === t.value ? ACCENT : INK,
                      font: `${accountType === t.value ? '700' : '600'} 13px "Plus Jakarta Sans"`,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <span style={label}>Current Balance</span>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  font: '600 15px "Plus Jakarta Sans"', color: MUTED,
                }}>₹</span>
                <input
                  value={accountBalance}
                  onChange={e => setAccountBalance(e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                  onFocus={e => e.target.select()}
                  style={{ ...inp, paddingLeft: 30 }}
                />
              </div>
            </div>

            <button style={primary} onClick={() => setStep(3)} disabled={!accountName.trim()}>
              Continue
            </button>
          </div>
        )}

        {/* ── Step 3: Salary Setup ─────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: 26 }}>
              <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                When do you get paid?
              </div>
              <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                Helps with affordability planning and budget suggestions.
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <span style={label}>Salary Credit Date</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  value={salaryDay}
                  onChange={e => setSalaryDay(e.target.value)}
                  placeholder="28"
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
              <span style={label}>
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
                  onChange={e => setMonthlyIncome(e.target.value)}
                  placeholder="50,000"
                  inputMode="numeric"
                  onFocus={e => e.target.select()}
                  style={{ ...inp, paddingLeft: 30 }}
                />
              </div>
              {suggestedBudget(monthlyIncome) && (
                <div style={{
                  marginTop: 8, font: '500 12px "Plus Jakarta Sans"', color: ACCENT,
                }}>
                  Suggested weekly budget: ₹{suggestedBudget(monthlyIncome)!.toLocaleString('en-IN')}
                </div>
              )}
            </div>

            <button style={primary} onClick={() => setStep(4)}>Continue</button>
            <button style={ghost} onClick={() => setStep(4)}>Skip for now</button>
          </div>
        )}

        {/* ── Step 5: First Expense Tutorial ──────────────────────────── */}
        {step === 5 && (
          <div style={{ margin: 'auto 0', paddingTop: 20 }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
                You're ready to go!
              </div>
              <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55 }}>
                See how Mint understands your expenses naturally.
              </div>
            </div>

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                value={tutorialInput}
                onChange={e => { setTutorialInput(e.target.value); setTutorialParsed(null) }}
                placeholder="e.g. Tea 20 cash"
                onFocus={e => e.target.select()}
                style={{
                  ...inp,
                  fontSize: 17,
                  padding: '15px 16px',
                  border: `1.5px solid ${tutorialParsed ? ACCENT : BORDER}`,
                  transition: 'border-color 0.2s',
                }}
              />
            </div>

            {tutorialParsed && tutorialParsed.amount > 0 && (
              <div style={{
                background: SURFACE,
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 20,
                border: `1.5px solid ${ACCENT}`,
                animation: 'ofFadeUp 0.3s ease both',
              }}>
                <div style={{
                  font: '700 10px "Plus Jakarta Sans"',
                  color: ACCENT, letterSpacing: '0.06em',
                  textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Mint understood
                </div>
                {[
                  ['Description', tutorialParsed.description],
                  ['Amount', `₹${tutorialParsed.amount}`],
                  ['Category', tutorialParsed.category],
                ].map(([lbl, val], i, arr) => (
                  <div key={lbl} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: i < arr.length - 1 ? `1px solid ${BG}` : 'none',
                  }}>
                    <span style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED }}>{lbl}</span>
                    <span style={{ font: '700 13px "Plus Jakarta Sans"', color: INK }}>{val}</span>
                  </div>
                ))}
              </div>
            )}

            {!tutorialParsed ? (
              <>
                <button
                  style={{ ...primary, background: ACCENT }}
                  onClick={() => setTutorialParsed(parseDemo(tutorialInput))}
                >
                  Try Demo
                </button>
                <button style={ghost} onClick={finish} disabled={saving}>
                  {saving ? 'Setting up…' : 'Skip for now'}
                </button>
              </>
            ) : (
              <button style={primary} onClick={finish} disabled={saving}>
                {saving ? 'Setting up…' : 'Go to Dashboard'}
              </button>
            )}
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
