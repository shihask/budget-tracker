const CARD_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export function colorFor(name: string): string {
  return CARD_COLORS[name.charCodeAt(0) % CARD_COLORS.length]
}
