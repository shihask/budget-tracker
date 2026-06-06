import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { DashboardSection, DashboardSectionId, Settings } from '@/types'
import { DEFAULT_DASHBOARD_SECTIONS } from '@/types'

const LOCKED_IDS: DashboardSectionId[] = ['hero', 'affordability']

const SECTION_META: Record<DashboardSectionId, { label: string; desc: string }> = {
  hero:          { label: 'Weekly Overview',        desc: 'Spending vs budget & week summary' },
  affordability: { label: 'Affordability Checker',  desc: 'Can I afford this purchase?' },
  metrics:       { label: 'Your Money',             desc: 'Balance, savings & key metrics' },
  commitments:   { label: 'Commitments',            desc: 'Bills & recurring payments' },
  accounts:      { label: 'Accounts',               desc: 'Bank & cash account balances' },
  borrowing:     { label: 'Borrowing',              desc: 'Money lent & borrowed' },
  credit_cards:  { label: 'Credit Cards',           desc: 'Card balances & due dates' },
  analytics:     { label: 'Analytics',              desc: 'Spending trends & charts' },
  renovation:    { label: 'Renovation',             desc: 'Project budget tracker' },
  recent_txns:   { label: 'Recent Transactions',    desc: 'Latest activity' },
}

interface Props {
  sections: DashboardSection[]
  settings: Settings
  onUpdate: (sections: DashboardSection[]) => Promise<void>
  onClose: () => void
}

export function DashboardLayoutPage({ sections, settings, onUpdate, onClose }: Props) {
  const c = useTheme()

  // Merge stored sections with any new defaults (handles future new sections)
  const merged = (() => {
    const ids = sections.map(s => s.id)
    const missing = DEFAULT_DASHBOARD_SECTIONS.filter(s => !ids.includes(s.id))
    return [...sections, ...missing]
  })()

  const [local, setLocal] = useState<DashboardSection[]>(merged)

  useEffect(() => {
    setLocal(merged)
  }, [sections])

  const lockedSections = local.filter(s => LOCKED_IDS.includes(s.id))
  const freeSections   = local.filter(s => !LOCKED_IDS.includes(s.id))

  const commit = async (newFree: DashboardSection[]) => {
    const updated = [...lockedSections, ...newFree]
    setLocal(updated)
    await onUpdate(updated)
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...freeSections]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    commit(next)
  }

  const moveDown = (i: number) => {
    if (i === freeSections.length - 1) return
    const next = [...freeSections]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    commit(next)
  }

  const toggleVisible = (i: number) => {
    commit(freeSections.map((s, idx) => idx === i ? { ...s, visible: !s.visible } : s))
  }

  const handleReset = async () => {
    const reset = DEFAULT_DASHBOARD_SECTIONS.map(s => ({ ...s }))
    setLocal(reset)
    await onUpdate(reset)
  }

  const featureDisabled = (id: DashboardSectionId) => {
    if (id === 'borrowing')    return !(settings.track_borrowings ?? true)
    if (id === 'credit_cards') return !(settings.track_credit_cards ?? false)
    return false
  }

  // ── Shared sub-components ────────────────────────────────────────────────────

  const ChevronUp = () => (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 15l6-6 6 6" />
    </svg>
  )
  const ChevronDown = () => (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
  const LockIcon = () => (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke={c.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )

  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '16px 0 8px',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: c.bg, zIndex: 300,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: `calc(14px + env(safe-area-inset-top, 0px)) 16px 14px`,
        borderBottom: `1px solid ${c.faint}`,
        display: 'flex', alignItems: 'center', gap: 12,
        background: c.bg, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: 999, border: 'none',
            background: c.surface2, cursor: 'pointer', color: c.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>Dashboard Layout</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Reorder & show/hide sections</div>
        </div>
        <button
          onClick={handleReset}
          style={{
            background: 'none', border: `1.5px solid ${c.faint}`, borderRadius: 10,
            padding: '7px 14px', font: '700 12px Plus Jakarta Sans',
            color: c.muted, cursor: 'pointer', flexShrink: 0,
          }}
        >
          Reset
        </button>
      </div>

      {/* ── Scrollable list ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 16px calc(24px + env(safe-area-inset-bottom, 0px))` }}>

        {/* Locked group */}
        <div style={sectionLabel}>Always shown</div>
        {lockedSections.map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0', borderBottom: `1px solid ${c.faint}`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: c.surface2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <LockIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{SECTION_META[s.id].label}</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{SECTION_META[s.id].desc}</div>
            </div>
            <div style={{
              font: '700 11px Plus Jakarta Sans', color: c.muted,
              background: c.surface2, padding: '4px 9px', borderRadius: 7,
            }}>
              Locked
            </div>
          </div>
        ))}

        {/* Free sections */}
        <div style={sectionLabel}>Customizable</div>
        {freeSections.map((s, i) => {
          const disabled = featureDisabled(s.id)
          const isFirst  = i === 0
          const isLast   = i === freeSections.length - 1

          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0', borderBottom: `1px solid ${c.faint}`,
              opacity: disabled ? 0.45 : 1,
            }}>
              {/* Up / Down */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                <button
                  onClick={() => moveUp(i)}
                  disabled={isFirst}
                  style={{
                    width: 28, height: 26, border: 'none', borderRadius: 7, cursor: isFirst ? 'default' : 'pointer',
                    background: isFirst ? 'transparent' : c.surface2, color: c.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: isFirst ? 0.15 : 1,
                  }}
                >
                  <ChevronUp />
                </button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={isLast}
                  style={{
                    width: 28, height: 26, border: 'none', borderRadius: 7, cursor: isLast ? 'default' : 'pointer',
                    background: isLast ? 'transparent' : c.surface2, color: c.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: isLast ? 0.15 : 1,
                  }}
                >
                  <ChevronDown />
                </button>
              </div>

              {/* Label */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{SECTION_META[s.id].label}</span>
                  {disabled && (
                    <span style={{
                      font: '600 10px Plus Jakarta Sans', color: c.muted,
                      background: c.surface2, padding: '2px 7px', borderRadius: 5,
                    }}>
                      Feature off
                    </span>
                  )}
                </div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{SECTION_META[s.id].desc}</div>
              </div>

              {/* Visibility toggle */}
              <button
                onClick={() => { if (!disabled) toggleVisible(i) }}
                style={{
                  width: 44, height: 26, borderRadius: 999, border: 'none',
                  cursor: disabled ? 'default' : 'pointer',
                  background: (s.visible && !disabled) ? c.accent : c.surface2,
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999,
                  background: '#fff', transition: 'left 0.2s',
                  left: (s.visible && !disabled) ? 21 : 3,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          )
        })}

        {/* Footer hint */}
        <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textAlign: 'center', paddingTop: 20 }}>
          Changes save automatically
        </div>
      </div>
    </div>
  )
}
