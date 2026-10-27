import { Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { monthKey, monthLabel, type HouseholdSummary } from '../lib/budget'
import { HouseholdIcon } from '../lib/icons'
import type { HouseholdCategory, HouseholdMember, HouseholdTransaction, HouseholdEntryType } from '../types'
import { Button, Card, MonthSwitcher, ProgressBar, SectionLabel } from './ui'
import { EntryRow } from './HouseholdTransactionList'

const RECENT_COUNT = 5
const TOP_CATEGORIES = 6

/** Screen 4 — the household dashboard. Every figure is household-only. */
export function HouseholdOverview({ summary, month, onMonth, transactions, categories, members, meMemberId, onAdd, onOpenEntry, onSeeAll, onBudgets }: {
  summary: HouseholdSummary
  month: string
  onMonth: (m: string) => void
  transactions: HouseholdTransaction[]
  categories: HouseholdCategory[]
  members: HouseholdMember[]
  meMemberId: string
  onAdd: (type: HouseholdEntryType) => void
  onOpenEntry: (t: HouseholdTransaction) => void
  onSeeAll: () => void
  onBudgets: () => void
}) {
  const c = useTheme()
  const isCurrent = month === monthKey(new Date())
  const { overall } = summary
  const catById = new Map(categories.map(cat => [cat.id, cat]))

  return (
    <div>
      <MonthSwitcher month={month} onChange={onMonth} />

      {/* Hero: spending against the monthly budget */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted }}>
          {isCurrent ? 'Household spending this month' : `Household spending in ${monthLabel(month)}`}
        </div>
        <div style={{ font: '800 30px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.03em', margin: '4px 0 2px' }}>{fmt(summary.expense)}</div>
        {overall.limit == null ? (
          <button type="button" onClick={onBudgets} style={{ background: 'none', border: 'none', padding: 0, color: c.accent, font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}>
            Set a monthly budget
          </button>
        ) : (
          <>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.sub, marginBottom: 12 }}>Monthly budget: {fmt(overall.limit)}</div>
            <ProgressBar progress={overall.progress} tone={overall.status === 'none' ? 'ok' : overall.status} label="Monthly household budget used" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, font: '700 13px Plus Jakarta Sans' }}>
              <span style={{ color: c.muted }}>{overall.limit > 0 ? `${Math.round(overall.progress * 100)}% used` : 'No spending planned'}</span>
              <span style={{ color: overall.status === 'over' ? c.bad : c.good }}>
                {overall.status === 'over' ? `${fmt(overall.over)} over` : `${fmt(overall.remaining ?? 0)} remaining`}
              </span>
            </div>
          </>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <Tile label="Shared income" value={fmt(summary.income)} icon={<TrendingUp size={15} color={c.good} />} />
        <Tile label="Shared expenses" value={fmt(summary.expense)} icon={<TrendingDown size={15} color={c.bad} />} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <div style={{ flex: 1 }}><Button full onClick={() => onAdd('expense')}><Plus size={16} /> Add expense</Button></div>
        <div style={{ flex: 1 }}><Button full kind="secondary" onClick={() => onAdd('income')}><Plus size={16} /> Add income</Button></div>
      </div>

      {summary.categories.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Spending by category</SectionLabel>
          <Card style={{ display: 'grid', gap: 14 }}>
            {summary.categories.slice(0, TOP_CATEGORIES).map(line => {
              const cat = line.categoryId ? catById.get(line.categoryId) : undefined
              const name = cat?.name ?? 'Uncategorised'
              const share = summary.expense > 0 ? line.spent / summary.expense : 0
              return (
                <div key={line.categoryId ?? 'none'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <HouseholdIcon name={cat?.icon} size={15} color={c.sub} />
                    <span style={{ flex: 1, font: '700 13px Plus Jakarta Sans', color: c.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(line.spent)}</span>
                    {line.limit != null && <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>/ {fmt(line.limit)}</span>}
                  </div>
                  <ProgressBar
                    progress={line.limit != null ? line.progress : share}
                    tone={line.status === 'over' ? 'over' : line.status === 'near' ? 'near' : 'ok'}
                    label={`${name} spending`}
                  />
                </div>
              )
            })}
          </Card>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabel>Recent shared entries</SectionLabel>
        {transactions.length > RECENT_COUNT && (
          <button type="button" onClick={onSeeAll} style={{ background: 'none', border: 'none', color: c.accent, font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}>See all</button>
        )}
      </div>
      {transactions.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Nothing shared {isCurrent ? 'yet this month' : `in ${monthLabel(month)}`}</div>
          <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted }}>Add the first expense you share — groceries, rent, a bill.</div>
        </Card>
      ) : (
        <Card style={{ padding: '4px 12px' }}>
          {transactions.slice(0, RECENT_COUNT).map(t => (
            <EntryRow key={t.id} txn={t} category={t.category_id ? catById.get(t.category_id) : undefined} members={members} meMemberId={meMemberId} onOpen={() => onOpenEntry(t)} />
          ))}
        </Card>
      )}
    </div>
  )
}

function Tile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  const c = useTheme()
  return (
    <div style={{ flex: 1, background: c.surface2, borderRadius: 16, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 4 }}>{icon}{label}</div>
      <div style={{ font: '800 19px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
