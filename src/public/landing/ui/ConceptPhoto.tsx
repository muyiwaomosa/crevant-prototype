import clsx from 'clsx'
import { PHOTOS, type PhotoId } from '../photos'

/**
 * An AI-generated concept photograph, always with its disclosure label on the
 * image itself (so it can't be cropped away from the picture it describes).
 */
export function ConceptPhoto({ id, sizes, className }: { id: PhotoId; sizes: string; className?: string }) {
  const p = PHOTOS[id]
  return (
    <figure data-photo={p.id} data-origin={p.origin} className={clsx('relative m-0 overflow-hidden rounded-[28px] bg-sp-midnight', className)}>
      <img
        src={p.sources[p.sources.length - 1].src}
        srcSet={p.sources.map((s) => `${s.src} ${s.width}w`).join(', ')}
        sizes={sizes}
        width={p.width}
        height={p.height}
        alt={p.alt}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-cover"
      />
      <figcaption
        data-testid="ai-photo-label"
        className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-full bg-sp-midnight/90 px-3 py-1.5 text-[11px] font-semibold leading-tight text-white sm:left-4 sm:top-4"
      >
        {p.label}
      </figcaption>
    </figure>
  )
}
