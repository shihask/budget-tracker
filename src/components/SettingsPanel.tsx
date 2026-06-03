import { useTheme } from '@/lib/theme-context'
import { ACCENT_OPTIONS } from '@/lib/tokens'
import type { Layout } from '@/types'

interface SettingsPanelProps {
  accent: string
  dark: boolean
  layout: Layout
  onAccent: (v: string) => void
  onDark: (v: boolean) => void
  onLayout: (v: Layout) => void
}

export function SettingsPanel({ accent, dark, layout, onAccent, onDark, onLayout }: SettingsPanelProps) {
  const c = useTheme()

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

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 280,
      background: c.surface, borderLeft: `1px solid ${c.faint}`,
      padding: '60px 20px 20px', zIndex: 200,
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
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
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
