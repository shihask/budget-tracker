import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { PILLARS, PILLAR_LABEL, type CategoryGroupView, type Pillar, type PillarTotals } from '../lib/pillars'

interface Props {
  totals: PillarTotals
  disabled: boolean
  onCategory: (categoryId: string, pillar: Pillar | null) => Promise<void>
  onTxn: (transactionId: string, pillar: Pillar | null) => Promise<void>
}

const money = (n: number) => fmt(Math.round(n))
const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** Review transactions: one row per category (its default pillar, for all its
 *  spending), expandable to the expenses inside (each can differ — "Only this
 *  expense"). Never edits a transaction or category; only Kakeibo's own tables. */
export function PillarReview({ totals, disabled, onCategory, onTxn }: Props) {
  const c = useTheme()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (err) { console.error('Kakeibo pillar save failed', err); setError("Couldn't save that change — check your connection and try again.") }
    finally { setBusy(false) }
  }
  const toggle = (k: string) => setOpen(prev => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s })

  const selectStyle: React.CSSProperties = {
    background: c.surface, color: c.ink, border: `1.5px solid ${c.faint}`, borderRadius: 10,
    padding: '6px 8px', font: '700 12px Plus Jakarta Sans', maxWidth: 150,
  }
  const tag = (text: string, tone: 'muted' | 'accent' | 'warn') => (
    <span style={{
      font: '700 10px Plus Jakarta Sans', padding: '2px 6px', borderRadius: 999,
      background: tone === 'warn' ? c.warnSoft : tone === 'accent' ? c.accentSoft : c.surface2,
      color: tone === 'warn' ? c.warn : tone === 'accent' ? c.accent : c.muted, whiteSpace: 'nowrap',
    }}>{text}</span>
  )

  const groupRow = (g: CategoryGroupView) => {
    const k = g.categoryId ?? '__none__'
    const isOpen = open.has(k)
    const unresolved = g.rows.some(r => !r.pillar)
    return (
      <div key={k} style={{ borderTop: `1px solid ${c.faint}`, padding: '10px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button" onClick={() => toggle(k)} aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Hide' : 'Show'} ${g.name} expenses`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.muted, display: 'flex' }}
          >{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{g.name}</span>
              {g.source === 'ai' && tag('AI', 'accent')}
              {g.exceptions > 0 && tag(`${g.exceptions} exception${g.exceptions === 1 ? '' : 's'}`, 'muted')}
              {unresolved && tag('Needs review', 'warn')}
            </div>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{money(g.amount)} · {g.rows.length} expense{g.rows.length === 1 ? '' : 's'}</div>
          </div>
          {g.categoryId ? (
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <select
                aria-label={`Pillar for all ${g.name} spending`}
                value={g.pillar ?? ''}
                disabled={disabled || busy}
                onChange={e => {
                  const v = e.target.value
                  run(() => onCategory(g.categoryId!, v === '__reset' ? null : (v as Pillar)))
                }}
                style={{ ...selectStyle, borderColor: g.pillar ? c.faint : c.warn }}
              >
                {!g.pillar && <option value="" disabled>Choose…</option>}
                {PILLARS.map(p => <option key={p} value={p}>{PILLAR_LABEL[p]}</option>)}
                {(g.source === 'user' || g.source === 'ai') && <option value="__reset">Reset to default</option>}
              </select>
              <span style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>Applies to all {g.name} spending</span>
            </label>
          ) : (
            <span style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, maxWidth: 140, textAlign: 'right' }}>No category — choose per expense</span>
          )}
        </div>

        {isOpen && (
          <div style={{ margin: '8px 0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.rows.map(r => (
              <div key={r.t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.t.description || g.name}
                  </div>
                  <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
                    {dateLabel(r.t.transaction_date)} · {money(r.amount)}{r.lifeEvent ? ' · life event' : ''}
                  </div>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <select
                    aria-label={`Pillar for this ${g.name} expense only`}
                    value={r.pillar ?? ''}
                    disabled={disabled || busy}
                    onChange={e => {
                      const v = e.target.value
                      run(() => onTxn(r.t.id, v === '__default' ? null : (v as Pillar)))
                    }}
                    style={{ ...selectStyle, borderColor: r.pillar ? c.faint : c.warn, fontWeight: r.source === 'txn' ? 800 : 600 }}
                  >
                    {!r.pillar && <option value="" disabled>Choose…</option>}
                    {PILLARS.map(p => <option key={p} value={p}>{PILLAR_LABEL[p]}</option>)}
                    {r.source === 'txn' && <option value="__default">Use category default</option>}
                  </select>
                  <span style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>{r.source === 'txn' ? 'Only this expense' : 'From category'}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6, lineHeight: 1.5 }}>
        A category's pillar applies to all its spending. Open a category to change a single expense. Your MoneyPlant categories don't change.
      </div>
      {error && <div role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginBottom: 6 }}>{error}</div>}
      {totals.groups.map(groupRow)}
    </div>
  )
}
