import { Gem, House, Plane, GraduationCap, Baby, PartyPopper, Hospital, Car } from 'lucide-react'

/** Life-event icons. Stored as a stable key string on `events.icon`, not as an
 *  emoji — same convention as JourneyMilestone.emoji / AnalyticsPage's ICON_MAP,
 *  so the glyph is ours to control rather than the platform's font. */
export const EVENT_ICONS = {
  ring: Gem,
  house: House,
  plane: Plane,
  graduation: GraduationCap,
  baby: Baby,
  party: PartyPopper,
  hospital: Hospital,
  car: Car,
} satisfies Record<string, React.ComponentType<{ size?: number; color?: string }>>

export type EventIconKey = keyof typeof EVENT_ICONS

export const EVENT_ICON_KEYS = Object.keys(EVENT_ICONS) as EventIconKey[]
export const DEFAULT_EVENT_ICON: EventIconKey = 'ring'

/** `events.icon` is free text in the database and AI output is untrusted, so
 *  anything that did not come from this file is checked before it is used. */
export const isEventIconKey = (key: unknown): key is EventIconKey =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(EVENT_ICONS, key)

/** Renders an event's icon, falling back to the default so a row written before
 *  a key was retired still shows something. */
export function EventIcon({ name, size = 16, color }: { name?: string | null; size?: number; color?: string }) {
  const Icon = isEventIconKey(name) ? EVENT_ICONS[name] : EVENT_ICONS[DEFAULT_EVENT_ICON]
  return <Icon size={size} color={color} />
}
