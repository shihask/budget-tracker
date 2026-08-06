import type { AppState } from '@/types'

export type AchievementCategory = 'budget' | 'growth' | 'savings' | 'reflection' | 'habits'
export type AchievementVisibility = 'visible' | 'secret'

// Named domain events an achievement can be unlocked from, instead of state-polling.
// Add a new variant here (not a bespoke inline call somewhere) when a future badge
// needs a transient fact that can't be recovered by checking state later.
export type AchievementEvent =
  | { type: 'challenge_comeback' }

// `kind` is evaluation timing (when to check); `event` (when present) names which
// domain event it cares about — properties of a trigger, not the trigger itself.
export type AchievementTrigger =
  | { kind: 'daily' }
  | { kind: 'event'; event: AchievementEvent['type'] }

export interface AchievementProgress {
  current: number
  target: number
  unit?: 'days' | 'leaves' | '₹' | 'goals'
}

export interface AchievementDefinition {
  id: string
  title: string
  description: string
  category: AchievementCategory
  visibility: AchievementVisibility
  trigger: AchievementTrigger
  // Present for trigger.kind === 'daily' only — event-triggered defs (Comeback) are
  // never polled, so they have nothing to check against state.
  condition?: (state: AppState) => boolean
  progress?: (state: AppState) => AchievementProgress
}

function totalSaved(state: AppState): number {
  return state.goals.filter(g => g.is_active).reduce((sum, g) => sum + g.current_saved, 0)
}

