import { useTheme } from '@/lib/theme-context'
import { Glyph } from './Glyph'

interface HeaderProps {
  dark: boolean
  onToggleTheme: () => void
}

export function Header({ dark, onToggleTheme }: HeaderProps) {
  const c = useTheme()

  const iconBtnStyle: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 999,
    background: c.surface, border: `1px solid ${c.faint}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: c.cardShadow,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 14px' }}>
      <div>
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.01em' }}>
          Good morning
        </div>
        <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginTop: 2 }}>
          Rahul Menon
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onToggleTheme} aria-label="Toggle theme" style={iconBtnStyle}>
          <Glyph name={dark ? 'sun' : 'moon'} color={c.ink} size={18} />
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: 999,
          background: c.accent, color: '#fff',
          font: '800 15px Plus Jakarta Sans',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          RM
        </div>
      </div>
    </div>
  )
}
