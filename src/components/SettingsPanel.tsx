import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { ACCENT_OPTIONS } from '@/lib/tokens'
import type { Layout } from '@/types'

interface SettingsPanelProps {
  accent: string
  dark: boolean
  layout: Layout
  emergencyFund: number
  salaryDate: number | null
  onAccent: (v: string) => void
  onDark: (v: boolean) => void
  onLayout: (v: Layout) => void
  onEmergencyFund: (v: number) => Promise<void>
  onSalaryDate: (v: number | null) => Promise<void>
}

export function SettingsPanel({ accent, dark, layout, emergencyFund, salaryDate, onAccent, onDark, onLayout, onEmergencyFund, onSalaryDate }: SettingsPanelProps) {
  const c = useTheme()
  const [emergencyInput, setEmergencyInput] = useState(String(emergencyFund))
  const [salaryInput, setSalaryInput] = useState(String(salaryDate || ''))
  const [savingEmergency, setSavingEmergency] = useState(false)
  const [savingSalary, setSavingSalary] = useState(false)

  const handleEmergencySave = async () => {
    const v = parseFloat(emergencyInput)
    if (isNaN(v) || v < 0) return
    setSavingEmergency(true)
    try { await onEmergencyFund(v) } catch (_) {}
    setSavingEmergency(false)
  }

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

      <div style={sectionLabel}>Dashboard cards</div>
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
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 8 }}>Emergency fund reserve</div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <span style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none',
          }}>₹</span>
          <input
            type="number"
            value={emergencyInput}
            onChange={e => setEmergencyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEmergencySave()}
            style={{
              width: '100%', background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 11, padding: '11px 12px 11px 26px',
              font: '800 16px Plus Jakarta Sans', color: c.ink,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={handleEmergencySave}
          disabled={savingEmergency}
          style={{
            width: '100%', background: c.warn, color: '#fff', border: 'none',
            borderRadius: 11, padding: '11px', marginBottom: 16,
            font: '700 13px Plus Jakarta Sans',
            cursor: savingEmergency ? 'not-allowed' : 'pointer', opacity: savingEmergency ? 0.6 : 1,
          }}
        >
          {savingEmergency ? 'Saving...' : 'Save Emergency Fund'}
        </button>

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
