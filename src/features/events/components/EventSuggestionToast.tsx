import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { EventIcon } from '../lib/eventIcons'
import { EVENT_COLOR } from './EventTile'
import type { EventSuggestion } from '@/lib/event-suggestions'

/** How long the toast stays readable before it files itself into the bell.
 *  Paused while a finger or pointer is on it. */
const TOAST_VISIBLE_MS = 12_000
const TICK_MS = 250
const ENTER_MS = 450
const FLY_MS = 650

/** Header's bell carries this attribute; the toast measures it to fly there. */
const NOTIFICATION_BELL_SELECTOR = '[data-notification-bell]'

type Phase = 'entering' | 'shown' | 'flying' | 'leaving'

interface Props {
  suggestion: EventSuggestion
  onCreate: () => void
  /** The toast has finished — landed in the bell, or acted on. */
  onDone: () => void
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Slides down from the top, stays TOAST_VISIBLE_MS, then shrinks into the
 *  notification bell — where the suggestion is waiting in the Notifications
 *  sheet. The fly-in is the explanation of where it went. */
export function EventSuggestionToast({ suggestion: s, onCreate, onDone }: Props) {
  const c = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('entering')
  const [flyTransform, setFlyTransform] = useState<string | null>(null)
  const remaining = useRef(TOAST_VISIBLE_MS)
  const paused = useRef(false)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })

  // Enter on the next frame so the off-screen start position is painted first.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('shown')))
    return () => cancelAnimationFrame(id)
  }, [])

  const fileIntoBell = () => {
    const bell = document.querySelector(NOTIFICATION_BELL_SELECTOR)?.getBoundingClientRect()
    const box = ref.current?.getBoundingClientRect()
    if (!bell || !box || prefersReducedMotion()) {
      // No bell to aim at (or motion reduced): just slide back up.
      setPhase('leaving')
      window.setTimeout(() => done.current(), ENTER_MS)
      return
    }
    const dx = bell.left + bell.width / 2 - (box.left + box.width / 2)
    const dy = bell.top + bell.height / 2 - (box.top + box.height / 2)
    setFlyTransform(`translate(${dx}px, ${dy}px) scale(0.06)`)
    setPhase('flying')
    window.setTimeout(() => done.current(), FLY_MS)
  }

  // Countdown, paused while touched — a ticking interval rather than one long
  // timeout, so a pause doesn't restart the full duration.
  useEffect(() => {
    if (phase !== 'shown') return
    const id = window.setInterval(() => {
      if (paused.current) return
      remaining.current -= TICK_MS
      if (remaining.current <= 0) { window.clearInterval(id); fileIntoBell() }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [phase])

  const transform =
    phase === 'entering' || phase === 'leaving' ? 'translateY(calc(-100% - 40px))'
    : phase === 'flying' && flyTransform ? flyTransform
    : 'translateY(0)'

  const count = s.txIds.length

  return createPortal(
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      onPointerEnter={() => { paused.current = true }}
      onPointerLeave={() => { paused.current = false }}
      onPointerDown={() => { paused.current = true }}
      onPointerUp={() => { paused.current = false }}
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: 0, right: 0, margin: '0 auto',
        width: 'calc(100% - 32px)', maxWidth: 400,
        // Above the dashboard and header, below sheets (BottomSheet ≥ 200 is not
        // expected — App only mounts this when nothing is open).
        zIndex: 480,
        background: c.surface,
        border: `1px solid ${c.faint}`,
        borderRadius: 18,
        padding: '12px 12px 12px 14px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.22)',
        transform,
        transformOrigin: 'center center',
        opacity: phase === 'flying' ? 0.35 : 1,
        transition: phase === 'flying'
          ? `transform ${FLY_MS}ms cubic-bezier(0.55,0,0.1,1), opacity ${FLY_MS}ms ease-in`
          : `transform ${ENTER_MS}ms cubic-bezier(0.32,0.72,0,1)`,
        pointerEvents: phase === 'flying' || phase === 'leaving' ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: EVENT_COLOR,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <EventIcon name={s.icon} size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: '700 11.5px Plus Jakarta Sans', color: c.muted }}>
            <Sparkles size={12} color={EVENT_COLOR} /> Mint noticed a life event
          </div>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.name}
          </div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
            {count} expense{count === 1 ? '' : 's'} · {fmt(s.total)}
          </div>
        </div>
        <button
          onClick={() => { onCreate(); done.current() }}
          style={{
            padding: '9px 12px', borderRadius: 12, border: 'none', flexShrink: 0,
            background: c.accent, color: '#fff', font: '700 13px Plus Jakarta Sans', cursor: 'pointer',
          }}
        >
          {s.existingEventId ? 'Link' : 'Create'}
        </button>
        <button
          onClick={fileIntoBell}
          aria-label="Close — keep in notifications"
          style={{
            background: 'none', border: 'none', padding: 4, cursor: 'pointer',
            color: c.muted, display: 'flex', flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
