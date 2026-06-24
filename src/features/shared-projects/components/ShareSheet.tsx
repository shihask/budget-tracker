import { useState } from 'react'
import { useTheme } from '@/lib/theme-context'
import { BottomSheet } from '@/components/BottomSheet'
import type { Project } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  project: Project
  onGenerateCode: () => Promise<string>
  onRevokeCode: () => Promise<void>
}

export function ShareSheet({ open, onClose, project, onGenerateCode, onRevokeCode }: Props) {
  const c = useTheme()
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [localCode, setLocalCode] = useState<string | null>(null)

  const activeCode = project.share_code || localCode
  const shareUrl = activeCode
    ? `${window.location.origin}/project/${activeCode}`
    : null

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const code = await onGenerateCode()
      setLocalCode(code)
    } catch (e) {
      console.error('Failed to generate share code', e)
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm('Revoke public access? Anyone with the link will lose access.')) return
    setRevoking(true)
    try {
      await onRevokeCode()
      setLocalCode(null)
    } catch (e) {
      console.error('Failed to revoke share code', e)
    } finally {
      setRevoking(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} showHelpButton={false}>
      <div style={{ padding: '0 4px 16px' }}>
        <div style={{ font: '800 20px Plus Jakarta Sans', color: c.ink, marginBottom: 6 }}>
          Share Project
        </div>
        <div style={{ font: '500 13px Plus Jakarta Sans', color: c.muted, marginBottom: 20, lineHeight: 1.5 }}>
          Generate a public read-only link. Anyone with the link can view the project details, contributions, expenses, and settlement.
        </div>

        {(project.is_public || localCode) && shareUrl ? (
          <>
            <div style={{
              background: c.surface2, borderRadius: 14, padding: '12px 14px',
              font: '600 13px Plus Jakarta Sans', color: c.accent,
              wordBreak: 'break-all', marginBottom: 14,
            }}>
              {shareUrl}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCopy}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14,
                  border: 'none', background: c.accent, color: '#fff',
                  font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
                }}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                style={{
                  padding: '12px 20px', borderRadius: 14,
                  border: `1.5px solid #EF4444`, background: 'transparent',
                  color: '#EF4444', font: '700 14px Plus Jakarta Sans', cursor: 'pointer',
                  opacity: revoking ? 0.6 : 1,
                }}
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </button>
            </div>

            {project.share_views > 0 && (
              <div style={{ font: '500 12px Plus Jakarta Sans', color: c.muted, marginTop: 12, textAlign: 'center' }}>
                {project.share_views} view{project.share_views !== 1 ? 's' : ''}
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 16,
              border: 'none', background: c.accent, color: '#fff',
              font: '700 16px Plus Jakarta Sans', cursor: 'pointer',
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? 'Generating…' : 'Generate Public Link'}
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
