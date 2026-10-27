import {
  ShoppingCart, Utensils, House, Zap, Droplet, Wifi, Flame, Package, Repeat, Fuel, HeartPulse, Baby,
  GraduationCap, PawPrint, ShoppingBag, Film, Gift, Tag, HandCoins, Wallet, Coins,
} from 'lucide-react'

/** Household category icons. household_categories.icon stores one of these keys
 *  (seeded by mp_household_create), never a glyph — same convention as EVENT_ICONS. */
const HOUSEHOLD_ICONS = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  home: House,
  zap: Zap,
  droplet: Droplet,
  wifi: Wifi,
  flame: Flame,
  package: Package,
  repeat: Repeat,
  fuel: Fuel,
  'heart-pulse': HeartPulse,
  baby: Baby,
  'graduation-cap': GraduationCap,
  'paw-print': PawPrint,
  'shopping-bag': ShoppingBag,
  film: Film,
  gift: Gift,
  tag: Tag,
  'hand-coins': HandCoins,
  wallet: Wallet,
  coins: Coins,
} satisfies Record<string, React.ComponentType<{ size?: number; color?: string }>>

type HouseholdIconKey = keyof typeof HOUSEHOLD_ICONS

const isHouseholdIconKey = (key: unknown): key is HouseholdIconKey =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(HOUSEHOLD_ICONS, key)

/** Renders a category icon; an unknown key (a newer/older row) falls back to the tag. */
export function HouseholdIcon({ name, size = 16, color }: { name?: string | null; size?: number; color?: string }) {
  const Icon = isHouseholdIconKey(name) ? HOUSEHOLD_ICONS[name] : Tag
  return <Icon size={size} color={color} />
}
