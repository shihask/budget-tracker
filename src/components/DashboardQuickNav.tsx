import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { SECTION_META } from '@/lib/dashboard-sections'
import { FEATURE_ICONS, customSectionIcon } from '@/lib/feature-icons'
import type { DashboardSectionId } from '@/types'

/** Short rail label per built-in section. The full name (tooltip, aria) comes from
 *  SECTION_META and the icon from FEATURE_ICONS, so the rail, Dashboard Layout,
 *  the dashboard cards and the Navigation menu never disagree. */
const SECTION_SHORT: Record<DashboardSectionId, string> = {
  hero:            'Overview',
  kakeibo:         'Kakeibo',
  wealth_summary:  'Wealth',
  budget_strategy: 'Strategy',
  affordability:   'Afford',
  daily_challenge: 'Challenge',
  metrics:         'Money',
  cashflow:        'Forecast',
  commitments:     'Bills',
  goals:           'Goals',
  accounts:        'Accounts',
  savings:         'Savings',
  borrowing:       'Borrowings',
  credit_cards:    'Cards',
  events:          'Events',
  projects:        'Projects',
  analytics:       'Analytics',
  recent_txns:     'Transactions',
}

interface NavItem { id: string; label: string; short: string; Icon: LucideIcon }

function navItem(id: string, customLabel: string | undefined): NavItem | null {
  if (id.startsWith('custom__')) {
    const label = customLabel || 'Custom'
    return { id, label, short: label, Icon: customSectionIcon(label).Icon }
  }
  const short = SECTION_SHORT[id as DashboardSectionId]
  if (!short) return null
  return { id, short, label: SECTION_META[id as DashboardSectionId]?.label ?? short, Icon: FEATURE_ICONS[id as DashboardSectionId] }
}

/** A single shortcut is just a link to wherever the user already is — not worth the screen space. */
const MIN_ITEMS = 2
/** Rail width in the side gutter (desktop); the compact rail is wider to fit labels. */
const RAIL_W = 48
const GUTTER_GAP = 20
/** A section is "current" once its top passes this fraction of the area below the header. */
const READING_LINE = 0.3
/** Gap left between the header and a section after jumping to it. */
const SCROLL_PAD = 12
/** No scroll event for this long = a programmatic smooth scroll has finished. */
const SCROLL_SETTLE_MS = 150
const SCROLL_LOCK_MAX_MS = 1500
/** The compact (mobile) rail folds back into its edge tab after this long untouched. */
const COMPACT_IDLE_MS = 4000

const SECTION_SELECTOR = '[data-dash-sections] > [data-dash-section]'
const sectionEl = (id: string) => document.querySelector<HTMLElement>(`[data-dash-section="${id}"]`)
const headerHeight = () => document.querySelector<HTMLElement>('[data-dashboard-header]')?.offsetHeight ?? 72
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** The rail mirrors the dashboard: every section actually rendered, in the order
 *  it appears (so it follows the user's Dashboard Layout and every visibility
 *  rule without knowing any of them). A wrapper whose card rendered nothing is
 *  skipped. Encoded as one string — a stable primitive, so useSyncExternalStore
 *  re-renders only when the list really changes. */
const readSections = () =>
  Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR))
    .filter(el => el.firstElementChild)
    .map(el => `${el.dataset.dashSection}\u0001${el.dataset.dashLabel ?? ''}`)
    .join('\u0002')
/** Section wrappers are direct children of App's `[data-dash-sections]` column, so
 *  its child list catches a section appearing, leaving or being reordered. The
 *  snapshot is also re-read on every render, which covers a card going empty. */
const subscribeSections = (onChange: () => void) => {
  const column = document.querySelector('[data-dash-sections]')
  if (!column) return () => {}
  const mo = new MutationObserver(onChange)
  mo.observe(column, { childList: true })
  return () => mo.disconnect()
}

interface DashboardQuickNavProps {
  /** True whenever anything covers the dashboard (sheet, page, onboarding, tour). */
  hidden: boolean
  containerWidth: number
  windowWidth: number
}

