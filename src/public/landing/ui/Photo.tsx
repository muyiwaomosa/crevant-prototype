import clsx from 'clsx'
import { PHOTOS, type PhotoKey } from '../photos'

/**
 * A licensed stock photograph from photos.ts, served at the size the layout
 * needs (srcset) and cropped to its slot, so the layout never jumps.
 */
export function Photo({ id, sizes, className, eager, decorative }: { id: PhotoKey; sizes: string; className?: string; eager?: boolean; decorative?: boolean }) {
  const p = PHOTOS[id]
  const [w, h] = p.ratio.split('/').map(Number)
  const largest = p.widths[p.widths.length - 1]
  return (
    <img
      data-photo={p.id}
      src={`${p.base}-${largest}.webp`}
      srcSet={p.widths.map((x) => `${p.base}-${x}.webp ${x}w`).join(', ')}
      sizes={sizes}
      width={largest}
      height={Math.round((largest * h) / w)}
      alt={decorative ? '' : p.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={clsx('block h-auto w-full object-cover', className)}
    />
  )
}
