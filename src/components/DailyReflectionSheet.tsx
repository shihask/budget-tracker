import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { iso, addDays, TODAY } from '@/lib/utils'
import { computeChallenge } from '@/lib/challenge'
import type { AppState, DerivedMetrics, Goal, Transaction, Category } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getYesterdayStr(): string {
  return iso(addDays(TODAY, -1))
}

function catName(t: Transaction, categories: Category[]): string {
  return categories.find(c => c.id === t.category_id)?.name ?? 'Uncategorized'
}

function groupName(t: Transaction, categories: Category[]): string {
  return categories.find(c => c.id === t.category_id)?.group_name ?? 'Other'
}

function fmt(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

// ── Content generators ────────────────────────────────────────────────────────

function generateStory(
  yesterdaySpend: number,
  txCount: number,
  topGroup: [string, number] | undefined,
  challengeEnabled: boolean,
  challengeCompleted: boolean,
  challengeTarget: number,
): string {
  if (txCount === 0) {
    return 'No expenses recorded yesterday. Starting fresh or taking a break from tracking? Either way, today is a new opportunity.'
  }

  const spendStr = fmt(yesterdaySpend)
  const txStr = `${txCount} transaction${txCount !== 1 ? 's' : ''}`
  const groupPart = topGroup ? ` Most spending was on ${topGroup[0]} (${fmt(topGroup[1])}).` : ''

  if (challengeEnabled && challengeCompleted) {
    const saved = Math.round(challengeTarget - yesterdaySpend)
    return `You spent ${spendStr} across ${txStr} yesterday.${groupPart} You stayed within your daily target and earned growth for your MoneyPlant — ${fmt(saved)} below target.`
  }

  if (challengeEnabled && !challengeCompleted) {
    return `You spent ${spendStr} across ${txStr} yesterday.${groupPart} Yesterday wasn't a growth day, but today is a fresh opportunity.`
  }

  return `You spent ${spendStr} across ${txStr} yesterday.${groupPart}`
}

function generateReflection(
  yesterdayStr: string,
  yesterdaySpend: number,
  yesterdayTxns: Transaction[],
  state: AppState,
): string {
  // Consecutive tracking days (starting from yesterday backwards)
  const expenseDates = new Set(
    state.transactions.filter(t => t.transaction_type === 'expense').map(t => t.transaction_date)
  )
  let consecutive = 0
  for (let i = 1; i <= 60; i++) {
    if (expenseDates.has(iso(addDays(TODAY, -i)))) consecutive++
    else break
  }
  if (consecutive >= 7) {
    return `You tracked expenses on ${consecutive} consecutive days. Consistency helps your MoneyPlant grow.`
  }

  // Top category yesterday
  const catTotals: Record<string, number> = {}
  yesterdayTxns.forEach(t => {
    const name = catName(t, state.categories)
    catTotals[name] = (catTotals[name] ?? 0) + t.amount
  })
  const topCatEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]

  // Compare top category vs its 7-day average (days before yesterday)
  if (topCatEntry) {
    const [topCat, topAmt] = topCatEntry
    const sevenDayStart = iso(addDays(TODAY, -8)) // 7 days before yesterday
    const cat7Total = state.transactions
      .filter(t =>
        t.transaction_type === 'expense' &&
        t.transaction_date >= sevenDayStart &&
        t.transaction_date < yesterdayStr &&
        catName(t, state.categories) === topCat
      )
      .reduce((s, t) => s + t.amount, 0)
    const cat7Avg = cat7Total / 7
    if (cat7Avg > 50 && topAmt > cat7Avg * 1.5) {
      const mult = (topAmt / cat7Avg).toFixed(1)
      return `${topCat} spending was ${mult}× your 7-day average. This category had the biggest impact yesterday.`
    }
  }

  // Good progress vs 7-day average
  const sevenDayStart = iso(addDays(TODAY, -8))
  const recent = state.transactions.filter(t =>
    t.transaction_type === 'expense' &&
    t.transaction_date >= sevenDayStart &&
    t.transaction_date < yesterdayStr
  )
  const recentDays = new Set(recent.map(t => t.transaction_date)).size
  const recentTotal = recent.reduce((s, t) => s + t.amount, 0)
  const avg7 = recentDays > 0 ? recentTotal / recentDays : 0

  if (avg7 > 100 && yesterdaySpend < avg7 * 0.75) {
    const pct = Math.round((1 - yesterdaySpend / avg7) * 100)
    return `You spent ${pct}% less than your 7-day daily average. Nice improvement.`
  }

  // Largest day this week check
  const weekStart = iso(addDays(TODAY, -6))
  const thisWeekSpends: Record<string, number> = {}
  state.transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date >= weekStart && t.transaction_date <= yesterdayStr)
    .forEach(t => { thisWeekSpends[t.transaction_date] = (thisWeekSpends[t.transaction_date] ?? 0) + t.amount })
  const maxDaySpend = Math.max(...Object.values(thisWeekSpends))
  if (yesterdaySpend > 0 && yesterdaySpend >= maxDaySpend && Object.keys(thisWeekSpends).length >= 3) {
    return 'This was your largest spending day this week.'
  }

  return 'Every transaction you track helps your MoneyPlant grow.'
}

