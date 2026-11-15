import clsx from 'clsx'
import { BRAND } from '../brand'

/**
 * The Splitpost mark: a rounded square cut diagonally in two, Deep Teal and
 * Growth Green (the split). Matches the public site's SplitMark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <clipPath id="sp-mark-clip">
          <rect width="64" height="64" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#sp-mark-clip)">
        <rect width="64" height="64" fill="#163d3a" />
        <path d="M64 0V64H0Z" fill="#38a88a" />
      </g>
    </svg>
  )
}

export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { mark: 'h-6 w-6', text: 'text-lg' },
    md: { mark: 'h-8 w-8', text: 'text-[1.4rem]' },
    lg: { mark: 'h-12 w-12', text: 'text-4xl' },
  }[size]
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <LogoMark className={sizes.mark} />
      <span aria-hidden="true" className={clsx('font-sp-display font-black tracking-[-0.02em] text-sp-ink [font-stretch:108%]', sizes.text)}>
        {BRAND.wordmark}
      </span>
      <span className="sr-only">{BRAND.name}</span>
    </span>
  )
}
