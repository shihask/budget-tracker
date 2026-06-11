import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { Settings } from '@/types'

interface AcctRow { name: string; type: 'bank' | 'cash'; balance: string }

interface Props {
  containerWidth: number
  onAddAccount: (a: { name: string; type: string; current_balance: number }) => Promise<void>
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  onClose: () => void
}

const SUGGESTED: AcctRow[] = [
  { name: 'Axis Bank', type: 'bank', balance: '' },
  { name: 'Federal Bank', type: 'bank', balance: '' },
  { name: 'Cash', type: 'cash', balance: '' },
]

export function OnboardingWizard({ containerWidth, onAddAccount, onUpdateSettings, onClose }: Props) {
  const c = useTheme()
  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState<AcctRow[]>(SUGGESTED)
  const [salaryDay, setSalaryDay] = useState('')
  const [weeklyBudget, setWeeklyBudget] = useState('')
  const [saving, setSaving] = useState(false)

  const finish = (skipRest = false) => {
    setSaving(true)
    ;(async () => {
      try {
        if (!skipRest) {
          for (const a of accounts) {
            if (a.name.trim()) {
              await onAddAccount({ name: a.name.trim(), type: a.type, current_balance: parseFloat(a.balance) || 0 })
            }
          }
          const patch: Partial<Settings> = {}
          const day = parseInt(salaryDay)
          if (day >= 1 && day <= 31) patch.salary_date = day
          const wb = parseFloat(weeklyBudget)
          if (wb > 0) patch.weekly_budget = wb
          if (Object.keys(patch).length) await onUpdateSettings(patch)
        }
      } catch (_) { /* non-fatal — let them into the app regardless */ }
      onClose()
    })()
  }

  const skipAll = () => { onClose() }

  const W = Math.min(containerWidth, 440)

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '12px 14px',
    font: '600 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.04em',
    textTransform: 'uppercase', marginBottom: 6, display: 'block',
  }
  const primary: React.CSSProperties = {
    width: '100%', background: c.accent, color: '#fff', border: 'none',
    borderRadius: 14, padding: '15px', font: '800 15px Plus Jakarta Sans',
    cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
  }
  const ghost: React.CSSProperties = {
    width: '100%', background: 'none', color: c.muted, border: 'none',
    borderRadius: 12, padding: '10px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer', marginTop: 8,
  }

  const Progress = () => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i <= step - 1 ? c.accent : c.faint, transition: 'background 0.2s' }} />
      ))}
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, background: c.bg,
      display: 'flex', justifyContent: 'center', overflowY: 'auto', overscrollBehavior: 'contain',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      padding: `calc(24px + env(safe-area-inset-top,0px)) 18px calc(24px + env(safe-area-inset-bottom,0px))`,
    }}>
      <div style={{ width: '100%', maxWidth: W, display: 'flex', flexDirection: 'column' }}>

        {/* Step 0 — Welcome */}
        {step === 0 && (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <img src="/favicon.svg" width="64" height="64" alt="MoneyPlant" style={{ borderRadius: 16, marginBottom: 20 }} />
            <div style={{ font: '800 26px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>
              Welcome to MoneyPlant
            </div>
            <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 28 }}>
              MoneyPlant tracks your real free money across your accounts, cards, and commitments. Let's set up the basics — takes about 30 seconds.
            </div>
            <button style={primary} onClick={() => setStep(1)}>Get started</button>
            <button style={ghost} onClick={skipAll}>I'll set up later</button>
          </div>
        )}

        {/* Step 1 — Accounts */}
        {step === 1 && (
          <div>
            <Progress />
            <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Add your accounts</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, marginBottom: 20 }}>
              Add the accounts you use and their current balance. This is what makes your dashboard come alive.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {accounts.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={a.name} placeholder="Account name"
                    onChange={e => setAccounts(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    style={{ ...inp, flex: 1.4 }} />
                  <input value={a.balance} placeholder="0" inputMode="numeric"
                    onChange={e => setAccounts(arr => arr.map((x, j) => j === i ? { ...x, balance: e.target.value } : x))}
                    onFocus={e => e.target.select()}
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={() => setAccounts(arr => arr.filter((_, j) => j !== i))}
                    aria-label="Remove" style={{ background: c.surface2, border: 'none', borderRadius: 10, width: 38, height: 42, flexShrink: 0, cursor: 'pointer', color: c.muted, font: '700 18px Plus Jakarta Sans' }}>×</button>
                </div>
              ))}
            </div>

            <button onClick={() => setAccounts(arr => [...arr, { name: '', type: 'bank', balance: '' }])}
              style={{ background: 'none', border: `1.5px dashed ${c.faint}`, color: c.accent, borderRadius: 12, padding: '11px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', width: '100%', marginTop: 12 }}>
              + Add another account
            </button>

            <div style={{ marginTop: 24 }}>
              <button style={primary} onClick={() => setStep(2)}>Continue</button>
              <button style={ghost} onClick={() => setStep(2)}>Skip this</button>
            </div>
          </div>
        )}

        {/* Step 2 — Salary & budget */}
        {step === 2 && (
          <div>
            <Progress />
            <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>Salary & budget</div>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5, marginBottom: 20 }}>
              These power your "weeks until payday" and affordability checks. You can change them anytime in Settings.
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>What day of the month do you get paid?</label>
              <input value={salaryDay} onChange={e => setSalaryDay(e.target.value)} placeholder="e.g. 30" inputMode="numeric"
                onFocus={e => e.target.select()} style={inp} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Weekly spending budget (₹)</label>
              <input value={weeklyBudget} onChange={e => setWeeklyBudget(e.target.value)} placeholder="e.g. 5000" inputMode="numeric"
                onFocus={e => e.target.select()} style={inp} />
            </div>

            <div style={{ marginTop: 24 }}>
              <button style={primary} onClick={() => setStep(3)} disabled={saving}>Continue</button>
              <button style={ghost} onClick={() => setStep(3)}>Skip this</button>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 999, background: c.goodSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ font: '800 24px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>You're all set!</div>
            <div style={{ font: '600 14px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6, marginBottom: 28 }}>
              Your dashboard is ready. Tap the <strong style={{ color: c.ink }}>+</strong> button anytime to log your first expense — that's the daily habit that keeps everything accurate.
            </div>
            <button style={primary} onClick={() => finish(false)} disabled={saving}>
              {saving ? 'Setting up…' : 'Go to my dashboard'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