export function DashboardQuickNav({ hidden, containerWidth, windowWidth }: DashboardQuickNavProps) {
  const c = useTheme()
  const [active, setActive] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  const [edges, setEdges] = useState({ above: false, below: false })
  const activeRef = useRef<string | null>(null)
  const lockRef = useRef<{ settle: number; max: number } | null>(null)
  const railRef = useRef<HTMLElement>(null)
  const idleRef = useRef<number | null>(null)
  const releaseLockRef = useRef<() => void>(() => {})
  const indRef = useRef<HTMLSpanElement>(null)

  // Desktop has an empty gutter beside the 720px column: the rail lives there and
  // never covers a card. Narrower screens have only the 16px content gutter, so
  // the rail folds into an edge tab and opens on demand instead.
  const margin = (windowWidth - containerWidth) / 2
  const gutter = margin >= RAIL_W + GUTTER_GAP * 2
  const railLeft = gutter ? margin - RAIL_W - GUTTER_GAP : 0

  const sectionsKey = useSyncExternalStore(subscribeSections, readSections)
  const items = useMemo(() => (sectionsKey ? sectionsKey.split('\u0002') : [])
    .map(entry => { const [id, label] = entry.split('\u0001'); return navItem(id, label) })
    .filter((i): i is NavItem => !!i), [sectionsKey])
  const visible = !hidden && items.length >= MIN_ITEMS
  const open = visible && !gutter && expanded

  const updateActive = useCallback(() => {
    if (lockRef.current) return
    const top = headerHeight()
    const vh = window.innerHeight
    const line = top + (vh - top) * READING_LINE
    const rects = items
      .map(({ id }) => ({ id, el: sectionEl(id) }))
      .filter((e): e is { id: string; el: HTMLElement } => !!e.el)
      .map(({ id, el }) => ({ id, r: el.getBoundingClientRect() }))
    const onScreen = rects.filter(({ r }) => r.bottom > top && r.top < vh)

    let next: string | null = null
    const atEnd = window.scrollY + vh >= document.documentElement.scrollHeight - 4
    if (atEnd) {
      // A short last section can never reach the reading line, so at the bottom
      // keep the section the user is already on (typically the one just tapped)
      // if it's still on screen, otherwise the lowest one showing.
      next = onScreen.some(s => s.id === activeRef.current) ? activeRef.current : onScreen[onScreen.length - 1]?.id ?? null
    } else {
      // Every section is a shortcut, so the current one is simply the last whose
      // top has crossed the reading line; above the first, nothing is.
      for (const { id, r } of rects) if (r.top <= line && r.bottom > top) next = id
    }
    if (next !== activeRef.current) {
      activeRef.current = next
      setActive(next)
    }
  }, [items])

  // Scroll-spy. A rAF-throttled passive listener over the section rects rather
  // than IntersectionObserver: IO can't express "the last section whose top passed
  // the line" or "the page can't scroll any further", and both decide what's active.
  useEffect(() => {
    if (!visible) return
    let frame: number | null = null
    const onScroll = () => {
      setTip(null)
      if (lockRef.current) {
        // A jump is in flight: wait for it to settle instead of flickering
        // through every section it passes.
        window.clearTimeout(lockRef.current.settle)
        lockRef.current.settle = window.setTimeout(releaseLock, SCROLL_SETTLE_MS)
        return
      }
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; updateActive() })
    }
    const releaseLock = () => {
      if (!lockRef.current) return
      window.clearTimeout(lockRef.current.settle)
      window.clearTimeout(lockRef.current.max)
      lockRef.current = null
      updateActive()
    }
    releaseLockRef.current = releaseLock
    updateActive()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [visible, updateActive])

  // A long dashboard makes a rail taller than the screen: it scrolls inside
  // itself, fades at whichever end has more, and keeps the current item in view.
  const readEdges = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const next = { above: rail.scrollTop > 2, below: rail.scrollTop + rail.clientHeight < rail.scrollHeight - 2 }
    setEdges(prev => (prev.above === next.above && prev.below === next.below ? prev : next))
  }, [])
  useEffect(() => {
    const rail = railRef.current
    if (!rail || !visible) return
    const ro = new ResizeObserver(readEdges)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [visible, gutter, readEdges])
  useEffect(() => {
    const rail = railRef.current
    const btn = active ? rail?.querySelector<HTMLElement>(`[data-nav-id="${active}"]`) : null
    if (!rail || !btn) return
    const pad = 8
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth'
    if (btn.offsetTop < rail.scrollTop + pad) rail.scrollTo({ top: btn.offsetTop - pad, behavior })
    else if (btn.offsetTop + btn.offsetHeight > rail.scrollTop + rail.clientHeight - pad)
      rail.scrollTo({ top: btn.offsetTop + btn.offsetHeight - rail.clientHeight + pad, behavior })
  }, [active, open])

  // The active highlight is one pill that slides to the current item rather than a
  // background that jumps between buttons. Written straight to the DOM: it is pure
  // presentation and must land before paint. Its first placement (or a remount on a
  // gutter <-> compact switch) is instant and only fades in, so it never flies in
  // from the top of the rail.
  useLayoutEffect(() => {
    const ind = indRef.current
    if (!ind) return
    const btn = active ? railRef.current?.querySelector<HTMLElement>(`[data-nav-id="${active}"]`) : null
    if (!btn) { ind.dataset.shown = 'false'; return }
    const first = ind.dataset.shown !== 'true'
    if (first) ind.style.transition = 'none'
    ind.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`
    ind.style.width = `${btn.offsetWidth}px`
    ind.style.height = `${btn.offsetHeight}px`
    if (first) { void ind.offsetHeight; ind.style.transition = '' }
    ind.dataset.shown = 'true'
  }, [active, items, gutter])

  // Compact rail: fold back on outside tap, Escape, or after a while untouched.
  const armIdle = useCallback(() => {
    if (idleRef.current !== null) window.clearTimeout(idleRef.current)
    idleRef.current = window.setTimeout(() => setExpanded(false), COMPACT_IDLE_MS)
  }, [])
  useEffect(() => {
    if (!open) return
    armIdle()
    const onDown = (e: PointerEvent) => { if (!railRef.current?.contains(e.target as Node)) setExpanded(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      if (idleRef.current !== null) window.clearTimeout(idleRef.current)
    }
  }, [open, armIdle])

  const jumpTo = (id: string) => {
    const el = sectionEl(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - headerHeight() - SCROLL_PAD
    const max = document.documentElement.scrollHeight - window.innerHeight
    const target = Math.max(0, Math.min(top, max))

    activeRef.current = id
    setActive(id)
    if (lockRef.current) { window.clearTimeout(lockRef.current.settle); window.clearTimeout(lockRef.current.max) }
    lockRef.current = {
      // Already in place → no scroll events → this settle timer still releases the lock.
      settle: window.setTimeout(() => releaseLockRef.current(), SCROLL_SETTLE_MS),
      max: window.setTimeout(() => releaseLockRef.current(), SCROLL_LOCK_MAX_MS),
    }
    window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    if (!gutter) setExpanded(false)
  }

  // The tooltip is one fixed element outside the rail — the rail scrolls, and
  // anything inside a scroll container is clipped by it.
  const showTip = (btn: HTMLElement, label: string) => {
    const r = btn.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2, left: r.right + 12 })
  }

  // Stays mounted while something covers the dashboard, so it can fade out and back
  // in rather than blinking; data-hidden makes it inert meanwhile.
  if (items.length < MIN_ITEMS) return null
  const focusable = gutter ? visible : open

  const vars = {
    '--dqn-surface': c.surface,
    '--dqn-surface2': c.surface2,
    '--dqn-faint': c.faint,
    '--dqn-ink': c.ink,
    '--dqn-muted': c.muted,
    '--dqn-accent': c.accent,
    '--dqn-accent-soft': c.accentSoft,
    '--dqn-tip-bg': c.ink,
    '--dqn-tip-fg': c.bg,
    '--dqn-shadow': c.cardShadow,
  } as React.CSSProperties

  const rail = (
    <nav
      ref={railRef}
      aria-label="Jump to dashboard section"
      className={`mp-dqn ${gutter ? 'mp-dqn--gutter' : 'mp-dqn--compact'}`}
      data-open={gutter || open ? 'true' : 'false'}
      data-hidden={visible ? undefined : 'true'}
      data-more-above={edges.above ? 'true' : undefined}
      data-more-below={edges.below ? 'true' : undefined}
      aria-hidden={focusable ? undefined : true}
      onScroll={() => { readEdges(); setTip(null); if (!gutter) armIdle() }}
      onPointerMove={gutter ? undefined : armIdle}
      style={{ ...vars, left: gutter ? railLeft : undefined }}
    >
      <span ref={indRef} className="mp-dqn__ind" aria-hidden />
      {items.map(({ id, label, short, Icon }, i) => {
        const isActive = active === id
        return (
          <button
            key={id}
            type="button"
            data-nav-id={id}
            className="mp-dqn__item"
            aria-label={label}
            aria-current={isActive ? 'true' : undefined}
            tabIndex={focusable ? 0 : -1}
            style={{ '--dqn-i': Math.min(i, 8) } as React.CSSProperties}
            onClick={() => jumpTo(id)}
            onPointerEnter={gutter ? e => { if (e.pointerType === 'mouse') showTip(e.currentTarget, label) } : undefined}
            onPointerLeave={gutter ? () => setTip(null) : undefined}
            onFocus={gutter ? e => { if (e.currentTarget.matches(':focus-visible')) showTip(e.currentTarget, label) } : undefined}
            onBlur={gutter ? () => setTip(null) : undefined}
          >
            <Icon size={gutter ? 18 : 19} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
            {!gutter && <span className="mp-dqn__label">{short}</span>}
          </button>
        )
      })}
    </nav>
  )

  const tooltip = gutter && visible && tip && (
    <div className="mp-dqn-tip" role="presentation" style={{ ...vars, top: tip.top, left: tip.left }}>{tip.label}</div>
  )

  if (gutter) return <>{rail}{tooltip}</>

  return (
    <>
      <button
        type="button"
        className="mp-dqn-tab"
        data-open={open ? 'true' : 'false'}
        data-active={active ? 'true' : 'false'}
        data-hidden={visible ? undefined : 'true'}
        tabIndex={visible ? 0 : -1}
        aria-hidden={visible ? undefined : true}
        aria-label="Jump to dashboard section"
        aria-expanded={open}
        onClick={() => setExpanded(true)}
        style={vars}
      >
        <span className="mp-dqn-tab__face">
          <ChevronRight size={13} strokeWidth={2.6} aria-hidden />
        </span>
      </button>
      {rail}
    </>
  )
}
