import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/lib/theme-context'

interface TourStep {
  target: string
  title: string
  description: string
}

const ALL_STEPS: TourStep[] = [
  { target: 'hero', title: 'Welcome to MoneyPlant!', description: "This is your personal finance dashboard. Let's show you around." },
  { target: 'metrics', title: 'Your Money', description: 'Available Today, Total Balance, Emergency Fund and Net Worth — all at a glance.' },
  { target: 'cashflow', title: 'Cash Flow Forecast', description: "See how much money you'll have before your next salary. MoneyPlant predicts your future balance using salary, bills, savings, credit cards and planned expenses." },
  { target: 'daily_challenge', title: 'Daily Challenge', description: 'Stay within your daily spending limit and build healthy financial habits.' },
  { target: 'commitments', title: 'Upcoming Commitments', description: 'Never miss an EMI, SIP, Gold Scheme or subscription. MoneyPlant reminds you before they\'re due.' },
  { target: 'accounts', title: 'Accounts', description: 'View all your bank accounts and cash balances in one place.' },
  { target: 'credit_cards', title: 'Credit Cards', description: 'Track your credit card balances, billing cycles and due dates. Pay bills directly from here.' },
  { target: 'projects', title: 'Projects', description: 'Organize and split shared expenses across trips, events, and group activities. Invite others, log shared costs, and see who owes what.' },
  { target: 'ai-fab', title: 'Mint AI', description: 'Tap the dark floating button to ask Mint anything about your money — Can I afford this? Why did I overspend?' },
  { target: 'fab', title: 'Add Transaction', description: 'Tap the green + button to record income or expenses in seconds. The more you record, the smarter your forecasts become.' },
  { target: 'settings', title: 'Settings', description: 'Set your income pattern, salary date, toggle features like credit cards, savings, notifications and more.' },
]

const PROGRAMMATIC_TARGETS = new Set(['settings'])
const NO_HIGHLIGHT_TARGETS = new Set(['settings'])
const FIXED_TARGETS = new Set(['fab', 'ai-fab'])
const TOOLTIP_TOP_TARGETS = new Set(['fab', 'ai-fab'])

interface GuidedTourProps {
  open: boolean
  onClose: () => void
  userId: string
  onOpenSettings?: () => void
  onCloseSettings?: () => void
  onActiveTarget?: (target: string | null) => void
}

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8
const MAX_HIGHLIGHT_H = 280

