import clsx from 'clsx'
import { BRAND } from '../brand'
import { SplitpostLogo } from '../logo/SplitpostLogo'

/**
 * The Splitpost lockup for the tour and account screens: the official logo
 * (the same file the public site uses) beside the wordmark.
 */
export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { mark: 'h-8 w-8', text: 'text-lg' },
    md: { mark: 'h-10 w-10', text: 'text-[1.4rem]' },
    lg: { mark: 'h-14 w-14', text: 'text-4xl' },
  }[size]
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <SplitpostLogo className={sizes.mark} />
      <span aria-hidden="true" className={clsx('font-sp-display font-black tracking-[-0.02em] text-sp-ink [font-stretch:108%]', sizes.text)}>
        {BRAND.wordmark}
      </span>
      <span className="sr-only">{BRAND.name}</span>
    </span>
  )
}
