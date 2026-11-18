import clsx from 'clsx'
import { SplitpostLogo } from '../../../logo/SplitpostLogo'

/**
 * The Splitpost lockup for the public site: the official logo (one shared
 * file, see src/logo/SplitpostLogo.tsx) beside "splitpost" set in Archivo.
 * `dark` sits on cobalt, `light` on ivory or white.
 */
export function SplitpostWordmark({
  tone = 'dark',
  className,
  compactBelow360 = false,
}: {
  tone?: 'dark' | 'light'
  className?: string
  /** Show only the logo mark below 360px wide (the header, beside Sign In and the waitlist button). */
  compactBelow360?: boolean
}) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <SplitpostLogo className="h-9 w-9" />
      <span
        aria-hidden="true"
        className={clsx(
          'font-sp-display text-[1.35rem] font-black lowercase leading-none tracking-[-0.02em] [font-stretch:108%]',
          tone === 'dark' ? 'text-sp-bg' : 'text-sp-ink',
          compactBelow360 && 'max-[359px]:hidden',
        )}
      >
        splitpost
      </span>
      <span className="sr-only">Splitpost</span>
    </span>
  )
}
