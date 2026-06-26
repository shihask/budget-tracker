import React, { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'

type FeatureKey = 'track_credit_cards' | 'track_borrowings' | 'track_savings' | 'autopilot_enabled' | 'notifications_enabled'

interface FeaturePage {
  key: FeatureKey
  label: string
  subtitle: string
  description: string
  defaultOn: boolean
  featured?: boolean
  Icon: ({ size }: { size: number }) => React.JSX.Element
}

function SparkleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.8 5.62.82-4.06 3.96.96 5.6L12 16.9l-5.02 2.63.96-5.6L3.88 9.62l5.62-.82z"/>
    </svg>
  )
}

function CreditCardIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}

function UsersIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function TrendingUpIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}

function BellIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

const PAGES: FeaturePage[] = [
  {
    key: 'autopilot_enabled',
    label: 'Mint AI',
    subtitle: "MoneyPlant's core feature",
    description: 'Mint reads what you type and categorizes automatically — "tea 20" becomes Tea & Snacks instantly.\n\nAsk it anything: "how much did I spend on food this month?" Get answers in seconds. Spot patterns before they become bad habits.',
    defaultOn: true,
    featured: true,
    Icon: SparkleIcon,
  },
  {
    key: 'track_credit_cards',
    label: 'Credit Card Tracking',
    subtitle: 'Know what you owe',
    description: 'Have a credit card? Keep those spends completely separate from cash.\n\nSee your outstanding balance update in real-time — so you always know what you owe before the bill lands.',
    defaultOn: false,
    Icon: CreditCardIcon,
  },
  {
    key: 'track_borrowings',
    label: 'Lend & Borrow',
    subtitle: 'Never lose track',
    description: 'Lent ₹500 to a friend? Borrowed from family? Track every rupee you\'ve given or received.\n\nSee at a glance who owes you — and who you owe.',
    defaultOn: false,
    Icon: UsersIcon,
  },
  {
    key: 'track_savings',
    label: 'Savings & Investments',
    subtitle: 'Watch your wealth grow',
    description: 'Track your SIPs, gold schemes, recurring deposits and fixed deposits — all in one dedicated section.\n\nRecord each contribution, see your total corpus, and keep savings completely separate from daily expenses.',
    defaultOn: false,
    Icon: TrendingUpIcon,
  },
  {
    key: 'notifications_enabled',
    label: 'Smart Reminders',
    subtitle: 'Never forget to track your spending',
    description: 'Life gets busy — MoneyPlant keeps you on track.\n\n• Salary day nudge to log your income\n• Due date alerts for bills & commitments\n• Budget limit warning before you overspend\n• Weekly spending summary every Sunday\n• Daily reminder to log today\'s expenses',
    defaultOn: false,
    Icon: BellIcon,
  },
]

interface Props {
  onComplete: (features: Record<FeatureKey, boolean>) => void
  onBack: () => void
}

function LargeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 56, height: 32, borderRadius: 16,
        background: on ? '#16C98A' : '#C8C2BB',
        border: 'none', cursor: 'pointer',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.25s ease',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 4, left: on ? 28 : 4,
        width: 24, height: 24, borderRadius: 12,
        background: '#fff',
        transition: 'left 0.25s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </button>
  )
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  )
}

