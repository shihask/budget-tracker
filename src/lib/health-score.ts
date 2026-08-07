import type { AppNotification, AppState, DerivedMetrics } from '@/types'
import type { ChallengeCalc } from '@/lib/challenge'
import { ACHIEVEMENTS } from '@/lib/achievement-definitions'
import { TODAY, iso } from '@/lib/utils'

// Bump whenever component weights/formulas change — health-score-cache.ts uses this
// to invalidate a stale trend comparison instead of showing a misleading score jump
// that's actually just a rebalanced formula.
export const HEALTH_SCORE_ALGORITHM_VERSION = 1

export interface HealthScoreComponent {
  key: string
  label: string
  score: number    // 0-100, this component's own score before weighting
  weight: number   // 0-100, renormalized so all included components sum to 100
}

export interface HealthScoreResult {
  score: number
  grade: string
  components: HealthScoreComponent[]
  strongest: HealthScoreComponent | null
  weakest: HealthScoreComponent | null
  trend: 'up' | 'down' | 'flat' | null
  lastUpdated: string   // ISO timestamp
}

const HEALTH_SCORE_GRADES: { min: number; label: string }[] = [
  { min: 90, label: 'Flourishing' },
  { min: 80, label: 'Healthy' },
  { min: 70, label: 'Stable' },
  { min: 60, label: 'Improving' },
  { min: 40, label: 'At Risk' },
  { min: 0, label: 'Critical' },
]

export function gradeForScore(score: number): string {
  return HEALTH_SCORE_GRADES.find(g => score >= g.min)?.label ?? 'Critical'
}

function daysSince(dateStr: string | null | undefined, todayStr: string): number | null {
  if (!dateStr) return null
  const then = new Date(dateStr + 'T00:00:00')
  const today = new Date(todayStr + 'T00:00:00')
  if (Number.isNaN(then.getTime())) return null
  return Math.round((today.getTime() - then.getTime()) / 86400000)
}

// Proxy for "reflection frequency" that stays schema-free — there's no daily
// reflection log, only the most recent date, so recency stands in for consistency.
function reflectionRecencyScore(lastReflectionDate: string | null | undefined, todayStr: string): number {
  const days = daysSince(lastReflectionDate, todayStr)
  if (days === null) return 0
  if (days <= 0) return 100
  if (days === 1) return 80
  if (days <= 3) return 50
  if (days <= 7) return 20
  return 0
}

function alertSeverityScore(notifications: AppNotification[]): number {
  const criticalCount = notifications.filter(n => n.priority === 'critical').length
  const highCount = notifications.filter(n => n.priority === 'high').length
  return Math.max(0, 100 - criticalCount * 20 - highCount * 10)
}

interface RawComponent extends HealthScoreComponent {
  applicable: boolean
}

export function computeHealthScore(
  state: AppState,
  d: DerivedMetrics,
  calc: ChallengeCalc | null,
  notifications: AppNotification[],
  habitConsistencyPct: number | null,
): HealthScoreResult {
  const todayStr = iso(TODAY)

  const raw: RawComponent[] = [
    {
      key: 'mission', label: 'Daily Mission', weight: 25,
      score: calc?.successRate ?? 0, applicable: calc?.successRate != null,
    },
    {
      key: 'habits', label: 'Habit Consistency', weight: 20,
      score: habitConsistencyPct ?? 0, applicable: habitConsistencyPct != null,
    },
    {
      key: 'cash_health', label: 'Cash Flow', weight: 20,
      score: d.cashHealth?.status === 'healthy' ? 100 : d.cashHealth?.status === 'shortfall' ? 0 : 0,
      applicable: d.cashHealth != null,
    },
    {
      key: 'reflection', label: 'Reflection', weight: 15,
      score: reflectionRecencyScore(state.settings.last_reflection_date, todayStr), applicable: true,
    },
    {
      key: 'achievements', label: 'Achievements', weight: 10,
      score: ACHIEVEMENTS.length > 0 ? Math.round((state.user_achievements.length / ACHIEVEMENTS.length) * 100) : 0,
      applicable: ACHIEVEMENTS.length > 0,
    },
    {
      key: 'alerts', label: 'Active Alerts', weight: 10,
      score: alertSeverityScore(notifications), applicable: true,
    },
  ]

  const applicable = raw.filter(c => c.applicable)
  const totalWeight = applicable.reduce((s, c) => s + c.weight, 0)

  const components: HealthScoreComponent[] = []
  if (totalWeight > 0) {
    const roundedWeights = applicable.map(c => Math.round((c.weight / totalWeight) * 100))
    // Independent per-component rounding can land the total a point or two off 100
    // (e.g. three components at 33.3% each round to 33+33+33=99) — give the
    // remainder to the heaviest-weighted component so displayed weights always sum
    // to exactly 100.
    const diff = 100 - roundedWeights.reduce((s, w) => s + w, 0)
    if (diff !== 0) {
      const heaviestIdx = applicable.reduce((best, c, i) => (c.weight > applicable[best].weight ? i : best), 0)
      roundedWeights[heaviestIdx] += diff
    }
    applicable.forEach((c, i) => components.push({ key: c.key, label: c.label, score: c.score, weight: roundedWeights[i] }))
  }

  const score = components.length > 0
    ? Math.round(components.reduce((s, c) => s + (c.score * c.weight) / 100, 0))
    : 0

  const strongest = components.length > 0
    ? components.reduce((a, b) => (b.score > a.score ? b : a))
    : null
  const weakest = components.length > 0
    ? components.reduce((a, b) => (b.score < a.score ? b : a))
    : null

  return {
    score,
    grade: gradeForScore(score),
    components,
    strongest,
    weakest,
    trend: null,   // filled in by the caller from health-score-cache.ts, which knows yesterday's score
    lastUpdated: new Date().toISOString(),
  }
}
