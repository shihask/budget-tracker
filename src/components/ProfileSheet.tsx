import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from './BottomSheet'
import { SignInMethodsSection } from './SignInMethodsSection'

/**
 * Opened from the pencil next to the name in the header's profile menu:
 * edit the display name (user_metadata.full_name) and add the missing sign-in
 * method (email or mobile). Saving fires USER_UPDATED; App re-sets the session,
 * so the header name and these rows refresh on their own.
 */
export function ProfileSheet({ open, user, onClose }: { open: boolean; user: User; onClose: () => void }) {
  const c = useTheme()
  const currentName = (user.user_metadata?.full_name as string | undefined) ?? ''
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const dirty = !!trimmed && trimmed !== currentName

  const saveName = async () => {
    if (!dirty) return
    setSaving(true); setError(null); setSaved(false)
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    if (error) setError(error.message)
    else setSaved(true)
    setSaving(false)
  }

  const sectionLabel: React.CSSProperties = {
    font: '700 11px Plus Jakarta Sans', color: c.muted,
    letterSpacing: '0.06em', textTransform: 'uppercase', padding: '14px 0 6px',
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '12px 0', borderBottom: `1px solid ${c.faint}`,
  }
  const labelStyle: React.CSSProperties = { font: '600 13px Plus Jakarta Sans', color: c.ink }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 18px Plus Jakarta Sans', color: c.ink, marginBottom: 4 }}>Profile</div>

        <div style={sectionLabel}>Your name</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={e => { setName(e.target.value); setSaved(false); setError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') saveName() }}
            placeholder="e.g. Rahul Menon" autoComplete="name"
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box', background: c.surface2, border: `1.5px solid ${c.faint}`,
              borderRadius: 12, padding: '11px 14px', font: '600 15px Plus Jakarta Sans', color: c.ink, outline: 'none',
            }} />
          <button onClick={saveName} disabled={!dirty || saving} style={{
            flexShrink: 0, border: 'none', borderRadius: 12, padding: '0 18px',
            background: dirty && !saving ? c.accent : c.faint, color: dirty && !saving ? '#fff' : c.muted,
            font: '700 13px Plus Jakarta Sans', cursor: dirty && !saving ? 'pointer' : 'default',
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {(saved || error) && (
          <div style={{ font: '600 11px Plus Jakarta Sans', color: error ? '#EF4444' : c.good, padding: '6px 0 0' }}>
            {error ?? 'Name updated'}
          </div>
        )}

        <div style={sectionLabel}>Sign-in methods</div>
        <SignInMethodsSection user={user} rowStyle={rowStyle} labelStyle={labelStyle} />
      </div>
    </BottomSheet>
  )
}
