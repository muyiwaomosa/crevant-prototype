import clsx from 'clsx'
import { Share2 } from 'lucide-react'
import { Photo } from './Photo'
import { Avatar, SamplePost } from './PostJourney'

/**
 * The hero picture: a creator at work, a fan reacting on his phone, and the
 * post between them, with its value split three ways (creator, fans,
 * Splitpost). Photos are stock images of models; the post is a labelled
 * sample.
 */
export function HeroScene({ className }: { className?: string }) {
  return (
    <figure data-testid="hero-scene" className={clsx('relative m-0 mx-auto aspect-[5/6] w-full max-w-[480px] lg:max-w-none', className)}>
      {/* The creator. */}
      <div className="absolute left-[6%] top-0 h-[78%] w-[66%] overflow-hidden rounded-[28px] bg-sp-midnight-raised shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
        <Photo id="creatorAtWork" eager className="h-full w-full object-cover object-[60%_20%]" />
      </div>

      {/* The fan, cut out over an orange disc. */}
      <div className="absolute bottom-[14%] right-0 h-[46%] w-[44%]">
        <div aria-hidden="true" className="absolute inset-x-[4%] bottom-0 aspect-square rounded-full bg-sp-orange" />
        <Photo id="fanOnPhone" eager className="absolute bottom-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2 object-contain" />
      </div>

      {/* The post that connects them. */}
      <div className="absolute bottom-0 left-0 w-[64%] min-w-[220px] max-w-[320px]">
        <SamplePost compact />
      </div>

      <p
        aria-hidden="true"
        className="absolute right-[2%] top-[8%] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-sp-midnight shadow-[0_16px_30px_-12px_rgb(0_0_0/0.6)] sm:text-xs"
      >
        <Share2 className="h-3.5 w-3.5 text-sp-orange-text" /> Ana shared Priya’s post
      </p>

      {/* The split, at a glance: one post, value going to the people who made it succeed. */}
      <div
        aria-hidden="true"
        className="absolute right-[2%] top-[22%] hidden rounded-2xl bg-sp-midnight/90 p-3 text-white ring-1 ring-white/15 backdrop-blur sm:block"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sp-muted-on-dark">One post, split</p>
        <div className="mt-2 flex items-center gap-1.5">
          <Avatar initials="PR" tone="priya" className="h-7 w-7 text-[10px]" />
          <Avatar initials="AN" tone="ana" className="h-7 w-7 text-[10px]" />
          <Avatar initials="LE" tone="leo-light" className="h-7 w-7 text-[10px]" />
        </div>
      </div>

      <figcaption className="sr-only">
        A creator at work and a fan on his phone, connected by Priya’s sample post. Photos show models from stock images.
      </figcaption>
    </figure>
  )
}
