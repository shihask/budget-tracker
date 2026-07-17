export interface PickedReceipt {
  blob: Blob
  originalName: string
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

let webpSupported: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpSupported === null) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpSupported
}

export async function compressImage(
  file: File,
  opts?: { maxDim?: number; quality?: number }
): Promise<PickedReceipt> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file')
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error('Photo is too large (max 10MB)')
  }

  const maxDim = opts?.maxDim ?? 1600
  const quality = opts?.quality ?? 0.72

  const objectUrl = URL.createObjectURL(file)
  let img: HTMLImageElement
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read this file as an image'))
      el.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
  // Decode failure now propagates as a real error instead of falling through.

  try {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const mimeType = canEncodeWebp() ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, quality))
    if (!blob) throw new Error('Compression failed')

    return { blob, originalName: file.name }
  } catch {
    // Decode already succeeded here, so this is a genuinely valid, displayable
    // image — safe to fall back to the uncompressed original on canvas/encode issues.
    return { blob: file, originalName: file.name }
  }
}
