import { Gem, House, Plane, GraduationCap, Baby, PartyPopper, Hospital, Car } from 'lucide-react'

/** Life-event icons. Stored as a stable key string on `events.icon`, not as an
 *  emoji — same convention as JourneyMilestone.emoji / AnalyticsPage's ICON_MAP,
 *  so the glyph is ours to control rather than the platform's font. */
export const EVENT_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  ring: Gem,
  house: House,
  plane: Plane,
  graduation: GraduationCap,
  baby: Baby,
  party: PartyPopper,
  hospital: Hospital,
  car: Car,
}

export const EVENT_ICON_KEYS = Object.keys(EVENT_ICONS)
export const DEFAULT_EVENT_ICON = 'ring'

/** Renders an event's icon, falling back to the default so a row written before
 *  a key was retired still shows something. */
export function EventIcon({ name, size = 16, color }: { name?: string | null; size?: number; color?: string }) {
  const Icon = EVENT_ICONS[name ?? ''] ?? EVENT_ICONS[DEFAULT_EVENT_ICON]
  return <Icon size={size} color={color} />
}
