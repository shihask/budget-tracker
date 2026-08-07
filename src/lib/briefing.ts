import type { AppNotification, EstimateConfidence, NotificationAction, NotificationPriority, NotificationTone } from '@/types'
import type { MintSuggestion } from '@/lib/mint-suggestions'
import { PRIORITY_WEIGHT } from '@/lib/notification-engine'

// Named so a future tablet/desktop layout can raise the display cap without hunting
// through code — see useGrowInsights, which caps AFTER buildDailyBriefing returns.
export const MAX_BRIEFING_ITEMS = 3

export interface ExplainInfo {
  detector: string           // slug, resolved via getDetectorLabel (detector-labels.ts) for display
  confidence?: EstimateConfidence
  reasons?: { label: string; amount: number }[]
  recommendation?: string
}

export interface BriefingItem {
  id: string
  source: 'notification' | 'suggestion'
  priority: NotificationPriority
  tone: NotificationTone
  title: string
  body: string
  topic?: string              // set only where a known cross-engine collision exists
  explain: ExplainInfo
  actions?: NotificationAction[]
}

// notification-engine's bill_due reminders and mint-suggestions' forecast rule
// ("Big expense tomorrow") can both describe the exact same event. Rather than
// threading entity ids through both engines, tag both with a shared coarse topic so
// dedupeByTopic collapses them to whichever ranks higher. Add more topics here as
// real collisions are found, not preemptively.
const BILL_TOMORROW_TOPIC = 'bill_tomorrow'

function isBillDueTomorrow(n: AppNotification): boolean {
  return n.detector === 'bill_due' && n.message.includes('due tomorrow')
}

function mapNotificationToBriefingItem(n: AppNotification): BriefingItem {
  return {
    id: n.id,
    source: 'notification',
    priority: n.priority,
    tone: n.tone,
    title: n.title,
    body: n.message,
    topic: isBillDueTomorrow(n) ? BILL_TOMORROW_TOPIC : undefined,
    explain: {
      detector: n.detector,
      confidence: n.confidence,
      reasons: n.reasons,
      recommendation: n.recommendation,
    },
    actions: n.actions,
  }
}

// generateMintSuggestions returns exactly one item (its internal waterfall
// short-circuits), so there's nothing to merge on this side — just one item to place
// at the right rank alongside the notification list.
const SUGGESTION_PRIORITY: Record<MintSuggestion['id'], NotificationPriority> = {
  mission_risk: 'high',
  recurring_spend: 'medium',
  category_spike: 'medium',
  unused_budget: 'info',
  forecast: 'info',
  celebrate: 'positive',
}

const TONE_FOR_PRIORITY: Record<NotificationPriority, NotificationTone> = {
  critical: 'critical', high: 'warning', medium: 'warning', info: 'info', positive: 'positive',
}

function bucketConfidence(pct: number): EstimateConfidence {
  if (pct >= 80) return 'high'
  if (pct >= 50) return 'medium'
  return 'low'
}

// Exported so MintSuggestionCard (the standalone single-suggestion card) can route a
// MintSuggestion through the same BriefingItemRow/ExplainPanel treatment Today's
// Briefing uses, without going through the full merge/sort/dedupe pipeline below —
// there's nothing to merge for a single suggestion.
export function mapSuggestionToBriefingItem(s: MintSuggestion): BriefingItem {
  const priority = SUGGESTION_PRIORITY[s.id]
  return {
    id: `suggestion_${s.id}`,
    source: 'suggestion',
    priority,
    tone: TONE_FOR_PRIORITY[priority],
    title: s.title,
    body: s.body,
    topic: s.id === 'forecast' ? BILL_TOMORROW_TOPIC : undefined,
    explain: {
      detector: s.detector,
      confidence: bucketConfidence(s.confidence),
    },
  }
}

function sortByPriority(items: BriefingItem[]): BriefingItem[] {
  return [...items].sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
}

// Groups by topic (items without one pass through untouched) and keeps only the
// first — i.e. highest-priority, since this runs after sortByPriority — item per
// group.
function dedupeByTopic(items: BriefingItem[]): BriefingItem[] {
  const seenTopics = new Set<string>()
  const out: BriefingItem[] = []
  for (const item of items) {
    if (!item.topic) { out.push(item); continue }
    if (seenTopics.has(item.topic)) continue
    seenTopics.add(item.topic)
    out.push(item)
  }
  return out
}

// Returns the full ranked+deduped candidate list (NOT capped) — callers cap
// separately (see MAX_BRIEFING_ITEMS) so useGrowInsights can pass the uncapped list
// to Coach while only showing the top few in the card.
export function buildDailyBriefing(notifications: AppNotification[], suggestions: MintSuggestion[]): BriefingItem[] {
  const items = [
    ...notifications.map(mapNotificationToBriefingItem),
    ...suggestions.map(mapSuggestionToBriefingItem),
  ]
  return dedupeByTopic(sortByPriority(items))
}
