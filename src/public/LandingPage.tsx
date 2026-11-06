import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, Gift, HandCoins, HeartHandshake, Megaphone, MessageCircle, UserPlus } from 'lucide-react'
import { buttonClass, SparkIcon } from '../components/ui'
import { TOUR_BASE } from '../entry'

// Positioning: "You don't need a million followers. You need the right 1,000."
// It is a hypothesis we are testing in the pilot, never an earnings claim.
//
// Copy rules (enforced by src/public/public-site.test.tsx):
//  * The "right 1,000" line always travels with its hypothesis label, and is
//    never paired with a money figure or a promise of a living.
//  * Never imply guaranteed reach or guaranteed earnings.
//  * The Following feed is described by its ordering only: newest first, not
//    ranked by engagement. It does not promise that anyone sees a post.
//  * Everything carries its real status: in the pilot, in development, or
//    where we're headed. Nothing involving money is live.

export type Status = 'pilot' | 'development' | 'vision'

const STATUS_LABEL: Record<Status, string> = {
  pilot: 'In the pilot',
  development: 'In development',
  vision: "Where we're headed",
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        status === 'pilot' && 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
        status === 'development' && 'bg-spark-50 text-spark-700 ring-1 ring-spark-200',
        status === 'vision' && 'border border-dashed border-ink-300 text-ink-500',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function Section({ id, eyebrow, title, children, className }: { id: string; eyebrow?: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={clsx('px-4 py-14 sm:px-6 sm:py-20', className)}>
      <div className="mx-auto max-w-6xl">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
        <h2 id={`${id}-title`} className="mt-2 max-w-3xl font-display text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900 sm:text-[2.4rem]">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

const cardShadow = 'shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]'

/** Decorative only: a sketch of a post in the Following feed. */
function HeroIllustration() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[400px] select-none">
      <div className="absolute -inset-6 rounded-[44px] bg-gradient-to-br from-brand-100 via-paper to-spark-100 opacity-80" />
      <div className="relative rounded-[28px] bg-card p-4 shadow-[0_18px_50px_-20px_rgb(11_106_92/0.45),0_0_0_1px_rgb(19_25_27/0.05)]">
        <div className="mb-3 flex items-center justify-between text-xs font-semibold text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" /> Following · newest first
          </span>
          <span className="rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-[10px] uppercase tracking-wide">Illustration</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 font-display text-sm font-bold text-white">AM</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">A creator you follow</p>
            <p className="text-xs text-ink-500">Posted 2 minutes ago</p>
          </div>
        </div>
        <div className="mt-3 aspect-[16/10] rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-4">
          <div className="flex h-full items-end">
            <p className="max-w-[80%] font-display text-lg font-bold leading-tight text-white">Behind the scenes of this week's episode</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-ink-500">
            <HeartHandshake className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-spark-50 px-2.5 py-1 text-xs font-semibold text-spark-700 ring-1 ring-spark-200">
            <SparkIcon className="h-3.5 w-3.5" /> +2 CP with this creator
          </span>
        </div>
      </div>
      <div className="relative mt-3 ml-auto w-[78%] rounded-2xl bg-card px-4 py-3 shadow-[0_10px_30px_-18px_rgb(19_25_27/0.4),0_0_0_1px_rgb(19_25_27/0.05)]">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-700">
          <Gift className="h-4 w-4 text-brand-600" /> Reward unlocked: early access
        </p>
      </div>
    </div>
  )
}

/** The central contrast: audience size versus relationship depth. */
const CONTRAST: Array<{ size: string; depth: string }> = [
  { size: 'How many people follow you', depth: 'How many people genuinely value what you make' },
  { size: 'Chasing views and virality', depth: 'Showing up for the people who show up for you' },
  { size: 'An algorithm decides the order', depth: 'Your Following feed shows posts newest first' },
  { size: 'Followers are a number', depth: 'Supporters are people you can recognise and reward' },
  { size: 'Earning depends on reaching huge audiences', depth: 'We\'re building ways for the people who value your work to back it' },
]

const BLOCKS: Array<{ verb: string; title: string; body: string; status: Status; icon: ReactNode }> = [
  {
    verb: 'Find them',
    title: 'A Following feed in time order',
    body: "When someone follows you, your posts appear in their Following feed newest first. The order isn't ranked by likes, comments or any engagement score, so you can build your community without second-guessing an algorithm.",
    status: 'pilot',
    icon: <Clock3 className="h-5 w-5" />,
  },
  {
    verb: 'Recognise them',
    title: 'Connection Points',
    body: "Points your supporters earn with you by taking part. They show you who keeps showing up, not just who clicked follow. They're not money and only work with you.",
    status: 'pilot',
    icon: <SparkIcon className="h-5 w-5" />,
  },
  {
    verb: 'Reward them',
    title: 'Creator rewards',
    body: 'Thank the people who matter with things you choose: a shout-out, early access, a live Q&A. The kind of thanks that works best with a community you actually know.',
    status: 'pilot',
    icon: <Gift className="h-5 w-5" />,
  },
  {
    verb: 'Let them back you',
    title: 'Voluntary support',
    body: "Ways for the people who value your work to support it directly. It isn't live yet, and we're still deciding how to test it safely. No money changes hands on Crevant today.",
    status: 'development',
    icon: <HandCoins className="h-5 w-5" />,
  },
  {
    verb: 'Add to it',
    title: 'Creator-content advertising',
    body: "Advertising on eligible creator content, as a possible extra source of value. It isn't live yet. We see it as a supplement to direct support, not the centre of the model.",
    status: 'development',
    icon: <Megaphone className="h-5 w-5" />,
  },
]

const STEPS = [
  { title: 'Create and follow', body: 'Share your work and follow the creators you care about.', icon: <UserPlus className="h-5 w-5" /> },
  { title: 'Take part', body: 'Comments, shares and showing up earn you Connection Points with that creator.', icon: <MessageCircle className="h-5 w-5" /> },
  { title: 'Get recognised and rewarded', body: 'Creators see who keeps showing up, and offer rewards that supporters redeem with their points.', icon: <Gift className="h-5 w-5" /> },
]

const IN_PILOT = [
  'Profiles and posts',
  'A Following feed shown newest first',
  'Comments, likes and shares',
  'Connection Points with each creator',
  'Rewards that creators choose and offer',
]

const IN_DEVELOPMENT = [
  'Direct, voluntary support from audiences to creators',
  'Advertising on eligible creator content',
  'Ways to see your active supporters alongside your follower count',
]

const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'Is 1,000 a magic number?',
    a: "No. It's our way of saying that depth matters more than size. Every creator's right number is different, and we can't promise what any community will earn.",
  },
  {
    q: 'Can my supporters become a sustainable income?',
    a: "That's what we're working toward, not something we can promise. During the pilot no money changes hands on Crevant.",
  },
  { q: 'Is it free?', a: 'Yes.' },
  {
    q: 'Are Connection Points money?',
    a: "No. They can't be bought, sold, cashed out or moved to another creator, and they only work with the creator who gave them.",
  },
  {
    q: 'Can I earn money on Crevant now?',
    a: "Not yet. We're building ways for creators to earn, and we'll be upfront about when and how they arrive. We can't promise anyone earnings.",
  },
  {
    q: 'Will my followers see everything I post?',
    a: "Your posts appear in your followers' Following feed, newest first. Whether they open the app and scroll to them is up to them, and we don't promise any particular reach.",
  },
  {
    q: 'Do follower counts still exist?',
    a: "Yes. We just don't think they tell the whole story, so we want to put the people who actively support you alongside them.",
  },
  { q: 'Who can join?', a: 'Adults 18 and over, by invitation, during the pilot.' },
  { q: 'Why invitation only?', a: 'A small group lets us test this idea properly, with the people using it.' },
]

