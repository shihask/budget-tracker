import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'
import { HABIT_PRESETS, HABIT_CATEGORY_META, HABIT_FREQUENCY_OPTIONS, type HabitPreset } from '@/lib/habit-presets'
import type { HabitFrequency } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (form: {
    title: string
    category: string
    preset_key: string | null
    frequency: HabitFrequency
    days_of_week?: number[]
    weekly_day?: number | null
    monthly_day?: number | null
  }) => Promise<void>
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_CATEGORY = 'saving'

// BottomSheet-based creation flow, matching this app's existing lightweight-creation
// convention (e.g. category pickers) rather than a new full page — pick a preset
// (pre-fills title/category/icon, frequency still user-chosen) or go custom.
export function CreateHabitSheet({ open, onClose, onCreate }: Props) {
  const c = useTheme()
  const [selectedPreset, setSelectedPreset] = useState<HabitPreset | null>(null)
  const [customTitle, setCustomTitle] = useState('')
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [frequency, setFrequency] = useState<HabitFrequency>('daily')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])
  const [weeklyDay, setWeeklyDay] = useState(1)
  const [monthlyDay, setMonthlyDay] = useState(1)
  const [saving, setSaving] = useState(false)

  const pickPreset = (preset: HabitPreset) => {
    setSelectedPreset(preset)
    setCustomTitle(preset.title)
    setCategory(preset.category)
    setFrequency(preset.frequency)
  }
  const pickCustom = () => {
    setSelectedPreset(null)
    setCustomTitle('')
    setCategory(DEFAULT_CATEGORY)
    setFrequency('daily')
  }

  const title = customTitle.trim()
  const canCreate = title.length > 0 && (frequency !== 'specific_days' || daysOfWeek.length > 0)

  const reset = () => {
    setSelectedPreset(null); setCustomTitle(''); setCategory(DEFAULT_CATEGORY); setFrequency('daily')
    setDaysOfWeek([]); setWeeklyDay(1); setMonthlyDay(1)
  }

  const handleCreate = async () => {
    if (!canCreate || saving) return
    setSaving(true)
    await onCreate({
      title,
      category,
      preset_key: selectedPreset?.id ?? null,
      frequency,
      days_of_week: frequency === 'specific_days' ? daysOfWeek : undefined,
      weekly_day: frequency === 'weekly' ? weeklyDay : null,
      monthly_day: frequency === 'monthly' ? monthlyDay : null,
    })
    setSaving(false)
    reset()
    onClose()
  }

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    background: selected ? c.accent : c.surface2,
    border: `1.5px solid ${selected ? c.accent : c.faint}`,
    font: '700 12px Plus Jakarta Sans', color: selected ? '#fff' : c.sub,
  })

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose() }} zIndex={320} maxHeight="92svh">
      <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em', marginBottom: 16 }}>
        New Habit
      </div>

      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Choose a starting point
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {HABIT_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => pickPreset(preset)}
            style={{
              ...chipStyle(selectedPreset?.id === preset.id),
              display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', justifyContent: 'flex-start',
            }}
          >
            <span style={{ fontSize: 15 }}>{preset.icon}</span> {preset.title}
          </button>
        ))}
        <button
          onClick={pickCustom}
          style={{ ...chipStyle(selectedPreset === null && customTitle !== ''), textAlign: 'left' }}
        >
          ✏️ Custom
        </button>
      </div>

      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Title
      </div>
      <input
        value={customTitle}
        onChange={e => setCustomTitle(e.target.value)}
        placeholder="e.g. No tea after 5pm"
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 12, marginBottom: 16,
          border: `1.5px solid ${c.faint}`, background: c.surface2, color: c.ink,
          font: '600 14px Plus Jakarta Sans', boxSizing: 'border-box',
        }}
      />

      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Category
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(HABIT_CATEGORY_META).map(([key, meta]) => (
          <button key={key} onClick={() => setCategory(key)} style={chipStyle(category === key)}>
            {meta.icon} {meta.label}
          </button>
        ))}
      </div>

      <div style={{ font: '700 12px Plus Jakarta Sans', color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Frequency
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {HABIT_FREQUENCY_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setFrequency(opt.value)} style={chipStyle(frequency === opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>

      {frequency === 'specific_days' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {WEEKDAY_LABELS.map((label, day) => (
            <button
              key={day}
              onClick={() => setDaysOfWeek(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day])}
              style={{ ...chipStyle(daysOfWeek.includes(day)), flex: 1, padding: '7px 0', textAlign: 'center' }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {frequency === 'weekly' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {WEEKDAY_LABELS.map((label, day) => (
            <button key={day} onClick={() => setWeeklyDay(day)} style={{ ...chipStyle(weeklyDay === day), flex: 1, padding: '7px 0', textAlign: 'center' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {frequency === 'monthly' && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="number" min={1} max={31} value={monthlyDay}
            onChange={e => setMonthlyDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            style={{
              width: 90, padding: '10px 12px', borderRadius: 12,
              border: `1.5px solid ${c.faint}`, background: c.surface2, color: c.ink,
              font: '600 14px Plus Jakarta Sans', boxSizing: 'border-box',
            }}
          />
          <span style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginLeft: 8 }}>
            day of the month (clamps to the last day in shorter months)
          </span>
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={!canCreate || saving}
        style={{
          width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
          background: canCreate ? c.accent : c.surface2, color: canCreate ? '#fff' : c.muted,
          font: '700 15px Plus Jakarta Sans', cursor: canCreate ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? 'Creating…' : 'Create Habit'}
      </button>
    </BottomSheet>
  )
}
