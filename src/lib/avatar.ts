// Profile picture handling. Pictures stay in this browser only: they are
// cropped to a square, shrunk, and stored as a small JPEG data URL.

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const MAX_AVATAR_FILE_BYTES = 8 * 1024 * 1024
export const AVATAR_SIZE = 256
/** Safety cap on the stored data URL (about 150 KB). */
export const MAX_AVATAR_DATA_URL_CHARS = 200_000

export type AvatarError = 'type' | 'size' | 'empty' | 'decode' | 'tooLarge' | 'storage'

export const AVATAR_ERROR_TEXT: Record<AvatarError, string> = {
  type: 'That file type is not supported. Please choose a JPEG, PNG, WebP, or GIF image.',
  size: 'That image is larger than 8 MB. Please choose a smaller one.',
  empty: 'That file is empty. Please choose another image.',
  decode: 'That image could not be opened. It may be damaged or in an unsupported format.',
  tooLarge: 'That image is still too large after resizing. Please try a simpler picture.',
  storage: 'Your browser storage is full, so the picture could not be saved. Try removing other uploaded images, then try again.',
}

/** Checks that can run before reading the file. */
export function validateAvatarFile(file: { type: string; size: number }): AvatarError | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size === 0) return 'empty'
  if (file.size > MAX_AVATAR_FILE_BYTES) return 'size'
  return null
}

/** Centre crop that fits the largest square inside an image. */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height)
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side }
}

export class AvatarProcessingError extends Error {
  constructor(public code: AvatarError) {
    super(AVATAR_ERROR_TEXT[code])
  }
}

/** Validate, decode, crop and shrink a picture. Resolves to a JPEG data URL. */
export async function processAvatar(file: File): Promise<string> {
  const problem = validateAvatarFile(file)
  if (problem) throw new AvatarProcessingError(problem)

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new AvatarProcessingError('decode'))
      el.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw new AvatarProcessingError('decode')
    const { sx, sy, side } = squareCrop(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AvatarProcessingError('decode')
    ctx.fillStyle = '#ffffff' // transparent PNGs get a white background instead of black
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    let data = canvas.toDataURL('image/jpeg', 0.85)
    if (data.length > MAX_AVATAR_DATA_URL_CHARS) data = canvas.toDataURL('image/jpeg', 0.6)
    if (data.length > MAX_AVATAR_DATA_URL_CHARS) throw new AvatarProcessingError('tooLarge')
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}
