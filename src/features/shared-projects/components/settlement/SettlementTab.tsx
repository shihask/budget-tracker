import { useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Info, Share2, Wallet } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import type { ColorTokens } from '@/lib/tokens'
import type { ProjectTransaction, SettlementResult } from '../../types'
import type { SettlementComputation, SettlementParticipant, Transfer } from '../../lib/settlement'
import {
  rs, standing, breakdownLine, kittyLine, summaryLines, equation, headline, notes, transferHint, shareText,
  type Tone,
} from '../../lib/settlementCopy'
import { FONT, cardStyle } from '../overview/styles'
import { Avatar, Badge } from '../members/MemberRow'
import { RecordPaymentSheet } from './RecordPaymentSheet'
import { RecordedPayments } from './RecordedPayments'

interface Props {
  settlement: SettlementResult
  projectName: string
  /** All project transactions — for the Recorded payments list. */
  transactions?: ProjectTransaction[]
  /** Owner or editor: may record and undo payments. Viewers and the share link: read-only. */
  canEdit?: boolean
  /** Record a payment for a suggested transfer (amount in rupees). */
  onRecordPayment?: (transfer: Transfer, form: { amount: number; date: string; note: string }) => Promise<void>
  onUndoPayment?: (id: string) => Promise<void>
}

const toneColor = (c: ColorTokens, t: Tone) => (t === 'good' ? c.good : t === 'ink' ? c.ink : c.muted)
const sectionLabel = (c: ColorTokens): React.CSSProperties => ({
  font: `700 11px ${FONT}`, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.05em',
})

export function SettlementTab({ settlement, projectName, transactions = [], canEdit = false, onRecordPayment, onUndoPayment }: Props) {
  const d = settlement.detail
  // The sheet is remounted per opening (key) so it starts from the suggested amount.
  const [paying, setPaying] = useState<{ key: number; transfer: Transfer | null; open: boolean }>({ key: 0, transfer: null, open: false })
  if (!d) return null
  const canRecord = canEdit && !!onRecordPayment
  const spent = d.totals.expenses > 0
  const showPlan = spent && d.balanced && d.transfers.length > 0

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SummaryCard d={d} projectName={projectName} />
      {spent && (
        <div style={{ display: 'grid', gap: 12, alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
          {showPlan && <PlanCard transfers={d.transfers} onMarkPaid={canRecord ? t => setPaying(p => ({ key: p.key + 1, transfer: t, open: true })) : undefined} />}
          <StandingsCard d={d} />
        </div>
      )}
      <RecordedPayments transactions={transactions} canEdit={canEdit} onUndo={onUndoPayment} />
      {canRecord && (
        <RecordPaymentSheet
          key={`pay-${paying.key}`}
          open={paying.open}
          transfer={paying.transfer}
          kittyBalance={d.kitty.balance}
          onClose={() => setPaying(p => ({ ...p, open: false }))}
          onSave={form => onRecordPayment!(paying.transfer!, form)}
        />
      )}
    </div>
  )
}

// ── Summary ──────────────────────────────────────────────────────────────

function SummaryCard({ d, projectName }: { d: SettlementComputation; projectName: string }) {
  const c = useTheme()
  const spent = d.totals.expenses > 0
  const lines = spent && d.balanced ? summaryLines(d) : []
  const noteList = notes(d)
  const kittyInvolved = d.kitty.balance !== 0 || d.reconciliation.kittyPays > 0 || d.reconciliation.kittyOwed > 0

  return (
    <div style={{ ...cardStyle(c), padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={sectionLabel(c)}>Settlement</div>
        {spent && <ShareButton d={d} projectName={projectName} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <div style={{ font: `800 19px ${FONT}`, color: c.ink }}>{headline(d)}</div>
        {spent && (d.balanced ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: `700 11px ${FONT}`, color: c.good, background: c.goodSoft, padding: '3px 8px', borderRadius: 999 }}>
            <Check size={12} strokeWidth={3} /> Balanced
          </span>
        ) : (
          <span style={{ font: `700 11px ${FONT}`, color: c.warn, background: c.warnSoft, padding: '3px 8px', borderRadius: 999 }}>Not verified</span>
        ))}
      </div>

      {!spent && (
        <div style={{ font: `500 13px ${FONT}`, color: c.sub, marginTop: 6, lineHeight: 1.5 }}>
          {d.kitty.balance > 0 && <>Kitty balance <strong style={{ color: c.ink }}>{rs(d.kitty.balance)}</strong>. </>}
          Settlement appears once expenses are recorded.
        </div>
      )}

      {lines.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${c.faint}` }}>
          {lines.map(l => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: `1px solid ${c.faint}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: `700 13px ${FONT}`, color: c.ink }}>{l.label}</div>
                <div style={{ font: `500 11px ${FONT}`, color: c.muted }}>{l.hint}</div>
              </div>
              <div style={{ font: `800 14px ${FONT}`, color: c.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{rs(l.amount)}</div>
            </div>
          ))}
          <div style={{ font: `600 12px ${FONT}`, color: c.sub, marginTop: 8 }}>{equation(d)}</div>
        </div>
      )}

      {noteList.map((n, i) => (
        <div key={i} role={n.tone === 'warn' ? 'alert' : undefined} style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, padding: '10px 12px', borderRadius: 12,
          background: n.tone === 'warn' ? c.warnSoft : c.surface2,
        }}>
          {n.tone === 'warn'
            ? <AlertTriangle size={15} color={c.warn} style={{ flexShrink: 0, marginTop: 1 }} />
            : <Info size={15} color={c.muted} style={{ flexShrink: 0, marginTop: 1 }} />}
          <div style={{ font: `500 12px ${FONT}`, color: c.ink, lineHeight: 1.5 }}>{n.text}</div>
        </div>
      ))}

      {spent && (
        <div style={{ font: `500 11px ${FONT}`, color: c.muted, marginTop: 10, lineHeight: 1.5 }}>
          Based on everything recorded so far. If the trip isn't over, this changes as you add expenses.
          {kittyInvolved && " MoneyPlant tracks the kitty balance, not who's holding the cash."}
        </div>
      )}
    </div>
  )
}

