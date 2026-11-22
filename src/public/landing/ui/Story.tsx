import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { SplitpostLogo } from '../../../logo/SplitpostLogo'

/**
 * Shared pieces that keep the seven sections reading as one story: the
 * eyebrow, the Splitpost badge on each "seam" where one section hands over to
 * the next, and the pilot disclosure note.
 */

export function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p
      className={clsx(
        'font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em]',
        tone === 'dark' ? 'text-sp-secondary-on-dark' : 'text-sp-link',
      )}
    >
      {children}
    </p>
  )
}

/** The Splitpost badge on the boundary between two sections, so the seven sections read as one story. */
export function Seam() {
  return (
    <div aria-hidden="true" data-testid="seam" className="pointer-events-none relative z-20 -my-7 flex justify-center">
      <SplitpostLogo className="h-14 w-14 shadow-[0_10px_24px_-10px_rgb(0_0_0/0.55)]" />
    </div>
  )
}

/**
 * A pilot disclosure: the founder's approved wording, visually secondary but
 * real text (readable by screen readers, AA contrast on its background).
 */
export function Disclosure({ children, tone = 'light', testId, className }: { children: ReactNode; tone?: 'light' | 'dark'; testId?: string; className?: string }) {
  return (
    <p
      data-testid={testId}
      className={clsx(
        'flex gap-2 text-[13px] leading-relaxed sm:text-sm',
        tone === 'dark' ? 'text-sp-muted-on-dark' : 'text-sp-muted',
        className,
      )}
    >
      <Info aria-hidden="true" className={clsx('mt-[3px] h-3.5 w-3.5 shrink-0', tone === 'dark' ? 'text-sp-secondary-on-dark' : 'text-sp-primary')} />
      <span>{children}</span>
    </p>
  )
}
