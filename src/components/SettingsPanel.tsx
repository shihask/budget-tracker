import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { ACCENT_OPTIONS } from '@/lib/tokens'
import type { Layout } from '@/types'

interface SettingsPanelProps {
  accent: string
  dark: boolean
  layout: Layout
  salaryDate: number | null
  trackCreditCards: boolean
  trackBorrowings: boolean
  autopilotEnabled: boolean
  aiRequestsUsed: number
  aiRequestsResetAt: string | null
  onAccent: (v: string) => void
  onDark: (v: boolean) => void
  onLayout: (v: Layout) => void
  onSalaryDate: (v: number | null) => Promise<void>
  onTrackCreditCards: (v: boolean) => Promise<void>
  onTrackBorrowings: (v: boolean) => Promise<void>
  onAutopilot: (v: boolean) => Promise<void>
  onDashboardLayout: () => void
}

export function SettingsPanel({ accent, dark, layout, salaryDate, trackCreditCards, trackBorrowings, autopilotEnabled, aiRequestsUsed, aiRequestsResetAt, onAccent, onDark, onLayout, onSalaryDate, onTrackCreditCards, onTrackBorrowings, onAutopilot, onDashboardLayout }: SettingsPanelProps) {
  const c = useTheme()
  const [salaryInput, setSalaryInput] = useState(String(salaryDate || ''))
  const [savingSalary, setSavingSalary] = useState(false)

  const handleSalarySave = async () => {
    const v = parseInt(salaryInput)
    const val = (!salaryInput || isNaN(v)) ? null : Math.min(31, Math.max(1, v))
    setSavingSalary(true)
    try { await onSalaryDate(val) } catch (_) {}
    setSavingSalary(false)
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 0', borderBottom: `1px solid ${c.faint}`,
  }
  const labelStyle: React.CSSProperties = {
    font: '600 13px Plus Jakarta Sans', color: c.ink,
  }
  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '14px 0 6px',
  }

  const panelW = typeof window !== 'undefined' ? Math.min(280, window.innerWidth) : 280

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: panelW,
      background: c.surface, borderLeft: panelW < window.innerWidth ? `1px solid ${c.faint}` : 'none',
      padding: `calc(60px + env(safe-area-inset-top, 0px)) 20px calc(20px + env(safe-area-inset-bottom, 0px))`,
      zIndex: 200,
      boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
      overflowY: 'auto',
    }}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Settings</div>
      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Customize your dashboard</div>

      <div style={sectionLabel}>Dashboard</div>
      <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={onDashboardLayout}>
        <div>
          <div style={labelStyle}>Dashboard Layout</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Reorder & show/hide sections</div>
        </div>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={c.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Card layout</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['grid', 'carousel', 'list'] as Layout[]).map(l => (
            <button
              key={l}
              onClick={() => onLayout(l)}
              style={{
                padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                font: '700 11px Plus Jakarta Sans',
                background: layout === l ? c.accent : c.surface2,
                color: layout === l ? '#fff' : c.muted,
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionLabel}>Budget</div>
      <div style={{ paddingBottom: 4, borderBottom: `1px solid ${c.faint}` }}>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Salary credit date</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            type="number"
            value={salaryInput}
            onChange={e => setSalaryInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSalarySave()}
            placeholder="e.g. 28"
            min="1" max="31"
            style={{
              flex: 1, background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 11, padding: '11px 12px',
              font: '800 16px Plus Jakarta Sans', color: c.ink,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, whiteSpace: 'nowrap' }}>of month</span>
        </div>
        <button
          onClick={handleSalarySave}
          disabled={savingSalary}
          style={{
            width: '100%', background: c.accent, color: '#fff', border: 'none',
            borderRadius: 11, padding: '11px', marginBottom: 14,
            font: '700 13px Plus Jakarta Sans',
            cursor: savingSalary ? 'not-allowed' : 'pointer', opacity: savingSalary ? 0.6 : 1,
          }}
        >
          {savingSalary ? 'Saving...' : 'Save Salary Date'}
        </button>
      </div>

      <div style={sectionLabel}>Features</div>
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Credit card tracking</div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Track billing cycles & due dates</div>
        </div>
        <button
          onClick={() => onTrackCreditCards(!trackCreditCards)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: trackCreditCards ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackCreditCards ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={labelStyle}>Lend & Borrow tracker</div>
            <div style={{ position: 'relative', display: 'inline-flex' }} className="info-tooltip-wrap">
              <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke={c.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'default', flexShrink: 0 }}>
                <circle cx="10" cy="10" r="8" />
                <line x1="10" y1="9" x2="10" y2="14" />
                <circle cx="10" cy="6.5" r="0.8" fill={c.muted} stroke="none" />
              </svg>
              <span style={{
                position: 'absolute', left: '50%', bottom: '120%',
                transform: 'translateX(-50%)',
                background: c.ink, color: c.surface,
                font: '600 10px Plus Jakarta Sans',
                borderRadius: 7, padding: '5px 9px',
                whiteSpace: 'nowrap', pointerEvents: 'none',
                opacity: 0, transition: 'opacity 0.15s',
                zIndex: 999,
              }} className="info-tooltip">
                Track money you lent to others or borrowed from them
              </span>
            </div>
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Track money lent & borrowed</div>
        </div>
        <button
          onClick={() => onTrackBorrowings(!trackBorrowings)}
          style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: trackBorrowings ? c.accent : c.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: trackBorrowings ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
        </button>
      </div>

      {/* PlantMind card — all-in-one */}
      {(() => {
        const now = new Date()
        const resetAt = aiRequestsResetAt ? new Date(aiRequestsResetAt) : null
        const isToday = resetAt != null &&
          resetAt.getFullYear() === now.getFullYear() &&
          resetAt.getMonth() === now.getMonth() &&
          resetAt.getDate() === now.getDate()
        const used = isToday ? (aiRequestsUsed ?? 0) : 0
        const LIMIT = 100
        const pct = Math.min(100, (used / LIMIT) * 100)
        const barColor = pct >= 85 ? '#EF4444' : pct >= 60 ? '#F59E0B' : c.accent
        return (
          <div style={{ background: c.surface, borderRadius: 18, padding: '14px 16px', marginBottom: 16, border: `1px solid ${c.faint}` }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="22" height="22">
                    <path d="M 50 24 C 36 24 27 34 27 47 C 27 61 38 70 50 76 L 50 24 Z" fill="#16C98A"/>
                    <path d="M 50 24 C 64 24 73 34 73 47 C 73 61 62 70 50 76 L 50 24 Z" fill="#16C98A" fillOpacity="0.5"/>
                    <path d="M 50 30 L 50 73" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>PlantMind</span>
                    <span style={{ font: '700 9px Plus Jakarta Sans', color: c.accent, background: `${c.accent}22`, borderRadius: 6, padding: '2px 6px', letterSpacing: '0.04em' }}>AI</span>
                  </div>
                  <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>Your AI-powered financial assistant</div>
                </div>
              </div>
              <button
                onClick={() => onAutopilot(!autopilotEnabled)}
                style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: autopilotEnabled ? c.accent : c.faint, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left 0.2s', left: autopilotEnabled ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: c.faint, marginBottom: 12 }} />

            {/* Quota */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ font: '600 11px Plus Jakarta Sans', color: c.ink }}>
                <span style={{ font: '700 13px Plus Jakarta Sans' }}>{used}</span>
                <span style={{ color: c.muted }}> / {LIMIT} today</span>
              </span>
              <span style={{ font: '600 10px Plus Jakarta Sans', color: c.muted }}>Resets tomorrow</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: c.surface, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: barColor, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: pct >= 85 ? barColor : c.muted, marginTop: 5 }}>
              {pct >= 100 ? 'Daily limit reached. Try again tomorrow.' : `${LIMIT - used} requests remaining`}
            </div>
          </div>
        )
      })()}

      <div style={sectionLabel}>Theme</div>
      <div style={rowStyle}>
        <span style={labelStyle}>Accent color</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {ACCENT_OPTIONS.map(a => (
            <button
              key={a}
              onClick={() => onAccent(a)}
              style={{
                width: 24, height: 24, borderRadius: 999, border: 'none',
                background: a, cursor: 'pointer',
                outline: a === accent ? `2px solid ${c.ink}` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Dark mode</span>
        <button
          onClick={() => onDark(!dark)}
          style={{
            width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: dark ? c.accent : c.surface2,
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 999,
            background: '#fff', transition: 'left 0.2s',
            left: dark ? 21 : 3,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

    </div>
  )
}