function ShareButton({ d, projectName }: { d: SettlementComputation; projectName: string }) {
  const c = useTheme()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const share = async () => {
    const text = shareText(d, projectName)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button onClick={share} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 10,
      border: `1px solid ${c.faint}`, background: c.surface, color: c.ink, font: `700 12px ${FONT}`, cursor: 'pointer',
    }}>
      {state === 'copied' ? <Check size={14} strokeWidth={3} color={c.good} /> : <Share2 size={14} />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't share" : 'Share'}
    </button>
  )
}

// ── How to settle ────────────────────────────────────────────────────────

function KittyTile({ c, size = 30 }: { c: ColorTokens; size?: number }) {
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: size / 3, background: c.accentSoft, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Wallet size={Math.round(size * 0.5)} color={c.accent} />
    </div>
  )
}

function PlanCard({ transfers, onMarkPaid }: { transfers: Transfer[]; onMarkPaid?: (t: Transfer) => void }) {
  const c = useTheme()
  return (
    <section>
      <div style={{ ...sectionLabel(c), margin: '0 4px 8px' }}>How to settle</div>
      <div style={{ ...cardStyle(c), padding: 0, overflow: 'hidden' }}>
        {transfers.map((t, i) => {
          const hint = transferHint(t)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '10px 14px', borderTop: i === 0 ? 'none' : `1px solid ${c.faint}` }}>
              {t.from.kind === 'kitty' ? <KittyTile c={c} /> : <Avatar c={c} name={t.from.name} size={30} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, font: `600 14px ${FONT}`, color: c.ink }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{t.from.name}</span>
                  <ArrowRight size={14} color={c.muted} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{t.to.name}</span>
                </div>
                {hint && <div style={{ font: `500 11px ${FONT}`, color: c.muted, marginTop: 1 }}>{hint}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ font: `800 14px ${FONT}`, color: c.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{rs(t.amount)}</div>
                {onMarkPaid && (
                  <button onClick={() => onMarkPaid(t)} style={{
                    padding: '4px 10px', borderRadius: 999, border: 'none', background: c.accentSoft, color: c.accent,
                    font: `700 11px ${FONT}`, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    Mark as paid
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Where everyone stands ────────────────────────────────────────────────

function StandingsCard({ d }: { d: SettlementComputation }) {
  const c = useTheme()
  const [open, setOpen] = useState<string | null>(null)
  const members = d.participants.filter(p => p.kind === 'member')
  const kitty = d.participants.find(p => p.kind === 'kitty')!
  const showKitty = d.kitty.balance !== 0

  return (
    <section>
      <div style={{ ...sectionLabel(c), margin: '0 4px 8px' }}>Where everyone stands</div>
      <div style={{ ...cardStyle(c), padding: 0, overflow: 'hidden' }}>
        {members.map((p, i) => (
          <StandingRow key={p.id} p={p} verified={d.balanced} first={i === 0}
            open={open === p.id} onToggle={() => setOpen(o => (o === p.id ? null : p.id))} />
        ))}
        {showKitty && (
          <div style={{ borderTop: `1px solid ${c.faint}` }}>
            <button onClick={() => setOpen(o => (o === 'kitty' ? null : 'kitty'))} aria-expanded={open === 'kitty'} style={rowButton(c)}>
              <KittyTile c={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 14px ${FONT}`, color: c.ink }}>Kitty</div>
                <div style={{ font: `500 12px ${FONT}`, color: c.muted }}>
                  Kitty balance {d.kitty.balance < 0 ? '−' : ''}{rs(Math.abs(d.kitty.balance))}
                </div>
              </div>
              {d.balanced && (
                <span style={{ font: `700 13px ${FONT}`, color: c.ink, whiteSpace: 'nowrap' }}>
                  {kitty.net < 0 ? `Pays out ${rs(-kitty.net)}` : `Needs ${rs(kitty.net)} top-up`}
                </span>
              )}
              <ChevronDown size={16} color={c.muted} style={{ flexShrink: 0, transform: open === 'kitty' ? 'rotate(180deg)' : undefined }} />
            </button>
            {open === 'kitty' && <Detail c={c} text={kittyLine(d)} extra="MoneyPlant tracks the kitty balance, not who's holding the cash." />}
          </div>
        )}
      </div>
    </section>
  )
}

const rowButton = (c: ColorTokens): React.CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '10px 14px',
  border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: c.ink, boxSizing: 'border-box',
})

function StandingRow({ p, verified, first, open, onToggle }: {
  p: SettlementParticipant; verified: boolean; first: boolean; open: boolean; onToggle: () => void
}) {
  const c = useTheme()
  const s = standing(p.net)
  // When the settlement isn't verified, show only what each person put in — no owes/gets-back.
  const credits = [p.putIn > 0 && `${rs(p.putIn)} put in kitty`, p.paidPersonally > 0 && `${rs(p.paidPersonally)} paid personally`]
    .filter(Boolean).join(' + ') || 'Nothing put in'
  return (
    <div style={{ borderTop: first ? 'none' : `1px solid ${c.faint}` }}>
      <button onClick={onToggle} aria-expanded={open} style={rowButton(c)}>
        <Avatar c={c} name={p.name} inactive={!p.active} size={30} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: `600 14px ${FONT}`, color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          {!p.active && <Badge c={c}>Inactive</Badge>}
        </div>
        {verified && <span style={{ font: `700 13px ${FONT}`, color: toneColor(c, s.tone), whiteSpace: 'nowrap' }}>{s.label}</span>}
        <ChevronDown size={16} color={c.muted} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && <Detail c={c} text={verified ? breakdownLine(p) : credits} />}
    </div>
  )
}

function Detail({ c, text, extra }: { c: ColorTokens; text: string; extra?: string }) {
  return (
    <div style={{ padding: '0 14px 12px 54px', font: `500 12px ${FONT}`, color: c.sub, lineHeight: 1.5 }}>
      {text}
      {extra && <div style={{ color: c.muted, marginTop: 4 }}>{extra}</div>}
    </div>
  )
}