export function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section id="hero" aria-labelledby="hero-title" className="overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="min-w-0">
            <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-ink-600 ring-1 ring-ink-100">
              <span>Invitation-only pilot</span>
              <span aria-hidden="true">·</span>
              <span>Free</span>
              <span aria-hidden="true">·</span>
              <span>18+</span>
            </p>
            <h1
              id="hero-title"
              className="mt-5 font-display text-[2.45rem] font-extrabold leading-[1.03] tracking-[-0.035em] text-ink-900 sm:text-[3.4rem] lg:text-[3.85rem]"
            >
              You don't need a million followers. <span className="text-brand-600">You need the right 1,000.</span>
            </h1>
            <div className="mt-6 max-w-xl space-y-4 text-lg leading-relaxed text-ink-600">
              <p>
                What if your success as a creator wasn't determined by how many people followed you, but by how many
                people genuinely valued what you created?
              </p>
              <p>
                Crevant is building a social network where meaningful connections matter, loyal supporters are
                recognized, and creators have more opportunities to turn their work into sustainable income.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
              <Link to="/request-invite" className={buttonClass('primary', 'lg')}>
                Request an invitation <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href={TOUR_BASE} className={buttonClass('secondary', 'lg')}>
                Take the tour
              </a>
            </div>
            <p data-testid="hypothesis-note" className="mt-5 max-w-xl text-sm leading-relaxed text-ink-500">
              This is the idea we're testing in our pilot, not a promise of earnings. No money changes hands on Crevant
              yet.
            </p>
            <p className="mt-2 text-sm text-ink-500">
              Already invited?{' '}
              <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
                Sign in
              </Link>
            </p>
          </div>
          <HeroIllustration />
        </div>
      </section>

      {/* The problem: size versus depth */}
      <Section id="why" eyebrow="Why we're building Crevant" title="A big audience isn't the same as a committed one." className="bg-white">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
            <p>
              Most platforms reward reach. Creators are told to post more, chase trends and hope the algorithm picks them
              up. Follower counts grow, but they rarely tell you who actually values your work, and a big number on its
              own doesn't pay the bills.
            </p>
            <p>
              We think creation is a profession, and that a smaller community of people who genuinely value what you
              make can matter more than a huge audience that scrolls past. That's the hypothesis our pilot is here to
              test.
            </p>
          </div>
          <div className={clsx('overflow-hidden rounded-3xl bg-paper ring-1 ring-ink-100')}>
            <div className="grid grid-cols-2 border-b border-ink-100 text-[12px] font-semibold uppercase tracking-wide">
              <p className="px-4 py-3 text-ink-500 sm:px-5">Chasing size</p>
              <p className="bg-brand-50 px-4 py-3 text-brand-700 sm:px-5">Building depth</p>
            </div>
            <ul aria-label="Chasing size compared with building depth">
              {CONTRAST.map((row) => (
                <li key={row.size} className="grid grid-cols-2 border-b border-ink-100 last:border-b-0">
                  <p className="px-4 py-3.5 text-[15px] leading-snug text-ink-500 sm:px-5">{row.size}</p>
                  <p className="bg-brand-50/60 px-4 py-3.5 text-[15px] font-medium leading-snug text-ink-900 sm:px-5">{row.depth}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* How Crevant helps: the building blocks */}
      <Section id="building-blocks" eyebrow="How Crevant helps" title="Find them. Recognise them. Reward them. Let them back you.">
        <p className="-mt-4 mb-8 max-w-2xl leading-relaxed text-ink-600">
          Every part of Crevant is built around the people who value your work, not the size of your audience. Here's
          what each piece does, and what's ready today.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCKS.map((b) => (
            <li key={b.title} className={clsx('flex flex-col rounded-3xl bg-card p-6', cardShadow)}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">{b.icon}</span>
                <StatusBadge status={b.status} />
              </div>
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-600">{b.verb}</p>
              <h3 className="mt-1 font-display text-xl font-bold text-ink-900">{b.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-600">{b.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* What success looks like */}
      <Section id="success" eyebrow="What success looks like here" title="Measured by the people who show up, not just the people who follow." className="bg-white">
        <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
            <p>
              A follower can be one click and gone. A supporter keeps coming back, takes part and cares how your work
              does. We want Crevant to help you see the difference, and to treat your community of supporters as one of
              the most valuable things you build.
            </p>
            <p>
              Follower counts aren't going away. During the pilot we're learning how best to show your active supporters
              alongside them, and we'll shape it with the creators taking part.
            </p>
          </div>
          <div className={clsx('rounded-3xl bg-paper p-6 ring-1 ring-ink-100')}>
            <StatusBadge status="vision" />
            <p className="mt-4 font-display text-lg font-bold leading-snug text-ink-900">
              Over time, we want your body of work, and the community around it, to keep creating opportunities for you.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
              That's a long-term aim, not a feature you can use today.
            </p>
          </div>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="Three steps, for everyone">
        <p className="-mt-4 mb-8 max-w-2xl leading-relaxed text-ink-600">
          There's one kind of account. Anyone can create, follow and offer rewards, with no switching between modes.
        </p>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-white p-6 ring-1 ring-ink-100">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-display text-sm font-bold text-white">{i + 1}</span>
                <span className="text-brand-600">{s.icon}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-ink-900">{s.title}</h3>
              <p className="mt-1.5 leading-relaxed text-ink-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Creators and supporters */}
      <Section id="who" eyebrow="Who it's for" title="Good for creators. Good for the people who show up." className="bg-white">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-brand-700 p-7 text-white">
            <h3 className="font-display text-xl font-bold">For creators</h3>
            <ul className="mt-4 space-y-3 leading-relaxed text-brand-50">
              <li>Know who your right people are, not just how many follow you.</li>
              <li>Recognise and reward them on your terms.</li>
              <li>Help shape how creators earn here.</li>
            </ul>
          </div>
          <div className={clsx('rounded-3xl bg-card p-7', cardShadow)}>
            <h3 className="font-display text-xl font-bold text-ink-900">For supporters</h3>
            <ul className="mt-4 space-y-3 leading-relaxed text-ink-600">
              <li>Be one of the people who matters to a creator.</li>
              <li>See posts from the creators you follow, newest first.</li>
              <li>Get recognised for showing up, and unlock rewards from creators you care about.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Connection Points */}
      <Section id="points" eyebrow="Connection Points" title="Recognition you earn with each creator">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_0.9fr]">
          <p className="text-[17px] leading-relaxed text-ink-600">
            Points you earn with one specific creator by taking part. They're not money. They can't be bought, sold,
            cashed out or moved to another creator, and they only work with the creator who gave them. Creators decide
            which rewards to offer and what each one costs in points.
          </p>
          <ul className="grid gap-2.5 text-[15px] font-medium text-ink-700">
            {['Earned by taking part', 'Specific to one creator', 'Never bought, sold or cashed out', 'Redeemed for rewards the creator offers'].map((t) => (
              <li key={t} className="flex items-center gap-3 rounded-2xl bg-spark-50 px-4 py-3 ring-1 ring-spark-100">
                <SparkIcon className="h-5 w-5 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* The pilot */}
      <Section id="pilot" eyebrow="The pilot" title="Testing the idea, carefully" className="bg-white">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
            <p>
              Our pilot asks a simple question: can a smaller, committed community create more meaningful value for a
              creator than a large, passive audience? We don't know the answer yet, and we'll share what we learn with the
              people taking part.
            </p>
            <p>
              Invited creators join first, then each creator invites the people who follow them. The 60 days begin when
              invited participants can actually use Crevant, not when this page goes live.
            </p>
            <p>
              We're also working on real, voluntary support from audiences to creators. It isn't available yet. Before
              anything involving money goes live, participants will hear from us first, with the full details.
            </p>
          </div>
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <div className={clsx('rounded-3xl bg-paper p-5 ring-1 ring-ink-100')}>
              <StatusBadge status="pilot" />
              <h3 className="mt-3 font-display text-base font-bold text-ink-900">What the pilot includes</h3>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-ink-600">
                {IN_PILOT.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className={clsx('rounded-3xl bg-paper p-5 ring-1 ring-ink-100')}>
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
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="Questions" title="The honest answers">
        <div className="max-w-3xl divide-y divide-ink-100 rounded-3xl bg-white ring-1 ring-ink-100">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                {f.q}
                <span aria-hidden="true" className="text-xl leading-none text-ink-400 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 leading-relaxed text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Closing call to action */}
      <section aria-labelledby="cta-title" className="px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mx-auto max-w-6xl rounded-[32px] bg-ink-900 px-6 py-12 text-center sm:px-12">
          <h2 id="cta-title" className="mx-auto max-w-2xl font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[2.4rem]">
            Build with the people who matter most.
          </h2>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-ink-300">
            We're inviting a small group of creators first. Requests open once our privacy notice is ready.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 min-[420px]:flex-row">
            <Link to="/request-invite" className={buttonClass('spark', 'lg')}>
              Request an invitation
            </Link>
            <a href={TOUR_BASE} className={clsx(buttonClass('ghost', 'lg'), 'text-white hover:bg-white/10')}>
              Take the tour
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
