import { useTheme } from '@/lib/theme-context'
import { FEATURE_ICONS, type FeatureKey } from '@/lib/feature-icons'
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
  onCreditCards: () => void
  onProjects: () => void
  onEvents: () => void
  onCreate: () => void
  onGrow: () => void
  onPlant: () => void
  onMasters: () => void
  onCategories: () => void
  onSettings: () => void
  /** Household (shared finances). Undefined hides the row — App passes it only when VITE_HOUSEHOLD is on. */
  onHousehold?: () => void
  trackSavings: boolean
  trackBorrowings: boolean
  trackCreditCards: boolean
  trackProjects: boolean
  hasEvents: boolean
}

export function NavMenu({
  open, onClose,
  onTransactions, onAnalytics, onCashflow, onCommitments, onSavings, onBorrowing, onCreditCards, onProjects, onEvents, onCreate, onGrow, onPlant, onMasters, onCategories, onSettings, onHousehold,
  trackSavings, trackBorrowings, trackCreditCards, trackProjects, hasEvents,
}: NavMenuProps) {
  const c = useTheme()
  // `section` groups rows under a small header; the first row has none. Icons are `sub`, not
  // `ink`, so labels lead — the only colored icon is Create new, an action rather than a place.
  // Each row's icon is its feature's FEATURE_ICONS entry (the row id), shared with the dashboard.
  const items: { id: FeatureKey; label: string; onClick: () => void; hidden?: boolean; section?: string }[] = [
    // First, and never hidden — this is the feature-discovery surface now that
    // Life Events has no settings toggle.
    { id: 'create', label: 'Create new', onClick: onCreate },
    { section: 'Money', id: 'transactions', label: 'Transactions', onClick: onTransactions },
    { section: 'Money', id: 'analytics', label: 'Analytics', onClick: onAnalytics },
    { section: 'Money', id: 'cashflow', label: 'Cash Flow Forecast', onClick: onCashflow },
    { section: 'Plan & track', id: 'commitments', label: 'Bills & Obligations', onClick: onCommitments },
    { section: 'Plan & track', id: 'savings', label: 'Savings & Investments', onClick: onSavings, hidden: !trackSavings },
    { section: 'Plan & track', id: 'borrowing', label: 'Lend & Borrow', onClick: onBorrowing, hidden: !trackBorrowings },
    // Gated on the same setting as the dashboard tile — unlike Life Events, credit cards are
    // opt-in, so the tile and this row appear and disappear together.
    { section: 'Plan & track', id: 'credit_cards', label: 'Credit Cards', onClick: onCreditCards, hidden: !trackCreditCards },
    { section: 'Plan & track', id: 'events', label: 'Life Events', onClick: onEvents, hidden: !hasEvents },
    { section: 'Shared', id: 'projects', label: 'Projects', onClick: onProjects, hidden: !trackProjects },
    // Not settings-gated: the menu row is how Household is found (same lesson as Life Events).
    { section: 'Shared', id: 'household', label: 'Household', onClick: () => onHousehold?.(), hidden: !onHousehold },
    { section: 'Mint', id: 'grow', label: 'Grow', onClick: onGrow },
    { section: 'Mint', id: 'plant', label: 'Plant', onClick: onPlant },
    // Sits with Categories rather than in Settings: this is the directory's
    // only entry point, and the panel's Data section is its sixth and last —
    // the same burial that made Life Events undiscoverable in v1.57.
    { section: 'Manage', id: 'masters', label: 'Masters', onClick: onMasters },
    { section: 'Manage', id: 'categories', label: 'Categories', onClick: onCategories },
    { section: 'Manage', id: 'settings', label: 'Settings', onClick: onSettings },
  ]

  const rowStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
    padding: '8px 10px', background: 'none', border: 'none',
    borderRadius: 12, cursor: 'pointer', textAlign: 'left',
    font: '700 14px Plus Jakarta Sans', color: c.ink,
    minHeight: 40,
  }
  // Same header style as SettingsPage's sections.
  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '10px 10px 2px',
  }

  return (
    <BottomSheet open={open} onClose={onClose} zIndex={300} showHelpButton={false}>
      <div style={{ padding: '4px 0 8px' }}>
        <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', marginBottom: 10 }}>
          Navigation
        </div>
        <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Headers come from the visible rows, so a section whose rows are all hidden
              (e.g. Shared with no household and no projects) leaves no orphan header. */}
          {items.filter(item => !item.hidden).map((item, i, visible) => {
            const Icon = FEATURE_ICONS[item.id]
            return (
              <div key={item.id} style={{ display: 'contents' }}>
                {item.section && item.section !== visible[i - 1]?.section && (
                  <div role="presentation" style={sectionLabel}>{item.section}</div>
                )}
                <button
                  role="menuitem"
                  style={rowStyle}
                  onClick={() => { onClose(); item.onClick() }}
                >
                  <Icon size={18} strokeWidth={2} color={item.id === 'create' ? c.accent : c.sub} style={{ flexShrink: 0 }} aria-hidden />
                  {item.label}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
