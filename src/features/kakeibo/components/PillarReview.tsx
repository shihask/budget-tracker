import { useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import {
  PILLARS, PILLAR_LABEL, PILLAR_PLAIN, PILLAR_EXAMPLES, PILLAR_COLOR,
  type CategoryGroupView, type Pillar, type PillarSource, type PillarTotals,
} from '../lib/pillars'
import { PillarIcon } from './pillarStyle'

interface Props {
  totals: PillarTotals
  disabled: boolean
  onCategory: (categoryId: string, pillar: Pillar | null) => Promise<void>
  onTxn: (transactionId: string, pillar: Pillar | null) => Promise<void>
}

const money = (n: number) => fmt(Math.round(n))
const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** What the picker sheet is choosing for. */
type Target =
  | { scope: 'category'; categoryId: string; name: string; amount: number; count: number; pillar: Pillar | null; source: PillarSource | null }
  | { scope: 'txn'; transactionId: string; name: string; category: string; amount: number; date: string; pillar: Pillar | null; source: PillarSource | null }

/** Review transactions: one row per category (its default pillar, for all its
 *  spending), expandable to the expenses inside (each can differ — "Only this
 *  expense"). Never edits a transaction or category; only Kakeibo's own tables. */
export function PillarReview({ totals, disabled, onCategory, onTxn }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Pillar | 'reset' | null>(null)
  const [target, setTarget] = useState<Target | null>(null)

  const toggle = (k: string) => setOpen(prev => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s })

  const choose = async (value: Pillar | null) => {
    if (!target) return
    setSaving(value ?? 'reset'); setError(null)
    try {
      if (target.scope === 'category') await onCategory(target.categoryId, value)
      else await onTxn(target.transactionId, value)
      setTarget(null)
    } catch (err) {
      console.error('Kakeibo pillar save failed', err)
      setError("Couldn't save that change — check your connection and try again.")
    } finally { setSaving(null) }
  }

  const tag = (text: string, tone: 'muted' | 'accent' | 'warn') => (
    <span style={{
      font: '700 10px Plus Jakarta Sans', padding: '2px 7px', borderRadius: 999,
      background: tone === 'warn' ? c.warnSoft : tone === 'accent' ? c.accentSoft : c.surface2,
      color: tone === 'warn' ? c.warn : tone === 'accent' ? c.accent : c.muted, whiteSpace: 'nowrap',
    }}>{text}</span>
  )

  /** The compact chip on each row: the pillar's colour, icon and name — or a
   *  dashed "Choose" when it still needs review. Opens the picker sheet. */
  const chip = (pillar: Pillar | null, label: string, onClick: () => void, strong = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-haspopup="dialog"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        padding: '6px 10px 6px 8px', borderRadius: 999, cursor: disabled ? 'default' : 'pointer',
        background: pillar ? PILLAR_COLOR[pillar] + '1A' : 'transparent',
        border: pillar ? `1.5px solid ${PILLAR_COLOR[pillar]}${strong ? '' : '40'}` : `1.5px dashed ${c.warn}`,
        color: pillar ? c.ink : c.warn, font: `${strong ? 800 : 700} 12px Plus Jakarta Sans`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {pillar && <PillarIcon pillar={pillar} size={14} />}
      <span>{pillar ? PILLAR_LABEL[pillar] : 'Choose'}</span>
      <ChevronDown size={13} color={c.muted} />
    </button>
  )

  const groupRow = (g: CategoryGroupView) => {
    const k = g.categoryId ?? '__none__'
    const isOpen = open.has(k)
    const unresolved = g.rows.some(r => !r.pillar)
    return (
      <div key={k} style={{ borderTop: `1px solid ${c.faint}`, padding: '12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button" onClick={() => toggle(k)} aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Hide' : 'Show'} ${g.name} expenses`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.muted, display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textAlign: 'left' }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{g.name}</span>
                {g.source === 'ai' && tag('AI', 'accent')}
                {g.exceptions > 0 && tag(`${g.exceptions} exception${g.exceptions === 1 ? '' : 's'}`, 'muted')}
                {unresolved && tag('Needs review', 'warn')}
              </span>
              <span style={{ display: 'block', font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                {money(g.amount)} · {g.rows.length} expense{g.rows.length === 1 ? '' : 's'}
              </span>
            </span>
          </button>
          {g.categoryId
            ? chip(g.pillar, `Pillar for all ${g.name} spending: ${g.pillar ? PILLAR_LABEL[g.pillar] : 'not chosen'}`, () => setTarget({
                scope: 'category', categoryId: g.categoryId!, name: g.name, amount: g.amount, count: g.rows.length, pillar: g.pillar, source: g.source,
              }))
            : <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textAlign: 'right', maxWidth: 120 }}>Choose per expense</span>}
        </div>

        {isOpen && (
          <div style={{ margin: '10px 0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.rows.map(r => (
              <div key={r.t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.t.description || g.name}
                  </div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                    {dateLabel(r.t.transaction_date)} · {money(r.amount)}{r.lifeEvent ? ' · life event' : ''}
                    {r.source === 'txn' && <span style={{ color: c.accent, fontWeight: 700 }}> · only this expense</span>}
                  </div>
                </div>
                {chip(r.pillar, `Pillar for this ${g.name} expense: ${r.pillar ? PILLAR_LABEL[r.pillar] : 'not chosen'}`, () => setTarget({
                  scope: 'txn', transactionId: r.t.id, name: r.t.description || g.name, category: g.name,
                  amount: r.amount, date: r.t.transaction_date, pillar: r.pillar, source: r.source,
                }), r.source === 'txn')}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const canReset = target?.scope === 'category'
    ? target.source === 'user' || target.source === 'ai'
    : target?.source === 'txn'

  return (
    <div>
      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6, lineHeight: 1.5 }}>
        A category's pillar applies to all its spending. Open a category to change a single expense. Your MoneyPlant categories don't change.
      </div>
      {error && !target && <div role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginBottom: 6 }}>{error}</div>}
      {totals.groups.map(groupRow)}

      <BottomSheet open={target != null} onClose={() => { if (!saving) { setTarget(null); setError(null) } }} showHelpButton={false} dismissible={!saving}>
        {target && (
          <div>
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>{target.name}</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '3px 0 16px', lineHeight: 1.5 }}>
              {target.scope === 'category'
                ? <>Applies to <b style={{ color: c.ink }}>all {target.name} spending</b> · {target.count} expense{target.count === 1 ? '' : 's'} · {money(target.amount)}</>
                : <>Applies to <b style={{ color: c.ink }}>only this expense</b> · {target.category} · {dateLabel(target.date)} · {money(target.amount)}</>}
            </div>

            <div role="radiogroup" aria-label="Kakeibo pillar" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PILLARS.map(p => {
                const selected = target.pillar === p
                const color = PILLAR_COLOR[p]
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving != null}
                    onClick={() => { if (!selected) void choose(p); else setTarget(null) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                      padding: '12px 14px', borderRadius: 16, cursor: saving ? 'default' : 'pointer',
                      background: selected ? color + '14' : c.surface,
                      border: `1.5px solid ${selected ? color : c.faint}`,
                      opacity: saving && saving !== p ? 0.55 : 1,
                    }}
                  >
                    <span style={{
                      width: 40, height: 40, borderRadius: 12, background: color + '1F', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><PillarIcon pillar={p} size={20} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', font: '800 14px Plus Jakarta Sans', color: c.ink }}>
                        {PILLAR_LABEL[p]} <span style={{ font: '600 12px Plus Jakarta Sans', color: c.sub }}>· {PILLAR_PLAIN[p]}</span>
                      </span>
                      <span style={{ display: 'block', font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 2, lineHeight: 1.4 }}>{PILLAR_EXAMPLES[p]}</span>
                    </span>
                    <span style={{
                      width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                      border: selected ? 'none' : `1.5px solid ${c.faint}`, background: selected ? color : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <Check size={14} color="#fff" strokeWidth={3} />}
                      {saving === p && !selected && <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />}
                    </span>
                  </button>
                )
              })}
            </div>

            {error && <div role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 12 }}>{error}</div>}

            {canReset && (
              <button
                type="button"
                disabled={saving != null}
                onClick={() => { void choose(null) }}
                style={{
                  marginTop: 14, width: '100%', background: 'transparent', border: `1.5px solid ${c.faint}`,
                  borderRadius: 12, padding: '11px 14px', color: c.sub, font: '700 13px Plus Jakarta Sans',
                  cursor: saving ? 'default' : 'pointer',
                }}
              >
                {saving === 'reset' ? 'Saving…' : target.scope === 'category' ? 'Reset to default' : `Use the ${target.category} default`}
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
