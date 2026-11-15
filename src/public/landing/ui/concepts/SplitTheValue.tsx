import clsx from 'clsx'
import { useId } from 'react'
import { Heart, MessageCircle, Repeat2, Sparkles } from 'lucide-react'
import { Avatar, SamplePost } from '../PostJourney'

/**
 * HERO CONCEPT B, "Split the value" (for review, not live).
 *
 * Priya's sample post stays whole. Beneath it the line of the post forks in
 * two, with small sparks travelling down each branch: one to Priya, who made
 * it, one to the fans who helped it grow. Recognition, not money: no amounts,
 * no percentages, no currency. The sparks stop for reduced motion.
 */
export function SplitTheValue({ className }: { className?: string }) {
  const glow = useId()
  const left = 'M200 0 C200 46 92 40 92 96'
  const right = 'M200 0 C200 46 308 40 308 96'
  return (
    <figure data-testid="hero-concept-b" className={clsx('relative m-0 mx-auto w-full max-w-[25rem] lg:max-w-[28rem]', className)}>
      <div aria-hidden="true">
        <div className="relative z-10 mx-auto max-w-[22.5rem]">
          <SamplePost compact className="ring-white/10" />
        </div>

        <svg viewBox="0 0 400 96" className="-mt-px block h-auto w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id={glow}>
              <stop offset="0" stopColor="#ffd2a8" />
              <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d={left} fill="none" stroke="#ff6a2b" strokeWidth="3" strokeLinecap="round" />
          <path d={right} fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="3" strokeLinecap="round" />
          <circle cx="200" cy="2" r="7" fill="#10142e" stroke="#ff6a2b" strokeWidth="3" />
          <g className="motion-reduce:hidden">
            {[0, 1.1].map((begin) => (
              <g key={begin}>
                <circle r="9" fill={`url(#${glow})`}>
                  <animateMotion dur="2.2s" begin={`${begin}s`} repeatCount="indefinite" path={left} />
                </circle>
                <circle r="9" fill={`url(#${glow})`}>
                  <animateMotion dur="2.2s" begin={`${begin}s`} repeatCount="indefinite" path={right} />
                </circle>
              </g>
            ))}
          </g>
        </svg>

        <div className="-mt-1 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-sp-orange p-3 text-sp-midnight shadow-[0_20px_40px_-20px_rgb(0_0_0/0.7)] sm:p-3.5">
            <div className="flex items-center gap-2">
              <Avatar initials="PR" tone="leo" className="h-9 w-9 text-xs" />
              <Sparkles className="ml-auto h-4 w-4" />
            </div>
            <p className="mt-2 font-sp-display text-base font-black leading-tight [font-stretch:105%]">Priya</p>
            <p className="text-[13px] font-semibold leading-snug">made the post</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-sp-midnight shadow-[0_20px_40px_-20px_rgb(0_0_0/0.7)] sm:p-3.5">
            <div className="flex items-center">
              <Avatar initials="AN" tone="ana" className="h-9 w-9 text-xs ring-2 ring-white" />
              <Avatar initials="LE" tone="leo" className="-ml-2 h-9 w-9 text-xs ring-2 ring-white" />
              <Avatar initials="JK" tone="friend" className="-ml-2 h-9 w-9 text-xs" />
              <Sparkles className="ml-auto h-4 w-4 text-sp-orange-text" />
            </div>
            <p className="mt-2 font-sp-display text-base font-black leading-tight [font-stretch:105%]">Ana, Leo and friends</p>
            <p className="flex items-center gap-1 text-[13px] font-semibold leading-snug text-sp-muted">
              <Heart className="h-3 w-3" /> <MessageCircle className="h-3 w-3" /> <Repeat2 className="h-3 w-3" /> helped it grow
            </p>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Priya’s sample post, whole. Below it the post’s line splits in two: one branch goes to Priya, who made the post, and the other to Ana, Leo and
        friends, who helped it grow by liking, commenting and reposting.
      </figcaption>
    </figure>
  )
}
