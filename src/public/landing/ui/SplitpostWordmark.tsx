import clsx from 'clsx'

/**
 * TEMPORARY Splitpost wordmark: "splitpost" set in Archivo beside a square cut
 * diagonally in two (the split mark). A placeholder until the logo and visual
 * identity are approved; it lives with the public site only, so the tour and
 * account screens keep their current mark until they're switched over.
 */
export function SplitMark({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-block shrink-0 rounded-[7px]',
        tone === 'dark'
          ? 'bg-[linear-gradient(135deg,#ffffff_0_50%,var(--color-sp-orange)_50%_100%)]'
          : 'bg-[linear-gradient(135deg,var(--color-sp-midnight)_0_50%,var(--color-sp-orange)_50%_100%)]',
        className,
      )}
    />
  )
}

export function SplitpostWordmark({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <SplitMark tone={tone} className="h-6 w-6" />
      <span
        aria-hidden="true"
        className={clsx(
          'font-sp-display text-[1.35rem] font-black lowercase leading-none tracking-[-0.02em] [font-stretch:108%]',
          tone === 'dark' ? 'text-white' : 'text-sp-ink',
        )}
      >
        splitpost
      </span>
      <span className="sr-only">Splitpost</span>
    </span>
  )
}
