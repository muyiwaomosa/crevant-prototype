import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, Gift, HeartHandshake, MessageCircle, Sparkles, Sprout, UserPlus, Users } from 'lucide-react'
import { buttonClass, SparkIcon } from '../components/ui'
import { TOUR_BASE } from '../entry'

// Copy rules (enforced by src/public/copy.test.tsx):
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
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        status === 'pilot' && 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
        status === 'development' && 'bg-spark-50 text-spark-700 ring-1 ring-spark-200',
        status === 'vision' && 'border border-dashed border-ink-300 text-ink-500',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function Section({ id, eyebrow, title, children, className }: { id?: string; eyebrow?: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={clsx('px-4 py-14 sm:px-6 sm:py-20', className)}>
      <div className="mx-auto max-w-6xl">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
        <h2 id={id ? `${id}-title` : undefined} className="mt-2 max-w-3xl font-display text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-900 sm:text-[2.4rem]">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

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

const PILLARS: Array<{ title: string; body: string; status: Status; icon: ReactNode }> = [
  {
    title: 'Relationships, not just reach',
    body: 'See who keeps showing up, not just how many. Connection Points recognise the people who take part, and you choose how to thank them.',
    status: 'pilot',
    icon: <Users className="h-5 w-5" />,
  },
  {
    title: 'A Following feed in time order',
    body: "When someone follows you, your posts appear in their Following feed newest first. The order isn't ranked by likes, comments or any engagement score.",
    status: 'pilot',
    icon: <Clock3 className="h-5 w-5" />,
  },
  {
    title: 'Opportunities to earn',
    body: "We're building ways for your audience to support you directly, and for eligible creator content to earn from advertising. Neither is live yet, and we won't promise earnings. We'll always be clear about what's real and what isn't.",
    status: 'development',
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    title: 'Work that keeps its value',
    body: "Your posts, your community and the rewards you've given stay tied to you. Over time, we want your body of work to become something that keeps creating opportunities.",
    status: 'vision',
    icon: <Sprout className="h-5 w-5" />,
  },
]

const STEPS = [
  { title: 'Create and follow', body: 'Share your work and follow the creators you care about.', icon: <UserPlus className="h-5 w-5" /> },
  { title: 'Take part', body: 'Comments, shares and showing up earn you Connection Points with that creator.', icon: <MessageCircle className="h-5 w-5" /> },
  { title: 'Get rewarded', body: 'Creators offer rewards, like a shout-out, early access or a live Q&A, that supporters redeem with their points.', icon: <Gift className="h-5 w-5" /> },
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
  'Tools that help your body of work keep creating value',
]

const FAQ: Array<{ q: string; a: ReactNode }> = [
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
  { q: 'Who can join?', a: 'Adults 18 and over, by invitation, during the pilot.' },
  { q: 'Why invitation only?', a: 'A small group lets us build something good with the people using it.' },
]

export function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
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
              className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink-900 sm:text-[3.6rem] lg:text-[4.1rem]"
            >
              Turn what you create into something that lasts.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              Crevant is a creator-first social network. It helps you know the people who show up for you, thank them in
              ways that matter, and build toward earning from your work, so what you make is worth more than a post that
              scrolls away.
            </p>
            <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
              <Link to="/request-invite" className={buttonClass('primary', 'lg')}>
                Request an invitation <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href={TOUR_BASE} className={buttonClass('secondary', 'lg')}>
                Take the tour
              </a>
            </div>
            <p className="mt-5 text-sm text-ink-500">
              Already invited?{' '}
              <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
                Sign in
              </Link>
            </p>
          </div>
          <HeroIllustration />
        </div>
      </section>

      {/* Vision */}
      <Section id="why" eyebrow="Why we're building Crevant" title="Creating is work. It deserves to be treated that way." className="bg-white">
        <div className="grid max-w-5xl gap-6 text-[17px] leading-relaxed text-ink-600 md:grid-cols-2">
          <p>
            The bond between a creator and the people who support them is worth something to both of them. Too often it
            gets reduced to a follower count and whatever an algorithm decides to show.
          </p>
          <p>
            We think content creation should be recognised as a profession, and that your body of work should keep
            opening doors for you long after you post it. Crevant is our attempt to build a place that treats it that
            way.
          </p>
        </div>
      </Section>

      {/* Pillars */}
      <Section id="pillars" eyebrow="What Crevant is for" title="Built around the relationship, not the scroll">
        <ul className="grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <li key={p.title} className="flex flex-col rounded-3xl bg-card p-6 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">{p.icon}</span>
                <StatusBadge status={p.status} />
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-ink-900">{p.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-600">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="Three steps, for everyone" className="bg-white">
        <p className="-mt-4 mb-8 max-w-2xl leading-relaxed text-ink-600">
          There's one kind of account. Anyone can create, follow and offer rewards, with no switching between modes.
        </p>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-3xl bg-paper p-6 ring-1 ring-ink-100">
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
      <Section id="who" eyebrow="Who it's for" title="Good for creators. Good for the people who show up.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-brand-700 p-7 text-white">
            <h3 className="font-display text-xl font-bold">For creators</h3>
            <ul className="mt-4 space-y-3 leading-relaxed text-brand-50">
              <li>Know who your real supporters are.</li>
              <li>Reward them on your terms.</li>
              <li>Help shape how creators earn here.</li>
            </ul>
          </div>
          <div className="rounded-3xl bg-card p-7 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
            <h3 className="font-display text-xl font-bold text-ink-900">For supporters</h3>
            <ul className="mt-4 space-y-3 leading-relaxed text-ink-600">
              <li>Follow creators and see their posts newest first.</li>
              <li>Get recognised for showing up.</li>
              <li>Unlock rewards from creators you care about.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Connection Points */}
      <Section id="points" eyebrow="Connection Points" title="Recognition you earn with each creator" className="bg-white">
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
      <Section id="pilot" eyebrow="The pilot" title="Starting small, and doing it carefully">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
            <p>
              Invited creators join first, then each creator invites the people who follow them. The 60 days begin when
              invited participants can actually use Crevant, not when this page goes live.
            </p>
            <p>
              We're also working on real, voluntary support from audiences to creators. It isn't available yet. Before
              anything involving money goes live, participants will hear from us first, with the full details.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
              <StatusBadge status="pilot" />
              <h3 className="mt-3 font-display text-base font-bold text-ink-900">What the pilot includes</h3>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-ink-600">
                {IN_PILOT.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
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
      <Section id="faq" eyebrow="Questions" title="The honest answers" className="bg-white">
        <div className="max-w-3xl divide-y divide-ink-100 rounded-3xl bg-paper ring-1 ring-ink-100">
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
      <section aria-labelledby="cta-title" className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl rounded-[32px] bg-ink-900 px-6 py-12 text-center sm:px-12">
          <h2 id="cta-title" className="mx-auto max-w-2xl font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[2.4rem]">
            Want to help shape Crevant?
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
