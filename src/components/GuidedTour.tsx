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
  { target: 'accounts', title: 'Accounts & Credit Cards', description: 'Track all your bank accounts, cash and credit cards in one place.' },
  { target: 'ai-fab', title: 'Mint AI', description: 'Ask Mint anything about your money — Can I afford a new phone? Why did I overspend? How can I save more?' },
  { target: 'fab', title: 'Add Transaction', description: 'Record income or expenses in seconds. The more you record, the smarter your forecasts become.' },
]

interface GuidedTourProps {
  open: boolean
  onClose: () => void
  userId: string
}

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 10

export function GuidedTour({ open, onClose, userId }: GuidedTourProps) {
  const c = useTheme()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const tooltipKey = useRef(0)

  const steps = useMemo(() => {
    if (!open) return ALL_STEPS
    return ALL_STEPS.filter(s => document.querySelector(`[data-tour="${s.target}"]`) !== null)
  }, [open])

  const totalSteps = steps.length
  const isFinish = step >= totalSteps
  const currentStep = isFinish ? null : steps[step]

  const measureTarget = useCallback((target: string) => {
    const el = document.querySelector(`[data-tour="${target}"]`)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [])

  const lockScroll = useCallback(() => {
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    document.documentElement.style.overflow = 'hidden'
  }, [])

  const unlockScroll = useCallback(() => {
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
    document.documentElement.style.overflow = ''
  }, [])

  const scrollAndMeasure = useCallback((target: string) => {
    const el = document.querySelector(`[data-tour="${target}"]`)
    if (!el) { setRect(null); return }
    unlockScroll()
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      lockScroll()
    }, 420)
  }, [lockScroll, unlockScroll])

  // Mount/unmount
  useEffect(() => {
    if (open) {
      setStep(0)
      setMounted(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(id)
    } else {
      setVisible(false)
      unlockScroll()
      const t = setTimeout(() => setMounted(false), 350)
      return () => clearTimeout(t)
    }
  }, [open, unlockScroll])

  // Measure target when step changes
  useEffect(() => {
    if (!open || !mounted) return
    if (isFinish) { setRect(null); return }
    if (currentStep) {
      tooltipKey.current++
      scrollAndMeasure(currentStep.target)
    }
  }, [open, mounted, step, isFinish, currentStep, scrollAndMeasure])

  // Resize handler
  useEffect(() => {
    if (!open || isFinish || !currentStep) return
    const handler = () => measureTarget(currentStep.target)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [open, isFinish, currentStep, measureTarget])

  const handleNext = useCallback(() => {
    if (isFinish) {
      localStorage.setItem('mp_tour_completed_' + userId, '1')
      onClose()
      return
    }
    if (step < totalSteps) {
      setStep(s => s + 1)
    }
  }, [step, totalSteps, isFinish, userId, onClose])

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

  const vw = window.innerWidth
  const vh = window.innerHeight

  // Tooltip placement
  let tooltipStyle: React.CSSProperties = {}
  if (isFinish || !rect) {
    tooltipStyle = {
      position: 'fixed',
      top: '50%', left: '50%',
      transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.94)',
      opacity: visible ? 1 : 0,
    }
  } else {
    const belowTarget = rect.top < vh * 0.45
    const tooltipWidth = Math.min(360, vw - 32)
    let tooltipLeft = rect.left + rect.width / 2 - tooltipWidth / 2
    tooltipLeft = Math.max(16, Math.min(tooltipLeft, vw - tooltipWidth - 16))

    if (belowTarget) {
      tooltipStyle = {
        position: 'fixed',
        top: rect.top + rect.height + PAD + 12,
        left: tooltipLeft,
        width: tooltipWidth,
      }
    } else {
      tooltipStyle = {
        position: 'fixed',
        left: tooltipLeft,
        width: tooltipWidth,
      }
      const estimatedTooltipHeight = 180
      tooltipStyle.top = Math.max(16, rect.top - PAD - 12 - estimatedTooltipHeight)
    }
  }

  return createPortal(
    <>
      <style>{`
        @keyframes tourFadeUp {
          from { opacity: 0; transform: translateY(8px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 0 rgba(16,185,129,0.3) }
          50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 6px rgba(16,185,129,0.15) }
        }
      `}</style>

      {/* Clickable backdrop */}
      <div
        onClick={handleSkip}
        style={{
          position: 'fixed', inset: 0, zIndex: 600,
          pointerEvents: visible ? 'auto' : 'none',
        }}
      />

      {/* Highlight cutout */}
      {rect && !isFinish && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 16,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            zIndex: 600,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Dimmed backdrop for finish screen */}
      {isFinish && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          background: visible ? 'rgba(0,0,0,0.55)' : 'transparent',
          transition: 'background 0.3s ease',
        }} />
      )}

      {/* Tooltip */}
      <div
        key={tooltipKey.current}
        onClick={e => e.stopPropagation()}
        style={{
          ...tooltipStyle,
          zIndex: 601,
          background: c.surface,
          borderRadius: 20,
          padding: isFinish ? '32px 24px 24px' : '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          maxWidth: 360,
          width: isFinish ? 'calc(100% - 48px)' : undefined,
          animation: 'tourFadeUp 0.28s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        {isFinish ? (
          // Finish screen
          <div style={{ textAlign: 'center' }}>
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
        ) : currentStep ? (
          // Step content
          <>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>
              {step + 1} of {totalSteps}
            </div>
            <div style={{ font: '700 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', marginBottom: 6 }}>
              {currentStep.title}
            </div>
            <div style={{ font: '400 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.6, marginBottom: 20 }}>
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
                    borderRadius: 12, padding: '10px 18px',
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
                  borderRadius: 12, padding: '10px 22px',
                  font: '700 13px Plus Jakarta Sans', color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {step === totalSteps - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>,
    document.body
  )
}
