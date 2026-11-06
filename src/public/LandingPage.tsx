import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, HandCoins, HeartHandshake, Sprout, Users } from 'lucide-react'
import { buttonClass, SparkIcon } from '../components/ui'
import { TOUR_BASE } from '../entry'
import { cardShadow, Section, StatusBadge, TourScreenshot, type Status } from './landing/shared'
import { FeedComparison, PyramidComparison } from './landing/visuals'

export { StatusBadge } from './landing/shared'

// Landing page: six sections (hero, why, who, what, how, final call to
// action), with the pilot facts and a compact FAQ inside "how".
//
// Copy rules (enforced by src/public/public-site.test.tsx):
//  * "You need the right 1,000" is the hero headline only, followed by the
//    mission and the note that it is a long-term mission, not a promise of
//    earnings during the pilot.
//  * Never imply guaranteed reach or earnings, financial returns for
//    supporters, or that creators own their followers. The Following feed is
//    described by its order only: newest first, not ranked by predicted
//    engagement. We never say every follower sees every post.
//  * The pyramid is a metaphor about unequal opportunity, labelled as a
//    conceptual vision, never as data or an allegation about any company.
//  * Every feature claim carries its real status. Nothing involving money is
//    live; advertising is a future supplement, not the centre of the model.
//  * Interface images are genuine tour screenshots, labelled as sample data.

function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="overflow-hidden px-4 pb-14 pt-10 sm:px-6 sm:pt-16 lg:pb-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0">
          <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-ink-600 ring-1 ring-ink-100">
            <span>Invitation-only pilot</span>
            <span aria-hidden="true">·</span>
            <span>Free</span>
            <span aria-hidden="true">·</span>
            <span>18+</span>
          </p>
          <h1 id="hero-title" className="mt-5 font-display text-[2.45rem] font-extrabold leading-[1.03] tracking-[-0.035em] text-ink-900 sm:text-[3.4rem] lg:text-[3.85rem]">
            You don't need a million followers. <span className="text-brand-600">You need the right 1,000.</span>
          </h1>
          <p data-testid="mission" className="mt-5 max-w-xl font-display text-[1.3rem] font-bold leading-snug text-ink-800 sm:text-[1.5rem]">
            Our mission is to help content creators who have something valuable to say build sustainable income.
          </p>
          <p data-testid="hypothesis-note" className="mt-3 max-w-xl text-sm leading-relaxed text-ink-500">
            This is our long-term mission, not a promise of earnings during the pilot. No money changes hands on Crevant yet.
          </p>
          <div className="mt-7 flex flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <div>
              <a href={TOUR_BASE} className={buttonClass('primary', 'lg')}>
                Explore Crevant <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <p className="mt-1.5 text-center text-[13px] text-ink-500">A tour with sample data</p>
            </div>
            <div>
              <Link to="/request-invite" className={buttonClass('secondary', 'lg')}>
                Join the invitation list
              </Link>
              <p className="mt-1.5 text-center text-[13px] text-ink-500">When available</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-ink-500">
            Already invited?{' '}
            <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
              Sign in
            </Link>
          </p>
        </div>
        <div className="relative">
          <div aria-hidden="true" className="absolute -inset-6 rounded-[48px] bg-gradient-to-br from-brand-100 via-paper to-spark-100 opacity-80" />
          <TourScreenshot screen="feed" caption="Your Following feed, newest first" priority className="relative" />
        </div>
      </div>
    </section>
  )
}

function Why() {
  return (
    <Section id="why" eyebrow="Why Crevant exists" title="You build the audience. The platform controls the distribution." className="bg-white">
      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p>
            Creators can spend years building an audience and still struggle to reach the people who{' '}
            <strong className="font-semibold text-ink-900">explicitly chose to follow them</strong>.
          </p>
          <p>
            Recommendation algorithms often prioritize predicted engagement rather than the relationships people have deliberately chosen. A
            follow doesn't always mean your posts show up.
          </p>
          <p className="font-semibold text-ink-900">On Crevant, the Following feed is chronological: newest first, not ranked by predicted engagement.</p>
        </div>
        <FeedComparison />
      </div>
    </Section>
  )
}

const GROUPS: Array<{ id: 'creators' | 'fans'; label: string; title: string; body: string; icon: ReactNode }> = [
  {
    id: 'creators',
    label: 'For creators',
    title: 'You have something valuable to share.',
    body: 'Build relationships with people who genuinely appreciate your work, recognize loyal supporters and work toward sustainable income.',
    icon: <Sprout className="h-6 w-6" />,
  },
  {
    id: 'fans',
    label: 'For fans',
    title: 'You believe in creators whose work matters to you.',
    body: 'Discover them, support their journey, earn recognition for meaningful participation and explore rewards they choose to offer.',
    icon: <Users className="h-6 w-6" />,
  },
]

