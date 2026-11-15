import clsx from 'clsx'
import { PHOTOS, type PhotoKey } from '../photos'

/** A stock photograph from photos.ts, with its real size so the layout never jumps. */
export function Photo({ id, className, eager }: { id: PhotoKey; className?: string; eager?: boolean }) {
  const p = PHOTOS[id]
  return (
    <img
      data-photo={p.id}
      src={p.src}
      width={p.width}
      height={p.height}
      alt={p.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={clsx('block', className)}
    />
  )
}
