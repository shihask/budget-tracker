import { ChevronRight } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { ColorTokens } from '@/lib/tokens'
import { initials } from '../../lib/overview'
import { moneyLine, settlementStatus, type MemberRowData } from '../../lib/members'
import { FONT } from '../overview/styles'
import { WIDE_COLUMNS, toneColor } from './memberUi'

export function Avatar({ c, name, inactive, size = 32 }: { c: ColorTokens; name: string; inactive?: boolean; size?: number }) {
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: inactive ? c.surface2 : c.accentSoft, color: inactive ? c.muted : c.accent,
      display: 'flex', alignItems: 'center', justifyContent: 'center', font: `800 ${Math.round(size * 0.36)}px ${FONT}`,
    }}>
      {initials(name)}
    </div>
  )
}

export function Badge({ c, children }: { c: ColorTokens; children: React.ReactNode }) {
  return (
    <span style={{
      font: `700 10px ${FONT}`, color: c.sub, background: c.surface2, padding: '1px 7px',
      borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

export function MemberBadges({ c, row }: { c: ColorTokens; row: MemberRowData }) {
  return (
    <>
      {row.member.share_ratio !== 1 && <Badge c={c}>×{row.member.share_ratio} share</Badge>}
      {row.inactive && <Badge c={c}>Inactive</Badge>}
    </>
  )
}

export function MemberRow({ row, wide, onOpen }: { row: MemberRowData; wide: boolean; onOpen: () => void }) {
  const c = useTheme()
  const status = row.net === null ? null : settlementStatus(row.net)
  const amountCell = (v: number) => (
    <span style={{ font: `600 13px ${FONT}`, color: v > 0.01 ? c.ink : c.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {v > 0.01 ? fmt(v) : '—'}
    </span>
  )
  const statusEl = status && (
    <span style={{ font: `700 13px ${FONT}`, color: toneColor(c, status.tone), whiteSpace: 'nowrap' }}>{status.label}</span>
  )

  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%', display: wide ? 'grid' : 'flex', gridTemplateColumns: wide ? WIDE_COLUMNS : undefined,
        alignItems: 'center', gap: 12, minHeight: 56, padding: '10px 14px', border: 'none',
        background: 'transparent', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
        opacity: row.inactive ? 0.7 : 1,
      }}
    >
      <Avatar c={c} name={row.member.name} inactive={row.inactive} />
      {wide ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ font: `600 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.member.name}
            </span>
            <MemberBadges c={c} row={row} />
          </div>
          <div style={{ textAlign: 'right' }}>{amountCell(row.putInKitty)}</div>
          <div style={{ textAlign: 'right' }}>{amountCell(row.paidPersonally)}</div>
          <div style={{ textAlign: 'right' }}>{statusEl}</div>
        </>
      ) : (
        // Name and status share the first line; badges and the money line get the
        // full width below and wrap rather than being cut off.
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 0, font: `600 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.member.name}
            </span>
            {statusEl && <span style={{ flexShrink: 0 }}>{statusEl}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, marginTop: 2 }}>
            <MemberBadges c={c} row={row} />
            <span style={{ font: `500 12px ${FONT}`, color: c.muted, lineHeight: 1.4 }}>{moneyLine(row)}</span>
          </div>
        </div>
      )}
      <ChevronRight size={16} color={c.muted} style={{ flexShrink: 0 }} />
    </button>
  )
}
