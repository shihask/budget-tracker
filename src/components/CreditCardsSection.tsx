import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import { CreditCardTile } from './CreditCardTile'
import { useCreditCardSheets } from './CreditCardSheets'
import { getCreditCardBilling } from '@/lib/credit-card'
import type { AppState, CreditCard } from '@/types'

interface Props {
  state: AppState
  onPayBill: (card: CreditCard, amount: number, accountId: string) => Promise<void>
  /** Opens the Credit Cards page — the tile's one destination. */
  onViewDetails: () => void
}

/**
 * Dashboard tile: overview + Pay Bill. Adding, editing, adjusting and deleting a card live on the
 * Credit Cards page (`onViewDetails`), so this surface mounts only the Pay Bill sheet.
 */
export function CreditCardsSection({ state, onPayBill, onViewDetails }: Props) {
  const c = useTheme()
  const [infoOpen, setInfoOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { openPay, sheets } = useCreditCardSheets({ mode: 'pay-only', state, onPayBill })

  const cards = state.credit_cards || []

  const totalBilled = cards.reduce((s, cd) => {
    const b = getCreditCardBilling(cd, state.transactions)
    return s + Math.max(0, b.billedAmount)
  }, 0)

  return (
    <>
      <Card>
        <div
          role="button"
          tabIndex={0}
          onClick={onViewDetails}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            onViewDetails()
          }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cards.length ? 16 : 0, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="5" y1="15" x2="9" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Credit Cards</div>
                <button
                  onClick={e => { e.stopPropagation(); setInfoOpen(true) }}
                  onKeyDown={e => e.stopPropagation()}
                  aria-label="About credit cards"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </button>
              </div>
              <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                {cards.length} card{cards.length !== 1 ? 's' : ''} · Billed {fmt(totalBilled)}
              </div>
            </div>
          </div>
          <button
            onClick={onViewDetails}
            aria-label="Open Credit Cards page"
            style={{
              flexShrink: 0, height: 31, padding: '0 12px', borderRadius: 999,
              background: c.surface, border: `1px solid ${c.faint}`, color: c.ink,
              font: '600 13px Plus Jakarta Sans', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            View Details
          </button>
        </div>

        {cards.length === 0 ? (
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>No cards yet. Tap View Details to add one.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cards.map(card => (
              <CreditCardTile
                key={card.id}
                card={card}
                state={state}
                expanded={expandedId === card.id}
                onToggle={() => setExpandedId(expandedId === card.id ? null : card.id)}
                onPay={() => openPay(card)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Section info popup */}
      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="3" fill="none" stroke={c.accent} strokeWidth="2"/>
                  <line x1="2" y1="10" x2="22" y2="10" stroke={c.accent} strokeWidth="2"/>
                  <line x1="6" y1="15" x2="10" y2="15" stroke={c.accent} strokeWidth="2"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Credit Cards</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
                  title: 'Track outstanding balance',
                  desc: 'See how much you currently owe on each card and your available credit at a glance.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                  title: 'Bill & due date alerts',
                  desc: 'Set your billing cycle, statement date, and due date to get warned when payment is approaching.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
                  title: 'Pay bill',
                  desc: 'Record a payment from any of your accounts — the outstanding balance updates automatically.',
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
                Enable credit card tracking in <strong style={{ color: c.ink }}>Settings</strong> to show this section on your dashboard.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {sheets}
    </>
  )
}
