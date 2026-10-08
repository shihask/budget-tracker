import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { deleteAdminUser, type AdminUserSummary } from '@/lib/adminApi'

const ERRORS: Record<string, string> = {
  confirmation_mismatch: "That doesn't match this account's email or phone.",
  cannot_delete_self: "You can't delete your own account here.",
  cannot_delete_admin: 'Remove their admin role first.',
  user_not_found: 'This account no longer exists. Refresh the list.',
}

/**
 * Admin → user detail → Danger zone. Permanent: the account, all its data
 * (every user table CASCADEs) and its uploaded files. Type-to-confirm with the
 * account's email or phone — re-checked server-side. Not offered for admins.
 * Mounted with key={user.id}, so the form resets per account.
 */
export function AdminDeleteAccount({ user, onDeleted }: { user: AdminUserSummary; onDeleted: (id: string) => void }) {
  const c = useTheme()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // admin-api's list reports a phone-only account's number in `email` (+91…).
  const identifier = user.email ?? ''
  const matches = !!identifier && confirm.trim().toLowerCase().replace(/\s+/g, '') === identifier.toLowerCase().replace(/\s+/g, '')

  if (user.isAdmin) return null

  const handleDelete = async () => {
    if (!matches) return
    setDeleting(true); setError(null)
    try {
      await deleteAdminUser(user.id, confirm.trim())
      onDeleted(user.id)
    } catch (e) {
      const code = e instanceof Error ? e.message : 'delete_failed'
      setError(ERRORS[code] ?? `Couldn't delete: ${code}`)
      setDeleting(false)
    }
  }

  return (
    <>
      <div style={{ marginTop: 22, font: '700 12px Plus Jakarta Sans', color: c.bad, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Danger zone
      </div>
      <div style={{ marginTop: 10, borderRadius: 16, padding: 14, background: c.surface, border: `1px solid ${c.bad}55` }}>
        {!open ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>Delete account</div>
              <div style={{ font: '500 11px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>Permanently removes the account, all its data and files.</div>
            </div>
            <button onClick={() => setOpen(true)} style={{
              flexShrink: 0, background: 'none', border: `1.5px solid ${c.bad}`, color: c.bad, borderRadius: 999,
              padding: '6px 14px', font: '700 12px Plus Jakarta Sans', cursor: 'pointer',
            }}>
              Delete
            </button>
          </div>
        ) : (
          <>
            <div style={{ font: '700 13px Plus Jakarta Sans', color: c.ink }}>This can't be undone.</div>
            <div style={{ font: '500 12px Plus Jakarta Sans', color: c.sub, marginTop: 6, lineHeight: 1.5 }}>
              Deletes every transaction, account, category, setting, saving, event and uploaded file. Shared
              projects this person owns are deleted for their collaborators too.
            </div>
            <div style={{ font: '600 12px Plus Jakarta Sans', color: c.ink, marginTop: 12 }}>
              Type <strong style={{ userSelect: 'all' }}>{identifier}</strong> to confirm:
            </div>
            <input value={confirm} onChange={e => { setConfirm(e.target.value); setError(null) }}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '10px 12px', borderRadius: 12,
                border: `1.5px solid ${c.faint}`, background: c.surface2, color: c.ink, font: '600 13px Plus Jakarta Sans', outline: 'none',
              }} />
            {error && <div style={{ marginTop: 8, font: '600 12px Plus Jakarta Sans', color: c.bad }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setOpen(false); setConfirm(''); setError(null) }} disabled={deleting} style={{
                flex: 1, background: c.surface2, border: 'none', borderRadius: 12, padding: '11px',
                font: '700 13px Plus Jakarta Sans', color: c.ink, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={!matches || deleting} style={{
                flex: 2, border: 'none', borderRadius: 12, padding: '11px',
                background: matches && !deleting ? c.bad : c.faint, color: matches && !deleting ? '#fff' : c.muted,
                font: '700 13px Plus Jakarta Sans', cursor: matches && !deleting ? 'pointer' : 'not-allowed',
              }}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
