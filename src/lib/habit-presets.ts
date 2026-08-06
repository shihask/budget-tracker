import type { HabitFrequency } from '@/types'

export interface HabitPreset {
  id: string
  icon: string
  color: string
  title: string
  category: string
  frequency: HabitFrequency
}

// Preset IDs are part of persisted user data (habits.preset_key). Changing one is a
// breaking change for every habit already created from it. Titles, icons, and
// categories may change freely; ids never do.
export const HABIT_PRESETS: HabitPreset[] = [
  { id: 'skip_tea', icon: '☕', color: 'amber', title: 'Skip Tea', category: 'saving', frequency: 'weekdays' },
  { id: 'skip_snacks', icon: '🍪', color: 'amber', title: 'Skip Snacks', category: 'saving', frequency: 'weekdays' },
  { id: 'save_100', icon: '💰', color: 'green', title: 'Save ₹100', category: 'saving', frequency: 'weekly' },
  { id: 'no_online_shopping', icon: '🛍️', color: 'amber', title: 'No Online Shopping', category: 'saving', frequency: 'daily' },

  { id: 'cook_at_home', icon: '🍳', color: 'orange', title: 'Cook at Home', category: 'lifestyle', frequency: 'daily' },
  { id: 'carry_water_bottle', icon: '💧', color: 'blue', title: 'Carry Water Bottle', category: 'lifestyle', frequency: 'daily' },
  { id: 'bring_lunch', icon: '🍱', color: 'orange', title: 'Bring Lunch', category: 'lifestyle', frequency: 'weekdays' },

  { id: 'review_expenses', icon: '📒', color: 'purple', title: 'Review Expenses', category: 'planning', frequency: 'weekly' },
  { id: 'check_budget', icon: '📊', color: 'purple', title: 'Check Budget', category: 'planning', frequency: 'weekly' },
  { id: 'reflect', icon: '🪞', color: 'purple', title: 'Reflect', category: 'planning', frequency: 'daily' },

  { id: 'walk_instead', icon: '🚶', color: 'teal', title: 'Walk Instead', category: 'transport', frequency: 'weekdays' },
  { id: 'use_public_transport', icon: '🚌', color: 'teal', title: 'Use Public Transport', category: 'transport', frequency: 'weekdays' },
  { id: 'carpool', icon: '🚗', color: 'teal', title: 'Carpool', category: 'transport', frequency: 'weekdays' },
]

// `category` is unconstrained text at the DB layer (see Grow Phase 4 plan) — this is
// just display metadata for the categories the presets above happen to use today. A
// future category not in this map falls back to DEFAULT_HABIT_CATEGORY_META, not an error.
export const HABIT_CATEGORY_META: Record<string, { icon: string; label: string }> = {
  saving: { icon: '💰', label: 'Saving' },
  lifestyle: { icon: '🍽', label: 'Lifestyle' },
  planning: { icon: '📒', label: 'Planning' },
  transport: { icon: '🚶', label: 'Transport' },
}
export const DEFAULT_HABIT_CATEGORY_META = { icon: '🌿', label: 'Other' }

export const HABIT_FREQUENCY_OPTIONS: Array<{ value: HabitFrequency; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'specific_days', label: 'Specific days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
