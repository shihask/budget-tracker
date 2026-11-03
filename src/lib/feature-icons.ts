import {
  Banknote, CalendarClock, CalendarHeart, ChartColumn, ChartPie, CreditCard, FolderOpen, HandCoins,
  House, Layers, LayoutDashboard, Leaf, NotebookPen, PiggyBank, Plus, Receipt, Settings, ShoppingCart,
  Sprout, Tag, Target, TrendingUp, Users, Wallet,
  BookOpen, Gift, Heart, Plane, ShoppingBag, ShoppingBasket, Star, Utensils, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'
import type { DashboardSectionId } from '@/types'

/** The one icon per feature, used everywhere that feature is named: its dashboard
 *  card badge and empty state, the Navigation and Create menus, the dashboard
 *  quick nav, its page, and its onboarding card. Pick from here instead of drawing
 *  an SVG or importing a lucide icon directly, so a feature never wears two faces.
 *
 *  Icons that describe *contents* (an account type, a savings kind, an event kind) are
 *  a separate thing and stay with their own components. */
export type FeatureKey =
  | DashboardSectionId
  | 'transactions' | 'household' | 'grow' | 'plant' | 'masters' | 'categories' | 'settings' | 'create'

export const FEATURE_ICONS: Record<FeatureKey, LucideIcon> = {
  // Places in the Navigation menu
  transactions:    Receipt,
  analytics:       ChartColumn,
  cashflow:        TrendingUp,
  commitments:     CalendarClock,
  savings:         PiggyBank,
  borrowing:       HandCoins,
  credit_cards:    CreditCard,
  events:          CalendarHeart,
  projects:        FolderOpen,
  household:       House,
  grow:            Sprout,
  plant:           Leaf,
  masters:         Users,
  categories:      Tag,
  settings:        Settings,
  create:          Plus,
  // Dashboard sections
  hero:            LayoutDashboard,
  kakeibo:         NotebookPen,
  wealth_summary:  Layers,
  budget_strategy: ChartPie,
  affordability:   ShoppingCart,
  daily_challenge: Sprout,      // the Grow feature's dashboard card
  metrics:         Banknote,
  goals:           Target,
  accounts:        Wallet,
  recent_txns:     Receipt,     // = transactions
}

/** A custom dashboard section (a user-named category-group card) has no fixed
 *  feature, so its icon and badge colour come from its name. Shared by the card
 *  and the dashboard quick nav. Savings / loan names reuse those features' icons. */
export function customSectionIcon(name: string): { color: string; Icon: LucideIcon } {
  const n = name.toLowerCase()
  const rules: [RegExp, string, LucideIcon][] = [
    [/renov|repair|build|construct|kitchen|bath|plumb|electri|paint|floor|wall|roof|carpent|mason|home|house|interior|furnit/, '#F97316', Wrench],
    [/food|eat|restaur|cafe|hotel|dhaba|mess|canteen|dine|lunch|dinner|breakfast|tea|coffee|snack|bakery/, '#EF4444', Utensils],
    [/travel|trip|tour|vacat|holiday|flight|train|bus|cab|taxi|transport|petrol|diesel/, '#3B82F6', Plane],
    [/medic|health|hospital|doctor|medicine|pharmac|clinic|dental|eye|optom|treatment/, '#EC4899', Heart],
    [/shop|market|mall|fashion|cloth|wear|apparel|boutique/, '#8B5CF6', ShoppingBag],
    [/edu|school|college|universi|course|book|tuition|learn|class|study|coaching/, '#06B6D4', BookOpen],
    [/entertain|movie|cinema|theatre|game|sport|gym|fitness|yoga|fun|hobby|subscri|ott|netflix|streaming/, '#F59E0B', Star],
    [/util|electric|water|gas|internet|phone|mobile|bill|recharge|postpaid|prepaid|broadband/, '#10B981', Zap],
    [/famil|kid|child|baby|parent|mom|dad|wife|husband|son|daughter/, '#F43F5E', Users],
    [/wed|marriag|annivers|birthday|celebrat|party|festival|puja|event|function|gift/, '#F59E0B', Gift],
    [/invest|mutual|sip|fd|deposit|stock|share|dividend|gold|saving/, '#10B981', FEATURE_ICONS.savings],
    [/loan|emi|debt|credit|mortgage/, '#EF4444', FEATURE_ICONS.credit_cards],
    [/grocer|vegetab|fruit|supermarket|provision|dairy|kirana/, '#14B8A6', ShoppingBasket],
  ]
  const hit = rules.find(([re]) => re.test(n))
  return hit ? { color: hit[1], Icon: hit[2] } : { color: '#6366F1', Icon: FEATURE_ICONS.categories }
}
