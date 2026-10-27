import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import { fmt } from '@/lib/utils'
import { budgetLine, monthKey, monthLabel, type BudgetLine, type HouseholdSummary } from '../lib/budget'
import { HouseholdIcon } from '../lib/icons'
import { parseLimit } from '../lib/validation'
import { householdErrorMessage } from '../lib/errors'
import type { HouseholdBudget, HouseholdCategory } from '../types'
import { Button, Card, ErrorText, FieldLabel, MonthSwitcher, ProgressBar, SectionLabel } from './ui'
import { useFieldStyle } from '../hooks/usePageShell'

export interface BudgetTarget { categoryId: string | null; name: string; existing: HouseholdBudget | null }

/** Screen 7 — household budgets. Calculated from shared expenses only; personal
 *  budgets are a different system and are never read here. */
export function HouseholdBudgets({ summary, month, onMonth, budgets, categories, onEdit }: {
  summary: HouseholdSummary
  month: string
  onMonth: (m: string) => void
  budgets: HouseholdBudget[]
  categories: HouseholdCategory[]
  onEdit: (target: BudgetTarget) => void
}) {
  const c = useTheme()
  const overallBudget = budgets.find(b => b.category_id == null) ?? null
  const lineByCategory = new Map(summary.categories.map(l => [l.categoryId, l]))
  const expenseCats = categories.filter(cat => cat.kind === 'expense' && (!cat.is_archived || lineByCategory.has(cat.id)))
  // Budgeted or spent-in first, then the rest alphabetically.
  const rows = expenseCats
    .map(cat => ({ cat, line: lineByCategory.get(cat.id) ?? budgetLine(0, null), budget: budgets.find(b => b.category_id === cat.id) ?? null }))
    .sort((a, b) => Number(!!b.budget) - Number(!!a.budget) || b.line.spent - a.line.spent || a.cat.name.localeCompare(b.cat.name))

  return (
    <div>
      <MonthSwitcher month={month} onChange={onMonth} />
      <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '-4px 0 14px', lineHeight: 1.5 }}>
        Budgets repeat every month and count shared expenses only. Shared income doesn't reduce them.
      </p>

      <SectionLabel>Overall</SectionLabel>
      <BudgetCard
        title="Monthly household budget" line={summary.overall}
        onEdit={() => onEdit({ categoryId: null, name: 'Monthly household budget', existing: overallBudget })}
        isCurrent={month === monthKey(new Date())} month={month}
      />
      {summary.categoryLimitsExceedOverall && (
        <div role="note" style={{ background: c.warnSoft, borderRadius: 13, padding: '10px 13px', font: '600 12px Plus Jakarta Sans', color: c.ink, margin: '10px 0 0', lineHeight: 1.5 }}>
          Your category budgets add up to {fmt(summary.categoryLimitsTotal)}, more than the overall {fmt(summary.overall.limit ?? 0)}.
        </div>
      )}

      <div style={{ height: 20 }} />
      <SectionLabel>By category</SectionLabel>
      <Card style={{ padding: '4px 14px' }}>
        {rows.map(({ cat, line, budget }) => (
          <button key={cat.id} type="button" onClick={() => onEdit({ categoryId: cat.id, name: cat.name, existing: budget })}
            aria-label={`${cat.name}: ${budget ? `${fmt(line.spent)} of ${fmt(budget.monthly_limit)}` : 'no budget'}. Edit budget`}
            style={{ width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${c.faint}`, padding: '12px 0', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: budget ? 8 : 0 }}>
              <HouseholdIcon name={cat.icon} size={15} color={c.sub} />
              <span style={{ flex: 1, font: '700 13px Plus Jakarta Sans', color: c.ink }}>{cat.name}</span>
              {budget ? (
                <span style={{ font: '700 12px Plus Jakarta Sans', color: line.status === 'over' ? c.bad : c.sub }}>
                  {line.status === 'over' ? `${fmt(line.over)} over` : `${fmt(line.remaining ?? 0)} left`}
                </span>
              ) : (
                <span style={{ font: '700 12px Plus Jakarta Sans', color: c.accent }}>{line.spent > 0 ? `${fmt(line.spent)} · ` : ''}Set budget</span>
              )}
            </div>
            {budget && <ProgressBar progress={line.progress} tone={line.status === 'none' ? 'ok' : line.status} label={`${cat.name} budget used`} />}
          </button>
        ))}
      </Card>
    </div>
  )
}

function BudgetCard({ title, line, onEdit, isCurrent, month }: { title: string; line: BudgetLine; onEdit: () => void; isCurrent: boolean; month: string }) {
  const c = useTheme()
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ font: '700 13px Plus Jakarta Sans', color: c.sub }}>{title}</span>
        <button type="button" onClick={onEdit} aria-label="Edit monthly household budget"
          style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: c.surface2, color: c.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Pencil size={15} />
        </button>
      </div>
      {line.limit == null ? (
        <>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>No budget set</div>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>{fmt(line.spent)} spent {isCurrent ? 'this month' : `in ${monthLabel(month)}`}</div>
          <Button kind="secondary" onClick={onEdit}>Set budget</Button>
        </>
      ) : (
        <>
          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{fmt(line.spent)} <span style={{ font: '600 14px Plus Jakarta Sans', color: c.muted }}>of {fmt(line.limit)}</span></div>
          <div style={{ margin: '10px 0 8px' }}><ProgressBar progress={line.progress} tone={line.status === 'none' ? 'ok' : line.status} label="Monthly household budget used" /></div>
          <div style={{ font: '700 13px Plus Jakarta Sans', color: line.status === 'over' ? c.bad : c.good }}>
            {line.status === 'over' ? `${fmt(line.over)} over budget` : `${fmt(line.remaining ?? 0)} remaining`}
          </div>
        </>
      )}
    </Card>
  )
}

export function BudgetEditSheet({ target, onClose, onSave }: {
  target: BudgetTarget | null
  onClose: () => void
  /** limit null removes the budget */
  onSave: (target: BudgetTarget, limit: number | null) => Promise<void>
}) {
  const c = useTheme()
  const field = useFieldStyle()
  const [value, setValue] = useState(target?.existing ? String(target.existing.monthly_limit) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (limit: number | null) => {
    if (!target) return
    setBusy(true); setError(null)
    try { await onSave(target, limit); onClose() }
    catch (err) { setError(householdErrorMessage(err, "Couldn't save the budget. Try again.")) }
    finally { setBusy(false) }
  }

  const submit = () => {
    const l = parseLimit(value)
    if (!l.ok) { setError(l.error); return }
    void run(l.value)
  }

  return (
    <BottomSheet open={!!target} onClose={busy ? () => {} : onClose} zIndex={220} showHelpButton={false} dismissible={!busy}>
      {target && (
        <form onSubmit={e => { e.preventDefault(); submit() }} style={{ padding: '0 4px 12px' }}>
          <h2 style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, margin: '0 0 4px' }}>{target.name}</h2>
          <p style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
            {target.categoryId == null ? 'The most the household plans to spend each month, across all categories.' : 'A monthly limit for this category.'}
          </p>
          <FieldLabel htmlFor="hh-limit">Monthly limit (₹)</FieldLabel>
          <input id="hh-limit" inputMode="decimal" autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 35,000" aria-invalid={!!error}
            style={{ ...field, font: '800 20px Plus Jakarta Sans' }} />
          <ErrorText>{error}</ErrorText>
          <div style={{ height: 16 }} />
          <Button type="submit" full busy={busy}>Save budget</Button>
          {target.existing && (
            <>
              <div style={{ height: 8 }} />
              <Button full kind="quiet" onClick={() => void run(null)} disabled={busy}>Remove budget</Button>
            </>
          )}
        </form>
      )}
    </BottomSheet>
  )
}
