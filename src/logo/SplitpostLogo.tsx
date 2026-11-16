import clsx from 'clsx'
import logoUrl from './splitpost-logo.svg'

/**
 * The official Splitpost logo, the split-post badge. Every placement (site
 * header and footer, section seams, product screens, the tour and account
 * screens) renders this one file, src/logo/splitpost-logo.svg, and the
 * favicon, app icons and sharing image are generated from it by
 * scripts/brand/build-icons.mjs. Please don't redraw or recolour it here.
 *
 * Decorative by default, because the wordmark or a nearby label names it;
 * pass `label` when the logo stands alone.
 */
export const SPLITPOST_LOGO_SRC: string = logoUrl

export function SplitpostLogo({ className, label }: { className?: string; label?: string }) {
  return (
    <img
      src={logoUrl}
      width={56}
      height={56}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      data-testid="splitpost-logo"
      className={clsx('inline-block aspect-square shrink-0 select-none rounded-full', className ?? 'h-9 w-9')}
    />
  )
}
