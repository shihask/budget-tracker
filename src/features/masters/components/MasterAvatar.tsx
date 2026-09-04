import { User } from 'lucide-react'
import { masterInitials, MASTER_ACCENTS } from '@/lib/masters'
import type { MasterType } from '@/types'

/** Initials on the type's soft fill. There is no photo upload in v1.60 —
 *  `masters.photo_url` exists as a column but nothing writes it, so this is the
 *  only avatar the directory has.
 *
 *  Falls back to a person glyph when the name yields no initials at all
 *  ("@@@"), rather than rendering an empty circle. */
export function MasterAvatar({ name, type, size = 40 }: {
  name: string
  type: MasterType
  size?: number
}) {
  const accent = MASTER_ACCENTS[type]
  const initials = masterInitials(name)
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        background: accent.soft, color: accent.solid,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        font: `700 ${Math.round(size * 0.36)}px Plus Jakarta Sans`,
        letterSpacing: '0.01em',
      }}
    >
      {initials || <User size={Math.round(size * 0.46)} color={accent.solid} />}
    </div>
  )
}
