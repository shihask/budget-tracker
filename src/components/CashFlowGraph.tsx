import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import type { CashFlowProjection } from '@/lib/cashflow'

interface Props {
  projections: CashFlowProjection[]
  currentBalance: number
  lowestBalance: number
  lowestBalanceDate?: string
  recoveryDate?: string
  recoveryBalance?: number
  nextSalaryDate?: string
  height?: number
  onPointTap?: (index: number) => void
}

const F = 'Plus Jakarta Sans'
const PAD_X = 40
const PAD_TOP = 32
const PAD_BOTTOM = 28

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export function CashFlowGraph({ projections, currentBalance, lowestBalance, lowestBalanceDate, recoveryDate, recoveryBalance, nextSalaryDate, height = 200, onPointTap }: Props) {
  const c = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(w)
    })
    ro.observe(el)
    setWidth(el.clientWidth || 320)
    return () => ro.disconnect()
  }, [])

  if (projections.length === 0) {
    return (
      <div ref={containerRef} style={{ background: c.surface2, borderRadius: 16, padding: 16, marginBottom: 14, textAlign: 'center' }}>
        <div style={{ font: `600 12px ${F}`, color: c.muted, padding: '20px 0' }}>No forecast events to visualize</div>
      </div>
    )
  }

  const chartW = width - PAD_X * 2
  const chartH = height - PAD_TOP - PAD_BOTTOM

  const points: { x: number; y: number; balance: number; date: string; idx: number; event: CashFlowProjection['event'] }[] = []

  const allBalances = [currentBalance, ...projections.map(p => p.balanceAfter)]
  const minBal = Math.min(...allBalances)
  const maxBal = Math.max(...allBalances)
  const range = Math.max(1, maxBal - minBal)
  const yPad = range * 0.1

  const yMin = minBal - yPad
  const yMax = maxBal + yPad
  const yRange = yMax - yMin

  const toY = (bal: number) => PAD_TOP + chartH - ((bal - yMin) / yRange) * chartH

  const dates = projections.map(p => p.event.date)
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]
  const daySpan = Math.max(1, Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / 86400000))
  const toX = (iso: string) => PAD_X + ((new Date(iso).getTime() - new Date(firstDate).getTime()) / 86400000 / daySpan) * chartW

  const startX = PAD_X
  const startY = toY(currentBalance)

  projections.forEach((p, i) => {
    points.push({ x: toX(p.event.date), y: toY(p.balanceAfter), balance: p.balanceAfter, date: p.event.date, idx: i, event: p.event })
  })

  const pathD = `M${startX},${startY} ` + points.map(p => `L${p.x},${p.y}`).join(' ')

  const zeroY = toY(0)
  const hasNegative = minBal < 0

  const lowestPt = lowestBalanceDate ? points.find(p => p.date === lowestBalanceDate && p.balance === lowestBalance) : null
  const recoveryPt = recoveryDate ? points.find(p => p.date === recoveryDate) : null
  const incomePoints = points.filter(p => p.event.type === 'income')
  const majorExpenses = points.filter(p => p.event.type === 'expense' && (p.event.source === 'card' || p.event.source === 'commitment' || p.event.source === 'saving' || p.event.source === 'planned') && p.event.amount >= 1000)

  const EVT_COLORS: Record<string, string> = { salary: '#22C55E', card: '#EF4444', commitment: '#EF4444', saving: '#8B5CF6', planned: '#F97316' }

  const gradId = 'cf-grad'
  const fillPath = `${pathD} L${points[points.length - 1].x},${PAD_TOP + chartH} L${startX},${PAD_TOP + chartH} Z`

  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; amount: string } | null>(null)

  const handleTap = (pt: typeof points[0], label?: string) => {
    setTooltip({ x: pt.x, y: pt.y, label: label || pt.event.title, amount: fmt(pt.balance) })
    onPointTap?.(pt.idx)
    setTimeout(() => setTooltip(null), 3000)
  }

  return (
    <div ref={containerRef} style={{ background: c.surface2, borderRadius: 16, padding: '12px 0', marginBottom: 14, overflow: 'hidden' }}>
      <svg width={width} height={height} style={{ display: 'block', touchAction: 'pan-y' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.good} stopOpacity={0.25} />
            <stop offset={hasNegative ? `${((zeroY - PAD_TOP) / chartH) * 100}%` : '100%'} stopColor={c.good} stopOpacity={0.05} />
            {hasNegative && <stop offset={`${((zeroY - PAD_TOP) / chartH) * 100}%`} stopColor={c.bad} stopOpacity={0.05} />}
            {hasNegative && <stop offset="100%" stopColor={c.bad} stopOpacity={0.2} />}
          </linearGradient>
        </defs>

        {/* Fill area */}
        <path d={fillPath} fill={`url(#${gradId})`} />

        {/* Zero line */}
        {hasNegative && zeroY > PAD_TOP && zeroY < PAD_TOP + chartH && (
          <line x1={PAD_X} y1={zeroY} x2={PAD_X + chartW} y2={zeroY} stroke={c.bad} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
        )}

        {/* Balance line */}
        <path d={pathD} fill="none" stroke={c.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Today marker */}
        <circle cx={startX} cy={startY} r={4} fill={c.accent} />
        <text x={startX} y={PAD_TOP - 6} textAnchor="start" fill={c.muted} style={{ font: `600 9px ${F}` }}>Today</text>
        <text x={startX} y={PAD_TOP + chartH + 14} textAnchor="start" fill={c.muted} style={{ font: `500 9px ${F}` }}>{shortDate(firstDate)}</text>

        {/* End date */}
        <text x={PAD_X + chartW} y={PAD_TOP + chartH + 14} textAnchor="end" fill={c.muted} style={{ font: `500 9px ${F}` }}>{shortDate(lastDate)}</text>

        {/* Income dots */}
        {incomePoints.map((pt, i) => (
          <circle key={`inc${i}`} cx={pt.x} cy={pt.y} r={3.5} fill={c.good} stroke={c.surface2} strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => handleTap(pt)} />
        ))}

        {/* Salary markers on x-axis */}
        {incomePoints.slice(0, 3).map((pt, i) => (
          <g key={`sal${i}`}>
            <line x1={pt.x} y1={PAD_TOP + chartH} x2={pt.x} y2={PAD_TOP + chartH + 4} stroke={c.good} strokeWidth={1.5} />
          </g>
        ))}

        {/* Major expense markers */}
        {majorExpenses.map((pt, i) => {
          const ec = EVT_COLORS[pt.event.source] ?? c.muted
          return <circle key={`exp${i}`} cx={pt.x} cy={pt.y} r={3} fill={ec} stroke={c.surface2} strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => handleTap(pt)} />
        })}

        {/* Lowest balance point */}
        {lowestPt && (
          <g style={{ cursor: 'pointer' }} onClick={() => handleTap(lowestPt, 'Lowest')}>
            <circle cx={lowestPt.x} cy={lowestPt.y} r={5} fill={c.bad} stroke={c.surface2} strokeWidth={2} />
            <text x={lowestPt.x} y={lowestPt.y + (lowestPt.y < PAD_TOP + chartH / 2 ? 16 : -10)} textAnchor="middle" fill={c.bad} style={{ font: `700 9px ${F}` }}>
              {fmt(lowestBalance)}
            </text>
          </g>
        )}

        {/* Recovery point */}
        {recoveryPt && (
          <g style={{ cursor: 'pointer' }} onClick={() => handleTap(recoveryPt, 'Recovery')}>
            <circle cx={recoveryPt.x} cy={recoveryPt.y} r={4.5} fill={c.good} stroke={c.surface2} strokeWidth={2} />
            <text x={recoveryPt.x} y={recoveryPt.y - 10} textAnchor="middle" fill={c.good} style={{ font: `600 9px ${F}` }}>Recovery</text>
          </g>
        )}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect x={tooltip.x - 40} y={tooltip.y - 30} width={80} height={22} rx={6} fill={c.ink} opacity={0.9} />
            <text x={tooltip.x} y={tooltip.y - 16} textAnchor="middle" fill={c.bg} style={{ font: `700 10px ${F}` }}>{tooltip.amount}</text>
          </g>
        )}
      </svg>
    </div>
  )
}
