import { AppApiError } from './api'

/**
 * Preparing a photo in the browser (Build 5.3): resize only. The browser
 * applies the camera's rotation when it decodes the photo (iPhone HEIC
 * included, in Safari); the result is a JPEG of at most 1600 px, which the
 * post-media Edge Function then checks, decodes and re-encodes.
 */

export const PHOTO_EDGE = 1600
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024

/** The size to draw a photo at: at most 1600 px on its longest edge, never upscaled. */
export function fitWithin(width: number, height: number, edge = PHOTO_EDGE): { width: number; height: number } {
  const s = Math.min(1, edge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new AppApiError('photo_not_usable'))
    }
    img.src = url
  })
}

/** Reads the chosen file (browsers apply the camera's rotation) and returns a JPEG of at most 1600 px. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; preview: string; width: number; height: number }> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new AppApiError('photo_type')
  if (file.size > MAX_ORIGINAL_BYTES) throw new AppApiError('photo_original_too_large')
  const img = await loadImage(file)
  try {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight)
    if (Math.min(width, height) < 64) throw new AppApiError('photo_not_usable')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AppApiError('photo_not_usable')
    ctx.fillStyle = '#ffffff' // transparent photos get white, not black
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b && b.type === 'image/jpeg' ? resolve(b) : reject(new AppApiError('photo_not_usable'))), 'image/jpeg', 0.9),
    )
    if (blob.size > 1_500_000) throw new AppApiError('photo_not_usable')
    return { blob, preview: URL.createObjectURL(blob), width, height }
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

