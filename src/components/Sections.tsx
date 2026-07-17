import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { useAppDialog } from './AppDialog'
import { fmt, fmtDate } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { MONTH_START, catById as buildCatById } from '@/lib/data'
import type { AppState, DashboardSection, Transaction } from '@/types'

// ── Custom Group Section ───────────────────────────────────────────────────────

function getSectionIcon(name: string): { color: string; svg: React.ReactNode } {
  const n = name.toLowerCase()

  const match = (re: RegExp, color: string, icon: React.ReactNode) =>
    re.test(n) ? { color, svg: icon } : null

  return (
    match(/renov|repair|build|construct|kitchen|bath|plumb|electri|paint|floor|wall|roof|carpent|mason|home|house|interior|furnit/, '#F97316',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
      </svg>) ||
    match(/food|eat|restaur|cafe|hotel|dhaba|mess|canteen|dine|lunch|dinner|breakfast|tea|coffee|snack|bakery/, '#EF4444',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
      </svg>) ||
    match(/travel|trip|tour|vacat|holiday|flight|train|bus|cab|taxi|transport|petrol|diesel/, '#3B82F6',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5c-1.5-1.5-3.5-1.5-5 0L11 6 2.8 4.2l-2 2L7 10l3.5 3.5-3.5 3.5-4-1-2 2 3 3 3 3 2-2-1-4 3.5-3.5L10 17l4 4 2-2z"/>
      </svg>) ||
    match(/medic|health|hospital|doctor|medicine|pharmac|clinic|dental|eye|optom|treatment/, '#EC4899',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
      </svg>) ||
    match(/shop|market|mall|fashion|cloth|wear|apparel|boutique/, '#8B5CF6',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
      </svg>) ||
    match(/edu|school|college|universi|course|book|tuition|learn|class|study|coaching/, '#06B6D4',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
      </svg>) ||
    match(/entertain|movie|cinema|theatre|game|sport|gym|fitness|yoga|fun|hobby|subscri|ott|netflix|streaming/, '#F59E0B',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>) ||
    match(/util|electric|water|gas|internet|phone|mobile|bill|recharge|postpaid|prepaid|broadband/, '#10B981',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>) ||
    match(/famil|kid|child|baby|parent|mom|dad|wife|husband|son|daughter/, '#F43F5E',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>) ||
    match(/wed|marriag|annivers|birthday|celebrat|party|festival|puja|event|function|gift/, '#F59E0B',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
      </svg>) ||
    match(/invest|mutual|sip|fd|deposit|stock|share|dividend|gold|saving/, '#10B981',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>) ||
    match(/loan|emi|debt|credit|mortgage/, '#EF4444',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>) ||
    match(/grocer|vegetab|fruit|supermarket|provision|dairy|kirana/, '#14B8A6',
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.97-1.67L23 6H6"/>
      </svg>) ||
    // Default
    { color: '#6366F1',
      svg: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      )
    }
  )
}

interface CustomGroupSectionProps { section: DashboardSection; state: AppState }

