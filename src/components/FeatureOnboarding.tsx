import React, { useState } from 'react'

type FeatureKey = 'track_credit_cards' | 'track_borrowings' | 'autopilot_enabled' | 'notifications_enabled'

interface FeatureDef {
  key: FeatureKey
  label: string
  tagline: string
  settingsHint?: string
  defaultOn: boolean
  badge?: string
  featured?: boolean
  Icon: () => React.JSX.Element
}

function CreditCardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.8 5.62.82-4.06 3.96.96 5.6L12 16.9l-5.02 2.63.96-5.6L3.88 9.62l5.62-.82z"/>
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

const FEATURES: FeatureDef[] = [
  {
    key: 'autopilot_enabled',
    label: 'Mint AI',
    tagline: "Mint auto-categorizes every transaction as you type, answers questions like \"how much did I spend on food this month?\", and surfaces spending patterns you'd never notice manually. It's MoneyPlant's core superpower.",
    defaultOn: true,
    badge: 'Recommended',
    featured: true,
    Icon: SparkleIcon,
  },
  {
    key: 'track_credit_cards',
    label: 'Credit Card Tracking',
    tagline: 'Do you use a credit card? This keeps your card spends separate from cash so you always know what you owe before the bill arrives.',
    settingsHint: 'Can be enabled later in Settings',
    defaultOn: false,
    Icon: CreditCardIcon,
  },
  {
    key: 'track_borrowings',
    label: 'Lend & Borrow',
    tagline: 'Lent money to a friend? Borrowed from family? Log it here so nothing slips through the cracks.',
    settingsHint: 'Can be enabled later in Settings',
    defaultOn: false,
    Icon: UsersIcon,
  },
  {
    key: 'notifications_enabled',
    label: 'Smart Reminders',
    tagline: "Salary day nudges, budget alerts when you're close to your limit, and a weekly spending summary.",
    settingsHint: 'Can be enabled later in Settings',
    defaultOn: false,
    Icon: BellIcon,
  },
]

interface Props {
  onComplete: (features: Record<FeatureKey, boolean>) => void
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(!on) }}
      style={{
        flexShrink: 0,
        width: 44, height: 26, borderRadius: 13,
        background: on ? '#16C98A' : '#C8C2BB',
        border: 'none', cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.22s ease',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: 10,
        background: '#fff',
        transition: 'left 0.22s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }} />
    </button>
  )
}

export function FeatureOnboarding({ onComplete }: Props) {
  const [enabled, setEnabled] = useState<Record<FeatureKey, boolean>>(
    () => Object.fromEntries(FEATURES.map(f => [f.key, f.defaultOn])) as Record<FeatureKey, boolean>
  )

  const toggle = (key: FeatureKey, val: boolean) =>
    setEnabled(prev => ({ ...prev, [key]: val }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#EDE7DD',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      overflowY: 'auto',
      animation: 'mpFadeIn 0.35s ease both',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        padding: '52px 20px 40px',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ font: '800 24px "Plus Jakarta Sans"', letterSpacing: '-0.025em', color: '#1C1410' }}>
            Personalize your app
          </div>
          <div style={{ marginTop: 8, font: '500 13px "Plus Jakarta Sans"', color: '#8A8178', lineHeight: 1.55 }}>
            Turn on what you need. Change anytime in Settings.
          </div>
        </div>

        {/* Feature cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FEATURES.map(f => {
            const on = enabled[f.key]
            const isFeatured = f.featured

            return (
              <div
                key={f.key}
                onClick={() => toggle(f.key, !on)}
                style={{
                  background: isFeatured
                    ? (on ? 'linear-gradient(135deg, #0FAF75 0%, #16C98A 100%)' : '#F5F1EB')
                    : '#FBF8F4',
                  borderRadius: 16,
                  padding: isFeatured ? '18px 18px' : '14px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 13,
                  boxShadow: isFeatured && on
                    ? '0 4px 20px rgba(22,201,138,0.28)'
                    : '0 1px 3px rgba(0,0,0,0.05)',
                  border: isFeatured
                    ? (on ? 'none' : '1.5px solid rgba(22,201,138,0.35)')
                    : '1.5px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.22s ease',
                  userSelect: 'none',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: isFeatured
                    ? (on ? 'rgba(255,255,255,0.2)' : 'rgba(22,201,138,0.1)')
                    : (on ? 'rgba(22,201,138,0.12)' : '#EDE7DD'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isFeatured ? (on ? '#fff' : '#16C98A') : (on ? '#16C98A' : '#8A8178'),
                  flexShrink: 0,
                  transition: 'all 0.22s ease',
                }}>
                  <f.Icon />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <span style={{
                      font: '700 14px "Plus Jakarta Sans"',
                      color: isFeatured && on ? '#fff' : '#1C1410',
                    }}>
                      {f.label}
                    </span>
                    {f.badge && (
                      <span style={{
                        font: '600 10px "Plus Jakarta Sans"',
                        color: isFeatured && on ? '#0FAF75' : '#16C98A',
                        background: isFeatured && on ? 'rgba(255,255,255,0.9)' : 'rgba(22,201,138,0.12)',
                        padding: '2px 7px',
                        borderRadius: 20,
                        letterSpacing: '0.01em',
                      }}>
                        {f.badge}
                      </span>
                    )}
                  </div>
                  <div style={{
                    font: `400 ${isFeatured ? 12.5 : 12}px "Plus Jakarta Sans"`,
                    color: isFeatured && on ? 'rgba(255,255,255,0.82)' : '#7A746C',
                    lineHeight: 1.55,
                  }}>
                    {f.tagline}
                  </div>
                  {f.settingsHint && (
                    <div style={{
                      marginTop: 6,
                      font: '500 11px "Plus Jakarta Sans"',
                      color: '#B8B0A8',
                      letterSpacing: '0.01em',
                    }}>
                      {f.settingsHint}
                    </div>
                  )}
                </div>

                {/* Toggle */}
                <div style={{ paddingTop: 1 }}>
                  <Toggle on={on} onChange={v => toggle(f.key, v)} />
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <button
          onClick={() => onComplete(enabled)}
          style={{
            marginTop: 28,
            width: '100%',
            padding: '16px',
            background: '#1C1410',
            color: '#EDE7DD',
            border: 'none', borderRadius: 16,
            font: '700 15px "Plus Jakarta Sans"',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            transition: 'opacity 0.15s',
          }}
        >
          Let's go
        </button>
      </div>

      <style>{`
        @keyframes mpFadeIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
      `}</style>
    </div>
  )
}