export function GuidedTour({ open, onClose, userId, onOpenSettings, onCloseSettings, onActiveTarget }: GuidedTourProps) {
  const c = useTheme()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const tooltipKey = useRef(0)

  const steps = useMemo(() => {
    if (!open) return ALL_STEPS
    return ALL_STEPS.filter(s =>
      PROGRAMMATIC_TARGETS.has(s.target) || document.querySelector(`[data-tour="${s.target}"]`) !== null
    )
  }, [open])

  const totalSteps = steps.length
  const isFinish = step >= totalSteps
  const currentStep = isFinish ? null : steps[step]
  const noHighlight = currentStep ? NO_HIGHLIGHT_TARGETS.has(currentStep.target) : false
  const tooltipAtTop = currentStep ? TOOLTIP_TOP_TARGETS.has(currentStep.target) : false

  const scrollAndMeasure = useCallback((target: string) => {
    if (NO_HIGHLIGHT_TARGETS.has(target)) {
      setRect(null)
      return
    }
    const el = document.querySelector(`[data-tour="${target}"]`)
    if (!el) { setRect(null); return }
    const isFixed = FIXED_TARGETS.has(target)
    if (!isFixed) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: isFixed ? r.height : Math.min(r.height, MAX_HIGHLIGHT_H) })
    }, isFixed ? 100 : 500)
  }, [])

  // Mount/unmount
  useEffect(() => {
    if (open) {
      setStep(0)
      setMounted(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(id)
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 350)
      return () => clearTimeout(t)
    }
  }, [open])

  // Notify parent of active target for z-index bumping
  useEffect(() => {
    if (!open || !mounted) {
      onActiveTarget?.(null)
      return
    }
    onActiveTarget?.(currentStep?.target ?? null)
  }, [open, mounted, currentStep, onActiveTarget])

  // Open/close settings panel for settings step
  useEffect(() => {
    if (!open || !mounted || !currentStep) return
    if (currentStep.target === 'settings') {
      onOpenSettings?.()
      return () => { onCloseSettings?.() }
    } else {
      onCloseSettings?.()
    }
  }, [open, mounted, currentStep, onOpenSettings, onCloseSettings])

  // Measure target when step changes
  useEffect(() => {
    if (!open || !mounted) return
    if (isFinish) { setRect(null); return }
    if (currentStep) {
      tooltipKey.current++
      scrollAndMeasure(currentStep.target)
    }
  }, [open, mounted, step, isFinish, currentStep, scrollAndMeasure])

  // Re-measure on resize
  useEffect(() => {
    if (!open || isFinish || !currentStep || NO_HIGHLIGHT_TARGETS.has(currentStep.target)) return
    const handler = () => {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: Math.min(r.height, MAX_HIGHLIGHT_H) })
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [open, isFinish, currentStep])

  const handleNext = useCallback(() => {
    if (isFinish) {
      localStorage.setItem('mp_tour_completed_' + userId, '1')
      onClose()
      return
    }
    setStep(s => s + 1)
  }, [isFinish, userId, onClose])

  const handleBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1)
  }, [step])

  const handleSkip = useCallback(() => {
    localStorage.setItem('mp_tour_completed_' + userId, '1')
    onClose()
  }, [userId, onClose])

  // Keyboard
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
      else if (e.key === 'ArrowRight') handleNext()
      else if (e.key === 'ArrowLeft' && step > 0) handleBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, step, handleSkip, handleNext, handleBack])

  if (!mounted) return null

  const tooltipContent = currentStep ? (
    <div style={{
      background: c.surface,
      borderRadius: 20,
      maxWidth: 456,
      margin: '0 auto',
      padding: '18px 18px 16px',
      boxShadow: tooltipAtTop ? '0 4px 40px rgba(0,0,0,0.2)' : '0 -4px 40px rgba(0,0,0,0.2)',
      border: `1px solid ${c.faint}`,
    }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? c.accent : c.faint,
            transition: 'background 0.25s ease',
          }} />
        ))}
      </div>
      <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', marginBottom: 5 }}>
        {currentStep.title}
      </div>
      <div style={{ font: '400 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.6, marginBottom: 16 }}>
        {currentStep.description}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleSkip}
          style={{
            background: 'none', border: 'none',
            font: '600 13px Plus Jakarta Sans', color: c.muted,
            cursor: 'pointer', padding: '8px 4px', marginRight: 'auto',
          }}
        >
          Skip
        </button>
        {step > 0 && (
          <button
            onClick={handleBack}
            style={{
              background: c.surface2, border: 'none',
              borderRadius: 12, padding: '10px 16px',
              font: '600 13px Plus Jakarta Sans', color: c.sub,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          style={{
            background: c.accent, border: 'none',
            borderRadius: 12, padding: '10px 20px',
            font: '700 13px Plus Jakarta Sans', color: '#fff',
            cursor: 'pointer',
          }}
        >
          {step === totalSteps - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  ) : null

  return createPortal(
    <>
      <style>{`
        @keyframes tourFadeUp {
          from { opacity: 0; transform: translateY(16px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes tourFadeDown {
          from { opacity: 0; transform: translateY(-16px) }
          to   { opacity: 1; transform: translateY(0) }
        }
      `}</style>

      {/* Full-screen backdrop */}
      <div
        onClick={handleSkip}
        style={{
          position: 'fixed', inset: 0, zIndex: 600,
          background: visible ? 'rgba(0,0,0,0.55)' : 'transparent',
          transition: 'background 0.3s ease',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      />

      {/* Highlight cutout */}
      {rect && !isFinish && !noHighlight && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 16,
            background: 'transparent',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            zIndex: 601,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Finish dialog — centered */}
      {isFinish && (
        <div
          key="finish"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 604,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            width: '100%',
            maxWidth: 320,
            background: c.surface,
            borderRadius: 22,
            padding: '32px 24px 24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            animation: 'tourFadeUp 0.3s cubic-bezier(0.32,0.72,0,1) both',
            textAlign: 'center',
            pointerEvents: 'auto',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 999,
              background: `${c.accent}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 6, letterSpacing: '-0.01em' }}>
              You're all set!
            </div>
            <div style={{ font: '400 13.5px Plus Jakarta Sans', color: c.sub, lineHeight: 1.55, marginBottom: 24 }}>
              Start tracking today and let MoneyPlant help you spend with confidence.
            </div>
            <button
              onClick={handleNext}
              style={{
                width: '100%', padding: '13px 0',
                background: c.accent, color: '#fff', border: 'none',
                borderRadius: 14, font: '700 14px Plus Jakarta Sans',
                cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Step tooltip — top or bottom depending on target */}
      {!isFinish && currentStep && (
        <div
          key={tooltipKey.current}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            ...(tooltipAtTop
              ? { top: 0, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 12px 0' }
              : { bottom: 0, padding: '0 12px calc(12px + env(safe-area-inset-bottom, 0px))' }
            ),
            left: 0,
            right: 0,
            zIndex: 604,
            animation: tooltipAtTop
              ? 'tourFadeDown 0.3s cubic-bezier(0.32,0.72,0,1) both'
              : 'tourFadeUp 0.3s cubic-bezier(0.32,0.72,0,1) both',
            boxSizing: 'border-box',
          }}
        >
          {tooltipContent}
        </div>
      )}
    </>,
    document.body
  )
}
