import { useTheme } from '@/lib/theme-context'
import { fmt } from '@/lib/utils'
import { ACC_COLORS } from '@/lib/tokens'
import { Card } from './Card'
import { Glyph } from './Glyph'
import type { AppState } from '@/types'
import type { GlyphName } from './Glyph'

const TYPE_ICON: Record<string, GlyphName> = {
  bank: 'shield', cash: 'wallet', credit_card: 'doc',
}
const TYPE_LABEL: Record<string, string> = {
  bank: 'Bank account', cash: 'Cash in hand', credit_card: 'Credit card',
}

interface AccountsSectionProps { state: AppState }

export function AccountsSection({ state }: AccountsSectionProps) {
  const c = useTheme()
  const accs = state.accounts.filter(a => a.is_active)
  const total = accs.reduce((s, a) => s + a.current_balance, 0) || 1

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ font: '700 16px Plus Jakarta Sans', color: c.ink }}>Accounts</div>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{fmt(total)}</div>
      </div>

      {/* distribution bar */}
      <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
        {accs.map(a => {
          const color = ACC_COLORS[a.name] || c.accent
          return (
            <div
              key={a.id}
              style={{ width: (a.current_balance / total) * 100 + '%', background: color }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {accs.map(a => {
          const color = ACC_COLORS[a.name] || c.accent
          const share = Math.round((a.current_balance / total) * 100)
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: color + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Glyph name={TYPE_ICON[a.type] || 'wallet'} color={color} size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>{a.name}</div>
                <div style={{ font: '600 11.5px Plus Jakarta Sans', color: c.muted }}>
                  {TYPE_LABEL[a.type]} · {share}%
                </div>
              </div>
              <div style={{ font: '800 15px Plus Jakarta Sans', color: c.ink }}>
                {fmt(a.current_balance, { decimals: a.current_balance % 1 ? 2 : 0 })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
