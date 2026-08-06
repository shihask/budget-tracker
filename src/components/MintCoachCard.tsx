import { useTheme } from '@/lib/theme-context'
import { AnimatedText } from './AnimatedText'

interface Props {
  text: string
  fresh: boolean   // just generated this load — plays the reveal. Cache hits render instantly.
  onContinueConversation: () => void
}

// Renders above (never instead of) MintSuggestionCard — Coach narrates the day
// (emotional/contextual), the suggestion card names one concrete action. Different jobs.
export function MintCoachCard({ text, fresh, onContinueConversation }: Props) {
  const c = useTheme()

  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    padding: 16,
    background: c.surface,
    border: `1px solid ${c.faint}`,
    boxShadow: c.cardShadow,
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🌱</span>
        <span style={{ font: '700 14px Plus Jakarta Sans', color: c.ink }}>Mint Coach</span>
      </div>

      <p style={{ font: '500 13px Plus Jakarta Sans', color: c.sub, margin: 0, lineHeight: 1.6 }}>
        {fresh ? <AnimatedText text={text} /> : text}
      </p>

      <button
        onClick={onContinueConversation}
        style={{
          marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          font: '700 12px Plus Jakarta Sans', color: c.accent,
        }}
      >
        Continue Conversation →
      </button>
    </div>
  )
}