function distinctGoalCount(state: AppState): number {
  return new Set(state.goal_contributions.map(c => c.goal_id)).size
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // ── Budget ──────────────────────────────────────────────────────────────
  {
    id: 'first_success', title: 'First Success', description: 'Stay under budget for one day.',
    category: 'budget', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_success_days ?? 0) >= 1,
    progress: state => ({ current: Math.min(state.settings.challenge_success_days ?? 0, 1), target: 1, unit: 'days' }),
  },
  {
    id: 'budget_guardian', title: 'Budget Guardian', description: '7 successful budget days.',
    category: 'budget', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_success_days ?? 0) >= 7,
    progress: state => ({ current: Math.min(state.settings.challenge_success_days ?? 0, 7), target: 7, unit: 'days' }),
  },
  {
    id: 'budget_champion', title: 'Budget Champion', description: '30 successful budget days.',
    category: 'budget', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_success_days ?? 0) >= 30,
    progress: state => ({ current: Math.min(state.settings.challenge_success_days ?? 0, 30), target: 30, unit: 'days' }),
  },
  {
    id: 'comeback', title: 'Comeback', description: 'Recovered right after an overspend day.',
    category: 'budget', visibility: 'secret', trigger: { kind: 'event', event: 'challenge_comeback' },
  },
  {
    id: 'perfect_week', title: 'Perfect Week', description: '7 successful days with no recovery needed.',
    category: 'budget', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_clean_streak ?? 0) >= 7,
    progress: state => ({ current: Math.min(state.settings.challenge_clean_streak ?? 0, 7), target: 7, unit: 'days' }),
  },

  // ── Growth (Plant) ──────────────────────────────────────────────────────
  {
    id: 'first_leaf', title: 'First Leaf', description: 'Earn your first leaf.',
    category: 'growth', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_leaves ?? 0) >= 1,
    progress: state => ({ current: Math.min(state.settings.challenge_leaves ?? 0, 1), target: 1, unit: 'leaves' }),
  },
  {
    id: 'young_plant', title: 'Young Plant', description: 'Reach the Young Plant stage.',
    category: 'growth', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_leaves ?? 0) >= 15,
    progress: state => ({ current: Math.min(state.settings.challenge_leaves ?? 0, 15), target: 15, unit: 'leaves' }),
  },
  {
    id: 'mature', title: 'Mature', description: 'Reach the Mature stage.',
    category: 'growth', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_leaves ?? 0) >= 60,
    progress: state => ({ current: Math.min(state.settings.challenge_leaves ?? 0, 60), target: 60, unit: 'leaves' }),
  },
  {
    id: 'blooming', title: 'Blooming', description: 'Reach the Blooming stage.',
    category: 'growth', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_leaves ?? 0) >= 100,
    progress: state => ({ current: Math.min(state.settings.challenge_leaves ?? 0, 100), target: 100, unit: 'leaves' }),
  },
  {
    id: 'forest_builder', title: 'Forest Builder', description: 'Earn 1,000 lifetime leaves.',
    category: 'growth', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.challenge_leaves ?? 0) >= 1000,
    progress: state => ({ current: Math.min(state.settings.challenge_leaves ?? 0, 1000), target: 1000, unit: 'leaves' }),
  },

  // ── Savings ─────────────────────────────────────────────────────────────
  {
    id: 'first_contribution', title: 'First Contribution', description: 'Make your first goal contribution.',
    category: 'savings', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => state.goal_contributions.length >= 1,
    progress: state => ({ current: Math.min(state.goal_contributions.length, 1), target: 1, unit: 'goals' }),
  },
  {
    id: 'saved_1000', title: '₹1,000 Saved', description: 'Save ₹1,000 across your goals.',
    category: 'savings', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => totalSaved(state) >= 1000,
    progress: state => ({ current: Math.min(totalSaved(state), 1000), target: 1000, unit: '₹' }),
  },
  {
    id: 'saved_10000', title: '₹10,000 Saved', description: 'Save ₹10,000 across your goals.',
    category: 'savings', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => totalSaved(state) >= 10000,
    progress: state => ({ current: Math.min(totalSaved(state), 10000), target: 10000, unit: '₹' }),
  },
  {
    id: 'three_goals', title: 'Three Goals', description: 'Contribute toward three different goals.',
    category: 'savings', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => distinctGoalCount(state) >= 3,
    progress: state => ({ current: Math.min(distinctGoalCount(state), 3), target: 3, unit: 'goals' }),
  },

  // ── Reflection ──────────────────────────────────────────────────────────
  {
    id: 'first_reflection', title: 'First Reflection', description: 'Complete your first reflection.',
    category: 'reflection', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.reflection_days_count ?? 0) >= 1,
    progress: state => ({ current: Math.min(state.settings.reflection_days_count ?? 0, 1), target: 1, unit: 'days' }),
  },
  {
    id: 'weekly_reflection', title: 'Weekly Reflection', description: 'Reflect on 7 different days.',
    category: 'reflection', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.reflection_days_count ?? 0) >= 7,
    progress: state => ({ current: Math.min(state.settings.reflection_days_count ?? 0, 7), target: 7, unit: 'days' }),
  },
  {
    id: 'self_awareness', title: 'Self Awareness', description: 'Reflect on 30 different days.',
    category: 'reflection', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => (state.settings.reflection_days_count ?? 0) >= 30,
    progress: state => ({ current: Math.min(state.settings.reflection_days_count ?? 0, 30), target: 30, unit: 'days' }),
  },

  // ── Habits (Phase 4) ────────────────────────────────────────────────────
  {
    id: 'habit_starter', title: 'Habit Starter', description: 'Complete a habit for the first time.',
    category: 'habits', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => state.habits.some(h => h.total_completions >= 1),
    progress: state => ({ current: Math.min(Math.max(0, ...state.habits.map(h => h.total_completions), 0), 1), target: 1, unit: 'days' }),
  },
  {
    id: 'seven_day_habit', title: '7-Day Habit', description: 'Complete a habit seven consecutive times.',
    category: 'habits', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => state.habits.some(h => h.best_streak >= 7),
    progress: state => ({ current: Math.min(Math.max(0, ...state.habits.map(h => h.best_streak), 0), 7), target: 7, unit: 'days' }),
  },
  {
    id: 'habit_consistency', title: 'Consistency', description: 'Reach a 30-day streak on any habit.',
    category: 'habits', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => state.habits.some(h => h.best_streak >= 30),
    progress: state => ({ current: Math.min(Math.max(0, ...state.habits.map(h => h.best_streak), 0), 30), target: 30, unit: 'days' }),
  },
  {
    // Generalized from "Morning Planner: complete Review Budget 30 times" — titles are
    // user-editable free text, category isn't, so this matches on category instead of
    // an exact habit title.
    id: 'planner', title: 'Planner', description: 'Complete 30 planning habits.',
    category: 'habits', visibility: 'visible', trigger: { kind: 'daily' },
    condition: state => state.habits.some(h => h.category === 'planning' && h.total_completions >= 30),
    progress: state => ({
      current: Math.min(Math.max(0, ...state.habits.filter(h => h.category === 'planning').map(h => h.total_completions), 0), 30),
      target: 30, unit: 'days',
    }),
  },
]
