import { useEffect } from 'react'
import { useTheme } from '@/lib/theme-context'
import type { AchievementDefinition } from '@/lib/achievement-definitions'

interface Props {
  achievement: AchievementDefinition
  onDismiss: () => void
}

// Passive notice, not a modal — nothing to claim/collect. Reuses the transient-toast
// visual language already established by UpdateToast.tsx, auto-dismisses like `flash`.
export function AchievementUnlockToast({ achievement, onDismiss }: Props) {
  const c = useTheme()

  useEffect(() => {
    const t = setTimeout(onDismiss, 3200)
    return () => clearTimeout(t)
  }, [achievement.id, onDismiss])

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 32px)',
        maxWidth: 340,
        background: c.ink,
        borderRadius: 16,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1) both',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🏆</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '700 11px Plus Jakarta Sans', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Achievement Unlocked
        </div>
        <div style={{ font: '700 14px Plus Jakarta Sans', color: '#fff', marginTop: 1 }}>
          {achievement.title}
        </div>
      </div>
    </div>
  )
}
