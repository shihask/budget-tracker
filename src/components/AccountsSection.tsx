import { useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { FEATURE_ICONS } from '@/lib/feature-icons'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { accountColor, accountShare } from '@/lib/accounts'
import { Card } from './Card'
import { AccountRow } from './AccountRow'
import { AddAccountSheet } from './AccountSheets'
import type { AppState } from '@/types'

interface AccountsSectionProps {
  state: AppState
  onAddAccount: (form: { name: string; type: string; current_balance: number }) => Promise<void>
  /** Tap on an account row — opens that account's page (Income, Transfer, Adjust, Edit). */
  onOpenAccount: (accountId: string) => void
  /** "View all" — opens the Accounts page (every account, Remove, distribution). */
  onViewAll: () => void
  linkedAccountIds?: Set<string> // AA-synced accounts (account_connections) — shows a bank-sync badge
  onOpenBankSync?: () => void // badge tap target — opens the Connect Bank hub (manage + review, all in one place)
}

export function AccountsSection({ state, onAddAccount, onOpenAccount, onViewAll, linkedAccountIds, onOpenBankSync }: AccountsSectionProps) {
  const c = useTheme()
  const accs = state.accounts.filter(a => a.is_active)
  const total = accs.reduce((s, a) => s + a.current_balance, 0)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <Card>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FEATURE_ICONS.accounts size={17} color="#fff" aria-hidden />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Accounts</div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                {accs.length} account{accs.length !== 1 ? 's' : ''} · {fmt(total)}
              </div>
            </div>
          </div>
          {accs.length > 0 && (
            <button
              onClick={onViewAll}
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, border: 'none', borderRadius: 999, padding: '7px 12px', background: c.accentSoft, color: c.accent, font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              View all <ArrowRight size={13} strokeWidth={2.6} aria-hidden />
            </button>
          )}
        </div>

        {accs.length === 0 ? (
          <div style={{ padding: '20px 0 8px', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><FEATURE_ICONS.accounts size={28} color="#A09890" /></div>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>No accounts yet</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 14, lineHeight: 1.5 }}>Add a bank account or cash wallet to track where your money lives.</div>
            <button
              onClick={() => setAddOpen(true)}
              style={{ background: c.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              Add Account
            </button>
          </div>
        ) : (
          <>
            {/* Total + distribution */}
            <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px 14px', marginBottom: 14 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Total Balance</div>
              <div style={{ font: '800 24px Plus Jakarta Sans', color: total < 0 ? c.bad : c.ink, letterSpacing: '-0.02em', marginTop: 1 }}>
                {fmt(total, { decimals: total % 1 ? 2 : 0 })}
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 2, marginTop: 10, background: c.faint }}>
                {accs.map(a => (
                  <div key={a.id} style={{ width: accountShare(accs, a.current_balance) + '%', background: accountColor(accs, a.id) }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {accs.map((a, i) => (
                <div key={a.id} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${c.faint}` : 'none' }}>
                  <AccountRow
                    account={a}
                    color={accountColor(accs, a.id)}
                    share={accountShare(accs, a.current_balance)}
                    variant="dashboard"
                    onOpen={() => onOpenAccount(a.id)}
                    linked={linkedAccountIds?.has(a.id)}
                    onOpenBankSync={onOpenBankSync}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => setAddOpen(true)}
              style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 12, padding: '11px', background: c.accentSoft, color: c.accent, font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Add Account
            </button>
          </>
        )}
      </Card>

      <AddAccountSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAddAccount} />
    </>
  )
}