function generateTodaysFocus(state: AppState, d: DerivedMetrics): string {
  const challengeEnabled = state.settings.challenge_enabled ?? false

  // Priority 1: 1 leaf from next milestone
  if (challengeEnabled) {
    const ch = computeChallenge(state, state.settings.challenge_difficulty ?? 'medium')
    const { plantGrowth } = ch
    if (plantGrowth.nextGoal === 1) {
      return `You're 1 leaf away from the next stage. A successful challenge today unlocks growth.`
    }
    if (plantGrowth.nextGoal <= 3) {
      return `${plantGrowth.nextGoal} leaves away from the next growth stage. Stay within target today.`
    }
  }

  // Priority 2: Goal near completion
  const nearGoal = (state.goals ?? [])
    .filter(g => g.is_active && g.goal_amount > 0)
    .map(g => ({ g, pct: (g.current_saved / g.goal_amount) * 100 }))
    .filter(x => x.pct >= 75 && x.pct < 100)
    .sort((a, b) => b.pct - a.pct)[0]
  if (nearGoal) {
    const pct = Math.round(nearGoal.pct)
    return `${nearGoal.g.name} is ${pct}% complete. One more contribution will push it closer.`
  }

  // Priority 3: Category spiking this week vs last week
  const weekStart = iso(addDays(TODAY, -6))
  const lastWeekStart = iso(addDays(TODAY, -13))
  const lastWeekEnd = iso(addDays(TODAY, -7))
  const thisWeekByGroup: Record<string, number> = {}
  const lastWeekByGroup: Record<string, number> = {}
  state.transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date >= weekStart)
    .forEach(t => { const g = groupName(t, state.categories); thisWeekByGroup[g] = (thisWeekByGroup[g] ?? 0) + t.amount })
  state.transactions
    .filter(t => t.transaction_type === 'expense' && t.transaction_date >= lastWeekStart && t.transaction_date <= lastWeekEnd)
    .forEach(t => { const g = groupName(t, state.categories); lastWeekByGroup[g] = (lastWeekByGroup[g] ?? 0) + t.amount })

  let spikeGroup: string | null = null
  let maxSpike = 0
  Object.entries(thisWeekByGroup).forEach(([group, amt]) => {
    const last = lastWeekByGroup[group] ?? 0
    if (last > 200 && amt > last * 1.3) {
      const spike = amt - last
      if (spike > maxSpike) { maxSpike = spike; spikeGroup = group }
    }
  })
  if (spikeGroup) return `${spikeGroup} spending has increased this week. Watch these costs today.`

  // Fallback
  if (challengeEnabled) {
    const ch = computeChallenge(state, state.settings.challenge_difficulty ?? 'medium')
    return `Target today: ${fmt(ch.adjustedTarget)}. Stay within it to grow your plant.`
  }

  // Free money fallback
  if (d.realFreeMoney > 0) {
    return `You have ${fmt(d.realFreeMoney)} in free money. Track mindfully today.`
  }

  return 'Track every expense today. Small habits build big results.'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, color }: { label: string; color: string }) {
  const c = useTheme()
  return (
    <div style={{ font: '700 10px Plus Jakarta Sans', color, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
      {label}
    </div>
  )
}

function Divider() {
  const c = useTheme()
  return <div style={{ height: 1, background: c.faint, margin: '20px 0' }} />
}

// ── Main Sheet ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  state: AppState
  d: DerivedMetrics
  onGoalContribution: (goalId: string, amount: number) => Promise<void>
}

export function DailyReflectionSheet({ open, onClose, state, d, onGoalContribution }: Props) {
  const c = useTheme()
  const [goalDone, setGoalDone] = useState(false)
  const [dragStartY, setDragStartY] = useState<number | null>(null)
  const [dragY, setDragY] = useState(0)

  const yesterdayStr = getYesterdayStr()

  // Yesterday's transactions
  const excluded = state.settings.challenge_excluded_txn_ids ?? []
  const yesterdayTxns = state.transactions.filter(t =>
    t.transaction_date === yesterdayStr && t.transaction_type === 'expense' && !excluded.includes(t.id)
  )
  const yesterdaySpend = yesterdayTxns.reduce((s, t) => s + t.amount, 0)
  const txCount = yesterdayTxns.length

  // Group + category breakdown for yesterday
  const groupTotals: Record<string, number> = {}
  const catTotals: Record<string, number> = {}
  yesterdayTxns.forEach(t => {
    const g = groupName(t, state.categories)
    const cn = catName(t, state.categories)
    groupTotals[g] = (groupTotals[g] ?? 0) + t.amount
    catTotals[cn] = (catTotals[cn] ?? 0) + t.amount
  })
  const sortedGroups = Object.entries(groupTotals).sort((a, b) => b[1] - a[1])
  const topGroup = sortedGroups[0]
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 4)

  // Challenge
  const challengeEnabled = state.settings.challenge_enabled ?? false
  const challengeDifficulty = state.settings.challenge_difficulty ?? 'medium'
  const ch = challengeEnabled ? computeChallenge(state, challengeDifficulty) : null
  const challengeTarget = ch?.target ?? 0
  const challengeCompleted = challengeEnabled && yesterdaySpend <= challengeTarget
  const savedAmount = challengeCompleted ? Math.round(challengeTarget - yesterdaySpend) : 0

  // Active goals
  const activeGoals = (state.goals ?? []).filter(g => g.is_active)

  // Content
  const story = generateStory(yesterdaySpend, txCount, topGroup, challengeEnabled, challengeCompleted, challengeTarget)
  const reflection = generateReflection(yesterdayStr, yesterdaySpend, yesterdayTxns, state)
  const todayFocus = generateTodaysFocus(state, d)

  // Leaf count for display
  const leaves = state.settings.challenge_leaves ?? 0
  const currentStageLabel = ch?.plantGrowth.milestone ?? 'seed'
  const nextGoalCount = ch?.plantGrowth.nextGoal ?? 1

  // Drag-to-close
  const handleTouchStart = (e: React.TouchEvent) => setDragStartY(e.touches[0].clientY)
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY === null) return
    const delta = e.touches[0].clientY - dragStartY
    if (delta > 0) setDragY(delta)
  }
  const handleTouchEnd = () => {
    if (dragY > 100) onClose()
    setDragY(0)
    setDragStartY(null)
  }

  const stageLabels: Record<string, string> = {
    seed: 'Seed', sprout: 'Sprout', first_leaf: 'First Leaves',
    young: 'Young Plant', growing: 'Growing', mature: 'Mature', blooming: 'Blooming',
  }

  return (
    <div
      inert={!open}
      style={{ position: 'fixed', inset: 0, zIndex: 95, pointerEvents: open ? 'auto' : 'none', touchAction: open ? 'none' : 'auto' }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', opacity: open ? 1 : 0, transition: 'opacity 0.3s' }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: c.surface,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '90svh',
          display: 'flex', flexDirection: 'column',
          transform: open ? `translateY(${dragY}px)` : 'translateY(115%)',
          transition: dragY > 0 ? 'none' : 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Drag handle area */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ padding: '12px 20px 0', touchAction: 'none', cursor: 'grab', flexShrink: 0 }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 999, background: c.faint, margin: '0 auto 16px' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#16C98A18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16C98A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20"/><path d="M12 8v4l3 3"/>
                </svg>
              </div>
              <div>
                <div style={{ font: '800 16px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>Yesterday's Reflection</div>
                <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                  {new Date(yesterdayStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 999, background: c.surface2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sub} strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 20px calc(24px + env(safe-area-inset-bottom, 0px))' }}>

          {/* ── Section 1: Story ── */}
          <div style={{ background: c.surface2, borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>
            <SectionHeader label="Today's Story" color="#16C98A" />
            <p style={{ font: '500 14px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6, margin: 0 }}>
              {story}
            </p>
          </div>

          {/* ── Spending Breakdown ── */}
          {sortedCats.length > 0 && (
            <>
              <SectionHeader label="Spending Breakdown" color={c.muted} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {sortedCats.map(([name, amt]) => {
                  const pct = yesterdaySpend > 0 ? (amt / yesterdaySpend) * 100 : 0
                  return (
                    <div key={name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ font: '500 13px Plus Jakarta Sans', color: c.sub }}>{name}</span>
                        <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(amt)}</span>
                      </div>
                      <div style={{ height: 4, background: c.faint, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(pct)}%`, background: '#16C98A', borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 8, borderTop: `1px solid ${c.faint}` }}>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Total</span>
                  <span style={{ font: '800 13px Plus Jakarta Sans', color: c.ink }}>{fmt(yesterdaySpend)}</span>
                </div>
              </div>
            </>
          )}

          <Divider />

          {/* ── Section 2: Growth Result (challenge only) ── */}
          {challengeEnabled && ch && (
            <>
              <SectionHeader label="Growth Result" color={challengeCompleted ? '#16C98A' : '#F59E0B'} />
              <div style={{
                background: challengeCompleted ? '#16C98A14' : '#F59E0B14',
                border: `1px solid ${challengeCompleted ? '#16C98A33' : '#F59E0B33'}`,
                borderRadius: 16, padding: '14px 16px', marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 999, background: challengeCompleted ? '#16C98A' : '#F59E0B20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {challengeCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <div style={{ font: '700 13px Plus Jakarta Sans', color: challengeCompleted ? '#16C98A' : '#D97706' }}>
                      {challengeCompleted ? 'Growth Earned' : 'Not a Growth Day'}
                    </div>
                    <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>
                      {challengeCompleted ? '+2 Leaves earned' : 'Tomorrow starts fresh'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Target', value: fmt(challengeTarget) },
                    { label: 'Spent', value: fmt(yesterdaySpend) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: c.surface, borderRadius: 10, padding: '8px 10px' }}>
                      <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted, marginBottom: 2 }}>{label}</div>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{value}</div>
                    </div>
                  ))}
                </div>

                {challengeCompleted && (
                  <div style={{ marginTop: 10, background: c.surface, borderRadius: 10, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>Current Stage</div>
                      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, marginTop: 1 }}>{stageLabels[currentStageLabel]} · {leaves} {leaves === 1 ? 'leaf' : 'leaves'}</div>
                    </div>
                    {ch.plantGrowth.nextGoal > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ font: '500 10px Plus Jakarta Sans', color: c.muted }}>Next</div>
                        <div style={{ font: '600 12px Plus Jakarta Sans', color: '#16C98A', marginTop: 1 }}>{nextGoalCount} more {nextGoalCount === 1 ? 'leaf' : 'leaves'}</div>
                      </div>
                    )}
                  </div>
                )}

                {!challengeCompleted && (
                  <div style={{ marginTop: 10, font: '500 12px Plus Jakarta Sans', color: c.muted, lineHeight: 1.5 }}>
                    {nextGoalCount} {nextGoalCount === 1 ? 'leaf' : 'leaves'} needed for {stageLabels[currentStageLabel] === 'Seed' ? 'Sprout' : 'the next stage'}.
                  </div>
                )}
              </div>

              <Divider />
            </>
          )}

          {/* ── Section 3: Goal Opportunity ── */}
          {challengeEnabled && challengeCompleted && savedAmount > 0 && !goalDone && (
            <>
              <SectionHeader label="Goal Opportunity" color="#3B82F6" />
              <div style={{
                background: '#3B82F614',
                border: '1px solid #3B82F633',
                borderRadius: 16, padding: '14px 16px', marginBottom: 20,
              }}>
                <p style={{ font: '500 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.55, margin: '0 0 12px' }}>
                  You stayed {fmt(savedAmount)} below your target yesterday.
                  {activeGoals.length > 0 ? ' Would you like to grow a goal?' : ' Create your first goal to turn good habits into progress.'}
                </p>

                {activeGoals.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {activeGoals.slice(0, 3).map(goal => (
                      <button
                        key={goal.id}
                        onClick={async () => {
                          await onGoalContribution(goal.id, savedAmount)
                          setGoalDone(true)
                        }}
                        style={{
                          height: 36, borderRadius: 10, background: '#3B82F6',
                          border: 'none', padding: '0 14px',
                          font: '600 12px Plus Jakarta Sans', color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        {goal.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setGoalDone(true)}
                      style={{
                        height: 36, borderRadius: 10, background: c.surface2,
                        border: 'none', padding: '0 14px',
                        font: '600 12px Plus Jakarta Sans', color: c.muted,
                        cursor: 'pointer',
                      }}
                    >
                      Not Now
                    </button>
                  </div>
                ) : (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: '#3B82F6' }}>
                    Set up a goal in the Goals section to put your savings to work.
                  </div>
                )}
              </div>
              <Divider />
            </>
          )}

          {/* Goal contribution confirmed */}
          {goalDone && challengeCompleted && savedAmount > 0 && (
            <>
              <div style={{
                background: '#16C98A14', border: '1px solid #16C98A33',
                borderRadius: 16, padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16C98A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ font: '600 13px Plus Jakarta Sans', color: c.ink }}>
                  {fmt(savedAmount)} added to your goal. Good move.
                </span>
              </div>
              <Divider />
            </>
          )}

          {/* ── Section 4: Reflection ── */}
          <SectionHeader label="Reflection" color="#16C98A" />
          <div style={{
            background: '#16C98A0C',
            borderLeft: '3px solid #16C98A',
            borderRadius: '0 12px 12px 0',
            padding: '12px 14px', marginBottom: 20,
          }}>
            <p style={{ font: '500 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6, margin: 0 }}>
              {reflection}
            </p>
          </div>

          <Divider />

          {/* ── Section 5: Today's Focus ── */}
          <SectionHeader label="Today's Focus" color="#F59E0B" />
          <div style={{
            background: '#F59E0B0C',
            border: '1px solid #F59E0B22',
            borderRadius: 16, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F59E0B20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <p style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.55, margin: 0 }}>
                {todayFocus}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
