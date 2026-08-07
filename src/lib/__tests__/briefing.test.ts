import { describe, it, expect } from 'vitest'
import { buildDailyBriefing, MAX_BRIEFING_ITEMS } from '../briefing'
import type { AppNotification, NotificationPriority } from '@/types'
import type { MintSuggestion } from '../mint-suggestions'

function makeNotif(overrides: Partial<AppNotification> & Pick<AppNotification, 'id' | 'priority' | 'detector'>): AppNotification {
  return {
    domain: 'budget', tone: 'warning', title: 't', message: 'm',
    createdAt: '2026-01-01', dismissible: true,
    ...overrides,
  }
}

function makeSuggestion(overrides: Partial<MintSuggestion> & Pick<MintSuggestion, 'id'>): MintSuggestion {
  return {
    type: 'spend_less', title: 't', body: 'b', savingAmount: null,
    priority: 1, detector: overrides.id, confidence: 70,
    ...overrides,
  }
}

describe('buildDailyBriefing', () => {
  it('merges notifications and the active suggestion into one list', () => {
    const notifications = [makeNotif({ id: 'n1', priority: 'medium', detector: 'budget_spike' })]
    const suggestions = [makeSuggestion({ id: 'category_spike' })]
    const result = buildDailyBriefing(notifications, suggestions)
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining(['n1', 'suggestion_category_spike']))
    expect(result).toHaveLength(2)
  })

  it('sorts by priority weight, highest urgency first', () => {
    const notifications = [
      makeNotif({ id: 'low', priority: 'info', detector: 'budget_top_category' }),
      makeNotif({ id: 'crit', priority: 'critical', detector: 'cash_shortfall' }),
      makeNotif({ id: 'mid', priority: 'medium', detector: 'budget_spike' }),
    ]
    const result = buildDailyBriefing(notifications, [])
    expect(result.map(r => r.id)).toEqual(['crit', 'mid', 'low'])
  })

  it('does not cap the result — capping is the caller\'s job', () => {
    const notifications = Array.from({ length: MAX_BRIEFING_ITEMS + 3 }, (_, i) =>
      makeNotif({ id: `n${i}`, priority: 'medium', detector: 'budget_spike' }))
    const result = buildDailyBriefing(notifications, [])
    expect(result.length).toBeGreaterThan(MAX_BRIEFING_ITEMS)
  })

  it('maps MintSuggestion confidence (0-100) into a bucketed EstimateConfidence', () => {
    const [high] = buildDailyBriefing([], [makeSuggestion({ id: 'mission_risk', confidence: 90 })])
    const [medium] = buildDailyBriefing([], [makeSuggestion({ id: 'mission_risk', confidence: 60 })])
    const [low] = buildDailyBriefing([], [makeSuggestion({ id: 'mission_risk', confidence: 20 })])
    expect(high.explain.confidence).toBe('high')
    expect(medium.explain.confidence).toBe('medium')
    expect(low.explain.confidence).toBe('low')
  })

  it('maps each MintSuggestion id to its documented briefing priority', () => {
    const cases: [MintSuggestion['id'], NotificationPriority][] = [
      ['mission_risk', 'high'],
      ['recurring_spend', 'medium'],
      ['category_spike', 'medium'],
      ['unused_budget', 'info'],
      ['forecast', 'info'],
      ['celebrate', 'positive'],
    ]
    for (const [id, expected] of cases) {
      const [item] = buildDailyBriefing([], [makeSuggestion({ id })])
      expect(item.priority).toBe(expected)
    }
  })

  it('collapses a bill_due-tomorrow notification and the forecast suggestion into one item, keeping the higher priority', () => {
    const notifications = [makeNotif({
      id: 'bill_due_gold', priority: 'medium', detector: 'bill_due',
      title: 'Gold payment', message: 'Gold payment — due tomorrow.',
    })]
    const suggestions = [makeSuggestion({ id: 'forecast', title: 'Big expense tomorrow' })]
    const result = buildDailyBriefing(notifications, suggestions)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('bill_due_gold')
  })

  it('does not dedupe a bill_due notification that is not due tomorrow', () => {
    const notifications = [makeNotif({
      id: 'bill_due_gold', priority: 'medium', detector: 'bill_due',
      title: 'Gold payment', message: 'Gold payment — due in 5 days.',
    })]
    const suggestions = [makeSuggestion({ id: 'forecast', title: 'Big expense tomorrow' })]
    const result = buildDailyBriefing(notifications, suggestions)
    expect(result).toHaveLength(2)
  })

  it('carries reasons/recommendation/confidence through into ExplainInfo unchanged', () => {
    const notifications = [makeNotif({
      id: 'n1', priority: 'high', detector: 'budget_pace',
      recommendation: 'Spend below 500/day.',
      reasons: [{ label: 'Food', amount: 300 }],
      confidence: 'medium',
    })]
    const [item] = buildDailyBriefing(notifications, [])
    expect(item.explain.recommendation).toBe('Spend below 500/day.')
    expect(item.explain.reasons).toEqual([{ label: 'Food', amount: 300 }])
    expect(item.explain.confidence).toBe('medium')
    expect(item.explain.detector).toBe('budget_pace')
  })
})
