import { useState, useEffect, useMemo, useRef } from 'react'
import { X, AlertTriangle, Flame } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { fmt, round2 } from '@/lib/utils'
import { evaluateAmountExpression } from '@/lib/amountExpression'
import { BottomSheet, HelpText } from './BottomSheet'
import { AmountOperatorRow } from './AmountOperatorRow'
import { goalProgressInsightWithAI } from '@/lib/gemini'
import { calcGoalStatus, calcGoalForecast, calcGoalMomentum, calcTargetInfo, MS_MONTH } from '@/lib/goals'
import type { Goal, GoalType, GoalContribution, DerivedMetrics, Settings, Transaction } from '@/types'

interface PrefillData {
  name: string
  goal_amount: number
  current_saved: number
  monthly_target: number
  target_date: string
}

interface Props {
  goals: Goal[]
  contributions: GoalContribution[]
  d: DerivedMetrics
  transactions: Transaction[]
  settings: Settings
  autopilotEnabled: boolean
  onAddGoal: (g: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  onUpdateGoal: (id: string, patch: Partial<Goal>) => Promise<void>
  onDeleteGoal: (id: string) => Promise<void>
  onAddSavings: (id: string, amount: number, source?: 'manual' | 'daily_challenge') => Promise<void>
  onUpdateSettings?: (patch: { ai_requests_used: number }) => void
  prefillGoal?: PrefillData | null
  onPrefillConsumed?: () => void
}

const TYPE_CFG: Record<GoalType, { label: string; color: string; icon: (stroke: string) => React.ReactNode }> = {
  purchase: {
    label: 'Purchase',
    color: '#EF4444',
    icon: (s) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
    ),
  },
  savings: {
    label: 'Savings',
    color: '#10B981',
    icon: (s) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
  event: {
    label: 'Event',
    color: '#F59E0B',
    icon: (s) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
}

function GoalIcon({ type, size = 40 }: { type: GoalType; size?: number }) {
  const cfg = TYPE_CFG[type]
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: cfg.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {cfg.icon(cfg.color)}
    </div>
  )
}

const EMPTY_FORM = { name: '', goalType: 'purchase' as GoalType, goalAmount: '', currentSaved: '', monthlyTarget: '', targetDate: '' }

export function GoalsSection({
  goals, contributions, d, transactions, settings, autopilotEnabled,
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
  const goalAmountRef = useRef<HTMLInputElement | null>(null)
  const currentSavedRef = useRef<HTMLInputElement | null>(null)
  const monthlyTargetRef = useRef<HTMLInputElement | null>(null)
  const savingsInputRef = useRef<HTMLInputElement | null>(null)
  const [goalAmountFocused, setGoalAmountFocused] = useState(false)
  const [currentSavedFocused, setCurrentSavedFocused] = useState(false)
  const [monthlyTargetFocused, setMonthlyTargetFocused] = useState(false)
  const [savingsInputFocused, setSavingsInputFocused] = useState(false)
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
        targetDate: prefillGoal.target_date || '',
      })
      setAddOpen(true)
      onPrefillConsumed?.()
    }
  }, [prefillGoal])

  useEffect(() => {
    if (!form.targetDate || goalAmt <= 0) return
    const targetMs = new Date(form.targetDate + 'T00:00:00').getTime()
    const nowMs = Date.now()
    if (targetMs <= nowMs) return
    const needed = Math.max(0, goalAmt - curSaved)
    const monthsLeft = (targetMs - nowMs) / MS_MONTH
    if (monthsLeft <= 0) return
    setForm(f => ({ ...f, monthlyTarget: String(Math.ceil(needed / monthsLeft)) }))
  }, [form.targetDate, form.goalAmount, form.currentSaved])

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, monthlyTarget: String(suggestedMonthly) })
    setAddOpen(true)
  }

  const closeAdd = () => { setAddOpen(false); setForm(EMPTY_FORM) }

  const goalAmt = evaluateAmountExpression(form.goalAmount) ?? 0
  const curSaved = evaluateAmountExpression(form.currentSaved) ?? 0
  const monthly = evaluateAmountExpression(form.monthlyTarget) ?? 0
  const target = calcTargetInfo(goalAmt, curSaved, monthly)

  const handleAdd = async () => {
    if (!form.name.trim() || goalAmt <= 0 || monthly <= 0) return
    setSaving(true)
    try {
      await onAddGoal({
        name: form.name.trim(),
        goal_type: form.goalType,
        goal_amount: round2(goalAmt),
        current_saved: round2(curSaved),
        monthly_target: round2(monthly),
        target_date: form.targetDate || target.iso,
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
    const rawAmt = evaluateAmountExpression(savingsInput)
    if (rawAmt === null || rawAmt <= 0) return
    const amt = round2(rawAmt)
    setSavingsAdding(true)
    try {
      await onAddSavings(detailGoal.id, amt, 'manual')
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
                <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="#fff" stroke="#fff"/>
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
            style={{ background: '#10B98118', color: '#10B981', border: 'none', borderRadius: 20, padding: '5px 11px', font: '700 18px Plus Jakarta Sans', cursor: 'pointer', lineHeight: 1 }}
          >
            +
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
                  <GoalIcon type={goal.goal_type} size={40} />
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
          <HelpText>What you are saving for. e.g. iPhone 16, Emergency Fund, Goa Trip.</HelpText>
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
          <HelpText>Total amount you need to save to reach this goal.</HelpText>
          <input
            ref={goalAmountRef}
            type="text" inputMode="decimal"
            value={form.goalAmount}
            onChange={e => setForm(f => ({ ...f, goalAmount: e.target.value }))}
            onFocus={e => { e.target.select(); setGoalAmountFocused(true) }}
            onBlur={e => {
              setGoalAmountFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setForm(f => ({ ...f, goalAmount: String(round2(r)) }))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              if (r !== null) setForm(f => ({ ...f, goalAmount: String(round2(r)) }))
            }}
            placeholder="0"
            style={inp}
          />
          {goalAmountFocused && <AmountOperatorRow inputRef={goalAmountRef} onChange={v => setForm(f => ({ ...f, goalAmount: v }))} />}
        </div>

        {/* Already Saved */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Already Saved (₹) <span style={{ textTransform: 'none', fontWeight: 600 }}>— optional</span></label>
          <HelpText>If you have already set aside money for this goal, enter it here.</HelpText>
          <input
            ref={currentSavedRef}
            type="text" inputMode="decimal"
            value={form.currentSaved}
            onChange={e => setForm(f => ({ ...f, currentSaved: e.target.value }))}
            onFocus={e => { e.target.select(); setCurrentSavedFocused(true) }}
            onBlur={e => {
              setCurrentSavedFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setForm(f => ({ ...f, currentSaved: String(round2(r)) }))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              if (r !== null) setForm(f => ({ ...f, currentSaved: String(round2(r)) }))
            }}
            placeholder="0"
            style={inp}
          />
          {currentSavedFocused && <AmountOperatorRow inputRef={currentSavedRef} onChange={v => setForm(f => ({ ...f, currentSaved: v }))} />}
        </div>

        {/* Target Date */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>
            Target Date <span style={{ textTransform: 'none', fontWeight: 600 }}>— optional</span>
          </label>
          <HelpText>When you want to reach this goal. Used to calculate how much to save each month.</HelpText>
          <input
            type="date"
            value={form.targetDate}
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
            style={inp}
          />
          {form.targetDate && goalAmt > 0 && monthly > 0 && (
            <div style={{ font: '600 11px Plus Jakarta Sans', color: '#10B981', marginTop: 5 }}>
              Monthly savings needed: {fmt(monthly)}/mo to reach goal by this date
            </div>
          )}
        </div>

        {/* Monthly Target */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>
            Monthly Target (₹){form.targetDate && goalAmt > 0 ? <span style={{ textTransform: 'none', fontWeight: 600, marginLeft: 4 }}>— auto-calculated</span> : null}
          </label>
          <HelpText>How much to save each month. Auto-calculated from goal amount and target date — you can override it.</HelpText>
          <input
            ref={monthlyTargetRef}
            type="text" inputMode="decimal"
            value={form.monthlyTarget}
            onChange={e => setForm(f => ({ ...f, monthlyTarget: e.target.value }))}
            onFocus={e => { e.target.select(); setMonthlyTargetFocused(true) }}
            onBlur={e => {
              setMonthlyTargetFocused(false)
              const r = evaluateAmountExpression(e.target.value)
              if (r !== null) setForm(f => ({ ...f, monthlyTarget: String(round2(r)) }))
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const r = evaluateAmountExpression(e.currentTarget.value)
              if (r !== null) setForm(f => ({ ...f, monthlyTarget: String(round2(r)) }))
            }}
            placeholder={String(suggestedMonthly)}
            style={inp}
          />
          {monthlyTargetFocused && <AmountOperatorRow inputRef={monthlyTargetRef} onChange={v => setForm(f => ({ ...f, monthlyTarget: v }))} />}
          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginTop: 5 }}>
            Suggested based on your spending: {fmt(suggestedMonthly)}/mo
          </div>
        </div>

        {/* Projected target date — only shown when no explicit target date is entered */}
        {goalAmt > 0 && monthly > 0 && !form.targetDate && (
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
      <BottomSheet open={!!detailGoal} onClose={() => { setDetailGoal(null); setDeleteConfirm(false) }} maxHeight="92svh" zIndex={410} showHelpButton={false}>
        {detailGoal && (() => {
          const goal = detailGoal
          const st = calcGoalStatus(goal)
          const forecast = calcGoalForecast(goal)
          const momentum = calcGoalMomentum(goal.id, contributions)
          const cfg = TYPE_CFG[goal.goal_type]
          const tDate = new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
          const tShort = new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
          const remaining = Math.max(0, goal.goal_amount - goal.current_saved)
          const aiInsight = goalAI[goal.id]
          const aiLoading = goalAILoading === goal.id

          // Goal Health config
          const healthCfg = st.health === 'complete'
            ? { label: 'Goal Reached', color: '#059669', bg: '#DCFCE7', border: '#10B98130', icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l5 5L20 4"/></svg>
              ) }
            : st.health === 'on_track'
            ? { label: 'On Track', color: '#059669', bg: '#DCFCE7', border: '#10B98130', icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              ) }
            : { label: 'Needs Attention', color: '#D97706', bg: '#FEF3C7', border: '#F59E0B30', icon: (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><circle cx="12" cy="17" r=".5" fill="#D97706"/><path d="M10.3 3.3L2 21h20L13.7 3.3a2 2 0 00-3.4 0z"/></svg>
              ) }

          const monthsToComplete = Math.round((Date.now() - new Date(goal.created_at).getTime()) / MS_MONTH)

          return (
            <>
              {/* Header row — always shown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <GoalIcon type={goal.goal_type} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</div>
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginTop: 1 }}>{cfg.label} Goal · {tShort}</div>
                </div>
                <button onClick={() => { setDetailGoal(null); setDeleteConfirm(false) }} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 30, height: 30, cursor: 'pointer', font: '700 13px Plus Jakarta Sans', color: c.muted, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
              </div>

              {st.isComplete ? (
                /* ── COMPLETION EXPERIENCE ─────────────────────────── */
                <>
                  {/* Trophy */}
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 20, margin: '0 auto 12px',
                      background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4a2 2 0 000 4h2"/><path d="M18 9h2a2 2 0 010 4h-2"/>
                        <path d="M6 4h12v10a6 6 0 01-12 0V4z"/>
                        <path d="M9 21h6"/><path d="M12 17v4"/>
                      </svg>
                    </div>
                    <div style={{ font: '800 22px Plus Jakarta Sans', color: '#059669', letterSpacing: '-0.02em', marginBottom: 4 }}>
                      Goal Achieved!
                    </div>
                    <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>
                      {goal.name}
                    </div>
                  </div>

                  {/* Achievement stats */}
                  <div style={{ background: '#DCFCE7', border: '1px solid #10B98130', borderRadius: 16, padding: '16px', marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                      <div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target</div>
                        <div style={{ font: '800 18px Plus Jakarta Sans', color: '#059669', marginTop: 2 }}>{fmt(goal.goal_amount)}</div>
                      </div>
                      <div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed in</div>
                        <div style={{ font: '800 18px Plus Jakarta Sans', color: '#059669', marginTop: 2 }}>
                          {monthsToComplete < 1 ? 'Under a month' : `${monthsToComplete} month${monthsToComplete !== 1 ? 's' : ''}`}
                        </div>
                      </div>
                      {momentum.totalContribs > 0 && (
                        <div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contributions</div>
                          <div style={{ font: '800 18px Plus Jakarta Sans', color: '#059669', marginTop: 2 }}>{momentum.totalContribs}</div>
                        </div>
                      )}
                      {momentum.challengeCount > 0 && (
                        <div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Challenge wins</div>
                          <div style={{ font: '800 18px Plus Jakarta Sans', color: '#059669', marginTop: 2 }}>{momentum.challengeCount}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Source breakdown — only shown if challenge contributions exist */}
                  {momentum.challengeTotal > 0 && (
                    <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>How you saved it</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Manual contributions</span>
                          <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(momentum.manualTotal)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>From challenge wins</span>
                          <span style={{ font: '700 13px Plus Jakarta Sans', color: c.accent }}>{fmt(momentum.challengeTotal)}</span>
                        </div>
                        <div style={{ height: 1, background: c.faint, margin: '2px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>Total saved</span>
                          <span style={{ font: '700 14px Plus Jakarta Sans', color: cfg.color }}>{fmt(goal.current_saved)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Contribution history */}
                  {momentum.recentContribs.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Contribution History</div>
                      <div style={{ background: c.surface2, borderRadius: 14, overflow: 'hidden' }}>
                        {momentum.recentContribs.map((contrib, i) => {
                          const dLabel = new Date(contrib.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          return (
                            <div key={contrib.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < momentum.recentContribs.length - 1 ? `1px solid ${c.faint}` : 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, minWidth: 44 }}>{dLabel}</span>
                                {contrib.source === 'daily_challenge' && (
                                  <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accent + '18', borderRadius: 6, padding: '2px 6px' }}>Challenge</span>
                                )}
                              </div>
                              <span style={{ font: '700 13px Plus Jakarta Sans', color: cfg.color }}>{fmt(contrib.amount)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── ACTIVE GOAL DETAIL ────────────────────────────── */
                <>
                  {/* Big progress */}
                  <div style={{ marginBottom: 16 }}>
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
                      <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>{fmt(remaining)} remaining</span>
                    </div>
                  </div>

                  {/* Goal Health badge */}
                  <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 14, background: healthCfg.bg, border: `1px solid ${healthCfg.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: healthCfg.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {healthCfg.icon}
                      </div>
                      <span style={{ font: '700 13px Plus Jakarta Sans', color: healthCfg.color }}>{healthCfg.label}</span>
                    </div>
                    {st.health === 'on_track' && st.daysAhead != null && st.daysAhead > 0 && (
                      <span style={{ font: '500 12px Plus Jakarta Sans', color: healthCfg.color, paddingLeft: 28 }}>
                        Ahead by {st.daysAhead} {st.daysAhead === 1 ? 'day' : 'days'}. Keep it up.
                      </span>
                    )}
                    {st.health === 'needs_attention' && st.extraNeeded != null && (
                      <span style={{ font: '500 12px Plus Jakarta Sans', color: healthCfg.color, paddingLeft: 28 }}>
                        Add {fmt(st.extraNeeded)}/month more to stay on target.
                        {st.daysBehind != null && st.daysBehind > 0 ? ` Behind by ${st.daysBehind} ${st.daysBehind === 1 ? 'day' : 'days'}.` : ''}
                      </span>
                    )}
                  </div>

                  {/* Source breakdown — shown when challenge contributions exist */}
                  {momentum.challengeTotal > 0 && (
                    <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>How you're saving</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>Manual contributions</span>
                          <span style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>{fmt(momentum.manualTotal)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>From challenge wins</span>
                          <span style={{ font: '700 13px Plus Jakarta Sans', color: c.accent }}>{fmt(momentum.challengeTotal)}</span>
                        </div>
                        <div style={{ height: 1, background: c.faint, margin: '2px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>Total saved</span>
                          <span style={{ font: '700 14px Plus Jakarta Sans', color: cfg.color }}>{fmt(goal.current_saved)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Forecast section */}
                  <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Forecast</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                      <div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Pace</div>
                        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(forecast.currentPace)}/mo</div>
                      </div>
                      <div>
                        <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>At This Pace</div>
                        <div style={{ font: '700 14px Plus Jakarta Sans', color: forecast.forecastLabel ? c.ink : c.muted, marginTop: 2 }}>
                          {forecast.forecastLabel ?? '—'}
                        </div>
                      </div>
                      {forecast.requiredPace !== null && (
                        <div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Required Pace</div>
                          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{fmt(forecast.requiredPace)}/mo</div>
                        </div>
                      )}
                      {forecast.monthlyGap !== null && forecast.monthlyGap > 0 && (
                        <div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly Gap</div>
                          <div style={{ font: '700 14px Plus Jakarta Sans', color: '#D97706', marginTop: 2 }}>+{fmt(forecast.monthlyGap)}/mo</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Goal Momentum */}
                  {momentum.daysSinceLast !== null && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 12, marginBottom: 14,
                      background: momentum.daysSinceLast > 21 ? '#FEF3C714' : '#DCFCE714',
                      border: `1px solid ${momentum.daysSinceLast > 21 ? '#F59E0B30' : '#10B98130'}`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}>{momentum.daysSinceLast > 21 ? <AlertTriangle size={16} /> : <Flame size={16} />}</span>
                      <div>
                        {momentum.daysSinceLast > 21 ? (
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: '#D97706' }}>
                            No contributions in {momentum.daysSinceLast} days
                          </span>
                        ) : momentum.thisMonthCount > 0 ? (
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: '#059669' }}>
                            {momentum.thisMonthCount} contribution{momentum.thisMonthCount !== 1 ? 's' : ''} this month
                            {momentum.thisMonthTotal > 0 ? ` · ${fmt(momentum.thisMonthTotal)} added` : ''}
                          </span>
                        ) : (
                          <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>
                            Last contribution {momentum.daysSinceLast === 0 ? 'today' : `${momentum.daysSinceLast} ${momentum.daysSinceLast === 1 ? 'day' : 'days'} ago`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

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
                      {st.monthsRemaining != null && (
                        <div>
                          <div style={{ font: '600 10px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Months Left</div>
                          <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink, marginTop: 2 }}>{Math.ceil(st.monthsRemaining)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contribution History */}
                  {momentum.recentContribs.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 8 }}>Contribution History</div>
                      <div style={{ background: c.surface2, borderRadius: 14, overflow: 'hidden' }}>
                        {momentum.recentContribs.map((contrib, i) => {
                          const dLabel = new Date(contrib.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          return (
                            <div key={contrib.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < momentum.recentContribs.length - 1 ? `1px solid ${c.faint}` : 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, minWidth: 44 }}>{dLabel}</span>
                                {contrib.source === 'daily_challenge' && (
                                  <span style={{ font: '600 10px Plus Jakarta Sans', color: c.accent, background: c.accent + '18', borderRadius: 6, padding: '2px 6px' }}>Challenge</span>
                                )}
                              </div>
                              <span style={{ font: '700 13px Plus Jakarta Sans', color: cfg.color }}>{fmt(contrib.amount)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mint AI */}
                  {autopilotEnabled && !aiInsight && !aiLoading && (
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
                  <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Add Savings</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', font: '700 13px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                        <input
                          ref={savingsInputRef}
                          type="text" inputMode="decimal"
                          value={savingsInput}
                          onChange={e => setSavingsInput(e.target.value)}
                          onFocus={e => { e.target.select(); setSavingsInputFocused(true) }}
                          onBlur={e => {
                            setSavingsInputFocused(false)
                            const r = evaluateAmountExpression(e.target.value)
                            if (r !== null) setSavingsInput(String(round2(r)))
                          }}
                          onKeyDown={e => {
                            if (e.key !== 'Enter') return
                            const r = evaluateAmountExpression(e.currentTarget.value)
                            if (r !== null) setSavingsInput(String(round2(r)))
                          }}
                          placeholder="Amount"
                          style={{ ...inp, paddingLeft: 24 }}
                        />
                      </div>
                      <button
                        onClick={handleAddSavings}
                        disabled={savingsAdding || !savingsInput || (evaluateAmountExpression(savingsInput) ?? 0) <= 0}
                        style={{ background: cfg.color, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 18px', font: '700 13px Plus Jakarta Sans', cursor: 'pointer', flexShrink: 0, opacity: (savingsAdding || !savingsInput || (evaluateAmountExpression(savingsInput) ?? 0) <= 0) ? 0.5 : 1 }}
                      >
                        {savingsAdding ? '…' : 'Add'}
                      </button>
                    </div>
                    {savingsInputFocused && <AmountOperatorRow inputRef={savingsInputRef} onChange={setSavingsInput} />}
                  </div>
                </>
              )}

              {/* Delete — always accessible */}
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
