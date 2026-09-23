import type { ReactNode } from 'react'
import {
  Target, CheckCircle, AlertCircle, CalendarClock, ShieldCheck, Sparkles,
  ArrowUpRight, ArrowDownRight, Wallet, Shield, Receipt, PiggyBank,
} from 'lucide-react'
import type { ColorTokens } from '@/lib/tokens'
import { inr, shortDate, type CfoSnapshot, type CfoDecision, type CfoObligation } from '@/lib/cfo-snapshot'
import type { CfoDeltas } from '@/lib/cfo-history'
import { cfoHeadline, relativeCheckTime, type CfoCardData } from './cfoCardText'

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

const FONT = 'Plus Jakarta Sans'

function toneColor(c: ColorTokens, t: Tone): string {
  return t === 'good' ? c.good : t === 'warn' ? c.warn : t === 'bad' ? c.bad : c.ink
}

function headlineTone(card: CfoCardData): Tone {
  const s = card.snap
  switch (card.kind) {
    case 'status': case 'gap': case 'free':
      return s.fundingGap > 0 ? 'warn' : 'good'
    case 'weekly':
      return s.weekly.over > 0 ? 'warn' : 'good'
    case 'afford':
      return !card.verdict ? 'neutral' : card.verdict.verdict === 'yes' ? 'good' : card.verdict.verdict === 'tight' ? 'warn' : 'bad'
    default:
      return 'neutral'
  }
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function Label({ c, children }: { c: ColorTokens; children: ReactNode }) {
  return (
    <div style={{ font: `700 11px ${FONT}`, letterSpacing: 0.6, textTransform: 'uppercase', color: c.muted, margin: '14px 0 6px' }}>
      {children}
    </div>
  )
}

function Row({ c, left, right, sub, tone = 'neutral', strong, muted }: {
  c: ColorTokens; left: ReactNode; right: string; sub?: string; tone?: Tone; strong?: boolean; muted?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: `${strong ? 700 : 500} 13px ${FONT}`, color: muted ? c.muted : c.sub, overflowWrap: 'anywhere' }}>{left}</div>
        {sub && <div style={{ font: `400 11px ${FONT}`, color: c.muted }}>{sub}</div>}
      </div>
      <div style={{
        font: `${strong ? 800 : 600} ${strong ? 14 : 13}px ${FONT}`, whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums', color: muted ? c.muted : toneColor(c, tone),
      }}>{right}</div>
    </div>
  )
}