function Who() {
  return (
    <Section id="who" eyebrow="Who Crevant is for" title="For creators. And for the fans who help them build something lasting.">
      <ul className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => (
          <li
            key={g.id}
            data-group={g.id}
            className={clsx('flex flex-col rounded-[28px] p-7 sm:p-8', g.id === 'creators' ? 'bg-brand-700 text-white' : 'bg-spark-100 text-ink-900 ring-1 ring-spark-200')}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={clsx('grid h-12 w-12 place-items-center rounded-2xl', g.id === 'creators' ? 'bg-white/10 text-white' : 'bg-white text-spark-700')}
              >
                {g.icon}
              </span>
              <h3 className={clsx('font-display text-2xl font-extrabold', g.id === 'creators' ? 'text-white' : 'text-ink-900')}>{g.label}</h3>
            </div>
            <p className={clsx('mt-5 font-display text-xl font-bold leading-snug', g.id === 'creators' ? 'text-white' : 'text-ink-900')}>{g.title}</p>
            <p className={clsx('mt-2 text-[17px] leading-relaxed', g.id === 'creators' ? 'text-white/85' : 'text-ink-700')}>{g.body}</p>
          </li>
        ))}
      </ul>
      <p data-testid="one-account" className="mt-5 text-center text-[15px] text-ink-600">
        One account for everyone. Create, follow and support, with no separate modes or account types.
      </p>
    </Section>
  )
}

function What() {
  return (
    <Section
      id="what"
      eyebrow="What we're building"
      title="The creator economy looks a lot like a pyramid scheme. We're building Crevant to flip it."
      className="bg-white"
      intro={
        <>
          <p>
            Millions of creators contribute content, creativity and attention to social media platforms, but sustainable earning opportunities
            are concentrated among relatively few.
          </p>
          <p className="mt-3 font-semibold text-ink-900">
            Our goal isn't to create a few more millionaires at the top. It's to help more creators earn enough to keep creating.
          </p>
        </>
      }
    >
      <PyramidComparison />
      <p data-testid="metaphor-note" className="mt-4 text-[13px] leading-relaxed text-ink-500">
        "Pyramid scheme" is a metaphor for unequal opportunity. We're not saying any company runs an illegal scheme.
      </p>
    </Section>
  )
}

const POINTS: Array<{ title: string; body: string; status: Status; icon: ReactNode }> = [
  {
    title: 'Follow means follow.',
    body: "Posts from creators you've chosen to follow appear newest first in the Following feed.",
    status: 'pilot',
    icon: <Clock3 className="h-5 w-5" />,
  },
  {
    title: 'Build meaningful connections.',
    body: 'Focus on relationships and communities, not just follower counts.',
    status: 'pilot',
    icon: <HeartHandshake className="h-5 w-5" />,
  },
  {
    title: 'Recognize loyal supporters.',
    body: 'Connection Points are being tested to recognize participation. They are not money.',
    status: 'testing',
    icon: <SparkIcon className="h-5 w-5" />,
  },
  {
    title: 'Build toward sustainable income.',
    body: 'Direct support and additional earning opportunities are planned, not currently live. Advertising should supplement creator opportunities rather than dominate the model.',
    status: 'vision',
    icon: <HandCoins className="h-5 w-5" />,
  },
]

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Will my followers see everything I post?',
    a: "We can't promise that. Your posts appear in your followers' Following feed, newest first. It isn't ranked by likes, comments or any engagement score, but whether people open the app and scroll is up to them, and we don't promise any particular reach.",
  },
  {
    q: 'Can I earn money on Crevant now?',
    a: "Not yet. No money changes hands on Crevant during the pilot. Direct support from audiences to creators is planned. It isn't available yet. Before anything involving money goes live, participants will hear from us first, with the full details. We can't promise anyone earnings.",
  },
  {
    q: 'Are Connection Points money?',
    a: "No. They're not money. They can't be bought, sold, cashed out or moved to another creator, and they only work with the creator who gave them.",
  },
  {
    q: "Do supporters get a financial share in a creator's success?",
    a: "No. Supporters can be recognized and rewarded by creators, but they don't receive ownership, profits or financial returns.",
  },
  {
    q: 'Is 1,000 a magic number?',
    a: "No. It's our way of saying that depth matters more than size. Every creator's right number is different, and we can't promise what any community will earn.",
  },
  {
    q: 'Do follower counts still exist?',
    a: "Yes. Follower counts aren't going away. We just don't think they tell the whole story.",
  },
]