export function CustomGroupSection({ section, state }: CustomGroupSectionProps) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)
  const name = section.customName || 'Custom'
  const { color, svg: iconSvg } = getSectionIcon(name)

  const groupCatIds = new Set(
    state.categories
      .filter(cat => (section.customGroups ?? []).includes(cat.group_name))
      .map(cat => cat.id)
  )
  const extraCatIds = new Set(section.customCategories ?? [])

  const items = state.transactions.filter(t =>
    t.category_id &&
    (groupCatIds.has(t.category_id) || extraCatIds.has(t.category_id)) &&
    new Date(t.transaction_date) >= MONTH_START
  )
  const total = items.reduce((s, t) => s + t.amount, 0)

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: items.length ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
            {iconSvg}
          </div>
          <div>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>{name}</div>
            <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>This month</div>
          </div>
        </div>
        <div style={{ font: '800 20px Plus Jakarta Sans', color, letterSpacing: '-0.02em' }}>{fmt(total)}</div>
      </div>
      {items.length === 0 ? (
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No {name.toLowerCase()} spend yet this month.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                {iconSvg}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 13.5px Plus Jakarta Sans', color: c.ink }}>{t.description}</div>
                <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{catMap[t.category_id!]?.name}</div>
              </div>
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(t.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Recent Transactions ───────────────────────────────────────────────────────

interface RecentTxnsProps {
  state: AppState
  limit?: number
  onSeeAll?: () => void
  onEdit?: (t: Transaction) => void
  onDelete?: (t: Transaction) => void
}

export function RecentTxns({ state, limit = 6, onSeeAll, onEdit, onDelete }: RecentTxnsProps) {
  const c = useTheme()
  const { confirm, dialogNode } = useAppDialog()
  const catMap = buildCatById(state.categories)
  const acctById = Object.fromEntries([
    ...state.accounts.map(a => [a.id, a]),
    ...(state.credit_cards ?? []).map(cc => [cc.id, { ...cc, name: cc.name }]),
  ])
  const txns = state.transactions.slice(0, limit)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const handleDelete = async (e: React.MouseEvent, t: Transaction) => {
    e.stopPropagation()
    if (!await confirm(`Delete "${t.description}" (${fmt(t.amount)})?`)) return
    setDeleting(t.id)
    await onDelete?.(t)
    setDeleting(null)
  }

  return (
    <>
    <Card pad={6}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Recent activity</div>
            <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
          </div>
        </div>
        <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
      </div>
      {txns.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>No transactions yet</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>Tap the <strong style={{ color: c.accent }}>+</strong> button to log your first expense or income.</div>
        </div>
      ) : txns.map((t) => {
        const cat = catMap[t.category_id!]
        const col = (cat && CAT_COLORS[cat.name]) || c.muted
        const acc = acctById[t.from_account_id!] ?? (t.credit_card_id ? acctById[t.credit_card_id] : undefined) ?? (t.transaction_type === 'balance_adjustment' || t.transaction_type === 'opening_balance' || t.transaction_type === 'cc_opening_balance' || t.transaction_type === 'cc_balance_adjustment' ? acctById[t.to_account_id!] : undefined)
        const toAcc = t.transaction_type === 'transfer' && t.to_account_id ? acctById[t.to_account_id] : null
        const isDeleting = deleting === t.id
        const typeLabel = (t.transaction_type === 'balance_adjustment' || t.transaction_type === 'cc_balance_adjustment') ? 'Balance Adjustment'
          : (t.transaction_type === 'opening_balance' || t.transaction_type === 'cc_opening_balance') ? 'Opening Balance'
          : cat ? cat.name : 'Other'
        const subLabel = toAcc
          ? `${acc?.name || '?'} → ${toAcc.name}`
          : `${typeLabel} · ${acc?.name || ''}`
        return (
          <div
            key={t.id}
            onClick={() => !isDeleting && onEdit?.(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderTop: `1px solid ${c.faint}`, cursor: onEdit ? 'pointer' : 'default', opacity: isDeleting ? 0.5 : 1 }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 11, background: col + '20', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 14px Plus Jakarta Sans', color: col }}>
              {t.description.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                {t.receipt_path && <Receipt size={11} color={c.muted} style={{ flexShrink: 0 }} />}
              </div>
              <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>{subLabel}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '800 14px Plus Jakarta Sans', color:
                  t.transaction_type === 'income' ? c.good :
                  t.transaction_type === 'opening_balance' ? c.good :
                  (t.transaction_type === 'balance_adjustment') ? (t.to_account_id ? c.good : c.muted) :
                  t.transaction_type === 'cc_opening_balance' ? c.muted :
                  t.transaction_type === 'cc_balance_adjustment' ? c.muted :
                  t.transaction_type === 'credit_card_payment' ? c.muted :
                  t.transaction_type === 'savings_withdrawal' ? '#10B981' :
                  t.transaction_type === 'savings_contribution' ? '#10B981' :
                  t.transaction_type === 'transfer' ? c.accent :
                  (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment') ? '#6366F1' :
                  c.bad }}>
                  {(t.transaction_type === 'income' || t.transaction_type === 'savings_withdrawal' || t.transaction_type === 'opening_balance') ? '+' :
                   t.transaction_type === 'balance_adjustment' ? (t.to_account_id ? '+' : '−') :
                   (t.transaction_type === 'cc_opening_balance' || t.transaction_type === 'cc_balance_adjustment') ? '' :
                   t.transaction_type === 'credit_card_payment' ? '⇄' :
                   t.transaction_type === 'savings_contribution' ? '−' :
                   t.transaction_type === 'transfer' ? '⇄' :
                   (t.transaction_type === 'borrowing' || t.transaction_type === 'borrowing_repayment')
                     ? (t.is_credit ? '+' : '−')
                     : '−'}{fmt(t.amount, { decimals: t.amount % 1 ? 2 : 0 })}
                </div>
                <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted }}>{fmtDate(t.transaction_date)}</div>
              </div>
              {onDelete && (
                <button
                  onClick={e => handleDelete(e, t)}
                  disabled={isDeleting}
                  style={{ background: '#FEE2E2', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )
      })}
    </Card>

      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Recent Activity</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                  title: 'Latest transactions',
                  desc: 'Shows your most recent expenses and income sorted by date — newest first.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
                  title: 'Edit or delete',
                  desc: 'Tap any transaction to edit it, or use the trash icon to remove it.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
                  title: 'Full history',
                  desc: 'Tap "See all" to open the complete transaction list with filters, search, and bulk management.',
                },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {item.svg}
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{item.title}</div>
                    <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '12px', background: c.surface2, borderRadius: 12 }}>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.6 }}>
                Add new transactions with the <strong style={{ color: c.ink }}>+ button</strong> at the bottom of the screen.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}
      {dialogNode}
    </>
  )
}
