import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppNotification, AppState, DerivedMetrics } from '@/types'
import type { DailyChallengeState } from '@/hooks/useDailyChallenge'
import { generateMintSuggestions } from '@/lib/mint-suggestions'
import { buildDailyBriefing, MAX_BRIEFING_ITEMS, type BriefingItem } from '@/lib/briefing'
import { applyDailyFreeze } from '@/lib/briefing-snapshot'
import { computeHealthScore, type HealthScoreResult } from '@/lib/health-score'
import { loadPreviousScore, saveTodayScore, scoreTrend } from '@/lib/health-score-cache'
import { buildMintCoachContext, buildMintCoachFingerprint, type MintCoachContext } from '@/lib/mint-coach-context'
import { buildMintCoachPrompt } from '@/lib/mint-coach-prompt'
import { loadCachedCoach, loadPreviousDaySummary, saveCachedCoach } from '@/lib/mint-coach-cache'
import { mintCoachWithAI } from '@/lib/gemini'
import { iso, addDays, TODAY } from '@/lib/utils'

// This hook is the only orchestration layer for Grow. New intelligence added to Grow
// should flow through this hook rather than being computed inside GrowPage.
export interface GrowInsights {
  coachText: string | null
  coachFresh: boolean
  briefing: BriefingItem[]
  healthScore: HealthScoreResult
  habitConsistencyPct: number | null   // 30-day %, also folded into healthScore's habits component — exposed directly too since GrowPage's Habits summary card needs the raw figure
}

interface Params {
  open: boolean   // whether GrowPage is currently shown — gates the AI-costing Coach fetch and the habit-consistency network call, not the pure Briefing/Health Score computation
  state: AppState
  d: DerivedMetrics
  challenge: DailyChallengeState
  notifications: AppNotification[]   // already computed once in App.tsx via getAppNotifications — reused, not recomputed, so the bell-icon sheet and Today's Briefing never drift apart
  userId: string
  userName: string
  onUpdateSettings: (patch: Partial<AppState['settings']>) => Promise<void>
  fetchHabitConsistency: (sinceDate: string) => Promise<{ completed: number; total: number }>
}

export function useGrowInsights({
  open, state, d, challenge, notifications, userId, userName, onUpdateSettings, fetchHabitConsistency,
}: Params): GrowInsights {
  const { calc, streak } = challenge
  const todayStr = iso(TODAY)

  // ── Habit consistency (30-day %) — feeds Health Score's habit component and
  // GrowPage's Habits summary card. Network call, so gated on `open` (only fetched
  // once Grow has actually been opened this session), same as the original
  // GrowPage-local effect it replaces — but living here means it survives Grow being
  // closed and reopened instead of refetching every remount. ──
  const [habitConsistencyPct, setHabitConsistencyPct] = useState<number | null>(null)
  useEffect(() => {
    if (state.habits.length === 0) { setHabitConsistencyPct(null); return }
    if (!open) return
    const sinceDate = iso(addDays(TODAY, -30))
    fetchHabitConsistency(sinceDate).then(c => {
      setHabitConsistencyPct(c.total > 0 ? Math.round((c.completed / c.total) * 100) : null)
    })
  }, [open, state.habits.length, fetchHabitConsistency])

  // ── Mint Suggestions — deterministic waterfall, exactly one active suggestion ──
  const suggestions = useMemo(() => (calc ? generateMintSuggestions(state, d, calc) : []), [state, d, calc])

  // ── Today's Briefing — merge notifications + suggestion, dedupe by topic, then
  // freeze the day's non-critical ordering (see briefing-snapshot.ts) so the card
  // reads like "today's briefing" instead of reshuffling on every transaction. ──
  const liveCandidates = useMemo(() => buildDailyBriefing(notifications, suggestions), [notifications, suggestions])
  const briefing = useMemo(
    () => applyDailyFreeze(userId, todayStr, liveCandidates, MAX_BRIEFING_ITEMS),
    [userId, todayStr, liveCandidates],
  )

  // ── Financial Health Score — composite of existing signals, no new schema ──
  const healthScoreRaw = useMemo(
    () => computeHealthScore(state, d, calc, notifications, habitConsistencyPct),
    [state, d, calc, notifications, habitConsistencyPct],
  )
  const healthScore = useMemo((): HealthScoreResult => {
    const previous = loadPreviousScore(userId, todayStr)
    saveTodayScore(userId, todayStr, healthScoreRaw.score)
    return { ...healthScoreRaw, trend: scoreTrend(healthScoreRaw.score, previous) }
  }, [userId, todayStr, healthScoreRaw])

  // Full detected set (before the display cap), each tagged with whether it made
  // today's Briefing card — lets Coach reference something Briefing didn't have room
  // for, while an instruction in mint-coach-prompt.ts tells it not to restate what's
  // already visible. See mint-coach-context.ts / mint-coach-prompt.ts.
  const allDetectedTopics: MintCoachContext['allDetectedTopics'] = useMemo(() => {
    const visibleIds = new Set(briefing.map(b => b.id))
    return liveCandidates.map(item => ({ title: item.title, visible: visibleIds.has(item.id) }))
  }, [liveCandidates, briefing])

  // ── Mint Coach — narrates today's Grow state via one-shot AI call, cached per
  // (day, state-fingerprint) so it only regenerates when something Coach-relevant
  // actually changed, not on every render. Relocated verbatim from GrowPage, with
  // allDetectedTopics folded into both the context and the fingerprint so Coach
  // regenerates whenever the detected set changes. ──
  const autopilotEnabled = state.settings.autopilot_enabled ?? false
  const coachFingerprint = (autopilotEnabled && calc)
    ? buildMintCoachFingerprint(buildMintCoachContext(state, d, challenge, streak, userName, null, allDetectedTopics))
    : null
  const [coachText, setCoachText] = useState<string | null>(null)
  const [coachFresh, setCoachFresh] = useState(false)
  const coachFetchingRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !coachFingerprint) { setCoachText(null); return }

    const cached = loadCachedCoach(userId, todayStr, coachFingerprint)
    if (cached) { setCoachText(cached); setCoachFresh(false); return }

    if (coachFetchingRef.current === coachFingerprint) return
    coachFetchingRef.current = coachFingerprint

    const rawPrevious = loadPreviousDaySummary(userId, todayStr)
    const previousCoachSummary = rawPrevious ? rawPrevious.split(/\s+/).slice(0, 50).join(' ') : null
    const ctx = buildMintCoachContext(state, d, challenge, streak, userName, previousCoachSummary, allDetectedTopics)
    const { message, context } = buildMintCoachPrompt(ctx)

    mintCoachWithAI(message, context, n => onUpdateSettings({ ai_requests_used: n })).then(reply => {
      if (coachFetchingRef.current !== coachFingerprint) return   // stale — fingerprint moved on while this was in flight
      coachFetchingRef.current = null
      if (reply) {
        saveCachedCoach(userId, todayStr, coachFingerprint, reply)
        setCoachText(reply)
        setCoachFresh(true)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coachFingerprint, userId])

  return { coachText, coachFresh, briefing, healthScore, habitConsistencyPct }
}
