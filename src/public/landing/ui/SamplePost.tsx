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

/**
 * The graphic inside Priya's post: her followers as a field of dots, with only
 * a few lit, beside the two numbers from her post. Illustrative numbers from a
 * sample post, never Splitpost data.
 */
export function ReachArt({ followers, followersLabel, seen, seenLabel, className }: { followers: string; followersLabel: string; seen: string; seenLabel: string; className?: string }) {
  const lit = new Set([3, 14, 20])
  return (
    <div aria-hidden="true" className={clsx('flex items-center gap-3 overflow-hidden rounded-xl bg-sp-primary p-3 text-sp-bg sm:gap-4 sm:p-3.5', className)}>
      <div className="grid shrink-0 grid-cols-6 gap-[3px] min-[400px]:grid-cols-8 sm:gap-1">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className={clsx('h-[7px] w-[7px] rounded-full sm:h-2 sm:w-2', lit.has(i) ? 'bg-sp-accent' : 'bg-sp-bg/25', i >= 24 && 'max-[399px]:hidden')} />
        ))}
      </div>
      <div className="grid min-w-0 gap-2 leading-none min-[400px]:gap-1.5">
        <p className="flex flex-col gap-0.5 min-[400px]:flex-row min-[400px]:items-baseline min-[400px]:gap-1.5">
          <span className="whitespace-nowrap font-sp-display text-[1.3rem] font-black tracking-[-0.01em] sm:text-2xl">{followers}</span>
          <span className="whitespace-nowrap text-[11px] font-semibold text-sp-muted-on-dark sm:text-xs">{followersLabel}</span>
        </p>
        <p className="flex flex-col gap-0.5 min-[400px]:flex-row min-[400px]:items-baseline min-[400px]:gap-1.5">
          <span className="whitespace-nowrap font-sp-display text-[1.05rem] font-black text-sp-accent sm:text-lg">{seen}</span>
          <span className="whitespace-nowrap text-[11px] font-semibold text-sp-muted-on-dark sm:text-xs">{seenLabel}</span>
        </p>
      </div>
    </div>
  )
}

export function SampleTag({ dark }: { dark?: boolean }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]', dark ? 'bg-white/12 text-white/80' : 'bg-sp-bg text-sp-muted')}>
      Sample data
    </span>
  )
}
