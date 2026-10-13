import { useState } from 'react'
import { Quote } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { KakeiboReflection } from '@/types'
import { KButton } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  record: KakeiboReflection | null
  /** Budget Strategy's savings target for this cycle; null = no strategy, so no prefill. */
  suggested: number | null
  /** Last cycle, when it has a note not yet acknowledged. */
  lesson: KakeiboReflection | null
  onSetGoal: (r: KakeiboReflection, amount: number | null) => Promise<void>
  onAcknowledge: (r: KakeiboReflection) => Promise<void>
}

export function KakeiboGoalSheet({ open, onClose, record, suggested, lesson, onSetGoal, onAcknowledge }: Props) {
  const c = useTheme()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill once per opening (React's "adjust state on prop change" pattern).
  const session = open && record ? record.id : null
  const [seen, setSeen] = useState<string | null>(null)
  if (session !== seen) {
    setSeen(session)
    if (session && record) {
      const start = record.savings_goal ?? suggested
      setValue(start != null && start > 0 ? String(Math.round(start)) : '')
      setError(null)
    }
  }

  const amount = value.trim() === '' ? null : Number(value)
  const valid = amount != null && Number.isFinite(amount) && amount > 0 && amount < 1e10

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn(); onClose() }
    catch (err) { console.error('Kakeibo goal save failed', err); setError("Couldn't save — check your connection and try again.") }
    finally { setBusy(false) }
  }

  return (
    <BottomSheet open={open && !!record} onClose={busy ? () => {} : onClose} showHelpButton={false} dismissible={!busy}>
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.01em' }}>What do you want to save this cycle?</div>
      <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, margin: '4px 0 16px', lineHeight: 1.5 }}>
        {suggested != null && suggested > 0
          ? `Suggested from your Budget Strategy: ${fmt(Math.round(suggested))}. Change it if you like.`
          : 'Set an amount you want to move into savings or investments before your next salary.'}
      </div>

      {lesson?.reflection_note && (
        <div style={{ background: c.surface2, borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>
            <Quote size={13} /> Your note from last cycle
          </div>
          <div style={{ font: '600 13px Plus Jakarta Sans', color: c.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{lesson.reflection_note}</div>
        </div>
      )}

      <label htmlFor="kakeibo-goal" style={{ display: 'block', font: '700 11px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>Savings goal (₹)</label>
      <input
        id="kakeibo-goal"
        inputMode="numeric"
        value={value}
        onChange={e => setValue(e.target.value.replace(/[^\d.]/g, ''))}
        placeholder="e.g. 10000"
        style={{
          width: '100%', boxSizing: 'border-box', background: c.surface2,
          border: `1.5px solid ${c.faint}`, borderRadius: 12, padding: '12px 14px',
          font: '800 18px Plus Jakarta Sans', color: c.ink, outline: 'none',
        }}
      />
      {error && <div role="alert" style={{ font: '600 12px Plus Jakarta Sans', color: c.bad, marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
        {record?.goal_decided_at == null
          ? <KButton kind="quiet" disabled={busy} onClick={() => record && run(async () => {
              await onSetGoal(record, null)
              if (lesson) await onAcknowledge(lesson)
            })}>Skip for now</KButton>
          : <KButton kind="quiet" disabled={busy} onClick={onClose}>Cancel</KButton>}
        <KButton disabled={!valid || busy} onClick={() => record && amount != null && run(async () => {
          await onSetGoal(record, Math.round(amount))
          if (lesson) await onAcknowledge(lesson)
        })}>{busy ? 'Saving…' : 'Set my goal'}</KButton>
      </div>
    </BottomSheet>
  )
}
