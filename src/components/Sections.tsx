import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt, fmtDate } from '@/lib/utils'
import { CAT_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { Glyph } from './Glyph'
import { MONTH_START, catById as buildCatById } from '@/lib/data'
import type { AppState, DashboardSection, Transaction } from '@/types'

// ── Custom Group Section ───────────────────────────────────────────────────────
const SECTION_COLORS = ['#6366F1', '#F97316', '#10B981', '#EC4899', '#3B82F6', '#8B5CF6', '#F59E0B']
const sectionColor = (name: string) => SECTION_COLORS[name.charCodeAt(0) % SECTION_COLORS.length]

interface CustomGroupSectionProps { section: DashboardSection; state: AppState }

export function CustomGroupSection({ section, state }: CustomGroupSectionProps) {
  const c = useTheme()
  const catMap = buildCatById(state.categories)
  const name = section.customName || 'Custom'
  const color = sectionColor(name)

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
        <div>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>{name}</div>
          <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>This month</div>
        </div>
        <div style={{ font: '800 20px Plus Jakarta Sans', color, letterSpacing: '-0.02em' }}>{fmt(total)}</div>
      </div>
      {items.length === 0 ? (
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No {name.toLowerCase()} spend yet this month.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name="doc" color={color} size={16} />
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
  const catMap = buildCatById(state.categories)
  const acctById = Object.fromEntries(state.accounts.map(a => [a.id, a]))
  const txns = state.transactions.slice(0, limit)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const handleDelete = async (e: React.MouseEvent, t: Transaction) => {
    e.stopPropagation()
    if (!confirm(`Delete "${t.description}" (${fmt(t.amount)})?`)) return
    setDeleting(t.id)
    await onDelete?.(t)
    setDeleting(null)
  }

  return (
    <>
    <Card pad={6}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Recent activity</div>
          <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        </div>
        <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
      </div>
      {txns.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>💸</div>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>No transactions yet</div>
          <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>Tap the <strong style={{ color: c.accent }}>+</strong> button to log your first expense or income.</div>
        </div>
      ) : txns.map((t) => {
        const cat = catMap[t.category_id!]
        const col = (cat && CAT_COLORS[cat.name]) || c.muted
        const acc = acctById[t.from_account_id!]
        const toAcc = t.transaction_type === 'transfer' && t.to_account_id ? acctById[t.to_account_id] : null
        const isDeleting = deleting === t.id
        const subLabel = toAcc
          ? `${acc?.name || '?'} → ${toAcc.name}`
          : `${cat ? cat.name : 'Other'} · ${acc ? acc.name : ''}`
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
              <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
              <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>{subLabel}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ font: '800 14px Plus Jakarta Sans', color: t.transaction_type === 'income' ? c.good : t.transaction_type === 'transfer' ? c.accent : c.bad }}>
                  {t.transaction_type === 'income' ? '+' : t.transaction_type === 'transfer' ? '⇄' : '−'}{fmt(t.amount, { decimals: t.amount % 1 ? 2 : 0 })}
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
    </>
  )
}
