import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Briefcase, Feather, Gift, HandCoins, HeartHandshake, Music, Sprout, Users } from 'lucide-react'
import { buttonClass, SparkIcon } from '../components/ui'
import { TOUR_BASE } from '../entry'
import { cardShadow, Section, StatusBadge, TourScreenshot, type Status } from './landing/shared'
import { AttentionAndRelationships, JourneyDiagram } from './landing/visuals'

export { StatusBadge } from './landing/shared'

// Landing page, version 2. WHY, WHO, WHAT, HOW in eight sections, plus a
// short FAQ before the closing call to action.
//
// Copy rules (enforced by src/public/public-site.test.tsx):
//  * "You need the right 1,000" is the hero headline only, always next to the
//    pilot disclaimer. It is a belief we are testing, never an earnings claim.
//  * Never imply guaranteed reach, guaranteed earnings, financial returns for
//    supporters, or that creators own their followers.
//  * Connection Points are never presented as money.
//  * Every feature claim carries its real status: in the pilot, testing in the
//    pilot, in development, or where we're headed. Nothing involving money is
//    live.
//  * Interface images are genuine tour screenshots, labelled as sample data.

const HEADLINE_LEAD = "You don't need a million followers."
const HEADLINE_FOCUS = 'You need the right 1,000.'

function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0">
          <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-ink-600 ring-1 ring-ink-100">
            <span>Invitation-only pilot</span>
            <span aria-hidden="true">·</span>
            <span>Free</span>
            <span aria-hidden="true">·</span>
            <span>18+</span>
          </p>
          <h1 id="hero-title" className="mt-5 font-display text-[2.45rem] font-extrabold leading-[1.03] tracking-[-0.035em] text-ink-900 sm:text-[3.4rem] lg:text-[3.85rem]">
            {HEADLINE_LEAD} <span className="text-brand-600">{HEADLINE_FOCUS}</span>
          </h1>
          <p data-testid="hypothesis-note" className="mt-4 max-w-xl text-sm leading-relaxed text-ink-500">
            This is the idea we're testing in our pilot, not a promise of earnings. No money changes hands on Crevant yet.
          </p>
          <p data-testid="supporting-headline" className="mt-6 max-w-xl font-display text-[1.35rem] font-bold leading-snug text-ink-800 sm:text-[1.55rem]">
            Your content should build your future. Not just someone else's platform.
          </p>
          <p data-testid="hero-opening" className="mt-4 max-w-xl text-lg leading-relaxed text-ink-600">
            You can spend years building an audience without building a sustainable career. Crevant is being built to help you grow real
            relationships with the people who value your work, and work toward opportunities that last beyond your next viral post.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
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
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-500">
            An invitation-only platform being built with creators and supporters. Free to join during our pilot. Ages 18+.
          </p>
          <p className="mt-2 text-sm text-ink-500">
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
    <Section
      id="why"
      eyebrow="Why Crevant exists"
      title="You can have thousands of followers and still struggle to make a living from what you create."
      className="bg-white"
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p>
            Think about someone who spends four hours creating a video that teaches people something valuable. It gets 100,000 views. People share
            it, thank them in the comments, and a few thousand new people follow. That's wonderful.
          </p>
          <p>
            But next month, when the bills arrive, those views may not translate into enough income. So they create another video. And another.
            Not always because they have something new to say, but because they're afraid the attention will disappear the moment they stop.
          </p>
          <p>
            Now imagine someone with only 500 followers, where 100 of those people genuinely value their work. They trust them, recommend them and
            would gladly support what they do.
          </p>
          <p className="font-semibold text-ink-900">Shouldn't that creator also have an opportunity to build a sustainable career? We believe they should.</p>
        </div>
        <div className="space-y-6">
          <AttentionAndRelationships />
          <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
            <p>
              The problem isn't that social media has no value. These platforms have helped millions of people find audiences they could never have
              reached before.
            </p>
            <p>
              The problem is that building an audience and building a sustainable career are not the same thing. And too many creators are still
              struggling to bridge that gap.
            </p>
            <p className="font-display text-xl font-bold leading-snug text-ink-900">
              That's why we're building Crevant. A creator's future shouldn't depend only on how many people watch. It should also depend on the
              relationships they build and the value they create for the people who care.
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