function MintAIDemo() {
  const TARGET = 'tea 20'
  const [typed, setTyped] = useState('')
  const [showResult, setShowResult] = useState(false)
  const [cursorOn, setCursorOn] = useState(true)

  useEffect(() => {
    let i = 0
    const delay = setTimeout(() => {
      const interval = setInterval(() => {
        i++
        setTyped(TARGET.slice(0, i))
        if (i >= TARGET.length) {
          clearInterval(interval)
          setTimeout(() => setShowResult(true), 700)
        }
      }, 110)
      return () => clearInterval(interval)
    }, 500)
    return () => clearTimeout(delay)
  }, [])

  useEffect(() => {
    if (showResult) return
    const t = setInterval(() => setCursorOn(v => !v), 530)
    return () => clearInterval(t)
  }, [showResult])

  return (
    <div style={{ width: '100%', marginBottom: 20, textAlign: 'left' }}>
      {/* Simulated input */}
      <div style={{
        background: '#FBF8F4', borderRadius: 12,
        border: `1.5px solid ${showResult ? 'rgba(22,201,138,0.35)' : '#16C98A'}`,
        padding: '13px 14px',
        marginBottom: 10,
        display: 'flex', alignItems: 'center',
        transition: 'border-color 0.3s',
      }}>
        <span style={{ font: '600 15px "Plus Jakarta Sans"', color: '#1C1410', flex: 1 }}>
          {typed || <span style={{ color: '#C0B9B1' }}>type anything…</span>}
        </span>
        {!showResult && (
          <span style={{
            display: 'inline-block', width: 2, height: 18,
            background: cursorOn ? '#16C98A' : 'transparent',
            borderRadius: 1, marginLeft: 1,
            transition: 'background 0.1s',
          }} />
        )}
      </div>

      {/* Result card */}
      {showResult && (
        <div style={{
          background: '#FBF8F4', borderRadius: 12,
          border: '1.5px solid rgba(22,201,138,0.3)',
          padding: '12px 14px',
          marginBottom: 16,
          animation: 'foFadeUp 0.35s ease both',
        }}>
          <div style={{
            font: '700 10px "Plus Jakarta Sans"', color: '#16C98A',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 9,
          }}>
            Mint understood
          </div>
          {([
            ['Description', 'Tea'],
            ['Category', 'Tea & Snacks'],
            ['Amount', '₹20'],
          ] as const).map(([lbl, val], i, arr) => (
            <div key={lbl} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0',
              borderBottom: i < arr.length - 1 ? '1px solid #EDE7DD' : 'none',
            }}>
              <span style={{ font: '500 13px "Plus Jakarta Sans"', color: '#8A8178' }}>{lbl}</span>
              <span style={{ font: '700 13px "Plus Jakarta Sans"', color: '#1C1410' }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Feature list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          'Auto-categorizes as you type',
          'Answers any spending question',
          'Spots patterns & savings opportunities',
          'Checks if you can afford something',
        ].map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={13} style={{ color: '#16C98A', flexShrink: 0 }} />
            <span style={{ font: '500 13px "Plus Jakarta Sans"', color: '#8A8178' }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FeatureOnboarding({ onComplete, onBack }: Props) {
  const [page, setPage] = useState(0)
  const [done, setDone] = useState(false)
  const [enabled, setEnabled] = useState<Record<FeatureKey, boolean>>(
    () => Object.fromEntries(PAGES.map(f => [f.key, f.defaultOn])) as Record<FeatureKey, boolean>
  )

  const cur = PAGES[page]
  const isLast = page === PAGES.length - 1
  const on = enabled[cur.key]

  const handleBack = () => page === 0 ? onBack() : setPage(p => p - 1)
  const handleNext = () => isLast ? setDone(true) : setPage(p => p + 1)
  const setOn = (v: boolean) => setEnabled(prev => ({ ...prev, [cur.key]: v }))

  if (done) return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#EDE7DD',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      padding: '0 32px',
      animation: 'foFadeUp 0.4s ease both',
    }}>
      {/* Check mark */}
      <div style={{
        width: 72, height: 72, borderRadius: 24,
        background: '#1C1410',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16C98A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>

      <div style={{ font: '800 26px "Plus Jakarta Sans"', color: '#1C1410', letterSpacing: '-0.025em', marginBottom: 10, textAlign: 'center' }}>
        Setup Complete
      </div>
      <div style={{ font: '600 15px "Plus Jakarta Sans"', color: '#16C98A', marginBottom: 16, textAlign: 'center' }}>
        MoneyPlant is ready.
      </div>
      <div style={{ font: '400 14px "Plus Jakarta Sans"', color: '#8A8178', lineHeight: 1.7, textAlign: 'center', maxWidth: 280, marginBottom: 44 }}>
        Your accounts, budget and preferences have been configured.
      </div>

      <button
        onClick={() => onComplete(enabled)}
        style={{
          width: '100%', maxWidth: 320, padding: '16px',
          background: '#1C1410', color: '#EDE7DD',
          border: 'none', borderRadius: 16,
          font: '700 15px "Plus Jakarta Sans"',
          cursor: 'pointer', letterSpacing: '-0.01em',
        }}
      >
        Go to Dashboard
      </button>

      <style>{`
        @keyframes foFadeUp {
          from { opacity: 0; transform: translateY(16px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </div>
  )

  const iconBg = cur.featured && on
    ? 'linear-gradient(135deg, #0FAF75, #16C98A)'
    : on ? 'rgba(22,201,138,0.12)' : '#E4DDD5'
  const iconColor = cur.featured && on ? '#fff' : on ? '#16C98A' : '#9C9188'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#EDE7DD',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: `calc(14px + env(safe-area-inset-top,0px)) 20px 0`,
        gap: 0,
      }}>
        <button
          onClick={handleBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#8A8178', padding: '8px',
            display: 'flex', alignItems: 'center', gap: 4,
            font: '600 13px "Plus Jakarta Sans"',
          }}
        >
          <BackArrow /> Back
        </button>

        {/* Progress dots */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {PAGES.map((_, i) => (
            <div key={i} style={{
              height: 6, borderRadius: 999,
              width: i === page ? 22 : 6,
              background: i <= page ? '#16C98A' : '#D4CEC8',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Right spacer matches back button width */}
        <div style={{ width: 72 }} />
      </div>

      {/* Page content — key forces remount + animation on page change */}
      <div
        key={page}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: cur.featured ? 'flex-start' : 'center',
          padding: cur.featured ? '20px 24px 16px' : '0 32px 16px',
          textAlign: 'center',
          overflowY: 'auto', overscrollBehavior: 'contain',
          animation: 'foFadeUp 0.32s ease both',
        }}
      >
        {/* Icon */}
        {cur.featured ? (
          <div style={{
            width: 76, height: 76, borderRadius: 24,
            background: '#1C1410',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <img
              src="/mint-thinking-loop.svg"
              alt="Mint AI"
              width={44}
              height={44}
              onError={e => {
                const el = e.currentTarget
                el.style.display = 'none'
                const fallback = el.nextElementSibling as HTMLElement | null
                if (fallback) fallback.style.display = 'flex'
              }}
            />
            <div style={{ display: 'none', alignItems: 'center', justifyContent: 'center', color: '#16C98A' }}>
              <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.88 5.8 5.62.82-4.06 3.96.96 5.6L12 16.9l-5.02 2.63.96-5.6L3.88 9.62l5.62-.82z"/>
              </svg>
            </div>
          </div>
        ) : (
          <div style={{
            width: 76, height: 76, borderRadius: 24,
            background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: iconColor,
            marginBottom: 24,
            transition: 'all 0.3s ease',
          }}>
            <cur.Icon size={30} />
          </div>
        )}

        {/* Label */}
        <div style={{
          font: '800 26px "Plus Jakarta Sans"',
          color: '#1C1410', letterSpacing: '-0.025em', marginBottom: 5,
        }}>
          {cur.label}
        </div>

        {/* Subtitle */}
        <div style={{
          font: '600 13px "Plus Jakarta Sans"',
          color: cur.featured ? '#16C98A' : '#8A8178',
          marginBottom: 20,
        }}>
          {cur.subtitle}
        </div>

        {/* Description */}
        {cur.featured ? (
          <MintAIDemo />
        ) : (
          <div style={{
            font: '400 14px "Plus Jakarta Sans"',
            color: '#8A8178', lineHeight: 1.72,
            marginBottom: 36, maxWidth: 320,
            whiteSpace: 'pre-line',
          }}>
            {cur.description}
          </div>
        )}

        {/* Toggle + status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: '#FBF8F4', borderRadius: 16,
          padding: '14px 20px',
          border: `1.5px solid ${on ? 'rgba(22,201,138,0.3)' : '#E0D9D0'}`,
          transition: 'border-color 0.25s',
        }}>
          <LargeToggle on={on} onChange={setOn} />
          <div style={{ textAlign: 'left' }}>
            <div style={{
              font: '700 14px "Plus Jakarta Sans"',
              color: on ? '#16C98A' : '#1C1410',
              transition: 'color 0.25s',
            }}>
              {on ? 'Enabled' : 'Disabled'}
            </div>
            <div style={{ font: '400 12px "Plus Jakarta Sans"', color: '#B0A9A1', marginTop: 1 }}>
              {on ? 'Tap to turn off' : 'Tap to enable'}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: `0 20px calc(28px + env(safe-area-inset-bottom,0px))`,
      }}>
        <button
          onClick={handleNext}
          style={{
            width: '100%', padding: '16px',
            background: '#1C1410', color: '#EDE7DD',
            border: 'none', borderRadius: 16,
            font: '700 15px "Plus Jakarta Sans"',
            cursor: 'pointer', letterSpacing: '-0.01em',
          }}
        >
          {isLast ? "Let's go" : 'Continue'}
        </button>
      </div>

      <style>{`
        @keyframes foFadeUp {
          from { opacity: 0; transform: translateY(16px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>
    </div>
  )
}
