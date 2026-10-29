import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from '@/lib/theme-context'

// "More options" disclosure shared by Quick Add and the transaction edit sheets.
// One bordered box holds both the toggle and its fields, so the expanded fields
// read as belonging to it.
//
// "More options", not "Advanced": nothing in here is advanced, it's just
// optional, and "Advanced" wrongly signals risky or expert. The count only
// appears while collapsed — once open the fields speak for themselves.
export function MoreOptions({ open, onToggle, setCount = 0, children }: {
  open: boolean
  onToggle: () => void
  /** Optional values already set — shown as "· N set" while collapsed. */
  setCount?: number
  children: ReactNode
}) {
  const c = useTheme()

  // Expand/collapse animation (.mp-collapse in index.css). The body stays
  // mounted only while closing so the height can animate down; once collapsed
  // it unmounts, so collapsed fields behave exactly as if never rendered.
  // Opening mounts at 0fr first, then expands on the next frame so the
  // transition has a start value.
  const [rendered, setRendered] = useState(open)
  const [expanded, setExpanded] = useState(open)
  // Clip only while animating — once open, absolute dropdowns inside
  // (MasterSelect) must be able to overflow the box.
  const [settled, setSettled] = useState(open)
  // React to `open` flipping during render, not in an effect. An initially-open
  // section never enters here, so it has nothing to animate.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setSettled(false)
    if (open) setRendered(true)
    else setExpanded(false)
  }
  useEffect(() => {
    if (!open || expanded) return
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setExpanded(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [open, expanded])

  return (
    <div style={{ border: `1.5px solid ${c.faint}`, borderRadius: 12 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12,
          border: 'none', background: 'transparent', color: c.muted,
          font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span>
          More options
          {!open && setCount > 0 && ` · ${setCount} set`}
        </span>
      </button>

      {rendered && (
        <div
          className="mp-collapse"
          data-open={expanded}
          aria-hidden={!expanded}
          onTransitionEnd={e => {
            if (e.target !== e.currentTarget || e.propertyName !== 'grid-template-rows') return
            if (expanded) setSettled(true)
            else setRendered(false)
          }}
        >
          <div style={{ minHeight: 0, overflow: expanded && settled ? 'visible' : 'hidden' }}>
            <div className="mp-collapse__body" style={{ padding: '0 12px 14px', borderTop: `1px solid ${c.faint}` }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
