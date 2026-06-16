// Mirrors app.jsx makeColors() and shade() exactly

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt)
  r = Math.round((f - r) * p) + r
  g = Math.round((f - g) * p) + g
  b = Math.round((f - b) * p) + b
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

export interface ColorTokens {
  bg: string
  surface: string
  surface2: string
  ink: string
  sub: string
  muted: string
  faint: string
  grid: string
  accent: string
  accentSoft: string
  good: string
  goodSoft: string
  warn: string
  warnSoft: string
  bad: string
  badSoft: string
  barDim: string
  cardShadow: string
  heroA: string
  heroB: string
  heroShadow: string
}

export function makeColors(accent: string, dark: boolean): ColorTokens {
  if (dark) return {
    bg: '#15120E', surface: '#211C16', surface2: '#2B251D',
    ink: '#F4EFE8', sub: '#CDC4B8', muted: '#8E857A',
    faint: 'rgba(255,255,255,0.09)', grid: 'rgba(255,255,255,0.11)',
    accent, accentSoft: accent + '2A',
    good: '#34D399', goodSoft: '#34D39922',
    warn: '#FBBF24', warnSoft: '#FBBF2422',
    bad: '#F87171', badSoft: '#F8717122',
    barDim: 'rgba(255,255,255,0.15)',
    cardShadow: '0 1px 2px rgba(0,0,0,0.35)',
    heroA: shade(accent, -0.22), heroB: accent,
    heroShadow: `0 14px 30px ${accent}45`,
  }
  return {
    bg: '#FBF8F4', surface: '#FFFFFF', surface2: '#F4EFE8',
    ink: '#241F1B', sub: '#5C554E', muted: '#9C938A',
    faint: 'rgba(40,28,16,0.08)', grid: 'rgba(40,28,16,0.10)',
    accent, accentSoft: accent + '1F',
    good: '#10B981', goodSoft: '#10B9811F',
    warn: '#F59E0B', warnSoft: '#F59E0B1F',
    bad: '#EF4444', badSoft: '#EF44441F',
    barDim: '#E7E0D5',
    cardShadow: '0 1px 2px rgba(40,28,16,0.04), 0 7px 20px rgba(40,28,16,0.05)',
    heroA: shade(accent, -0.28), heroB: accent,
    heroShadow: `0 14px 30px ${accent}3D`,
  }
}

export type ToneKey = 'ink' | 'accent' | 'good' | 'warn' | 'bad' | 'sub'

export function toneColor(c: ColorTokens, tone: ToneKey): string {
  const m: Record<string,string> = { ink: c.ink, accent: c.accent, good: c.good, warn: c.warn, bad: c.bad, sub: c.sub }; return m[tone] || c.ink
}

export function toneSoft(c: ColorTokens, tone: ToneKey): string {
  const m2: Record<string,string> = { ink: c.faint, accent: c.accentSoft, good: c.goodSoft, warn: c.warnSoft, bad: c.badSoft }; return m2[tone] || c.faint
}

// Category colors from data.js
export const CAT_COLORS: Record<string, string> = {
  'Food': '#F59E0B',
  'Tea & Snacks': '#FBBF24',
  'Groceries': '#10B981',
  'Fuel': '#0EA5E9',
  'Shopping': '#7C3AED',
  'Medical': '#EF4444',
  'Utilities': '#14B8A6',
  'Kitchen': '#F97316',
  'Granite': '#64748B',
  'Electrical': '#EAB308',
  'Plumbing': '#06B6D4',
  'Family': '#EC4899',
}

// Account palette — assigned by index, not name
export const ACCOUNT_PALETTE = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#8B5CF6', // violet
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#F97316', // orange
  '#EC4899', // pink
  '#6366F1', // indigo
]

export const ACCENT_OPTIONS = ['#10B981', '#0EA5E9', '#6366F1', '#F59E0B', '#EC4899']
