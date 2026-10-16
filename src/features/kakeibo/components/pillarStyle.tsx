import { ShoppingBasket, ShoppingBag, BookOpen, Wrench, type LucideProps } from 'lucide-react'
import { PILLAR_COLOR, type Pillar } from '../lib/pillars'

const ICONS: Record<Pillar, React.ComponentType<LucideProps>> = {
  survival: ShoppingBasket,
  optional: ShoppingBag,
  culture: BookOpen,
  unexpected: Wrench,
}

export function PillarIcon({ pillar, size = 16, color }: { pillar: Pillar; size?: number; color?: string }) {
  const Icon = ICONS[pillar]
  return <Icon size={size} color={color ?? PILLAR_COLOR[pillar]} aria-hidden="true" />
}
