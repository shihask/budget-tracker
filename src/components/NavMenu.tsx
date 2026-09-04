import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'

interface NavMenuProps {
  open: boolean
  onClose: () => void
  onTransactions: () => void
  onAnalytics: () => void
  onCashflow: () => void
  onCommitments: () => void
  onSavings: () => void
  onBorrowing: () => void
  onProjects: () => void
  onEvents: () => void
  onCreate: () => void
  onGrow: () => void
  onPlant: () => void
  onMasters: () => void
  onCategories: () => void
  onSettings: () => void
  trackSavings: boolean
  trackBorrowings: boolean
  trackProjects: boolean
  hasEvents: boolean
}

function NavIcon({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  )
}

export function NavMenu({
  open, onClose,
  onTransactions, onAnalytics, onCashflow, onCommitments, onSavings, onBorrowing, onProjects, onEvents, onCreate, onGrow, onPlant, onMasters, onCategories, onSettings,
  trackSavings, trackBorrowings, trackProjects, hasEvents,
}: NavMenuProps) {
  const c = useTheme()
  const items: { id: string; label: string; icon: React.ReactNode; onClick: () => void; hidden?: boolean }[] = [
    {
      // First, and never hidden — this is the feature-discovery surface now that
      // Life Events has no settings toggle.
      id: 'create', label: 'Create new', onClick: onCreate,
      icon: <NavIcon color={c.ink}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></NavIcon>,
    },
    {
      id: 'transactions', label: 'Transactions', onClick: onTransactions,
      icon: <NavIcon color={c.ink}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></NavIcon>,
    },
    {
      id: 'analytics', label: 'Analytics', onClick: onAnalytics,
      icon: <NavIcon color={c.ink}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></NavIcon>,
    },
    {
      id: 'cashflow', label: 'Cash Flow Forecast', onClick: onCashflow,
      icon: <NavIcon color={c.ink}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></NavIcon>,
    },
    {
      id: 'commitments', label: 'Bills & Obligations', onClick: onCommitments,
      icon: <NavIcon color={c.ink}><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></NavIcon>,
    },
    {
      id: 'savings', label: 'Savings & Investments', onClick: onSavings, hidden: !trackSavings,
      icon: <NavIcon color={c.ink}><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h3"/><path d="M3 9h13a2 2 0 012 2"/></NavIcon>,
    },
    {
      id: 'borrowing', label: 'Lend & Borrow', onClick: onBorrowing, hidden: !trackBorrowings,
      icon: <NavIcon color={c.ink}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></NavIcon>,
    },
    {
      id: 'events', label: 'Life Events', onClick: onEvents, hidden: !hasEvents,
      icon: <NavIcon color={c.ink}><path d="M3 10h18"/><path d="M21 12V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7"/><path d="M8 2v4"/><path d="M16 2v4"/><circle cx="18" cy="18" r="3"/></NavIcon>,
    },
    {
      id: 'projects', label: 'Projects', onClick: onProjects, hidden: !trackProjects,
      icon: <NavIcon color={c.ink}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></NavIcon>,
    },
    {
      id: 'grow', label: 'Grow', onClick: onGrow,
      icon: <NavIcon color={c.ink}><path d="M12 2v8"/><path d="M12 22c-4-2-7-6-7-11 4 0 7 2 7 6 0-4 3-6 7-6 0 5-3 9-7 11z"/></NavIcon>,
    },
    {
      id: 'plant', label: 'Plant', onClick: onPlant,
      icon: <NavIcon color={c.ink}><path d="M12 21V10"/><path d="M12 10c-4 0-7-2-7-6 4 0 7 2 7 6z"/><path d="M12 10c4 0 7-2 7-6-4 0-7 2-7 6z"/></NavIcon>,
    },
    {
      // Sits with Categories rather than in Settings: this is the directory's
      // only entry point, and the panel's Data section is its sixth and last —
      // the same burial that made Life Events undiscoverable in v1.57.
      id: 'masters', label: 'Masters', onClick: onMasters,
      icon: <NavIcon color={c.ink}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></NavIcon>,
    },
    {
      id: 'categories', label: 'Categories', onClick: onCategories,
      icon: <NavIcon color={c.ink}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></NavIcon>,
    },
    {
      id: 'settings', label: 'Settings', onClick: onSettings,
      icon: <NavIcon color={c.ink}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></NavIcon>,
    },
  ]

  const rowStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 10px', background: 'none', border: 'none',
    borderRadius: 12, cursor: 'pointer', textAlign: 'left',
    font: '700 14px Plus Jakarta Sans', color: c.ink,
    minHeight: 44,
  }

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={300} showHelpButton={false}>
      <div style={{ padding: '4px 0 8px' }}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', marginBottom: 10 }}>
          Navigation
        </div>
        <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.filter(item => !item.hidden).map(item => (
            <button
              key={item.id}
              role="menuitem"
              style={rowStyle}
              onClick={() => { onClose(); item.onClick() }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
