import { Paperclip } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ColorTokens } from '@/lib/tokens'
import type { ProjectMember, ProjectTransaction } from '../../types'
import { describeTransaction, GROUP_MONEY_SOURCE, PAYMENT_LABEL } from '../../lib/transactions'
import { sharedByCount } from '../../lib/sharedBy'
import { FONT } from '../overview/styles'
import { kindTile } from './kindTile'

interface Props {
  txn: ProjectTransaction
  attachmentCount: number
  /** Column layout for wide screens; two-line layout otherwise. */
  wide: boolean
  /** This project's members, for the "Shared by" count. */
  members: ProjectMember[]
  onOpen: () => void
}

export function KittyPill({ c }: { c: ColorTokens }) {
  return (
    <span style={{
      font: `700 10px ${FONT}`, color: c.accent, background: c.accentSoft,
      padding: '1px 7px', borderRadius: 999, letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      Kitty
    </span>
  )
}

export function TransactionRow({ txn, attachmentCount, wide, members, onOpen }: Props) {
  const c = useTheme()
  const v = describeTransaction(txn)
  const tile = kindTile(c, v.kind)
  // Money into the kitty: a member's contribution or group money.
  const isContrib = v.sign === 1
  const isGroup = v.kind === 'group-money'
  // A settlement payment moves money between two parties: neutral, no + or −.
  const isPayment = v.kind === 'settlement'

  const amount = (
    <span style={{ font: `700 14px ${FONT}`, color: isContrib ? c.good : isPayment ? c.sub : c.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {isContrib ? '+' : isPayment ? '' : '−'}{fmt(txn.amount)}
    </span>
  )
  const clip = attachmentCount > 0 && (
    <span title={`${attachmentCount} receipt${attachmentCount === 1 ? '' : 's'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: c.muted, font: `600 10px ${FONT}` }}>
      <Paperclip size={12} />{attachmentCount > 1 ? attachmentCount : null}
    </span>
  )
  // Only for expenses with an explicit group; nothing for Everyone.
  const sharedCount = sharedByCount(txn, members)
  const sharedLabel = sharedCount !== null ? `Shared by ${sharedCount}` : null
  const who = isPayment
    ? <span style={{ color: c.sub }}>{PAYMENT_LABEL}{txn.description ? ` · ${txn.description}` : ''}</span>
    : isContrib
    ? <span style={{ color: c.sub }}>{isGroup ? GROUP_MONEY_SOURCE : 'Contribution'}{txn.description ? ` · ${txn.description}` : ''}</span>
    : v.kind === 'expense-kitty'
      ? <KittyPill c={c} />
      : <span>Paid by {v.memberName}</span>

  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%', display: wide ? 'grid' : 'flex', alignItems: 'center', gap: 12,
        gridTemplateColumns: wide ? '32px minmax(0, 1fr) 170px 120px 22px' : undefined,
        minHeight: 56, padding: '10px 14px', border: 'none', background: 'transparent',
        textAlign: 'left', cursor: 'pointer', color: 'inherit', boxSizing: 'border-box',
      }}
    >
      <div aria-hidden style={{
        width: 32, height: 32, borderRadius: 10, background: tile.bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <tile.Icon size={15} color={tile.fg} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {/* In columns the member has its own column, so a contribution is titled by type. */}
          {wide && isContrib && !isGroup ? 'Contribution' : v.title}
        </div>
        {wide ? (
          (isPayment ? true : isContrib ? txn.description : (v.subtitleCategory || sharedCount)) && (
            <div style={{ font: `500 12px ${FONT}`, color: c.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isPayment ? [PAYMENT_LABEL, txn.description].filter(Boolean).join(' · ') : isContrib ? txn.description : [v.subtitleCategory, sharedLabel].filter(Boolean).join(' · ')}
            </div>
          )
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, minWidth: 0,
            font: `500 12px ${FONT}`, color: c.muted, overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            {v.subtitleCategory && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.subtitleCategory} ·</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', minWidth: 0 }}>{who}</span>
            {sharedLabel && <span style={{ flexShrink: 0 }}>· {sharedLabel}</span>}
          </div>
        )}
      </div>

      {wide ? (
        <>
          <div style={{ font: `500 13px ${FONT}`, color: c.sub, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isPayment ? 'Settlement' : isGroup ? 'Outside the group' : v.kind === 'expense-kitty' ? <KittyPill c={c} /> : v.memberName}
          </div>
          <div style={{ textAlign: 'right' }}>{amount}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{clip}</div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {amount}
          {clip}
        </div>
      )}
    </button>
  )
}
