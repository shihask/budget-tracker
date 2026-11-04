import { ChevronRight, MoreVertical } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_LABEL, shareLabel } from '@/lib/accounts'
import { Glyph } from './Glyph'
import type { Account } from '@/types'

interface Props {
  account: Account
  color: string
  share: number
  /** dashboard: balance over %, chevron. page: balance + % pill, ⋮ menu. */
  variant: 'dashboard' | 'page'
  onOpen: () => void
  onMenu?: () => void
  linked?: boolean
  onOpenBankSync?: () => void
  dimmed?: boolean
}

/** One account in the Accounts card and on the Accounts page. Tapping it opens the account's page. */
export function AccountRow({ account: a, color, share, variant, onOpen, onMenu, linked, onOpenBankSync, dimmed }: Props) {
  const c = useTheme()
  const balance = fmt(a.current_balance, { decimals: a.current_balance % 1 ? 2 : 0 })

  return (
    <div
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: dimmed ? 0.4 : 1, minHeight: 44 }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 12, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Glyph name={ACCOUNT_TYPE_ICON[a.type] || 'wallet'} color={color} size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
          {linked && (
            <button
              onClick={e => { e.stopPropagation(); onOpenBankSync?.() }}
              title="Synced via Account Aggregator — tap to manage"
              style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: 999,
                border: 'none', background: c.accent + '22', cursor: onOpenBankSync ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V9l7-6 7 6v12M9 21v-6h6v6" />
              </svg>
            </button>
          )}
        </div>
        <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>{ACCOUNT_TYPE_LABEL[a.type]}</div>
      </div>

      {variant === 'dashboard' ? (
        <>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ font: '800 15px Plus Jakarta Sans', color: a.current_balance < 0 ? c.bad : c.ink }}>{balance}</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{shareLabel(share)}</div>
          </div>
          <ChevronRight size={16} color={c.muted} strokeWidth={2.4} style={{ flexShrink: 0 }} aria-hidden />
        </>
      ) : (
        <>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: a.current_balance < 0 ? c.bad : c.ink, flexShrink: 0 }}>{balance}</div>
          <span style={{ flexShrink: 0, minWidth: 38, textAlign: 'center', padding: '3px 7px', borderRadius: 999, background: color + '1F', color, font: '700 11px Plus Jakarta Sans' }}>
            {shareLabel(share)}
          </span>
          {onMenu && (
            <button
              onClick={e => { e.stopPropagation(); onMenu() }}
              aria-label={`${a.name} options`}
              style={{ width: 30, height: 36, marginRight: -6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: c.muted }}
            >
              <MoreVertical size={18} strokeWidth={2.2} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
