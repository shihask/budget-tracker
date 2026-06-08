import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { Glyph } from './Glyph'

interface HeaderProps {
  dark: boolean
  onToggleTheme: () => void
  userName: string
  userEmail: string
  synced: boolean
  onSignOut: () => void
  onSettings: () => void
  onCategories: () => void
}

export function Header({ dark, onToggleTheme, userName, userEmail, synced, onSignOut, onSettings, onCategories }: HeaderProps) {
  const c = useTheme()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const initials = userName.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const iconBtnStyle: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 999,
    background: c.surface, border: `1px solid ${c.faint}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: c.cardShadow,
  }

  const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', background: 'none', border: 'none',
    borderRadius: 10, cursor: 'pointer',
    font: '700 13px Plus Jakarta Sans', textAlign: 'left',
    color: c.ink,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 14px' }}>
      {/* Logo + App name + Greeting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {/* Icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="36" height="36" style={{ flexShrink: 0, borderRadius: 10, boxShadow: `0 2px 8px #16C98A55` }}>
          <defs>
            <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#16C98A"/>
              <stop offset="100%" stopColor="#0A7A56"/>
            </linearGradient>
          </defs>
          <rect width="100" height="100" rx="22.5" fill="url(#hbg)"/>
          <circle cx="50" cy="64" r="25.5" fill="none" stroke="#FFFFFF" strokeWidth="5.2"/>
          <circle cx="50" cy="64" r="19.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.45"/>
          <text x="50" y="65.5" textAnchor="middle" dominantBaseline="central"
            fontFamily="'Plus Jakarta Sans', 'Montserrat', Arial, sans-serif" fontWeight="800" fontSize="30" fill="#FFFFFF">₹</text>
          <path d="M50 42 V 26" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round"/>
          <path d="M49.4 33.5 C 41.6 33.5 36.2 29.1 34.3 21 C 42.1 21 47.5 25.4 49.4 33.5 Z" fill="#FFFFFF"/>
          <path d="M50.6 33.5 C 58.4 33.5 63.8 29.1 65.7 21 C 57.9 21 52.5 25.4 50.6 33.5 Z" fill="#FFFFFF"/>
          <g fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.42">
            <path d="M46.5 30.5 C 43.5 28 40.5 25.8 37.5 24.5"/>
            <path d="M53.5 30.5 C 56.5 28 59.5 25.8 62.5 24.5"/>
          </g>
        </svg>
        <div>
          <div style={{ font: '800 15px Plus Jakarta Sans', letterSpacing: '-0.01em' }}>
            <span style={{ color: c.ink }}>Money</span><span style={{ color: '#16C98A' }}>Plant</span>
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, letterSpacing: '0.01em', marginTop: 1 }}>
            {greeting}, {userName}
          </div>
        </div>
      </div>

      {/* Right: theme toggle + avatar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onToggleTheme} aria-label="Toggle theme" style={iconBtnStyle}>
          <Glyph name={dark ? 'sun' : 'moon'} color={c.ink} size={18} />
        </button>

        {/* Avatar + dropdown */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              width: 40, height: 40, borderRadius: 999,
              background: c.accent, color: '#fff',
              font: '800 15px Plus Jakarta Sans',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, border: 'none', cursor: 'pointer',
              position: 'relative',
            }}
          >
            {initials}
            <span style={{
              position: 'absolute', bottom: 1, right: 1,
              width: 10, height: 10, borderRadius: 999,
              background: synced ? '#22C55E' : '#F59E0B',
              border: `2px solid ${c.bg}`,
            }} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 48, right: 0, zIndex: 400,
              background: c.surface, borderRadius: 16, padding: '6px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
              border: `1px solid ${c.faint}`,
              minWidth: 210,
            }}>
              {/* User info */}
              <div style={{ padding: '10px 12px 8px' }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{userName}</div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>{userEmail}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: synced ? '#22C55E18' : '#F59E0B18', borderRadius: 999, padding: '3px 8px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: synced ? '#22C55E' : '#F59E0B', flexShrink: 0 }} />
                  <span style={{ font: '600 10px Plus Jakarta Sans', color: synced ? '#22C55E' : '#F59E0B' }}>
                    {synced ? 'Synced with cloud' : 'Offline — local data'}
                  </span>
                </div>
              </div>

              <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />

              {/* Categories */}
              <button
                onClick={() => { setMenuOpen(false); onCategories() }}
                style={menuItemStyle}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                Categories
              </button>

              <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />

              {/* Settings */}
              <button
                onClick={() => { setMenuOpen(false); onSettings() }}
                style={menuItemStyle}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
                Settings
              </button>

              <div style={{ height: 1, background: c.faint, margin: '4px 0' }} />

              {/* Sign out */}
              <button
                onClick={() => { setMenuOpen(false); onSignOut() }}
                style={{ ...menuItemStyle, color: c.bad }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