function How() {
  return (
    <Section id="how" eyebrow="How Crevant is different" title="Built around the people you chose, not predicted engagement.">
      <div className="grid items-start gap-10 lg:grid-cols-[1.4fr_0.6fr]">
        <ol className="grid gap-4 sm:grid-cols-2">
          {POINTS.map((p) => (
            <li key={p.title} className={clsx('flex flex-col rounded-3xl bg-card p-5 sm:p-6', cardShadow)}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600" aria-hidden="true">
                  {p.icon}
                </span>
                <StatusBadge status={p.status} />
              </div>
              <h3 className="mt-3 font-display text-lg font-bold text-ink-900">{p.title}</h3>
              <p className="mt-1.5 leading-relaxed text-ink-600">{p.body}</p>
            </li>
          ))}
        </ol>
        <TourScreenshot screen="creator" caption="Connection Points with one creator" className="max-w-[220px] lg:max-w-[250px]" />
      </div>

      <div data-testid="fan-panel" className="mt-8 grid items-center gap-6 rounded-[32px] bg-spark-50 p-6 ring-1 ring-spark-200 sm:p-8 md:grid-cols-[1.4fr_0.6fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-spark-700">For fans</p>
          <h3 className="mt-2 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2rem]">
            Your support should count for something.
          </h3>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-700">
            You don't have to create content to be part of Crevant. We're testing ways to recognize meaningful participation through Connection
            Points.
          </p>
          <p className="mt-3 font-display text-lg font-bold leading-snug text-ink-900">
            Because creators build communities. But fans help make those communities possible.
          </p>
          <p data-testid="points-accuracy" className="mt-4 text-[13px] leading-relaxed text-ink-500">
            Connection Points are noncash participation points. They aren't money, investments, ownership or wages, and they can't be cashed out.
            Not every interaction earns points. Rewards are chosen by each creator and subject to availability, so not every fan will receive one.
          </p>
        </div>
        <TourScreenshot screen="rewards" caption="Rewards a creator chooses to offer" className="max-w-[220px]" />
      </div>

      <div data-testid="pilot-targets" className="mt-8 rounded-[28px] bg-white p-5 ring-1 ring-ink-100 sm:p-6">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">The pilot</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
          An invitation-only pilot for adults 18+, free to join, with approximately 10–20 creators and 200–300 supporters. These are planning
          targets, not promises about how many people will take part. The 60 days begin when invited participants can actually use Crevant, not when
          this page goes live.
        </p>
      </div>

      <div id="faq" className="mt-6">
        <h3 className="font-display text-lg font-bold text-ink-900">Honest answers</h3>
        <div className="mt-3 divide-y divide-ink-100 rounded-3xl bg-white ring-1 ring-ink-100">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-3.5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                {f.q}
                <span aria-hidden="true" className="text-xl leading-none text-ink-400 transition group-open:rotate-45 motion-reduce:transition-none">
                  +
                </span>
              </summary>
              <p className="mt-2 leading-relaxed text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

function FinalCta() {
  return (
    <section id="cta" aria-labelledby="cta-title" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl rounded-[36px] bg-ink-900 px-6 py-12 text-center sm:px-12 sm:py-16">
        <h2 id="cta-title" className="mx-auto max-w-3xl font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[2.6rem]">
          You have something valuable to say. <span className="text-spark-300">We're building a better way for people to hear it.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-300">
          You shouldn't need a million followers to have a meaningful opportunity to build a career from what you create. Come help us build a
          creator economy where more creators can succeed.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <a href={TOUR_BASE} className={buttonClass('spark', 'lg')}>
            Explore Crevant <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="text-[13px] text-ink-400">
            A tour with sample data.{' '}
            <Link to="/request-invite" className="font-semibold text-white underline underline-offset-2 hover:text-spark-200">
              Request an invitation
            </Link>{' '}
            once invitations open.
          </p>
        </div>
        <p className="mt-10 font-display text-lg font-bold text-white">
          Crevant <span className="font-semibold text-ink-400">·</span> <span className="text-ink-300">Create value. Own value. Build wealth.</span>
        </p>
      </div>
    </section>
  )
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <Why />
      <Who />
      <What />
      <How />
      <FinalCta />
    </>
  )
}
