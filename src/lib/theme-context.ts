import { createContext, useContext } from 'react'
import type { ColorTokens } from '@/lib/tokens'

export const ThemeContext = createContext<ColorTokens | null>(null)

export function useTheme(): ColorTokens {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeContext.Provider')
  return ctx
}