function Decision({ c, d }: { c: ColorTokens; d: CfoDecision }) {
  const urgent = d.kind === 'need' || d.kind === 'pause-savings'
  const color = urgent ? c.warn : c.good
  return (
    <div style={{
      background: urgent ? c.warnSoft : c.goodSoft, border: `1px solid ${color}55`,
      borderRadius: 14, padding: '11px 13px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `700 11px ${FONT}`, letterSpacing: 0.6, textTransform: 'uppercase', color }}>
        <Target size={12} strokeWidth={2.5} /> Today's decision
      </div>
      <div style={{ font: `700 15px ${FONT}`, color: c.ink, lineHeight: 1.45, marginTop: 5 }}>{d.title}</div>
      <div style={{ font: `500 12.5px ${FONT}`, color: c.sub, lineHeight: 1.5, marginTop: 3 }}>{d.reason}</div>
    </div>
  )
}

function Tiles({ c, s }: { c: ColorTokens; s: CfoSnapshot }) {
  const tiles: { icon: ReactNode; label: string; value: string; sub: string; tone: Tone }[] = [
    { icon: <Wallet size={11} />, label: 'Liquid cash', value: inr(s.liquidCash), sub: `${s.accounts.length} account${s.accounts.length === 1 ? '' : 's'}`, tone: 'neutral' },
    { icon: <Shield size={11} />, label: 'Emergency', value: inr(s.emergencyFund), sub: s.emergencyFund > 0 ? 'Protected' : 'Not set', tone: 'neutral' },
    { icon: <Receipt size={11} />, label: 'Mandatory bills', value: inr(s.mandatoryTotal), sub: s.nextIncomeDate ? `Before ${s.incomeLabel}` : 'Next 30 days', tone: 'neutral' },
    s.fundingGap > 0
      ? { icon: <AlertCircle size={11} />, label: 'Short by', value: inr(s.fundingGap), sub: 'Needs a funding plan', tone: 'bad' }
      : { icon: <CheckCircle size={11} />, label: 'Free money', value: inr(s.freeMoney), sub: 'Safe to use', tone: 'good' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
      {tiles.map(t => (
        <div key={t.label} style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 12, padding: '9px 10px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.muted, font: `500 10.5px ${FONT}` }}>{t.icon}{t.label}</div>
          <div style={{ font: `800 16px ${FONT}`, color: toneColor(c, t.tone), marginTop: 3, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{t.value}</div>
          <div style={{ font: `400 10.5px ${FONT}`, color: c.muted, marginTop: 1 }}>{t.sub}</div>
        </div>
      ))}
    </div>
  )
}

function Runway({ c, s }: { c: ColorTokens; s: CfoSnapshot }) {
  const short = s.runway.runsShortOn
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
      <CalendarClock size={15} color={short ? c.warn : c.good} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ font: `600 13px ${FONT}`, color: c.ink }}>
          Bill runway · {short
            ? `Bills run short on ${shortDate(short)}`
            : s.nextIncomeDate ? `Covers all scheduled bills until ${shortDate(s.nextIncomeDate)}` : 'Covers all scheduled bills'}
        </div>
        <div style={{ font: `400 11px ${FONT}`, color: c.muted }}>Excludes groceries, fuel and other day-to-day spending.</div>
      </div>
    </div>
  )
}

function PostIncomeRisk({ c, s }: { c: ColorTokens; s: CfoSnapshot }) {
  if (!s.postIncomeRisk) return null
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, font: `500 12.5px ${FONT}`, color: c.sub, lineHeight: 1.5 }}>
      <AlertCircle size={14} color={c.warn} style={{ flexShrink: 0, marginTop: 2 }} />
      Even after your {s.incomeLabel}, bills around {shortDate(s.postIncomeRisk.date)} take your balance to {inr(s.postIncomeRisk.balance)}.
    </div>
  )
}

function Equation({ c, s }: { c: ColorTokens; s: CfoSnapshot }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 12, padding: '8px 12px' }}>
      <Row c={c} left="Liquid cash" right={inr(s.liquidCash)} />
      <Row c={c} left="Emergency fund" right={inr(-s.emergencyFund)} />
      <Row c={c} left="Credit cards" right={inr(-s.cardTotal)} />
      <Row c={c} left="Fixed commitments" right={inr(-s.fixedTotal)} />
      <div style={{ borderTop: `1px solid ${c.grid}`, margin: '5px 0' }} />
      {s.fundingGap > 0
        ? <Row c={c} left="Funding gap" right={inr(s.fundingGap)} tone="bad" strong />
        : <Row c={c} left="Free money" right={inr(s.freeMoney)} tone="good" strong />}
      {/* Outside the result on purpose: savings are a choice, not a bill. */}
      {s.flexibleTotal > 0 && (
        <div style={{ marginTop: 4 }}>
          <Row c={c} muted
            left={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PiggyBank size={12} />Flexible savings · pause-able</span>}
            right={inr(-s.flexibleTotal)}
          />
          <Row c={c} muted left="After savings" right={inr(s.afterSavings)} />
        </div>
      )}
    </div>
  )
}

function Bills({ c, items }: { c: ColorTokens; items: CfoObligation[] }) {
  return (
    <>
      {items.map((o, i) => (
        <Row key={`${o.title}-${o.date}-${i}`} c={c} left={o.title} sub={shortDate(o.date)} right={inr(o.amount)} />
      ))}
    </>
  )
}

function Accounts({ c, s }: { c: ColorTokens; s: CfoSnapshot }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 12, padding: '8px 12px', marginTop: 10 }}>
      {s.accounts.map(a => <Row key={a.name} c={c} left={a.name} right={inr(a.balance)} tone={a.balance < 0 ? 'bad' : 'neutral'} />)}
      <div style={{ borderTop: `1px solid ${c.grid}`, margin: '5px 0' }} />
      <Row c={c} left="Total" right={inr(s.liquidCash)} strong />
    </div>
  )
}

