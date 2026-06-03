import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { Card } from './Card'
import { AreaTrend, WeeklyBars, CategoryDonut } from './Charts'
import type { AppState } from '@/types'
import { weeklyTrend, weeklyBars, categorySplit } from '@/lib/data'

type Tab = 'trend' | 'weeks' | 'category'
const TABS: [Tab, string][] = [['trend', 'Trend'], ['weeks', 'Weekly'], ['category', 'Category']]

interface AnalyticsProps { state: AppState }

export function Analytics({ state }: AnalyticsProps) {
  const c = useTheme()
  const [tab, setTab] = useState<Tab>('trend')

  const trend = weeklyTrend(state)
  const bars  = weeklyBars(state)
  const cats  = categorySplit(state)
  const trendTotal = trend.reduce((s, x) => s + x.value, 0)

  return (
    <Card pad={16}>
      <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Spending analytics</div>
      <div style={{ display: 'flex', gap: 4, background: c.surface2, borderRadius: 12, padding: 4, marginTop: 12 }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '8px 0',
            font: '700 12.5px Plus Jakarta Sans', transition: 'all 0.2s',
            background: tab === k ? c.surface : 'transparent',
            color: tab === k ? c.ink : c.muted,
            boxShadow: tab === k ? c.cardShadow : 'none',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {tab === 'trend' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <div style={{ font: '800 22px Plus Jakarta Sans', color: c.ink }}>{fmt(trendTotal)}</div>
              <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted }}>last 7 days</div>
            </div>
            <AreaTrend data={trend} />
          </div>
        )}
        {tab === 'weeks' && (
          <div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, marginBottom: 6 }}>Lifestyle spend per week</div>
            <WeeklyBars data={bars} />
          </div>
        )}
        {tab === 'category' && (
          cats.length === 0
            ? <div style={{ font: '600 13px Plus Jakarta Sans', color: c.muted, padding: '20px 0' }}>No lifestyle spend this month yet.</div>
            : <CategoryDonut data={cats} />
        )}
      </div>
    </Card>
  )
}
