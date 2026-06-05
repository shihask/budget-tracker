import { useState, useMemo, useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { ProgressRing } from './ProgressRing'
import type { DerivedMetrics, AppState } from '@/types'

interface HeroWeeklyProps {
  d: DerivedMetrics
  settings: AppState['settings']
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  editOpen: boolean
  onEditClose: () => void
}

function computeCycle(salaryDate: number) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const day = today.getDate()
  let start: Date, end: Date
  if (day >= salaryDate) {
    start = new Date(y, m, salaryDate)
    end = new Date(y, m + 1, salaryDate - 1)
  } else {
    start = new Date(y, m - 1, salaryDate)
    end = new Date(y, m, salaryDate - 1)
  }
  const todayMid = new Date(y, m, day)
  const msDay = 86400000
  const daysRemaining = Math.max(1, Math.round((end.getTime() - todayMid.getTime()) / msDay) + 1)
  const weeksRemaining = daysRemaining / 7
  const fmtD = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return { start, end, daysRemaining, weeksRemaining, startLabel: fmtD(start), endLabel: fmtD(end) }
}

function Row({ label, value, muted, accent, bad, bold }: { label: string; value: string; muted?: boolean; accent?: boolean; bad?: boolean; bold?: boolean }) {
  const c = useTheme()
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ font: '600 13px Plus Jakarta Sans', color: muted ? c.muted : c.ink }}>{label}</span>
      <span style={{ font: `${bold ? '800' : '700'} 14px Plus Jakarta Sans`, color: bad ? c.bad : accent ? c.accent : muted ? c.muted : c.ink }}>{value}</span>
    </div>
  )
}