function Changed({ c, deltas }: { c: ColorTokens; deltas: CfoDeltas }) {
  const rows: { label: string; value: number; goodWhenUp: boolean | null }[] = [
    { label: 'Credit card debt', value: deltas.cardDebt, goodWhenUp: false },
    { label: 'Free money', value: deltas.freeMoney, goodWhenUp: true },
    { label: 'Liquid cash', value: deltas.liquidCash, goodWhenUp: true },
    { label: 'Lifestyle spending logged', value: deltas.lifestyleSince, goodWhenUp: null },
  ].filter(r => Math.round(r.value) !== 0)
  return (
    <>
      <div style={{ font: `400 11px ${FONT}`, color: c.muted, marginBottom: 4 }}>
        Compared with your last check on this device · {relativeCheckTime(deltas.since)}
      </div>
      {rows.length === 0 && <div style={{ font: `500 13px ${FONT}`, color: c.sub }}>Nothing has moved since then.</div>}
      {rows.map(r => {
        const up = r.value > 0
        const tone: Tone = r.goodWhenUp == null ? 'neutral' : up === r.goodWhenUp ? 'good' : 'bad'
        const Arrow = up ? ArrowUpRight : ArrowDownRight
        return (
          <Row key={r.label} c={c} tone={tone}
            left={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {r.goodWhenUp != null && <Arrow size={13} color={toneColor(c, tone)} />}{r.label}
            </span>}
            right={r.goodWhenUp == null ? inr(r.value) : `${up ? '+' : ''}${inr(r.value)}`}
          />
        )
      })}
    </>
  )
}

function Insight({ c, s, text, pending, cursor }: { c: ColorTokens; s: CfoSnapshot; text: string; pending: boolean; cursor?: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: `700 11px ${FONT}`, letterSpacing: 0.6, textTransform: 'uppercase', color: c.accent }}>
          <Sparkles size={12} /> AI insight
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: `500 10.5px ${FONT}`, color: c.muted }}>
          <ShieldCheck size={11} /> {s.confidence === 'exact' ? 'Live financial snapshot' : 'Estimated snapshot · salary date unknown'}
        </span>
      </div>
      <p style={{ font: `500 13.5px ${FONT}`, color: c.sub, lineHeight: 1.6, margin: '5px 0 0' }}>
        {text ? renderBold(text, c) : pending ? <span style={{ color: c.muted }}>Mint is reading your numbers…</span> : null}
        {cursor}
      </p>
    </div>
  )
}

function renderBold(text: string, c: ColorTokens): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ fontWeight: 700, color: c.ink }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  )
}

/* ── The card ────────────────────────────────────────────────────────────── */

