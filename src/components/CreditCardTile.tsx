import { ReceiptText } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { getCreditCardBilling } from '@/lib/credit-card'
import { currentStatementPeriod, localYmd } from '@/lib/credit-card-cycles'
import { colorFor } from '@/lib/credit-card-colors'
import { STATEMENT_STATUS_LABEL, statementPillStyle, stmtDate, stmtPeriod } from './creditCardStatus'
import type { AppState, CreditCard } from '@/types'
import type { StatementStatus } from '@/lib/credit-card-cycles'

function getDaysUntil(day: number): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(now.getFullYear(), now.getMonth(), day)
  if (target < today) target.setMonth(target.getMonth() + 1)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

const todayYmd = () => localYmd(new Date())

function dayLabel(n: number): string {
  if (n <= 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  return `in ${n} days`
}

interface Props {
  card: CreditCard
  state: AppState
  expanded: boolean
  onToggle: () => void
  onPay: () => void
  /** Card management — passed by the Credit Cards page only. The dashboard omits it, so its
   *  accordion ends after the dates row and Pay Bill stays its one management action. */
  manage?: { onEdit: () => void; onAdjust: () => void; onDelete: () => void }
  /** Current Statement preview — page-only, same gating as `manage`. Dates come from
   *  `currentStatementPeriod` so this and the Statements tab agree on where the cycle begins. */
  showCurrentStatement?: boolean
  /** Opens this cycle's transactions in StatementDetailsPage. Omitted = no icon. */
  onViewStatement?: () => void
}

/** One credit card: the always-visible compact row plus the expandable detail. Shared by the
 *  dashboard section and the Credit Cards page. */
export function CreditCardTile({ card, state, expanded, onToggle, onPay, manage, showCurrentStatement, onViewStatement }: Props) {
  const c = useTheme()
  const col = colorFor(card.name)
  const utilPct = card.credit_limit > 0 ? Math.min(100, Math.round((card.current_balance / card.credit_limit) * 100)) : 0
  const available = card.credit_limit - card.current_balance
  const daysUntilBill = getDaysUntil(card.bill_day)
  const daysUntilDue = getDaysUntil(card.due_day)
  const isUrgent = daysUntilDue <= 5
  const billing = getCreditCardBilling(card, state.transactions)

  const manageBtn: React.CSSProperties = {
    flex: 1, background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10,
    padding: '8px 0', font: '700 11px Plus Jakarta Sans', cursor: 'pointer',
  }

  return (
    <div style={{ background: col + '12', borderRadius: 16, border: `1px solid ${col}30`, overflow: 'hidden' }}>
      {/* Compact header — always visible */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3" fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth="1.5"/>
              <rect x="2" y="9.5" width="20" height="2.5" fill="rgba(255,255,255,0.25)" stroke="none"/>
              <rect x="4.5" y="13" width="4" height="3" rx="1" fill="rgba(255,255,255,0.7)" stroke="none"/>
              <path d="M13.5 13.8a1.8 1.8 0 010-3.6" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" fill="none"/>
              <path d="M15 14.6a3.4 3.4 0 000-5.2" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" fill="none"/>
            </svg>
          </div>
          <div>
            <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{card.name}</div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>
              {billing.billedAmount > 0
                ? <span style={{ color: c.bad }}>{fmt(billing.billedAmount)} billed</span>
                : card.last_four ? <>•••• {card.last_four}</> : 'No bill due'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); onPay() }}
            style={{ background: col, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', font: '700 11px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            Pay Bill
          </button>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          style={{ padding: '0 14px 14px', borderTop: `1px solid ${col}25` }}
        >
          {/* Total outstanding */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, marginTop: 12 }}>
            <div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{fmt(card.current_balance)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available</div>
              <div style={{ font: '800 20px Plus Jakarta Sans', color: c.good, letterSpacing: '-0.02em' }}>{fmt(available)}</div>
            </div>
          </div>

          {/* Billed / Unbilled split */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }} onClick={e => e.stopPropagation()}>
            <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Billed</div>
              <div style={{ font: '700 15px Plus Jakarta Sans', color: billing.billedAmount > 0 ? c.bad : c.ink, marginTop: 2 }}>{fmt(billing.billedAmount)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>pay by {card.due_day}th</div>
            </div>
            <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unbilled</div>
              <div style={{ font: '700 15px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(billing.unbilledAmount)}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>since {card.bill_day}th</div>
            </div>
          </div>

          {/* Utilization bar */}
          <div style={{ height: 6, borderRadius: 999, background: c.surface2, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: utilPct + '%', height: '100%', borderRadius: 999, background: utilPct > 80 ? c.bad : utilPct > 50 ? c.warn : col, transition: 'width 0.4s' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{utilPct}% used of {fmt(card.credit_limit)}</span>
          </div>

          {/* Dates */}
          <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
            <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bill date</div>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{card.bill_day}th</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{dayLabel(daysUntilBill)}</div>
            </div>
            <div style={{ flex: 1, background: isUrgent ? c.badSoft : c.surface, borderRadius: 10, padding: '8px 10px', border: isUrgent ? `1px solid ${c.bad}40` : 'none' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: isUrgent ? c.bad : c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Due date</div>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: isUrgent ? c.bad : c.ink, marginTop: 2 }}>{card.due_day}th</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: isUrgent ? c.bad : c.muted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                {isUrgent && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.bad} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".8" fill={c.bad}/>
                  </svg>
                )}
                {dayLabel(daysUntilDue)}
              </div>
            </div>
            <div style={{ flex: 1, background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cycle</div>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{card.cycle_start_day}th</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>start day</div>
            </div>
          </div>

          {showCurrentStatement && (() => {
            const period = currentStatementPeriod(card)
            const remaining = billing.billedAmount
            const status: StatementStatus =
              billing.statementAmount <= 0 || remaining <= 0.01 ? 'paid'
              : billing.paidSinceBill > 0 ? 'partial'
              : todayYmd() > period.dueDate ? 'overdue'
              : 'due'
            return (
              <div style={{ marginTop: 12, background: c.surface, borderRadius: 12, padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Statement</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={statementPillStyle(c, status)}>{STATEMENT_STATUS_LABEL[status]}</span>
                    {onViewStatement && (
                      <button
                        onClick={onViewStatement}
                        aria-label="View statement transactions"
                        title="View transactions"
                        style={{ width: 26, height: 26, borderRadius: 8, border: 'none', padding: 0, background: col + '18', color: col, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        <ReceiptText size={14} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{stmtDate(period.statementDate)}</div>
                <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                  {stmtPeriod(period.periodStart, period.statementDate)} · due {stmtDate(period.dueDate, false)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {([
                    ['Total', billing.statementAmount, c.ink],
                    ['Paid', billing.paidSinceBill, billing.paidSinceBill > 0 ? c.good : c.ink],
                    ['Remaining', remaining, remaining > 0 ? c.bad : c.good],
                  ] as const).map(([label, value, color]) => (
                    <div key={label} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '600 9.5px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ font: '700 13px Plus Jakarta Sans', color, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {manage && (
            <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Manage</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={manage.onEdit} style={{ ...manageBtn, color: c.ink }}>Edit</button>
                <button onClick={manage.onAdjust} style={{ ...manageBtn, color: c.ink }}>Adjust</button>
                <button onClick={manage.onDelete} style={{ ...manageBtn, color: c.bad }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