const IMAGINE: Array<{ who: string; text: string; icon: ReactNode }> = [
  { who: 'A teacher', text: 'being able to build a career from the knowledge they share.', icon: <BookOpen className="h-5 w-5" /> },
  { who: 'A musician', text: 'earning a sustainable living from a community that loves their music.', icon: <Music className="h-5 w-5" /> },
  { who: 'A storyteller', text: 'turning their creativity into opportunities they never imagined.', icon: <Feather className="h-5 w-5" /> },
  {
    who: 'Someone with a full-time job',
    text: 'gradually building a second source of income from the things they love teaching or creating.',
    icon: <Briefcase className="h-5 w-5" />,
  },
]

function Vision() {
  return (
    <Section id="vision" eyebrow="Our vision" title="We envision a world where content creation is a respected profession, not just a hobby.">
      <div className="flex items-center gap-3">
        <StatusBadge status="vision" />
        <p className="text-sm text-ink-500">A long-term aim, not something Crevant does today.</p>
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {IMAGINE.map((item) => (
          <li key={item.who} className={clsx('rounded-3xl bg-card p-6', cardShadow)}>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600" aria-hidden="true">
              {item.icon}
            </span>
            <p className="mt-4 leading-relaxed text-ink-600">
              <span className="font-display text-lg font-bold text-ink-900">Imagine {item.who.toLowerCase()}</span> {item.text}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p className="font-semibold text-ink-900">Not because they became famous. But because they created something valuable for the right people.</p>
          <p>
            We want to help build a creator economy where opportunities aren't reserved for the biggest names. Where creators can grow meaningful
            communities, develop sustainable income opportunities and build something that becomes more valuable over time.
          </p>
          <p>And where the people supporting creators can be part of their journey, instead of being treated as numbers on a screen.</p>
        </div>
        <div className="rounded-[28px] bg-ink-900 p-7 text-white">
          <p className="font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em]">
            Create value. <span className="text-brand-300">Own value.</span> <span className="text-spark-300">Build wealth.</span>
          </p>
          <p className="mt-2 text-ink-300">That's our vision.</p>
        </div>
      </div>
    </Section>
  )
}

function Who() {
  return (
    <Section id="who" eyebrow="Who Crevant is for" title="For people who create value. And the people who believe in them." className="bg-white">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[28px] bg-brand-700 p-7 text-white sm:p-8">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-100">
            <Sprout className="h-4 w-4" aria-hidden="true" /> For creators
          </p>
          <div className="mt-4 space-y-4 leading-relaxed text-brand-50">
            <p>
              Teachers, artists, musicians, comedians, writers, storytellers. Maybe you already have 50,000 followers, or you're just starting with
              50. What matters isn't how famous you are. It's that you have something valuable to share.
            </p>
            <p>
              You don't have to abandon the platforms you already use. Crevant is being built to help you turn the attention you've earned into
              relationships and opportunities that can grow over time.
            </p>
          </div>
        </div>
        <div className={clsx('rounded-[28px] bg-card p-7 sm:p-8', cardShadow)}>
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-600">
            <Users className="h-4 w-4" aria-hidden="true" /> For supporters
          </p>
          <div className="mt-4 space-y-4 leading-relaxed text-ink-600">
            <p>
              Think about a creator who taught you a skill, got you through a difficult time or made you laugh when you needed it. You've watched,
              shared and told others about them.
            </p>
            <p>
              What if supporting them could mean more than pressing Like? Crevant is being built to help you connect, participate and be recognized
              for the role you play in a creator's community.
            </p>
            <p className="font-semibold text-ink-900">Because behind every successful creator are people who helped them get there.</p>
          </div>
        </div>
      </div>
    </Section>
  )
}

const IDEAS: Array<{ title: string; body: ReactNode; status: Status; icon: ReactNode }> = [
  {
    title: 'Build relationships, not just followers',
    body: 'Followers are numbers. Relationships are built through trust, shared interests and meaningful participation. Crevant is designed to help creators and supporters build stronger communities around the work they value.',
    status: 'pilot',
    icon: <HeartHandshake className="h-5 w-5" />,
  },
  {
    title: 'Make meaningful participation count',
    body: (
      <>
        Someone who consistently supports your work can contribute more to your journey than someone who watches one viral video and disappears.
        We're experimenting with Connection Points to recognize participation and loyalty.{' '}
        <strong className="font-semibold text-ink-800">
          Connection Points aren't money, and they don't promise financial returns.
        </strong>{' '}
        They're a way to explore how creators can recognize and reward meaningful support.
      </>
    ),
    status: 'testing',
    icon: <SparkIcon className="h-5 w-5" />,
  },
  {
    title: 'Create more opportunities to earn',
    body: (
      <>
        We want creators to have more ways to build sustainable income from their work, including direct support from their communities and
        potential brand partnerships. These earning tools are part of our longer-term product direction, not a promise that every creator will earn
        money during the pilot.{' '}
        <span data-testid="advertising-principle">
          Advertising may come later as a supplement to these opportunities, not the centre of Crevant's model. It isn't available today.
        </span>
      </>
    ),
    status: 'vision',
    icon: <HandCoins className="h-5 w-5" />,
  },
  {
    title: 'Build something that lasts',
    body: 'Imagine looking back at five years of creating and seeing more than a collection of posts: a body of work, a community that values it, and opportunities that grew from the relationships you built.',
    status: 'vision',
    icon: <Gift className="h-5 w-5" />,
  },
]

function Building() {
  return (
    <Section id="building" eyebrow="What we're building" title="Your audience should be the beginning of something bigger." intro={<p>We're building Crevant around four ideas.</p>}>
      <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
        <ol className="grid gap-4 sm:grid-cols-2">
          {IDEAS.map((idea, i) => (
            <li key={idea.title} className={clsx('flex flex-col rounded-3xl bg-card p-6', cardShadow)}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600" aria-hidden="true">
                  {idea.icon}
                </span>
                <StatusBadge status={idea.status} />
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-ink-900">
                <span className="text-brand-600">{i + 1}.</span> {idea.title}
              </h3>
              <p className="mt-2 leading-relaxed text-ink-600">{idea.body}</p>
            </li>
          ))}
        </ol>
        <div className="grid content-start gap-8 sm:grid-cols-2 lg:grid-cols-1">
          <TourScreenshot screen="creator" caption="Connection Points with one creator" />
          <TourScreenshot screen="rewards" caption="Rewards a creator chooses to offer" />
        </div>
      </div>
    </Section>
  )
}

function How() {
  return (
    <Section id="how" eyebrow="How Crevant works" title="From creating content to building meaningful opportunities." className="bg-white">
      <JourneyDiagram />
      <p className="mt-10 max-w-3xl rounded-2xl bg-spark-50 px-5 py-4 text-[15px] leading-relaxed text-ink-700 ring-1 ring-spark-200">
        Crevant is in development. The first pilot will test the core social experience and community participation features. Additional earning
        capabilities are planned and will be introduced only when ready.
      </p>
    </Section>
  )
}

const IN_PILOT = ['Profiles and posts', 'A Following feed shown newest first', 'Comments, likes and shares', 'Connection Points with each creator', 'Rewards that creators choose and offer']
const IN_DEVELOPMENT = ['Direct, voluntary support from audiences to creators', 'Advertising on eligible creator content, as a supplement, not the centre of the model', 'Ways to see your active supporters alongside your follower count']

function Pilot() {
  return (
    <Section id="pilot" eyebrow="Why we're starting small" title="We're not trying to attract a million users on day one.">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p>We're looking for people who believe the creator economy can work differently.</p>
          <ul className="space-y-3">
            {[
              'People who believe a creator with 500 loyal supporters deserves a meaningful opportunity.',
              'People who believe valuable content should do more than generate attention.',
              'People who believe creators and their communities should have a greater voice in shaping the platforms they use.',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                {t}
              </li>
            ))}
          </ul>
          <p>Together, we'll test the experience, learn what works and improve what doesn't.</p>
          <p className="font-semibold text-ink-900">
            We're not promising that joining Crevant will make you wealthy. We're inviting you to help build a platform that takes your future as
            seriously as you take your creativity.
          </p>
        </div>
        <div className="space-y-4">
          <div data-testid="pilot-targets" className="rounded-[28px] bg-white p-6 ring-1 ring-ink-100">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Our planning targets</p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
              {[
                ['10–20', 'creators'],
                ['200–300', 'supporters'],
                ['60', 'days'],
              ].map(([n, l]) => (
                <div key={l} className="rounded-2xl bg-paper px-2 py-4">
                  <dt className="sr-only">{l}</dt>
                  <dd>
                    <span className="block whitespace-nowrap font-display text-xl font-extrabold text-ink-900 sm:text-2xl">{n}</span>
                    <span className="text-[13px] text-ink-500">{l}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
              We're starting with a small, invitation-only pilot of approximately 10–20 creators and 200–300 supporters. These are planning targets,
              not promises about how many people will take part. The 60 days begin when invited participants can actually use Crevant, not when this page goes live.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-ink-100">
              <StatusBadge status="pilot" />
              <h3 className="mt-3 font-display text-base font-bold text-ink-900">What the pilot includes</h3>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-ink-600">
                {IN_PILOT.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-white p-5 ring-1 ring-ink-100">
              <StatusBadge status="development" />
              <h3 className="mt-3 font-display text-base font-bold text-ink-900">Still being built</h3>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-ink-600">
                {IN_DEVELOPMENT.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'Is 1,000 a magic number?',
    a: "No. It's our way of saying that depth matters more than size. Every creator's right number is different, and we can't promise what any community will earn.",
  },
  {
    q: 'Can I earn money on Crevant now?',
    a: "Not yet. No money changes hands on Crevant during the pilot. We're building ways for creators to earn, and we'll be upfront about when and how they arrive. We can't promise anyone earnings.",
  },
  {
    q: 'Are Connection Points money?',
    a: "No. They're not money. They can't be bought, sold, cashed out or moved to another creator, and they only work with the creator who gave them.",
  },
  {
    q: 'Do supporters get a financial share in a creator\'s success?',
    a: "No. Supporters can be recognized and rewarded by creators, but they don't receive ownership, profits or financial returns.",
  },
  {
    q: 'Will my followers see everything I post?',
    a: "Your posts appear in your followers' Following feed, newest first. It isn't ranked by likes, comments or any engagement score. Whether people open the app and scroll to your posts is up to them, and we don't promise any particular reach.",
  },
  {
    q: 'Do follower counts still exist?',
    a: "Yes. Follower counts aren't going away. We just don't think they tell the whole story, so we want to show the people who actively support you alongside them.",
  },
  {
    q: 'How long is the pilot, and who can join?',
    a: 'About 60 days, starting when invited participants can actually use Crevant. Adults 18 and over can join, by invitation. It is free.',
  },
  {
    q: 'When will anything involving money go live?',
    a: "We're working on real, voluntary support from audiences to creators. It isn't available yet. Before anything involving money goes live, participants will hear from us first, with the full details.",
  },
]

function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="The honest answers" className="bg-white">
      <div className="max-w-3xl divide-y divide-ink-100 rounded-3xl bg-paper ring-1 ring-ink-100">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
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
    </Section>
  )
}

function FinalCta() {
  return (
    <section id="cta" aria-labelledby="cta-title" className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-ink-900 px-6 py-12 sm:px-12 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="cta-title" className="font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[2.6rem]">
            What if the next five years of creating could build more than an audience?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-300">
            You don't have to become famous to begin building something meaningful. Your content has value. Your relationships have value. Come
            see what we're building, and help shape it.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 min-[420px]:flex-row min-[420px]:items-start">
            <div>
              <a href={TOUR_BASE} className={buttonClass('spark', 'lg')}>
                Explore Crevant <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <p className="mt-1.5 text-[13px] text-ink-400">A tour with sample data</p>
            </div>
            <div>
              <Link to="/request-invite" className={clsx(buttonClass('ghost', 'lg'), 'text-white ring-1 ring-white/25 hover:bg-white/10')}>
                Request an invitation
              </Link>
              <p className="mt-1.5 text-[13px] text-ink-400">Once invitations open</p>
            </div>
          </div>
          <p className="mt-10 font-display text-lg font-bold text-white">
            Crevant <span className="font-semibold text-ink-400">·</span> <span className="text-ink-300">Create value. Own value. Build wealth.</span>
          </p>
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <Why />
      <Vision />
      <Who />
      <Building />
      <How />
      <Pilot />
      <Faq />
      <FinalCta />
    </>
  )
}
