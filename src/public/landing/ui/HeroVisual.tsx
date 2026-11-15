import clsx from 'clsx'
import { Heart, MessageCircle, Repeat2 } from 'lucide-react'
import { DISCLOSURES } from '../claims'

/**
 * The hero's TEMPORARY visual: a creator and a fan connected by one sample
 * post, cut diagonally by the split. Built from shapes only (no photos, no
 * faces), and labelled as placeholder material until real, licensed
 * photography is approved. The post card is labelled as a concept with
 * sample data.
 */

export const PLACEHOLDER_LABEL = 'Placeholder imagery'

/** An abstract head-and-shoulders shape: deliberately not a person. */
function Silhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" className={className}>
      <circle cx="40" cy="29" r="15" fill="currentColor" opacity="0.9" />
      <path d="M12 76c2-17 14-27 28-27s26 10 28 27z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

function PersonCard({ role, className }: { role: 'Creator' | 'Fan'; className?: string }) {
  const creator = role === 'Creator'
  return (
    <div
      aria-hidden="true"
      className={clsx(
        // Labels sit on the outer edge of each card, away from the post in the middle.
        'absolute flex w-[34%] max-w-[150px] items-center gap-2 rounded-[22px] p-3 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.55)] ring-1',
        creator ? 'flex-col-reverse' : 'flex-col',
        creator ? 'bg-sp-midnight-raised text-sp-orange ring-white/10' : 'bg-[#2a1d4a] text-[#ffd2bd] ring-white/10',
        className,
      )}
    >
      <div className="aspect-square w-full overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,rgb(255_255_255/0.14),transparent_70%)]">
        <Silhouette className="h-full w-full" />
      </div>
      <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-sp-display text-[11px] font-bold uppercase tracking-[0.12em] text-white">{role}</span>
    </div>
  )
}

function SamplePost() {
  return (
    <div
      aria-hidden="true"
      className="absolute left-[55%] top-[55%] w-[56%] max-w-[270px] -translate-x-1/2 -translate-y-1/2 -rotate-[3deg] rounded-[22px] bg-white p-3.5 text-sp-ink shadow-[0_30px_60px_-15px_rgb(0_0_0/0.6)] sm:p-4"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sp-orange font-sp-display text-[12px] font-black text-sp-midnight">PR</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold">Priya Raman</span>
          <span className="block truncate text-[11px] text-sp-muted">@priyabuilds · sample</span>
        </span>
      </div>
      <p className="mt-2.5 text-[13px] leading-snug sm:text-[14px]">Shipped the offline mode. Here's what broke first.</p>
      <div className="mt-2.5 h-14 rounded-xl bg-[repeating-linear-gradient(135deg,var(--color-sp-neutral)_0_8px,#ece5da_8px_16px)] sm:h-16" />
      <div className="mt-2.5 flex items-center gap-3 text-sp-muted">
        <Heart className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
        <Repeat2 className="h-4 w-4" />
        <span className="ml-auto rounded-full bg-sp-orange/15 px-2 py-0.5 text-[10px] font-semibold text-sp-orange-text">Shared by a fan</span>
      </div>
      <span className="mt-2.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-sp-muted">
        {DISCLOSURES.concept} · {DISCLOSURES.sampleData}
      </span>
    </div>
  )
}

export function HeroVisual({ className }: { className?: string }) {
  return (
    <figure data-placeholder="hero" aria-labelledby="hero-visual-caption" className={clsx('relative m-0', className)}>
      <div className="relative aspect-[6/5] w-full overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,var(--color-sp-midnight-raised)_0_57%,var(--color-sp-orange)_57%_100%)] ring-1 ring-white/10 sm:aspect-[5/4] lg:aspect-[4/5]">
        {/* Soft light, so the panel reads as a lit surface rather than a flat block. */}
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_10%,rgb(255_255_255/0.10),transparent_55%)]" />
        {/* The connection between creator and fan runs through the post. */}
        <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M18 24 C 40 40, 60 60, 82 78" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        </svg>
        <PersonCard role="Creator" className="left-[5%] top-[7%] -rotate-[4deg]" />
        <PersonCard role="Fan" className="bottom-[7%] right-[5%] rotate-[4deg]" />
        <SamplePost />
        <span
          data-testid="placeholder-badge"
          className="absolute right-3 top-3 rounded-full bg-sp-midnight/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white ring-1 ring-white/20 backdrop-blur"
        >
          {PLACEHOLDER_LABEL}
        </span>
      </div>
      <figcaption id="hero-visual-caption" className="sr-only">
        {PLACEHOLDER_LABEL}, not real people: a creator and a fan connected by one sample post. {DISCLOSURES.concept} design with{' '}
        {DISCLOSURES.sampleData.toLowerCase()}.
      </figcaption>
    </figure>
  )
}
