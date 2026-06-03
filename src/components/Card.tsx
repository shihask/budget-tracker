import { useTheme } from '@/lib/theme-context'

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  pad?: number
}

export function Card({ children, style = {}, pad = 16 }: CardProps) {
  const c = useTheme()
  return (
    <div style={{
      background: c.surface,
      borderRadius: 22,
      padding: pad,
      boxShadow: c.cardShadow,
      border: `1px solid ${c.faint}`,
      ...style,
    }}>
      {children}
    </div>
  )
}
