import clsx from 'clsx'

/**
 * Pieces of the sample posts, shared by the hero illustration and the
 * product illustrations. Everything here is sample data and says so where it
 * appears; the drawings are hidden from screen readers because the text
 * around them carries the meaning.
 */

type Tone = 'priya' | 'ana' | 'leo' | 'friend' | 'neutral'

export function Avatar({ initials, tone, className }: { initials: string; tone: Tone; className?: string }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-sp-display font-black',
        tone === 'priya' && 'bg-sp-secondary text-sp-ink',
        tone === 'ana' && 'bg-sp-accent text-sp-ink',
        tone === 'leo' && 'bg-sp-primary-raised text-sp-bg',
        tone === 'friend' && 'bg-[#e6dfd0] text-sp-ink ring-2 ring-white',
        tone === 'neutral' && 'bg-[#e8e6e1] text-[#2b2f33]',
        className ?? 'h-8 w-8 text-[11px]',
      )}
    >
      {initials}
    </span>
  )
}

export function SampleTag({ dark }: { dark?: boolean }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]', dark ? 'bg-white/12 text-white/80' : 'bg-sp-bg text-sp-muted')}>
      Sample data
    </span>
  )
}
