// Inline SVG glyphs matching the prototype exactly
// (same paths as in cards.jsx Glyph component)

interface GlyphProps {
  name: GlyphName
  color: string
  size?: number
}

export type GlyphName = 'wallet' | 'shield' | 'spark' | 'lock' | 'doc' | 'cal' | 'cart' | 'check' | 'plus' | 'close' | 'sun' | 'moon'

const PATHS: Record<GlyphName, React.ReactNode> = {
  wallet: <><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h3"/><path d="M3 9h13a2 2 0 012 2"/></>,
  shield: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>,
  spark:  <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>,
  lock:   <><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/></>,
  doc:    <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></>,
  cal:    <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></>,
  cart:   <><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.5 11h10l2-7H6"/></>,
  check:  <path d="M5 12l5 5 9-11"/>,
  plus:   <path d="M12 5v14M5 12h14"/>,
  close:  <path d="M6 6l12 12M18 6L6 18"/>,
  sun:    <><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></>,
  moon:   <path d="M21 12.8A8.5 8.5 0 1111.2 3a6.6 6.6 0 009.8 9.8z"/>,
}

export function Glyph({ name, color, size = 16 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  )
}
