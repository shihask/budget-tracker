import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { BottomSheet } from './BottomSheet'
import { goalProgressInsightWithAI } from '@/lib/gemini'
import type { Goal, GoalType, DerivedMetrics, Settings, Transaction } from '@/types'

interface PrefillData {
  name: string
  goal_amount: number
  current_saved: number
  monthly_target: number
  target_date: string
}

interface Props {
  goals: Goal[]
  d: DerivedMetrics
  transactions: Transaction[]
  settings: Settings
  autopilotEnabled: boolean
  onAddGoal: (g: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  onUpdateGoal: (id: string, patch: Partial<Goal>) => Promise<void>
  onDeleteGoal: (id: string) => Promise<void>
  onAddSavings: (id: string, amount: number) => Promise<void>
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
  prefillGoal?: PrefillData | null
  onPrefillConsumed?: () => void
}

const TYPE_CFG: Record<GoalType, { label: string; color: string; icon: React.ReactNode }> = {
  purchase: {
    label: 'Purchase',
    color: '#EF4444',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
    ),
  },
  savings: {
    label: 'Savings',
    color: '#10B981',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  event: {
    label: 'Event',
    color: '#F59E0B',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
}

function GoalIcon({ type, size = 32 }: { type: GoalType; size?: number }) {
  const cfg = TYPE_CFG[type]
  const r = Math.round(size * 0.28)
  return (
    <div style={{ width: size, height: size, borderRadius: r, background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {cfg.icon}
    </div>
  )
}

function calcGoalStatus(goal: Goal) {
  const MS_MONTH = 1000 * 60 * 60 * 24 * 30
  const now = Date.now()
  const created = new Date(goal.created_at).getTime()
  const target = new Date(goal.target_date + 'T00:00:00').getTime()
  const monthsElapsed = Math.max(0, (now - created) / MS_MONTH)
  const monthsRemaining = Math.max(0, (target - now) / MS_MONTH)
  const expectedSaved = goal.monthly_target * monthsElapsed
  const diff = goal.current_saved - expectedSaved
  const pct = goal.goal_amount > 0 ? Math.min(100, Math.round((goal.current_saved / goal.goal_amount) * 100)) : 0
  const isComplete = goal.current_saved >= goal.goal_amount
  if (isComplete) return { pct: 100, monthsRemaining: 0, isComplete: true }
  if (diff >= 0) {
    const daysAhead = goal.monthly_target > 0 ? Math.round((diff / goal.monthly_target) * 30) : 0
    return { pct, daysAhead, monthsRemaining, isComplete: false }
  }
  const shortfall = Math.abs(diff)
  const extraNeeded = monthsRemaining > 0 ? Math.round(shortfall / monthsRemaining) : Math.round(shortfall)
  const daysBehind = goal.monthly_target > 0 ? Math.round((shortfall / goal.monthly_target) * 30) : 0
  return { pct, daysBehind, extraNeeded, monthsRemaining, isComplete: false }
}

function calcTargetInfo(goalAmount: number, currentSaved: number, monthlyTarget: number) {
  const needed = Math.max(0, goalAmount - currentSaved)
  const months = monthlyTarget > 0 ? Math.ceil(needed / monthlyTarget) : 0
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  return {
    label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    iso: d.toISOString().slice(0, 10),
    months,
  }
}

const EMPTY_FORM = { name: '', goalType: 'purchase' as GoalType, goalAmount: '', currentSaved: '', monthlyTarget: '' }

export function GoalsSection({
  goals, d, transactions, settings, autopilotEnabled,
  onAddGoal, onUpdateGoal, onDeleteGoal, onAddSavings,
  onUpdateSettings, prefillGoal, onPrefillConsumed,
}: Props) {
  const c = useTheme()
  const [addOpen, setAddOpen] = useState(false)
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [savingsInput, setSavingsInput] = useState('')
  const [savingsAdding, setSavingsAdding] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [goalAI, setGoalAI] = useState<Record<string, string>>({})
  const [goalAILoading, setGoalAILoading] = useState<string | null>(null)

  const suggestedMonthly = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const total30d = transactions
      .filter(t => t.transaction_type === 'expense' && new Date(t.transaction_date) >= cutoff)
      .reduce((s, t) => s + t.amount, 0)
    return Math.max(500, Math.round((d.weeklyBudget * 52) / 12 - total30d))
  }, [d.weeklyBudget, transactions])

  useEffect(() => {
    if (prefillGoal) {
      setForm({
        name: prefillGoal.name,
        goalType: 'purchase',
        goalAmount: String(prefillGoal.goal_amount),
        currentSaved: String(prefillGoal.current_saved > 0 ? Math.round(prefillGoal.current_saved) : 0),
        monthlyTarget: String(Math.round(prefillGoal.monthly_target)),
      })
      setAddOpen(true)
      onPrefillConsumed?.()
    }
  }, [prefillGoal])

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, monthlyTarget: String(suggestedMonthly) })
    setAddOpen(true)
  }

  const closeAdd = () => { setAddOpen(false); setForm(EMPTY_FORM) }

  const goalAmt = parseFloat(form.goalAmount) || 0
  const curSaved = parseFloat(form.currentSaved) || 0
  const monthly = parseFloat(form.monthlyTarget) || 0
  const target = calcTargetInfo(goalAmt, curSaved, monthly)

  const handleAdd = async () => {
    if (!form.name.trim() || goalAmt <= 0 || monthly <= 0) return
    setSaving(true)
    try {
      await onAddGoal({
        name: form.name.trim(),
        goal_type: form.goalType,
        goal_amount: goalAmt,
        current_saved: curSaved,
        monthly_target: monthly,
        target_date: target.iso,
        is_active: true,
      })
      closeAdd()
    } catch (e) {
      console.error('Failed to add goal:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleAddSavings = async () => {
    if (!detailGoal) return
    const amt = parseFloat(savingsInput)
    if (isNaN(amt) || amt <= 0) return
    setSavingsAdding(true)
    try {
      await onAddSavings(detailGoal.id, amt)
      setDetailGoal(g => g ? { ...g, current_saved: g.current_saved + amt } : g)
      setSavingsInput('')
    } catch (e) {
      console.error('Failed to add savings:', e)
    } finally {
      setSavingsAdding(false)
    }
  }

  const handleDelete = async () => {
    if (!detailGoal) return
    await onDeleteGoal(detailGoal.id)
    setDetailGoal(null)
    setDeleteConfirm(false)
  }

  const handleGetAI = async (goal: Goal) => {
    const status = calcGoalStatus(goal)
    const targetDate = new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    setGoalAILoading(goal.id)
    const insight = await goalProgressInsightWithAI({
      name: goal.name,
      goalType: goal.goal_type,
      goalAmount: goal.goal_amount,
      currentSaved: goal.current_saved,
      monthlyTarget: goal.monthly_target,
      targetDate,
      pct: status.pct,
      daysAhead: status.daysAhead,
      daysBehind: status.daysBehind,
      extraNeeded: status.extraNeeded,
    }, (n) => onUpdateSettings?.({ ai_requests_used: n }))
    if (insight) setGoalAI(prev => ({ ...prev, [goal.id]: insight }))
    setGoalAILoading(null)
  }

  const activeGoals = goals.filter(g => g.is_active)

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '600 14px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }

  return (
    <>
      {/* Dashboard card */}
      <div style={{ background: c.surface, borderRadius: 18, overflow: 'hidden', border: `1px solid ${c.faint}` }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <span style={{ font: '700 15px Plus Jakarta Sans', color: c.ink }}>Goals</span>
            {activeGoals.length > 0 && (
              <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 99, padding: '1px 7px' }}>
                {activeGoals.length}
              </span>
            )}
          </div>
          <button
            onClick={openAdd}
            style={{ background: '#10B98118', color: '#10B981', border: 'none', borderRadius: 20, padding: '5px 13px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}
          >
            + Add
          </button>
        </div>

        {/* Goal list */}
        {activeGoals.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, marginBottom: 12 }}>
              No goals yet — start saving towards something
            </div>
            <button
              onClick={openAdd}
              style={{ background: '#10B98114', color: '#10B981', border: `1.5px dashed #10B98150`, borderRadius: 12, padding: '10px 20px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer' }}
            >
              Add your first goal
            </button>
          </div>
        ) : (
          activeGoals.map((goal, i) => {
            const st = calcGoalStatus(goal)
            const cfg = TYPE_CFG[goal.goal_type]
            const tDate = new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            return (
              <button
                key={goal.id}
                onClick={() => { setDetailGoal(goal); setSavingsInput(''); setDeleteConfirm(false) }}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  borderBottom: i < activeGoals.length - 1 ? `1px solid ${c.faint}` : 'none',
                  padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <GoalIcon type={goal.goal_type} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                        {goal.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {st.isComplete ? (
                          <span style={{ font: '700 11px Plus Jakarta Sans', color: '#10B981', background: '#10B98114', borderRadius: 8, padding: '2px 7px' }}>Done</span>
                        ) : (
                          <span style={{ font: '700 12px Plus Jakarta Sans', color: cfg.color }}>{st.pct}%</span>
                        )}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                      </div>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: c.surface2, overflow: 'hidden', marginBottom: 5 }}>
                      <div style={{ height: '100%', width: `${st.pct}%`, background: cfg.color, borderRadius: 999, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{fmt(goal.current_saved)} / {fmt(goal.goal_amount)}</span>
                      <span style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>{tDate}</span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Add Goal Sheet */}
      <BottomSheet open={addOpen} onClose={closeAdd} maxHeight="92svh" zIndex={400}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>Add Goal</div>
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 20 }}>Define what you're saving for</div>

        {/* Type selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Goal Type</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['purchase', 'savings', 'event'] as GoalType[]).map(type => {
              const cfg = TYPE_CFG[type]
              const active = form.goalType === type
              return (
                <button
                  key={type}
                  onClick={() => setForm(f => ({ ...f, goalType: type }))}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '10px 4px', border: `1.5px solid ${active ? cfg.color : c.faint}`,
                    borderRadius: 12, background: active ? cfg.color + '14' : c.surface2,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <GoalIcon type={type} size={28} />
                  <span style={{ font: `${active ? '700' : '600'} 11px Plus Jakarta Sans`, color: active ? cfg.color : c.muted }}>{cfg.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Goal Name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={form.goalType === 'purchase' ? 'e.g. iPhone 16' : form.goalType === 'event' ? 'e.g. Wedding' : 'e.g. Emergency Fund'}
            style={inp}
          />
        </div>

        {/* Goal Amount */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Goal Amount (₹)</label>
          <input
            type="number" inputMode="decimal"
            value={form.goalAmount}
            onChange={e => setForm(f => ({ ...f, goalAmount: e.target.value }))}
            onFocus={e => e.target.select()}
            placeholder="0"
            style={inp}
          />
        </div>

        {/* Already Saved */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Already Saved (₹) <span style={{ textTransform: 'none', fontWeight: 600 }}>— optional</span></label>
          <input
            type="number" inputMode="decimal"
            value={form.currentSaved}
            onChange={e => setForm(f => ({ ...f, currentSaved: e.target.value }))}
            onFocus={e => e.target.select()}
            placeholder="0"
            style={inp}
          />
        </div>

        {/* Monthly Target */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Monthly Target (₹)</label>
          <input
            type="number" inputMode="decimal"
            value={form.monthlyTarget}
            onChange={e => setForm(f => ({ ...f, monthlyTarget: e.target.value }))}
            onFocus={e => e.target.select()}
            placeholder={String(suggestedMonthly)}
            style={inp}
          />
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
            Suggested based on your spending: {fmt(suggestedMonthly)}/mo
          </div>
        </div>

        {/* Projected target date */}
        {goalAmt > 0 && monthly > 0 && (
          <div style={{ background: `#10B98114`, border: `1px solid #10B98130`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ font: '600 12px Plus Jakarta Sans', color: c.ink }}>Projected target date</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ font: '800 13px Plus Jakarta Sans', color: '#10B981' }}>{target.label}</div>
              <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{target.months} month{target.months !== 1 ? 's' : ''} away</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={closeAdd} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleAdd}
            disabled={saving || !form.name.trim() || goalAmt <= 0 || monthly <= 0}
            style={{ flex: 2, background: '#10B981', color: '#fff', border: 'none', borderRadius: 14, padding: '13px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer', opacity: (saving || !form.name.trim() || goalAmt <= 0 || monthly <= 0) ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Goal'}
          </button>
        </div>
      </BottomSheet>

      {/* Goal Detail Sheet */}
      <BottomSheet open={!!detailGoal} onClose={() => { setDetailGoal(null); setDeleteConfirm(false) }} maxHeight="92svh" zIndex={410}>
        {detailGoal && (() => {
          const goal = detailGoal
          const st = calcGoalStatus(goal)
          const cfg = TYPE_CFG[goal.goal_type]
          const tDate = new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
          const tShort = new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
          const remaining = Math.max(0, goal.goal_amount - goal.current_saved)
          const aiInsight = goalAI[goal.id]
          const aiLoading = goalAILoading === goal.id

          return (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <GoalIcon type={goal.goal_type} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</div>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{cfg.label} Goal · {tShort}</div>
                </div>
                <button onClick={() => { setDetailGoal(null); setDeleteConfirm(false) }} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 30, height: 30, cursor: 'pointer', font: '700 13px Plus Jakarta Sans', color: c.muted, flexShrink: 0 }}>✕</button>
              </div>

              {/* Big progress */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                  <div>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saved</div>
                    <div style={{ font: '800 26px Plus Jakarta Sans', color: cfg.color, letterSpacing: '-0.02em', marginTop: 2 }}>{fmt(goal.current_saved)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Goal</div>
                    <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(goal.goal_amount)}</div>
                  </div>
                </div>

                <div style={{ height: 12, borderRadius: 999, background: c.surface2, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${st.pct}%`, background: cfg.color, borderRadius: 999, transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: '700 13px Plus Jakarta Sans', color: cfg.color }}>{st.pct}% complete</span>
                  {!st.isComplete && <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>{fmt(remaining)} remaining</span>}
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                  <div>
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly Target</div>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(goal.monthly_target)}</div>
                  </div>
                  <div>
                    <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Date</div>
                    <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{tDate}</div>
                  </div>
                  {!st.isComplete && st.monthsRemaining != null && (
                    <div>
                      <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Months Left</div>
                      <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{Math.ceil(st.monthsRemaining)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ahead / behind badge */}
              {!st.isComplete && (
                <div style={{
                  padding: '8px 12px', borderRadius: 10, marginBottom: 14,
                  background: st.daysAhead != null ? '#DCFCE7' : '#FEF3C7',
                  border: `1px solid ${st.daysAhead != null ? '#10B98130' : '#F59E0B30'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: st.daysAhead != null ? '#10B98118' : '#F59E0B18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {st.daysAhead != null ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill="#D97706"/><path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/></svg>
                    )}
                  </div>
                  <span style={{ font: '600 12px Plus Jakarta Sans', color: st.daysAhead != null ? '#059669' : '#D97706', lineHeight: 1.4 }}>
                    {st.daysAhead != null
                      ? `Ahead of schedule by ${st.daysAhead} days. Keep it up.`
                      : `Behind by ${st.daysBehind} days. Save ${fmt(st.extraNeeded ?? 0)}/month extra to catch up.`}
                  </span>
                </div>
              )}

              {st.isComplete && (
                <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 14, background: '#DCFCE7', border: '1px solid #10B98130', textAlign: 'center' }}>
                  <div style={{ font: '700 13px Plus Jakarta Sans', color: '#059669' }}>Goal Reached! Congratulations.</div>
                </div>
              )}

              {/* Mint AI */}
              {autopilotEnabled && !aiInsight && !aiLoading && !st.isComplete && (
                <button
                  onClick={() => handleGetAI(goal)}
                  style={{ width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'linear-gradient(135deg,#6366F114,#8B5CF614)', border: '1px solid #6366F130', borderRadius: 14, padding: '11px', font: '700 13px Plus Jakarta Sans', color: '#6366F1', cursor: 'pointer' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  Ask Mint for Insight
                </button>
              )}
              {autopilotEnabled && aiLoading && (
                <div style={{ marginBottom: 14, borderRadius: 14, padding: '12px 14px', background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)', border: '1px solid #6366F122' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: '#6366F122', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </div>
                    <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint is thinking…</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[100, 75].map(w => <div key={w} style={{ height: 9, borderRadius: 999, background: '#6366F118', width: `${w}%` }} />)}
                  </div>
                </div>
              )}
              {autopilotEnabled && aiInsight && (
                <div style={{ marginBottom: 14, borderRadius: 14, padding: '12px 14px', background: 'linear-gradient(135deg,#6366F10e,#8B5CF60e)', border: '1px solid #6366F130' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: '#6366F122', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </div>
                    <span style={{ font: '700 12px Plus Jakarta Sans', color: '#6366F1' }}>Mint Insight</span>
                  </div>
                  <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.6 }}>{aiInsight}</div>
                </div>
              )}

              {/* Add savings */}
              {!st.isComplete && (
                <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Add Savings</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', font: '700 13px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                      <input
                        type="number" inputMode="decimal"
                        value={savingsInput}
                        onChange={e => setSavingsInput(e.target.value)}
                        onFocus={e => e.target.select()}
                        placeholder="Amount"
                        style={{ ...inp, paddingLeft: 24 }}
                      />
                    </div>
                    <button
                      onClick={handleAddSavings}
                      disabled={savingsAdding || !savingsInput || parseFloat(savingsInput) <= 0}
                      style={{ background: cfg.color, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 18px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', flexShrink: 0, opacity: (savingsAdding || !savingsInput || parseFloat(savingsInput) <= 0) ? 0.5 : 1 }}
                    >
                      {savingsAdding ? '…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              {/* Delete */}
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} style={{ width: '100%', background: 'none', color: c.bad, border: `1px solid ${c.bad}30`, borderRadius: 12, padding: '10px', font: '600 13px Plus Jakarta Sans', cursor: 'pointer' }}>
                  Delete Goal
                </button>
              ) : (
                <div style={{ background: '#FEE2E2', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginBottom: 10 }}>Delete "{goal.name}"? This cannot be undone.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setDeleteConfirm(false)} style={{ flex: 1, background: '#fff', border: 'none', borderRadius: 10, padding: '9px', font: '700 13px Plus Jakarta Sans', color: c.ink, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleDelete} style={{ flex: 1, background: c.bad, border: 'none', borderRadius: 10, padding: '9px', font: '700 13px Plus Jakarta Sans', color: '#fff', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </BottomSheet>
    </>
  )
}
