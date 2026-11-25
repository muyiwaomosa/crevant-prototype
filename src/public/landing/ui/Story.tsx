import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { SplitpostLogo } from '../../../logo/SplitpostLogo'
import { HOMEPAGE_COPY } from '../copy'

/**
 * Shared pieces that keep the sections reading as one story: the
 * eyebrow, the Splitpost logo on each "seam" where one section hands over to
 * the next, and the photo placeholder
 * used until the founder approves the photography shortlist.
 */

export function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p
      className={clsx('font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em]', tone === 'dark' ? 'text-sp-secondary-on-dark' : 'text-sp-link')}
    >
      {children}
    </p>
  )
}

/** The Splitpost logo sitting on the boundary between two sections, so the sections read as one story. */
export function Seam() {
  return (
    <div aria-hidden="true" data-testid="seam" className="pointer-events-none relative z-20 -my-7 flex justify-center">
      <SplitpostLogo className="h-14 w-14 shadow-[0_10px_24px_-10px_rgb(0_0_0/0.55)]" />
    </div>
  )
}

/** A reserved photo: shown until the founder approves the licensed shortlist. Says what will go here. */
export function PhotoSlot({ shot, className }: { shot: string; className?: string }) {
  return (
    <figure
      data-testid="photo-slot"
      className={clsx(
        'relative m-0 grid place-items-center overflow-hidden rounded-[24px] border-2 border-dashed border-sp-ink/20 bg-[repeating-linear-gradient(135deg,rgb(18_48_45/0.03)_0_12px,transparent_12px_24px)] p-6 text-center',
        className,
      )}
    >
      <div className="max-w-[18rem]">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-sp-muted ring-1 ring-sp-ink/10">
          <Camera aria-hidden="true" className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-sp-muted">{HOMEPAGE_COPY.photoPending}</p>
        <figcaption className="mt-1.5 text-sm leading-snug text-sp-muted">{shot}</figcaption>
      </div>
    </figure>
  )
}
