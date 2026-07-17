import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, Receipt as ReceiptIcon, X } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { compressImage, type PickedReceipt } from '@/lib/imageCompress'

interface ReceiptFieldProps {
  pendingReceipt: PickedReceipt | null
  existingPath: string | null
  onPick: (receipt: PickedReceipt) => void
  onRemovePending: () => void
  onRemoveExisting?: () => void
  getUrl?: (path: string) => Promise<string | null>
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReceiptField({
  pendingReceipt, existingPath, onPick, onRemovePending, onRemoveExisting, getUrl,
}: ReceiptFieldProps) {
  const c = useTheme()
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [resolvingUrl, setResolvingUrl] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingReceipt) { setLocalPreviewUrl(null); return }
    const url = URL.createObjectURL(pendingReceipt.blob)
    setLocalPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingReceipt])

  useEffect(() => {
    if (pendingReceipt || !existingPath || !getUrl) { setResolvedUrl(null); return }
    let cancelled = false
    setResolvingUrl(true)
    getUrl(existingPath).then(url => {
      if (cancelled) return
      setResolvedUrl(url)
      setResolvingUrl(false)
    })
    return () => { cancelled = true }
  }, [existingPath, pendingReceipt, getUrl])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setError(null)
      const receipt = await compressImage(file)
      onPick(receipt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach photo')
    }
  }

  const labelStyle: React.CSSProperties = {
    font: '700 12px Plus Jakarta Sans', color: c.muted, marginBottom: 6, display: 'block',
  }
  const pickButtonStyle: React.CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 12px', borderRadius: 13, border: `1.5px dashed ${c.faint}`,
    background: 'transparent', font: '600 13px Plus Jakarta Sans', color: c.muted, cursor: 'pointer',
  }

  const previewUrl = localPreviewUrl ?? resolvedUrl
  const showThumbnail = !!previewUrl
  const isPendingPick = !!pendingReceipt

  return (
    <div>
      <div style={labelStyle}>Receipt (Optional)</div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take receipt photo"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        aria-label="Choose receipt from gallery"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {!showThumbnail && !resolvingUrl && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => cameraInputRef.current?.click()} style={pickButtonStyle}>
            <Camera size={15} /> Camera
          </button>
          <button type="button" onClick={() => galleryInputRef.current?.click()} style={pickButtonStyle}>
            <ImageIcon size={15} /> Gallery
          </button>
        </div>
      )}

      {resolvingUrl && (
        <div style={{ font: '600 12px Plus Jakarta Sans', color: c.muted, padding: '10px 0' }}>
          Loading receipt…
        </div>
      )}

      {showThumbnail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.surface2, borderRadius: 14, padding: 8 }}>
          <img
            src={previewUrl}
            alt="Receipt preview"
            loading="lazy"
            onClick={() => setLightboxOpen(true)}
            style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: '700 12px Plus Jakarta Sans', color: c.ink }}>
              <ReceiptIcon size={13} color={c.accent} />
              Receipt attached{isPendingPick ? '' : ' ✓'}
            </div>
            {isPendingPick && (
              <div style={{ font: '600 10.5px Plus Jakarta Sans', color: c.muted, marginTop: 2 }}>
                {formatSize(pendingReceipt.blob.size)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              aria-label="Replace receipt"
              onClick={() => galleryInputRef.current?.click()}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: c.muted }}
            >
              <Camera size={15} />
            </button>
            <button
              type="button"
              aria-label="Remove receipt"
              onClick={() => (isPendingPick ? onRemovePending() : onRemoveExisting?.())}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#EF4444' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ font: '600 11px Plus Jakarta Sans', color: '#EF4444', marginTop: 6 }}>{error}</div>
      )}

      {lightboxOpen && previewUrl && (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute', top: 16, right: 16, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.15)',
              color: '#fff', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
          <img src={previewUrl} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