export function HeroWeekly({ d, settings, onUpdateSettings, editOpen, onEditClose }: HeroWeeklyProps) {
  const c = useTheme()
  const pct = d.weeklyPct
  const status = pct > 100
    ? { t: 'Over budget', col: c.bad }
    : pct >= 75
    ? { t: 'Watch spending', col: c.warn }
    : { t: 'On track', col: c.good }

  const [salaryDateInput, setSalaryDateInput] = useState(String(settings.salary_date || ''))
  const [budgetInput, setBudgetInput] = useState(String(settings.weekly_budget))
  const [saving, setSaving] = useState(false)
  const [popup, setPopup] = useState<'budget' | 'spent' | null>(null)

  useEffect(() => {
    if (editOpen) {
      setSalaryDateInput(String(settings.salary_date || ''))
      setBudgetInput(String(settings.weekly_budget))
    }
  }, [editOpen, settings.salary_date, settings.weekly_budget])

  const cycle = useMemo(() => {
    const sd = parseInt(salaryDateInput)
    if (!sd || sd < 1 || sd > 31) return null
    return computeCycle(sd)
  }, [salaryDateInput])

  const cycleForDisplay = useMemo(() => {
    const sd = settings.salary_date
    if (!sd) return null
    return computeCycle(sd)
  }, [settings.salary_date])

  const suggested = cycle ? Math.round(d.realFreeMoney / cycle.weeksRemaining) : null

  const handleSave = async () => {
    const budget = parseFloat(budgetInput)
    const sd = parseInt(salaryDateInput) || null
    if (isNaN(budget) || budget <= 0) return
    setSaving(true)
    try {
      await onUpdateSettings({ weekly_budget: budget, salary_date: sd })
      onEditClose()
    } catch (_) {}
    setSaving(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: c.surface2,
    border: `1.5px solid ${c.faint}`, borderRadius: 11, padding: '10px 12px',
    font: '700 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    font: '600 11px Plus Jakarta Sans', color: c.muted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
  }

  return (
    <>
      <div style={{
        borderRadius: 26, padding: 20, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(145deg, ${c.heroA} 0%, ${c.heroB} 100%)`,
        boxShadow: c.heroShadow,
      }}>
        <div style={{ position: 'absolute', right: -40, top: -50, width: 180, height: 180, borderRadius: 999, background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 13px Plus Jakarta Sans', color: 'rgba(255,255,255,0.82)', letterSpacing: '0.02em' }}>Weekly Remaining</div>
            <div style={{ font: '800 40px Plus Jakarta Sans', color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 6 }}>
              {fmt(d.weeklyRemaining)}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '5px 11px' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />
              <span style={{ font: '700 12px Plus Jakarta Sans', color: '#fff' }}>{status.t}</span>
            </div>
          </div>

          <ProgressRing pct={pct} color="#fff" track="rgba(255,255,255,0.28)" size={104} stroke={10}>
            <div style={{ font: '800 22px Plus Jakarta Sans', color: '#fff', lineHeight: 1 }}>{Math.round(pct)}%</div>
            <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>used</div>
          </ProgressRing>
        </div>

        {/* Budget / Spent tiles */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'relative' }}>
          <div onClick={() => setPopup('budget')} style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>Budget ⓘ</div>
            <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(d.weeklyBudget)}</div>
            {settings.salary_date && (
              <div style={{ font: '600 10px Plus Jakarta Sans', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Salary: {settings.salary_date}th</div>
            )}
          </div>
          <div onClick={() => setPopup('spent')} style={{ flex: 1, background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
            <div style={{ font: '600 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.8)' }}>Spent ⓘ</div>
            <div style={{ font: '800 16px Plus Jakarta Sans', color: '#fff', marginTop: 2 }}>{fmt(d.weeklySpent)}</div>
          </div>
        </div>
      </div>

      {/* Calculation popup */}
      {popup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setPopup(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: c.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ font: '800 17px Plus Jakarta Sans', color: c.ink }}>
                {popup === 'budget' ? '📊 Budget Calculation' : '💸 Spent Calculation'}
              </div>
              <button onClick={() => setPopup(null)} style={{ background: c.surface2, border: 'none', borderRadius: 999, width: 28, height: 28, cursor: 'pointer', font: '700 14px Plus Jakarta Sans', color: c.muted }}>✕</button>
            </div>

            {popup === 'budget' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Total account balance" value={fmt(d.actualBalance)} />
                <Row label="Emergency fund reserve" value={`− ${fmt(d.emergencyFund)}`} muted />
                <Row label="Remaining commitments" value={`− ${fmt(d.remainingCommitments)}`} muted />
                <div style={{ height: 1, background: c.faint }} />
                <Row label="Free money" value={fmt(d.realFreeMoney)} accent />
                {cycleForDisplay ? (
                  <>
                    <Row label="Weeks left in cycle" value={`÷ ${cycleForDisplay.weeksRemaining.toFixed(1)} weeks`} muted />
                    <div style={{ height: 1, background: c.faint }} />
                    <Row label="Weekly budget" value={fmt(d.weeklyBudget)} accent bold />
                    <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '8px 10px', marginTop: 4 }}>
                      Cycle: {cycleForDisplay.startLabel} → {cycleForDisplay.endLabel} · {cycleForDisplay.daysRemaining} days left
                    </div>
                  </>
                ) : (
                  <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '10px 12px' }}>
                    Set salary date in budget settings to see cycle-based calculation.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, background: c.surface2, borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
                  Sum of expense transactions this week tagged under Lifestyle categories.
                </div>
                <Row label="Weekly spent" value={fmt(d.weeklySpent)} bold />
                <Row label="Weekly budget" value={fmt(d.weeklyBudget)} muted />
                <div style={{ height: 1, background: c.faint }} />
                <Row label="Weekly remaining" value={fmt(d.weeklyRemaining)} accent={d.weeklyRemaining >= 0} bad={d.weeklyRemaining < 0} bold />
                <Row label="Usage" value={`${Math.round(d.weeklyPct)}%`} muted />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget Edit Sheet */}
      {editOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={onEditClose} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ background: c.bg, borderRadius: '22px 22px 0 0', maxWidth: 600, width: '100%', margin: '0 auto', padding: '8px 16px calc(40px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto', maxHeight: '90svh' }}>
            <div style={{ width: 40, height: 4, background: c.faint, borderRadius: 999, margin: '12px auto 18px' }} />
            <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4, letterSpacing: '-0.02em' }}>Weekly Budget</div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 18 }}>Set your salary cycle to auto-calculate</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Salary credit date (day of month)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" value={salaryDateInput} onChange={e => setSalaryDateInput(e.target.value)}
                    placeholder="e.g. 28" min="1" max="31" style={{ ...inp, width: 100 }} />
                  <span style={{ font: '600 13px Plus Jakarta Sans', color: c.muted }}>of every month</span>
                </div>
              </div>

              {cycle && (
                <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ font: '700 12px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>
                    Current cycle: {cycle.startLabel} → {cycle.endLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent }}>{cycle.daysRemaining}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>days left</div>
                    </div>
                    <div>
                      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.accent }}>{cycle.weeksRemaining.toFixed(1)}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>weeks left</div>
                    </div>
                    <div>
                      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink }}>{fmt(d.realFreeMoney)}</div>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>free money</div>
                    </div>
                  </div>
                  {suggested !== null && suggested > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.faint}` }}>
                      <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>
                        {fmt(d.realFreeMoney)} ÷ {cycle.weeksRemaining.toFixed(1)} weeks
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ font: '600 11px Plus Jakarta Sans', color: c.muted }}>Suggested budget</div>
                          <div style={{ font: '800 22px Plus Jakarta Sans', color: c.good, letterSpacing: '-0.02em' }}>{fmt(suggested)}<span style={{ font: '600 12px Plus Jakarta Sans' }}>/week</span></div>
                        </div>
                        <button onClick={() => setBudgetInput(String(suggested))}
                          style={{ background: c.goodSoft, color: c.good, border: 'none', borderRadius: 10, padding: '8px 14px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer' }}>
                          Use this ↓
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={lbl}>Weekly budget</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', font: '700 14px Plus Jakarta Sans', color: c.muted, pointerEvents: 'none' }}>₹</span>
                  <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="0" min="0"
                    style={{ ...inp, paddingLeft: 28 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={onEditClose} style={{ flex: 1, background: c.surface2, color: c.muted, border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: c.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px', font: '700 14px Plus Jakarta Sans', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
