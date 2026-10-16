import { useState } from 'react'
import { Banknote, Landmark, Smartphone } from 'lucide-react'
import type { AccountType } from '@/types'
import { evaluateAmountExpression, sanitizeAmountInput } from '@/lib/amountExpression'
import { round2 } from '@/lib/utils'

// A guest's whole onboarding: one account, then straight to their first expense.
// Income pattern, features and the rest of OnboardingFlow wait until the account
// is saved (App resumes them via guestSetupPendingKey).

const SOURCES: { type: AccountType; name: string; label: string; Icon: typeof Banknote }[] = [
  { type: 'cash',   name: 'Cash',       label: 'Cash',       Icon: Banknote },
  { type: 'bank',   name: 'Bank',       label: 'Bank',       Icon: Landmark },
  { type: 'wallet', name: 'UPI Wallet', label: 'UPI wallet', Icon: Smartphone },
]

const BG      = '#EDE7DD'
const INK     = '#1C1410'
const ACCENT  = '#16C98A'
const MUTED   = '#8A8178'
const SURFACE = '#FBF8F4'
const BORDER  = '#E0D9D0'

interface Props {
  onAddAccount: (a: { name: string; type: string; current_balance: number }) => Promise<void>
  /** The account exists; App opens Quick Add. */
  onDone: () => void
}

export function GuestQuickStart({ onAddAccount, onDone }: Props) {
  const [source, setSource] = useState<AccountType>('cash')
  const [balance, setBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Created on an explicit tap, never in an effect, so StrictMode can't make two.
  const start = async () => {
    if (saving) return
    const picked = SOURCES.find(s => s.type === source)!
    setSaving(true); setError(null)
    try {
      await onAddAccount({
        name: picked.name,
        type: picked.type,
        current_balance: round2(evaluateAmountExpression(balance) ?? 0),
      })
      onDone()
    } catch {
      setError("Couldn't set that up. Check your connection and try again.")
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, background: BG,
      display: 'flex', justifyContent: 'center', overflowY: 'auto', overscrollBehavior: 'contain',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: 'calc(40px + env(safe-area-inset-top,0px)) 20px calc(36px + env(safe-area-inset-bottom,0px))',
    }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column' }}>
        <div style={{ font: '800 22px "Plus Jakarta Sans"', color: INK, letterSpacing: '-0.02em', marginBottom: 6 }}>
          Where do you usually pay from?
        </div>
        <div style={{ font: '500 13px "Plus Jakarta Sans"', color: MUTED, lineHeight: 1.55, marginBottom: 22 }}>
          Pick one to start. You can add more accounts later.
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {SOURCES.map(({ type, label, Icon }) => {
            const selected = source === type
            return (
              <button
                key={type}
                onClick={() => setSource(type)}
                aria-pressed={selected}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  background: selected ? 'rgba(22,201,138,0.08)' : SURFACE,
                  border: `1.5px solid ${selected ? ACCENT : BORDER}`,
                  borderRadius: 14, padding: '16px 6px', cursor: 'pointer',
                  color: selected ? ACCENT : INK,
                  font: `${selected ? '700' : '600'} 13px "Plus Jakarta Sans"`,
                }}
              >
                <Icon size={22} strokeWidth={2} />
                {label}
              </button>
            )
          })}
        </div>

        <label htmlFor="guest-balance" style={{
          font: '700 11px "Plus Jakarta Sans"', color: MUTED, letterSpacing: '0.05em',
          textTransform: 'uppercase', marginBottom: 7, display: 'block',
        }}>
          How much is in it? (optional)
        </label>
        <input
          id="guest-balance"
          inputMode="decimal"
          placeholder="₹0"
          value={balance}
          onChange={e => setBalance(sanitizeAmountInput(e.target.value))}
          style={{
            width: '100%', boxSizing: 'border-box', background: SURFACE,
            border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '13px 14px',
            font: '600 15px "Plus Jakarta Sans"', color: INK, outline: 'none', marginBottom: 28,
          }}
        />

        {error && (
          <div role="alert" style={{ font: '600 13px "Plus Jakarta Sans"', color: '#C2410C', marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={start}
          disabled={saving}
          style={{
            width: '100%', background: INK, color: BG, border: 'none', borderRadius: 14, padding: 16,
            font: '700 15px "Plus Jakarta Sans"', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Setting up…' : 'Add my first expense'}
        </button>
      </div>
    </div>
  )
}