export function CfoCard({ card, c, insight, insightPending, withInsight, cursor }: {
  card: CfoCardData
  c: ColorTokens
  insight: string
  insightPending: boolean
  withInsight: boolean
  cursor?: ReactNode
}) {
  const s = card.snap
  const tone = headlineTone(card)
  const HeadIcon = tone === 'good' ? CheckCircle : tone === 'neutral' ? Wallet : AlertCircle
  const decision = card.kind === 'status' || card.kind === 'gap' ? card.decision : null
  const mandatory = s.obligations.filter(o => o.tier !== 'flexible')

  return (
    <div>
      {decision && <div style={{ marginBottom: 12 }}><Decision c={c} d={decision} /></div>}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <HeadIcon size={17} color={toneColor(c, tone === 'neutral' ? 'good' : tone)} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} />
        <p style={{ font: `600 16px ${FONT}`, color: c.ink, lineHeight: 1.5, margin: 0 }}>{cfoHeadline(card)}</p>
      </div>

      {card.kind === 'status' && (
        <>
          <Label c={c}>Cash flow snapshot</Label>
          <Tiles c={c} s={s} />
          <Runway c={c} s={s} />
          <PostIncomeRisk c={c} s={s} />
          {card.story.length > 0 && (
            <>
              <Label c={c}>This month's story</Label>
              <p style={{ font: `500 13px ${FONT}`, color: c.sub, lineHeight: 1.6, margin: 0 }}>{card.story.join(' ')}</p>
            </>
          )}
          <Label c={c}>Cash flow equation</Label>
          <Equation c={c} s={s} />
          {mandatory.length > 0 && (
            <>
              <Label c={c}>Top priorities</Label>
              <Bills c={c} items={mandatory.slice(0, 3)} />
            </>
          )}
        </>
      )}

      {card.kind === 'gap' && (
        <>
          <Runway c={c} s={s} />
          <PostIncomeRisk c={c} s={s} />
          <Label c={c}>Where the pressure comes from</Label>
          <Row c={c} left="Credit cards" right={inr(s.cardTotal)} />
          <Row c={c} left="Fixed commitments" right={inr(s.fixedTotal)} />
          {mandatory.length > 0 && (
            <>
              <Label c={c}>Biggest bills</Label>
              <Bills c={c} items={[...mandatory].sort((a, b) => b.amount - a.amount).slice(0, 3)} />
            </>
          )}
          {s.flexibleTotal > 0 && (
            <>
              <Label c={c}>Could be paused</Label>
              <Bills c={c} items={s.obligations.filter(o => o.tier === 'flexible')} />
            </>
          )}
        </>
      )}

      {(card.kind === 'liquid' || card.kind === 'balances') && (
        <>
          <Accounts c={c} s={s} />
          {card.kind === 'liquid' && s.emergencyFund > 0 && (
            <div style={{ font: `500 12.5px ${FONT}`, color: c.sub, marginTop: 8 }}>
              {inr(s.emergencyFund)} of it is your emergency fund.
            </div>
          )}
        </>
      )}

      {card.kind === 'upcoming' && (
        <>
          {(['card', 'fixed', 'flexible'] as const).map(tier => {
            const items = s.obligations.filter(o => o.tier === tier)
            if (items.length === 0) return null
            const total = items.reduce((a, o) => a + o.amount, 0)
            return (
              <div key={tier}>
                <Label c={c}>{tier === 'card' ? 'Credit cards' : tier === 'fixed' ? 'Fixed commitments' : 'Flexible savings · pause-able'} · {inr(total)}</Label>
                <Bills c={c} items={items} />
              </div>
            )
          })}
          <Runway c={c} s={s} />
        </>
      )}

      {card.kind === 'free' && (
        <>
          <Label c={c}>Cash flow equation</Label>
          <Equation c={c} s={s} />
          <Runway c={c} s={s} />
          <PostIncomeRisk c={c} s={s} />
        </>
      )}

      {card.kind === 'weekly' && s.weekly.topCats.length > 0 && (
        <>
          <Label c={c}>Top categories {s.weekly.periodLabel}</Label>
          {s.weekly.topCats.map(cat => <Row key={cat.name} c={c} left={cat.name} right={inr(cat.amount)} />)}
        </>
      )}

      {card.kind === 'afford' && card.verdict && card.amount != null && (
        <div style={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 12, padding: '8px 12px', marginTop: 10 }}>
          <Row c={c} left="Free money now" right={inr(s.freeMoney)} />
          <Row c={c} left="This purchase" right={inr(-card.amount)} />
          <div style={{ borderTop: `1px solid ${c.grid}`, margin: '5px 0' }} />
          <Row c={c} left="Free money after" right={inr(card.verdict.after)} strong tone={card.verdict.after < 0 ? 'bad' : card.verdict.verdict === 'tight' ? 'warn' : 'good'} />
          <div style={{ font: `400 11px ${FONT}`, color: c.muted, marginTop: 4 }}>
            {card.verdict.pausesSavings
              ? `Only if you skip ${inr(s.flexibleTotal)} of planned savings.`
              : card.verdict.verdict === 'tight'
              ? `Leaves less than your ${inr(card.verdict.buffer)} safety cushion.`
              : card.verdict.verdict === 'yes'
              ? `Keeps your ${inr(card.verdict.buffer)} safety cushion intact.`
              : `Your bills before your ${s.incomeLabel} already need this money.`}
          </div>
        </div>
      )}

      {withInsight && <Insight c={c} s={s} text={insight} pending={insightPending} cursor={cursor} />}

      {card.kind === 'status' && card.deltas && (
        <>
          <Label c={c}>What changed</Label>
          <Changed c={c} deltas={card.deltas} />
        </>
      )}
      {card.kind === 'changed' && card.deltas && (
        <div style={{ marginTop: 10 }}><Changed c={c} deltas={card.deltas} /></div>
      )}
    </div>
  )
}
