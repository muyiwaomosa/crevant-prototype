import type { ReactNode } from 'react'
import { BellOff, MessageCircle, Share2, TrendingDown, TrendingUp, UserPlus } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { Photo } from '../ui/Photo'

const copy = HOMEPAGE_COPY.who

/** A small notification-style chip floating over a photo. Decorative: the list beside it says the same thing. */
function Chip({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-sp-ink shadow-[0_14px_30px_-12px_rgb(0_0_0/0.55)] sm:text-xs ${className}`}
    >
      {children}
    </span>
  )
}

/** The creator: late at night, the numbers going the wrong way. */
function CreatorScene() {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-sp-midnight">
      <Photo id="deskAtNight" className="absolute inset-0 h-full w-full object-cover opacity-70" />
      <Photo id="ringLight" className="absolute bottom-0 left-[4%] h-[72%] w-auto max-w-none opacity-90" />
      <Photo id="creatorFrustrated" className="absolute bottom-0 left-1/2 h-[92%] w-auto max-w-none -translate-x-[38%]" />
      <Chip className="left-[4%] top-[8%]">
        <TrendingUp className="h-3.5 w-3.5 text-sp-orange-text" /> Followers up again
      </Chip>
      <Chip className="right-[4%] top-[22%]">
        <TrendingDown className="h-3.5 w-3.5 text-sp-orange-text" /> Last post: reach down
      </Chip>
      <Chip className="bottom-[8%] right-[4%]">Post 5 of 5 this week</Chip>
    </div>
  )
}

/** The fan: sharing, commenting and recommending, with no one noticing. */
function FanScene() {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-[#ffd9c7]">
      <div aria-hidden="true" className="absolute -bottom-[30%] left-1/2 aspect-square w-[78%] -translate-x-1/2 rounded-full bg-sp-orange" />
      <Photo id="fansTogether" className="absolute bottom-0 left-1/2 h-[96%] w-auto max-w-none -translate-x-1/2" />
      <Chip className="left-[4%] top-[8%]">
        <Share2 className="h-3.5 w-3.5 text-sp-orange-text" /> Shared to 3 group chats
      </Chip>
      <Chip className="right-[4%] top-[24%]">
        <MessageCircle className="h-3.5 w-3.5 text-sp-orange-text" /> First to comment
      </Chip>
      <Chip className="bottom-[8%] left-[4%]">
        <UserPlus className="h-3.5 w-3.5 text-sp-orange-text" /> 3 friends followed
      </Chip>
      <Chip className="bottom-[8%] right-[4%] bg-sp-midnight! text-white!">
        <BellOff className="h-3.5 w-3.5" /> No one noticed
      </Chip>
    </div>
  )
}

const PEOPLE = [
  { key: 'creator', Scene: CreatorScene, ...copy.creator },
  { key: 'fan', Scene: FanScene, ...copy.fan },
] as const

/**
 * Section 3, WHO: the creator who keeps posting and the fan who keeps
 * sharing. Recognition before features: a photograph of each, one line, and
 * three frustrations they'll know.
 */
export function Who() {
  return (
    <section id="who" aria-labelledby="who-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto max-w-6xl px-4 py-18 sm:px-6 sm:py-24 lg:py-28">
        <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-orange-text">{copy.eyebrow}</p>
        <h2
          id="who-title"
          className="mt-4 font-sp-display text-[clamp(2rem,6.6vw,4.2rem)] font-black leading-[1.02] tracking-[-0.02em] [font-stretch:108%]"
        >
          <span className="block">{copy.headline[0]}</span> <span className="block text-sp-orange-text">{copy.headline[1]}</span>
        </h2>

        <div className="mt-12 grid gap-14 md:grid-cols-2 md:gap-10 lg:mt-16">
          {PEOPLE.map(({ key, Scene, label, line, points }) => (
            <article key={key} data-audience={key} aria-labelledby={`who-${key}`} className="flex min-w-0 flex-col gap-5">
              <Scene />
              <div>
                <h3 id={`who-${key}`} className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.16em] text-sp-orange-text">
                  {label}
                </h3>
                <p className="mt-2 font-sp-display text-[1.65rem] font-black leading-[1.1] tracking-[-0.01em] sm:text-[2rem]">{line}</p>
              </div>
              <ul className="space-y-2.5">
                {points.map((point) => (
                  <li key={point} className="flex gap-3 text-[1.05rem] leading-relaxed">
                    <span aria-hidden="true" className="mt-[0.6em] h-2 w-2 shrink-0 rounded-full bg-sp-orange" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
