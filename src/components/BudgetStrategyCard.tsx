import { useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { AppState, BudgetBucket, BudgetStrategyType } from '@/types'

interface BudgetStrategyCardProps {
  state: AppState
}

export const STRATEGY_PRESETS: Record<
  Exclude<BudgetStrategyType, 'none' | 'custom'>,
  { needs: number; wants: number; savings: number; label: string }
> = {
  balanced: { needs: 50, wants: 30, savings: 20, label: 'Balanced (50/30/20)' },
  stable:   { needs: 60, wants: 20, savings: 20, label: 'Stable (60/20/20)' },
  growth:   { needs: 45, wants: 20, savings: 35, label: 'Growth (45/20/35)' },
}

export function getStrategyPcts(settings: AppState['settings']): { needs: number; wants: number; savings: number; label: string } | null {
  const s = settings.budget_strategy ?? 'none'
  if (s === 'none') return null
  if (s === 'custom') {
    const n = settings.custom_needs_pct ?? 50
    const w = settings.custom_wants_pct ?? 30
    const sv = settings.custom_savings_pct ?? 20
    return { needs: n, wants: w, savings: sv, label: `Custom (${n}/${w}/${sv})` }
  }
  return STRATEGY_PRESETS[s]
}

// Derives the budget bucket for a category based on its group type.
// The budget_bucket column is only used for Other-group categories.
// Fallback for built-in groups that may not have `type` set in the DB yet.
const BUILTIN_BUCKETS: Record<string, BudgetBucket> = {
  Lifestyle: 'wants', Utilities: 'needs', Transport: 'needs',
  Health: 'needs', Family: 'needs', Obligations: 'needs',
}

// Returns the auto-derived bucket for a category based on its group type (no user override).
export function getAutoBucket(groups: AppState['groups'], groupName: string): BudgetBucket | null {
  const group = groups.find(g => g.name === groupName)
  if (!group || group.name === 'Other') return null
  switch (group.type) {
    case 'essential':
    case 'commitment':
      return 'needs'
    case 'savings':
      return 'savings'
    case 'discretionary':
      return 'wants'
    default:
      return BUILTIN_BUCKETS[groupName] ?? null
  }
}

// User-set budget_bucket overrides the auto-derived value for any category.
export function getCategoryBucket(cat: AppState['categories'][0], groups: AppState['groups']): BudgetBucket | null {
  if (cat.budget_bucket != null) return cat.budget_bucket
  return getAutoBucket(groups, cat.group_name)
}

function useStrategyData(state: AppState) {
  return useMemo(() => {
    const pcts = getStrategyPcts(state.settings)
    if (!pcts) return null

    const now = new Date()
    const sd = state.settings.salary_date
    let periodStart: Date

    if (sd && sd >= 1 && sd <= 31) {
      const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
      periodStart = day >= sd ? new Date(y, m, sd) : new Date(y, m - 1, sd)
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    const income = state.transactions
      .filter(t => t.transaction_type === 'income' && new Date(t.transaction_date) >= periodStart)
      .reduce((s, t) => s + t.amount, 0)

    const actuals: Record<BudgetBucket, number> = { needs: 0, wants: 0, savings: 0 }
    const catMap = Object.fromEntries(state.categories.map(c => [c.id, c]))

    for (const t of state.transactions) {
      if (new Date(t.transaction_date) < periodStart) continue
      if (t.transaction_type !== 'expense' && t.transaction_type !== 'commitment' && t.transaction_type !== 'savings_contribution') continue
      const cat = catMap[t.category_id ?? '']
      if (!cat) continue
      const bucket = getCategoryBucket(cat, state.groups)
      if (!bucket) continue
      // savings_contribution transactions count toward savings bucket regardless of category
      const effectiveBucket: BudgetBucket = t.transaction_type === 'savings_contribution' ? 'savings' : bucket
      actuals[effectiveBucket] += t.amount
    }

    const targets = {
      needs:   Math.round(income * pcts.needs   / 100),
      wants:   Math.round(income * pcts.wants   / 100),
      savings: Math.round(income * pcts.savings / 100),
    }

    // Adherence scores: needs/wants = staying within budget, savings = hitting target
    const needsScore   = targets.needs   > 0 ? Math.max(0, Math.min(100, actuals.needs   <= targets.needs   ? 100 : Math.round((2 - actuals.needs   / targets.needs)   * 100))) : 100
    const wantsScore   = targets.wants   > 0 ? Math.max(0, Math.min(100, actuals.wants   <= targets.wants   ? 100 : Math.round((2 - actuals.wants   / targets.wants)   * 100))) : 100
    const savingsScore = targets.savings > 0 ? Math.min(100, Math.round(actuals.savings / targets.savings * 100)) : 0
    const overallScore = Math.round((needsScore + wantsScore + savingsScore) / 3)

    return { pcts, income, actuals, targets, needsScore, wantsScore, savingsScore, overallScore }
  }, [state])
}

interface BucketRowProps {
  label: string
  actual: number
  target: number
  color: string
}

function BucketRow({ label, actual, target, color }: BucketRowProps) {
  const c = useTheme()
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
  const over = actual > target
  const barColor = over ? c.bad : color

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ font: `700 13px Plus Jakarta Sans`, color: over ? c.bad : c.ink }}>
            {fmt(actual)}
          </span>
          <span style={{ font: '500 11px Plus Jakarta Sans', color: c.muted }}>
            / {target > 0 ? fmt(target) : '—'}
          </span>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: c.faint, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          background: barColor,
          width: `${Math.min(100, pct)}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

export function BudgetStrategyCard({ state }: BudgetStrategyCardProps) {
  const c = useTheme()
  const data = useStrategyData(state)
  if (!data) return null

  const { pcts, actuals, targets, needsScore, wantsScore, savingsScore, overallScore } = data
  const noIncome = data.income === 0

  return (
    <div style={{
      background: c.surface, borderRadius: 18, padding: '16px 16px 14px',
      border: `1px solid ${c.faint}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>
            Budget Strategy
          </div>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
            {pcts.label}
          </div>
        </div>
        {!noIncome && (
          <div style={{
            background: overallScore >= 80 ? c.good : overallScore >= 50 ? c.warn : c.bad,
            color: '#fff', borderRadius: 20,
            padding: '3px 10px',
            font: '700 12px Plus Jakarta Sans',
          }}>
            {overallScore}%
          </div>
        )}
      </div>

      <BucketRow label="Needs"   actual={actuals.needs}   target={targets.needs}   color="#3B82F6" />
      <BucketRow label="Wants"   actual={actuals.wants}   target={targets.wants}   color="#F97316" />
      <BucketRow label="Savings" actual={actuals.savings} target={targets.savings} color={c.accent} />

      {noIncome && (
        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginBottom: 8, marginTop: -4 }}>
          Add income this cycle to see targets
        </div>
      )}

      {!noIncome && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: `1px solid ${c.faint}`,
          display: 'flex', gap: 0,
        }}>
          {[
            { label: 'Needs', score: needsScore },
            { label: 'Wants', score: wantsScore },
            { label: 'Savings', score: savingsScore },
            { label: 'Overall', score: overallScore, bold: true },
          ].map(({ label, score, bold }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                font: `${bold ? '800' : '700'} ${bold ? 14 : 13}px Plus Jakarta Sans`,
                color: score >= 80 ? c.good : score >= 50 ? c.warn : c.bad,
              }}>
                {score}%
              </div>
              <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
