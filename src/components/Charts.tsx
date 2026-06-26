import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
  PieChart, Pie, Cell as PieCell,
} from 'recharts'
import { useTheme } from '@/lib/theme-context'
import { CAT_COLORS } from '@/lib/tokens'
import { fmt } from '@/lib/utils'
import type { TrendPoint, BarPoint, CatPoint } from '@/types'

// ── Area Trend ────────────────────────────────────────────────────────────────
interface AreaTrendProps { data: TrendPoint[] }

export function AreaTrend({ data }: AreaTrendProps) {
  const c = useTheme()
  const gradId = 'trend-grad-' + c.accent.replace('#', '')
  const n = data.length
  const tickInterval = n <= 7 ? 0 : n <= 15 ? 2 : 4
  return (
    <ResponsiveContainer width="100%" height={132}>
      <AreaChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.accent} stopOpacity={0.28} />
            <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: n <= 7 ? 11 : 9, fontFamily: 'ui-monospace, monospace', fill: c.muted }} axisLine={false} tickLine={false} interval={tickInterval} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10, fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: c.ink }}
          formatter={(v) => [fmt(Number(v)), 'Spent']}
          labelStyle={{ color: c.muted, fontWeight: 600 }}
          cursor={{ stroke: c.faint, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={c.accent}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={(props: any) => {
            const { cx, cy, index } = props
            const isLast = index === data.length - 1
            if (n > 7 && !isLast) return <g key={index} />
            return (
              <g key={index}>
                {isLast && <circle cx={cx} cy={cy} r={6.5} fill={c.accent} fillOpacity={0.18} />}
                <circle cx={cx} cy={cy} r={isLast ? 4 : 2.6}
                  fill={isLast ? c.accent : '#fff'}
                  stroke={c.accent}
                  strokeWidth={isLast ? 0 : 2}
                />
              </g>
            )
          }}
          activeDot={{ r: 5, fill: c.accent }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Weekly Bars (last 5 weeks) ────────────────────────────────────────────────
interface WeeklyBarsProps { data: BarPoint[] }

export function WeeklyBars({ data }: WeeklyBarsProps) {
  const c = useTheme()
  const last = data.length - 1
  return (
    <ResponsiveContainer width="100%" height={132}>
      <BarChart data={data} margin={{ top: 18, right: 4, left: 4, bottom: 0 }} barSize={28}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', fill: c.muted }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: c.surface, border: `1px solid ${c.faint}`, borderRadius: 10, fontFamily: 'Plus Jakarta Sans', fontSize: 12, color: c.ink }}
          formatter={(v) => [fmt(Number(v)), 'Spent']}
          cursor={{ fill: c.faint }}
        />
        <Bar dataKey="value" radius={[6, 6, 6, 6]}
          label={{ position: 'top', fontSize: 10, fontFamily: 'ui-monospace, monospace', fontWeight: 700, fill: c.muted }}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === last ? c.accent : c.barDim} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Category Donut ─────────────────────────────────────────────────────────────
interface CategoryDonutProps { data: CatPoint[] }

export function CategoryDonut({ data }: CategoryDonutProps) {
  const c = useTheme()
  const total = data.reduce((s, x) => s + x.value, 0)
  const colorOf = (name: string) => CAT_COLORS[name] || c.accent

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <PieChart width={150} height={150}>
          <Pie
            data={data} cx={75} cy={75}
            innerRadius={52} outerRadius={69}
            dataKey="value" startAngle={90} endAngle={-270}
            paddingAngle={2} strokeWidth={0}
          >
            {data.map((entry, i) => (
              <PieCell key={i} fill={colorOf(entry.name)} />
            ))}
          </Pie>
        </PieChart>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ font: '500 10px ui-monospace, monospace', color: c.muted, letterSpacing: '0.5px' }}>THIS MONTH</div>
          <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, letterSpacing: '-0.02em' }}>{fmt(total)}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {data.slice(0, 6).map(x => (
          <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: colorOf(x.name), flexShrink: 0 }} />
            <span style={{ flex: 1, font: '600 12px Plus Jakarta Sans', color: c.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
            <span style={{ font: '700 12px Plus Jakarta Sans', color: c.ink }}>{fmt(x.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
