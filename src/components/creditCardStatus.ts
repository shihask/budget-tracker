import type { ColorTokens } from '@/lib/tokens'
import type { StatementStatus } from '@/lib/credit-card-cycles'

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  paid: 'Paid',
  partial: 'Partial',
  due: 'Due',
  overdue: 'Overdue',
}

/** The one status pill, shared by the Cards tab's Current Statement preview and the Statements tab,
 *  so a card reads identically in both places. House style: 600 10px, pill radius, 2px 7px. */
export function statementPillStyle(c: ColorTokens, status: StatementStatus): React.CSSProperties {
  const pair =
    status === 'paid' ? { color: c.good, background: c.goodSoft }
    : status === 'partial' ? { color: c.warn, background: c.warnSoft }
    : status === 'overdue' ? { color: c.bad, background: c.badSoft }
    : { color: c.muted, background: c.surface2 }
  return {
    ...pair,
    font: '600 10px Plus Jakarta Sans',
    borderRadius: 999,
    padding: '2px 7px',
    whiteSpace: 'nowrap',
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '25 Sep 2026' from a 'YYYY-MM-DD' string, parsed as a LOCAL date.
 *  `new Date('2026-09-25')` parses as UTC midnight and renders the 24th west of UTC, so the parts are
 *  split by hand — the same class of bug credit-card-cycles.ts avoids when formatting. */
export function stmtDate(ymd: string, withYear = true): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

/** '26 Aug – 25 Sep' — the year is dropped from both ends; the statement date carries it. */
export function stmtPeriod(start: string, end: string): string {
  return `${stmtDate(start, false)} – ${stmtDate(end, false)}`
}
