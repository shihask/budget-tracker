import { Check, Lock } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'

/** What a household shares and what it never sees. Shown on the intro and on Members. */
export function PrivacyExplainer() {
  const c = useTheme()
  const row = (icon: React.ReactNode, text: string) => (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start', font: '600 13px Plus Jakarta Sans', color: c.sub, lineHeight: 1.45 }}>
      <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>{text}
    </li>
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ background: c.surface2, borderRadius: 16, padding: 14 }}>
        <div style={{ font: '800 13px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Shared with your partner</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {row(<Check size={15} color={c.accent} />, 'Only the income and expenses either of you adds to the household')}
          {row(<Check size={15} color={c.accent} />, 'Household budgets and categories')}
          {row(<Check size={15} color={c.accent} />, 'Who paid — by the name each of you chooses')}
        </ul>
      </div>
      <div style={{ background: c.surface2, borderRadius: 16, padding: 14 }}>
        <div style={{ font: '800 13px Plus Jakarta Sans', color: c.ink, marginBottom: 10 }}>Always private</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {row(<Lock size={15} color={c.muted} />, 'Your accounts, balances and cards')}
          {row(<Lock size={15} color={c.muted} />, 'Your personal transactions, budgets and salary')}
          {row(<Lock size={15} color={c.muted} />, 'Your email and phone number')}
        </ul>
        <p style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
          Household entries never change your personal balances. If you also log a shared expense in your own MoneyPlant, it's counted there separately.
        </p>
      </div>
    </div>
  )
}
