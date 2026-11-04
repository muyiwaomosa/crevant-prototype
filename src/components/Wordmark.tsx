import clsx from 'clsx'

/**
 * Crevant mark: an open "C" (the creator) with a spark held inside it (the fan).
 * The gap in the C faces the spark, a nod to a direct line between the two.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--color-brand-600)" />
      <path d="M44 20.5A16 16 0 1 0 44 43.5" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      <circle cx="45" cy="32" r="5.5" fill="var(--color-spark-400)" />
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
      <span aria-hidden="true" className={clsx('font-display font-extrabold tracking-[-0.03em] text-ink-900', sizes.text)}>
        crevant
      </span>
      <span className="sr-only">Crevant</span>
    </span>
  )
}
