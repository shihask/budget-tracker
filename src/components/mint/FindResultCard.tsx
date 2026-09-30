import { Search, ChevronRight } from 'lucide-react'
import type { ColorTokens } from '@/lib/tokens'
import { fmt, parseIso } from '@/lib/utils'
import type { TransactionGroup } from '@/lib/splitGroups'
import { FIND_SHOWN, findCountText, viewAllShowsCount, type FindOutcome } from '@/lib/mint-find'
import type { Transaction } from '@/types'

const FONT = 'Plus Jakarta Sans'

export interface FindResultData {
  outcome: FindOutcome
  /** Loaded matches are showing; the database hasn't answered yet. */
  searching: boolean
  loadedCount: number
  /** Edit/delete found several equally good rows: tapping one picks it. */
  pick?: 'edit' | 'delete'
}

function rowDate(s: string): string {
  const d = parseIso(s)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

function MatchRow({ c, g, names, onTap, pick }: {
  c: ColorTokens; g: TransactionGroup; names: (t: Transaction) => { account: string; category: string }
  onTap: (t: Transaction) => void; pick: boolean
}) {
  const t = g.primary
  const { account, category } = names(t)
  const incoming = t.transaction_type === 'income'
  return (
    <button
      onClick={() => onTap(t)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'none', border: 'none', borderTop: `1px solid ${c.faint}`, padding: '9px 0', cursor: 'pointer',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ font: `600 13px ${FONT}`, color: c.ink, overflowWrap: 'anywhere' }}>{t.description || 'Untitled'}</div>
        <div style={{ font: `500 11px ${FONT}`, color: c.muted, marginTop: 2 }}>
          {[rowDate(t.transaction_date), g.isSplit ? `split · ${g.legs.length} accounts` : account, category].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ font: `700 13px ${FONT}`, fontVariantNumeric: 'tabular-nums', color: incoming ? c.good : c.ink, whiteSpace: 'nowrap' }}>
        {incoming ? '+' : ''}{fmt(g.total)}
      </div>
      {pick
        ? <span style={{ font: `600 11px ${FONT}`, color: c.accent }}>Choose</span>
        : <ChevronRight size={14} color={c.muted} />}
    </button>
  )
}

function Label({ c, children }: { c: ColorTokens; children: string }) {
  return <div style={{ font: `700 11px ${FONT}`, letterSpacing: 0.6, textTransform: 'uppercase', color: c.muted, margin: '10px 0 2px' }}>{children}</div>
}

export function FindResultCard({ c, data, names, onOpen, onPick, onViewAll }: {
  c: ColorTokens
  data: FindResultData
  names: (t: Transaction) => { account: string; category: string }
  onOpen: (t: Transaction) => void
  onPick: (t: Transaction) => void
  onViewAll?: () => void
}) {
  const { outcome: o, searching, loadedCount, pick } = data
  const tap = pick ? onPick : onOpen
  const latestFirst = !pick && o.query.emphasis === 'latest' && o.groups.length > 0
  // "When did I…" asks for the newest one, so order by date BEFORE taking the
  // first few — the newest may not be among the best text matches.
  const shown = (latestFirst ? [...o.groups].sort(byDateDesc) : o.groups).slice(0, FIND_SHOWN)

  const header = pick
    ? `Which one? ${o.total} look the same`
    : searching
      ? o.query.label
      : `${findCountText(o.total, o.status, loadedCount)} · ${o.query.label}`

  const rows = (gs: TransactionGroup[]) => gs.map(g =>
    <MatchRow key={g.key} c={c} g={g} names={names} onTap={tap} pick={!!pick} />)

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: `700 13px ${FONT}`, color: c.ink }}>
        <Search size={14} color={c.accent} strokeWidth={2.5} />
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{header}</span>
      </div>

      {o.fuzzy && o.total > 0 && (
        <div style={{ font: `500 11.5px ${FONT}`, color: c.muted, marginTop: 4 }}>No exact match — closest:</div>
      )}
      {searching && (
        <div style={{ font: `500 11.5px ${FONT}`, color: c.muted, marginTop: 4 }}>Searching all history…</div>
      )}
      {!searching && o.status === 'local' && (
        <div style={{ font: `500 11.5px ${FONT}`, color: c.muted, marginTop: 4 }}>
          Couldn't reach your full history, so only the latest {loadedCount.toLocaleString('en-IN')} were searched.
        </div>
      )}

      {o.total === 0 && !searching ? (
        <div style={{ font: `500 12.5px ${FONT}`, color: c.sub, lineHeight: 1.5, marginTop: 8 }}>
          No transactions matching {o.query.tokens.length ? `"${o.query.tokens.join(' ')}"` : 'that'} — try fewer words or a different month.
        </div>
      ) : latestFirst ? (
        <>
          <Label c={c}>{shown.length === 1 ? 'Last one' : 'Most recent'}</Label>
          {rows(shown.slice(0, 1))}
          {shown.length > 1 && <><Label c={c}>Earlier</Label>{rows(shown.slice(1))}</>}
        </>
      ) : (
        <div style={{ marginTop: 6 }}>{rows(shown)}</div>
      )}

      {!pick && !searching && o.total > FIND_SHOWN && onViewAll && (
        <button
          onClick={onViewAll}
          style={{
            marginTop: 8, width: '100%', height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: c.surface2, font: `600 12.5px ${FONT}`, color: c.accent,
          }}
        >
          {viewAllShowsCount(o) ? `View all ${o.total.toLocaleString('en-IN')} in Transactions` : 'View all in Transactions'}
        </button>
      )}
    </div>
  )
}

const byDateDesc = (a: TransactionGroup, b: TransactionGroup) =>
  b.primary.transaction_date.localeCompare(a.primary.transaction_date)
