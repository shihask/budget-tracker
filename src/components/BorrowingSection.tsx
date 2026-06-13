import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import type { AppState } from '@/types'

interface Props {
  state: AppState
  onSeeAll: () => void
  onAdd: () => void
}

export function BorrowingSection({ state, onSeeAll, onAdd }: Props) {
  const c = useTheme()
  const [infoOpen, setInfoOpen] = useState(false)

  const activeLent = state.borrowings.filter(b => (b.direction || 'lent') === 'lent' && (b.remaining_amount ?? (b.total_amount - b.paid_amount)) > 0)
  const activeBorrowed = state.borrowings.filter(b => (b.direction || 'lent') === 'borrowed' && (b.remaining_amount ?? (b.total_amount - b.paid_amount)) > 0)
  const totalLentRemaining = activeLent.reduce((s, b) => s + (b.remaining_amount ?? (b.total_amount - b.paid_amount)), 0)
  const totalOwedRemaining = activeBorrowed.reduce((s, b) => s + (b.remaining_amount ?? (b.total_amount - b.paid_amount)), 0)

  return (
    <>
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: state.borrowings.length ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Lend & Borrow</div>
            <button onClick={() => setInfoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.muted }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={onSeeAll} style={{ font: '600 13px Plus Jakarta Sans', color: c.accent, cursor: 'pointer' }}>See all</span>
          <button onClick={onAdd} aria-label="Add entry" style={{ width: 28, height: 28, borderRadius: 9, border: 'none', background: c.accentSoft, color: c.accent, cursor: 'pointer', font: '700 18px Plus Jakarta Sans', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>+</button>
        </div>
      </div>

      {state.borrowings.length === 0 ? (
        <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, paddingTop: 4 }}>
          No entries yet.{' '}
          <span onClick={onSeeAll} style={{ color: c.accent, cursor: 'pointer' }}>Tap to add</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }} onClick={onSeeAll}>
          <div style={{ flex: 1, background: c.goodSoft, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.good, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Owed to you</div>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.good, marginTop: 3 }}>{fmt(totalLentRemaining)}</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{activeLent.length} active entr{activeLent.length === 1 ? 'y' : 'ies'}</div>
          </div>
          <div style={{ flex: 1, background: c.badSoft, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.bad, textTransform: 'uppercase', letterSpacing: '0.04em' }}>You owe</div>
            <div style={{ font: '800 20px Plus Jakarta Sans', color: c.bad, marginTop: 3 }}>{fmt(totalOwedRemaining)}</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 3 }}>{activeBorrowed.length} active entr{activeBorrowed.length === 1 ? 'y' : 'ies'}</div>
          </div>
        </div>
      )}
    </Card>

      {infoOpen && (
        <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.surface, borderRadius: 22, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: c.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Lend & Borrow</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.good} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
                  title: 'Owed to you',
                  desc: 'Money you lent to friends or family that hasn\'t been paid back yet.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.bad} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
                  title: 'You owe',
                  desc: 'Money you borrowed from someone else and still need to return.',
                },
                {
                  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
                  title: 'Record payments',
                  desc: 'Tap "See all" to log partial or full repayments and keep the balance accurate.',
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
                Borrowings are tracked separately and do <strong style={{ color: c.ink }}>not</strong> affect your Spendable Balance or Real Free Money.
              </div>
            </div>
            <button onClick={() => setInfoOpen(false)} style={{ marginTop: 16, width: '100%', background: c.surface2, border: 'none', borderRadius: 12, padding: 11, font: '700 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
