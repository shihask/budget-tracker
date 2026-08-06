import { fmt } from '@/lib/utils'
import type { MintCoachContext } from '@/lib/mint-coach-context'

const TIMING_LABEL: Record<NonNullable<MintCoachContext['timingHint']>, string> = {
  salary_tomorrow: 'salary/cycle-reset arrives tomorrow',
  weekend_approaching: 'weekend is approaching',
  month_start: 'a new month just started',
}

// Reuses the exact `DailyChallenge: ...` label format AIChatSheet.tsx's own buildContext()
// sends (see line ~575) so the shared system prompt's already-tuned tone-calibration rules
// ("at_risk: motivating, not alarming", "exceeded: compassionate", etc.) apply here too,
// instead of inventing a second context format the model has no prior guidance for.
function buildContextString(ctx: MintCoachContext): string {
  const parts: string[] = []

  if (ctx.mission) {
    const { calc, streak, difficulty } = ctx.mission
    const successRate = calc.successRate !== null ? `${calc.successRate}%` : 'starting'
    parts.push(
      `DailyChallenge: difficulty:${difficulty} target:₹${Math.round(calc.adjustedTarget).toLocaleString()} spent-today:₹${Math.round(calc.spentToday).toLocaleString()} remaining:₹${Math.round(calc.remaining).toLocaleString()} status:${calc.status} streak:${streak}-days success-rate:${successRate} plant:${calc.plantGrowth.milestoneLabel} salary-pace:${calc.survivalStatus} safe-daily:₹${Math.round(calc.safeDailyLimit).toLocaleString()}`
    )
  }

  parts.push(`Habits: due:${ctx.habits.dueToday} completed:${ctx.habits.completedToday} top-streak:${ctx.habits.topStreak}`)

  if (ctx.achievement) {
    parts.push(`Achievement: ${ctx.achievement.title} (${ctx.achievement.unlockedToday ? 'unlocked-today' : 'past'})`)
  }

  parts.push(`Reflection: ${ctx.reflection.done ? 'done' : 'pending'}`)

  if (ctx.topSuggestion) {
    parts.push(`Suggestion: ${ctx.topSuggestion.id} — ${ctx.topSuggestion.title}`)
  }

  if (ctx.forecastEvent) {
    parts.push(`Forecast: ${ctx.forecastEvent.title} ${fmt(ctx.forecastEvent.amount)} due tomorrow`)
  }

  if (ctx.timingHint) {
    parts.push(`Timing: ${TIMING_LABEL[ctx.timingHint]}`)
  }

  if (ctx.previousCoachSummary) {
    parts.push(`PreviousCoachNote: ${ctx.previousCoachSummary}`)
  }

  return parts.join('\n')
}

const INSTRUCTIONS = [
  "Write today's Grow coaching summary as Mint.",
  'One flowing paragraph, no headings, no bullet points, no bold markdown, no emoji verdict line.',
  "Mention at most three of today's topics. Use only the facts given above — never invent numbers or events.",
  "Avoid exaggerated praise (\"Great work!\", \"Amazing!\", \"Fantastic!\") — be calm and practical, like a thoughtful coach, not a cheerleader.",
  'If PreviousCoachNote is present, briefly connect today to it for continuity (e.g. building on yesterday\'s momentum) rather than starting from a blank slate.',
  'If an achievement unlocked today, celebrate it briefly without exaggeration.',
  'If recovery is active, encourage without shaming.',
  'If habits were completed today, mention the momentum.',
  "A concrete action item is shown separately below this message — you don't need to repeat it verbatim, just set up why it matters if relevant.",
  'Maximum 80 words.',
].join(' ')

export function buildMintCoachPrompt(ctx: MintCoachContext): { message: string; context: string } {
  return {
    message: INSTRUCTIONS,
    context: buildContextString(ctx),
  }
}
