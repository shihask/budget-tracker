import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sprout, Pause, Play, X, ChevronLeft, ChevronRight, CalendarCheck, Sparkles, PenLine, Target } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { PILLARS, PILLAR_LABEL, PILLAR_PLAIN, PILLAR_EXAMPLES } from '../lib/pillars'

/** First-open introduction to Kakeibo — an Instagram-story-style animated
 *  sequence (no video file: nothing to download, works offline, follows the
 *  theme, readable by screen readers). Auto-advances; tap right/left to move,
 *  press and hold or the pause button to pause, Skip any time. With reduced
 *  motion it doesn't animate or auto-advance — Next moves on. */

interface Scene { id: string; ms: number; label: string }
const SCENES: Scene[] = [
  { id: 'meet', ms: 5000, label: 'Meet Kakeibo' },
  { id: 'history', ms: 7000, label: 'Where it comes from' },
  { id: 'questions', ms: 8000, label: 'The four questions' },
  { id: 'pillars', ms: 9000, label: 'The four pillars' },
  { id: 'moneyplant', ms: 8000, label: 'How MoneyPlant does it' },
  { id: 'ritual', ms: 7000, label: 'Your monthly ritual' },
  { id: 'start', ms: 0, label: 'Get started' },
]

const CSS = `
@keyframes kk-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@keyframes kk-pop { from { opacity: 0; transform: scale(.85) } to { opacity: 1; transform: none } }
@keyframes kk-grow { from { width: 0 } to { width: 100% } }
@keyframes kk-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
.kk-in { opacity: 0; animation: kk-in .6s cubic-bezier(.2,.7,.2,1) forwards }
.kk-pop { opacity: 0; animation: kk-pop .5s cubic-bezier(.2,.7,.2,1) forwards }
.kk-float { animation: kk-float 3.2s ease-in-out infinite }
.kk-paused .kk-in, .kk-paused .kk-pop, .kk-paused .kk-float, .kk-paused .kk-bar { animation-play-state: paused }
@media (prefers-reduced-motion: reduce) {
  .kk-in, .kk-pop { animation: none; opacity: 1 }
  .kk-float { animation: none }
}
`

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function KakeiboIntro({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useTheme()
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [held, setHeld] = useState(false)
  const pressAt = useRef(0)
  const [still] = useState(reducedMotion)
  const closeRef = useRef<HTMLButtonElement>(null)

  const last = SCENES.length - 1
  const next = useCallback(() => setI(n => Math.min(last, n + 1)), [last])
  const prev = useCallback(() => setI(n => Math.max(0, n - 1)), [])

  // Reset when (re)opened; focus the close button for keyboard users.
  const [openedFor, setOpenedFor] = useState(false)
  if (open !== openedFor) { setOpenedFor(open); if (open) { setI(0); setPaused(false) } }
  useEffect(() => { if (open) closeRef.current?.focus() }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p) }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [open, onClose, next, prev])

  if (!open) return null
  const scene = SCENES[i]
  const isPaused = paused || held

  // Tap = move by side; press-and-hold = pause while held.
  const onPointerDown = () => { pressAt.current = Date.now(); setHeld(true) }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setHeld(false)
    if (Date.now() - pressAt.current > 300) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX - rect.left < rect.width * 0.33) prev()
    else next()
  }

  const title = (t: string, delay = 0) => (
    <div className="kk-in" style={{ font: '800 26px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', lineHeight: 1.2, animationDelay: `${delay}ms` }}>{t}</div>
  )
  const body = (t: React.ReactNode, delay = 0) => (
    <div className="kk-in" style={{ font: '600 15px Plus Jakarta Sans', color: c.sub, lineHeight: 1.55, marginTop: 10, animationDelay: `${delay}ms` }}>{t}</div>
  )
  const chip = (icon: React.ReactNode, t: string, delay: number) => (
    <div className="kk-in" style={{
      display: 'flex', gap: 12, alignItems: 'center', background: c.surface, border: `1px solid ${c.faint}`,
      borderRadius: 16, padding: '12px 14px', animationDelay: `${delay}ms`,
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: c.accentSoft, color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, lineHeight: 1.4 }}>{t}</div>
    </div>
  )

  const content = (() => {
    switch (scene.id) {
      case 'meet': return (
        <div style={{ textAlign: 'center' }}>
          <div className="kk-pop kk-float" style={{
            width: 88, height: 88, borderRadius: 26, margin: '0 auto 22px', background: c.accentSoft, color: c.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Sprout size={44} /></div>
          <div className="kk-in" lang="ja" style={{ font: '800 44px sans-serif', color: c.accent, letterSpacing: '0.08em', animationDelay: '250ms' }}>家計簿</div>
          <div className="kk-in" style={{ font: '700 13px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '6px 0 18px', animationDelay: '450ms' }}>
            Kakeibo · “household account book”
          </div>
          {title('Meet Kakeibo', 700)}
          {body('A simple Japanese way to manage money more mindfully.', 900)}
        </div>
      )
      case 'history': return (
        <div>
          <div className="kk-pop" style={{ font: '800 64px Plus Jakarta Sans', color: c.accent, letterSpacing: '-0.03em', lineHeight: 1 }}>1904</div>
          <div className="kk-in" style={{ font: '700 13px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '8px 0 18px', animationDelay: '200ms' }}>Tokyo, Japan</div>
          {title('Born from a household notebook', 400)}
          {body(<>Hani Motoko — Japan’s first woman journalist — created Kakeibo to help families take charge of their money, one honest look at a time.</>, 650)}
          {body(<>More than a century later it’s still widely used across Japan. The secret isn’t a formula. It’s <b style={{ color: c.ink }}>noticing</b>.</>, 1100)}
        </div>
      )
      case 'questions': return (
        <div>
          {title('Four simple questions', 0)}
          {body('Every month, Kakeibo asks:', 150)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {['How much money did I receive?', 'How much do I want to save?', 'Where did my money go?', 'What can I do better next cycle?']
              .map((q, k) => (
                <div key={q} className="kk-in" style={{
                  display: 'flex', gap: 12, alignItems: 'center', background: c.surface, border: `1px solid ${c.faint}`,
                  borderRadius: 16, padding: '12px 14px', animationDelay: `${400 + k * 450}ms`,
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: c.accent, color: '#fff', font: '800 13px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k + 1}</div>
                  <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>{q}</div>
                </div>
              ))}
          </div>
        </div>
      )
      case 'pillars': return (
        <div>
          {title('Your spending, in four pillars', 0)}
          {body('Every expense fits one of these:', 150)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            {PILLARS.map((p, k) => (
              <div key={p} className="kk-pop" style={{
                background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '12px 12px 14px',
                animationDelay: `${400 + k * 500}ms`,
              }}>
                <div style={{ font: '800 16px Plus Jakarta Sans', color: c.accent }}>{PILLAR_LABEL[p]}</div>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{PILLAR_PLAIN[p]}</div>
                <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 4, lineHeight: 1.4 }}>{PILLAR_EXAMPLES[p]}</div>
              </div>
            ))}
          </div>
        </div>
      )
      case 'moneyplant': return (
        <div>
          {title('MoneyPlant does the bookkeeping', 0)}
          {body('No notebook needed — your recorded transactions do the work.', 150)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {chip(<CalendarCheck size={18} />, 'Follows your salary cycle, not the calendar month', 450)}
            {chip(<Target size={18} />, 'Set a savings goal when your salary arrives', 1100)}
            {chip(<Sparkles size={18} />, 'Generate an analysis any time — Mint AI suggests pillars, you can change any', 1750)}
          </div>
        </div>
      )
      case 'ritual': return (
        <div>
          {title('A two-minute monthly ritual', 0)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            {chip(<CalendarCheck size={18} />, 'Payday: your last cycle is ready to review', 300)}
            {chip(<PenLine size={18} />, 'Answer one question — “What will I do differently?”', 950)}
            {chip(<Sprout size={18} />, 'See your own lesson again at the start of next cycle', 1600)}
          </div>
          {body('Small, honest reflections. Better money habits.', 2200)}
        </div>
      )
      default: return (
        <div style={{ textAlign: 'center' }}>
          <div className="kk-pop kk-float" style={{
            width: 72, height: 72, borderRadius: 22, margin: '0 auto 20px', background: c.accentSoft, color: c.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Sprout size={36} /></div>
          {title('Your money, understood.', 150)}
          {body('Review your spending, check your savings and choose one thing to improve.', 350)}
          <button
            type="button" className="kk-in"
            onClick={e => { e.stopPropagation(); onClose() }}
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
            style={{
              marginTop: 26, width: '100%', background: c.accent, color: '#fff', border: 'none', borderRadius: 14,
              padding: '15px 16px', font: '800 15px Plus Jakarta Sans', cursor: 'pointer', animationDelay: '600ms',
            }}
          >Let’s get started</button>
        </div>
      )
    }
  })()

  const iconBtn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 999, border: 'none', background: c.surface2, color: c.ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  }
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="What is Kakeibo?"
      className={isPaused ? 'kk-paused' : undefined}
      // React portals bubble to their React parents: without this, an edge swipe
      // here would reach Analytics' swipe-back handler and close the page behind.
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: c.bg,
        backgroundImage: `radial-gradient(circle at 85% 8%, ${c.accentSoft}, transparent 45%), radial-gradient(circle at 10% 95%, ${c.goodSoft}, transparent 40%)`,
        display: 'flex', flexDirection: 'column', fontFamily: 'Plus Jakarta Sans, sans-serif',
        paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <style>{CSS}</style>
      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 20px 20px', boxSizing: 'border-box' }}>
        {/* Progress — the active bar's animationend advances the story. */}
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {SCENES.map((s, k) => (
            <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 999, background: c.faint, overflow: 'hidden' }}>
              <div
                key={k === i ? `on-${i}` : `off-${k}`}
                className={k === i && s.ms > 0 && !still ? 'kk-bar' : undefined}
                onAnimationEnd={k === i ? next : undefined}
                style={{
                  height: '100%', background: c.accent, borderRadius: 999,
                  width: k < i || (k === i && (s.ms === 0 || still)) ? '100%' : 0,
                  animation: k === i && s.ms > 0 && !still ? `kk-grow ${s.ms}ms linear forwards` : undefined,
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Kakeibo · {i + 1}/{SCENES.length}
          </div>
          {i < last && !still && (
            <button type="button" style={iconBtn} onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play' : 'Pause'}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          )}
          <button ref={closeRef} type="button" style={iconBtn} onClick={onClose} aria-label="Skip introduction"><X size={18} /></button>
        </div>

        {/* Stage — tap right/left to move, press and hold to pause. */}
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHeld(false)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation' }}
        >
          <div key={scene.id} aria-live="polite" style={{ width: '100%' }}>{content}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }} onPointerDown={stop} onPointerUp={stop}>
          <button type="button" onClick={prev} disabled={i === 0} aria-label="Previous"
            style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1, cursor: i === 0 ? 'default' : 'pointer' }}><ChevronLeft size={18} /></button>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', color: c.muted, font: '700 13px Plus Jakarta Sans', cursor: 'pointer', padding: 8 }}>
            {i < last ? 'Skip' : 'Close'}
          </button>
          <button type="button" onClick={next} disabled={i === last} aria-label="Next"
            style={{ ...iconBtn, opacity: i === last ? 0.35 : 1, cursor: i === last ? 'default' : 'pointer' }}><ChevronRight size={18} /></button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
