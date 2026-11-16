import clsx from 'clsx'
import { useId } from 'react'

/**
 * Pieces of Priya's sample post, shared by the hero illustration and the
 * concept phone screens. Everything here is sample data and says so where it
 * appears; the drawings are hidden from screen readers because the text
 * around them carries the meaning.
 */

type Tone = 'priya' | 'ana' | 'leo' | 'friend' | 'neutral'

export function Avatar({ initials, tone, className }: { initials: string; tone: Tone; className?: string }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-sp-display font-black',
        tone === 'priya' && 'bg-sp-green text-sp-ink',
        tone === 'ana' && 'bg-sp-gold text-sp-ink',
        tone === 'leo' && 'bg-sp-teal-raised text-sp-cream',
        tone === 'friend' && 'bg-[#e6dfd0] text-sp-ink ring-2 ring-white',
        tone === 'neutral' && 'bg-[#e8e6e1] text-[#2b2f33]',
        className ?? 'h-8 w-8 text-[11px]',
      )}
    >
      {initials}
    </span>
  )
}

/** The image in Priya's post, drawn: a 60-second calf drill in three steps, over a running track. */
export function PostArt({ className }: { className?: string }) {
  const track = useId()
  const steps = ['Heel raises', 'Toe walks', 'Ankle circles']
  return (
    <svg viewBox="0 0 360 112" aria-hidden="true" preserveAspectRatio="xMidYMid slice" className={clsx('block w-full rounded-xl', className)}>
      <defs>
        <linearGradient id={track} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-sp-teal-raised)" />
          <stop offset="1" stopColor="var(--color-sp-teal)" />
        </linearGradient>
      </defs>
      <rect width="360" height="112" fill={`url(#${track})`} />
      <path d="M-20 120 C80 92 170 82 380 78" fill="none" stroke="var(--color-sp-green)" strokeOpacity="0.5" strokeWidth="2" />
      <path d="M-20 104 C90 80 180 70 380 66" fill="none" stroke="var(--color-sp-green)" strokeOpacity="0.3" strokeWidth="2" />
      <text x="26" y="30" fontFamily="Archivo, sans-serif" fontWeight="900" fontSize="14" letterSpacing="1.2" fill="var(--color-sp-cream)">
        60-SECOND CALF DRILL
      </text>
      <rect x="26" y="37" width="38" height="3" rx="1.5" fill="var(--color-sp-gold)" />
      {steps.map((label, i) => (
        <g key={label} transform={`translate(${26 + i * 104} 50)`}>
          <rect width="96" height="48" rx="9" fill="var(--color-sp-cream)" />
          <circle cx="15" cy="15" r="9" fill="var(--color-sp-green)" />
          <text x="15" y="19.2" textAnchor="middle" fontFamily="Archivo, sans-serif" fontWeight="900" fontSize="11" fill="var(--color-sp-ink)">
            {i + 1}
          </text>
          <text x="9" y="39" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="10.5" fill="var(--color-sp-ink)">
            {label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function SampleTag({ dark }: { dark?: boolean }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]', dark ? 'bg-white/12 text-white/80' : 'bg-sp-cream text-sp-muted')}>
      Sample data
    </span>
  )
}
