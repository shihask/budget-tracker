import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ProjectTransaction } from '../../types'
import { FONT, cardStyle, shortDate } from './styles'
import { GROUP_MONEY_LABEL, GROUP_MONEY_SOURCE } from '../../lib/transactions'
import { SectionHeader } from './ui'

const MAX_SHOWN = 5

interface Props {
  /** Already newest first (useProjectsData orders by transaction_date, created_at desc). */
  transactions: ProjectTransaction[]
  onViewAll: () => void
}

export function RecentTransactionsCard({ transactions, onViewAll }: Props) {
  const c = useTheme()
  if (transactions.length === 0) return null

  return (
    <div style={cardStyle(c)}>
      <SectionHeader c={c} title="Recent transactions" action={{ label: 'View all', onClick: onViewAll }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {transactions.slice(0, MAX_SHOWN).map(txn => {
          const isContrib = txn.transaction_type === 'contribution'
          const fromKitty = !isContrib && txn.member_id == null
          const title = isContrib
            ? (txn.member?.name || GROUP_MONEY_LABEL)
            : (txn.description || txn.category || 'Expense')
          const meta = isContrib
            ? (txn.member ? 'Contribution' : GROUP_MONEY_SOURCE)
            : fromKitty ? 'From kitty' : `Paid by ${txn.member?.name || 'Unknown'}`
          return (
            <div key={txn.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div aria-hidden style={{
                width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                background: isContrib ? c.good : fromKitty ? c.accent : c.muted,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 13px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </div>
                <div style={{ font: `500 11px ${FONT}`, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {meta} · {shortDate(txn.transaction_date)}
                </div>
              </div>
              <div style={{ font: `700 13px ${FONT}`, color: isContrib ? c.good : c.ink, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {isContrib ? '+' : '−'}{fmt(txn.amount)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
