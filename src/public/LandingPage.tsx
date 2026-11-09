import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Info, Send } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { TOUR_BASE } from '../entry'
import { cardShadow, Section, StatusBadge, TourScreenshot } from './landing/shared'
import { DifferenceRail, EarningsContrast, FeedComparison, PlannedPanel } from './landing/visuals'

export { StatusBadge } from './landing/shared'

// Landing page V1: the founder-approved nine-section narrative.
//
// Rules (enforced by src/public/public-site.test.tsx):
//  * The approved copy is the source of truth. Headings and body text are used
//    as approved; longer passages may sit behind accessible expanders.
//  * Product images are genuine screenshots of the sample tour, always
//    labelled as sample data. The real app does not have these features yet,
//    so every feature claim carries "Being built for the pilot" or "Planned".
//    There is no creator-support screen anywhere, so 6.3 shows a Planned panel.
//  * Qualifications sit beside the claims they qualify, not only in Pilot
//    details: no promise of reach, views, engagement, earnings or rewards, and
//    Connection Points are never money.
//  * No forms and no personal data: the join pages only inform.

const DEMO_NOTE = 'A demonstration with sample data'

function Qualifier({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p data-testid={testId} className="mt-3 flex gap-2 text-[13px] leading-relaxed text-ink-500">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function ExploreButton({ variant = 'secondary' }: { variant?: 'secondary' | 'ghost-dark' }) {
  return (
    <div className="w-full min-[420px]:w-auto">
      <a
        href={TOUR_BASE}
        className={clsx(
          variant === 'secondary' ? buttonClass('secondary', 'lg') : clsx(buttonClass('ghost', 'lg'), 'text-white ring-1 ring-white/25 hover:bg-white/10'),
          'w-full min-[420px]:w-auto',
        )}
      >
        Explore Crevant
      </a>
      <p className={clsx('mt-1.5 text-center text-[13px]', variant === 'secondary' ? 'text-ink-500' : 'text-ink-400')}>{DEMO_NOTE}</p>
    </div>
  )
}

function JoinButton() {
  return (
    <a href="#founding" className={buttonClass('primary', 'lg')}>
      Join the Founding Community <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  )
}

// ---- 1. Hero ----------------------------------------------------------------

function Hero() {
  // Phones: headline, the one-line product explanation, the product preview,
  // then the actions, then the rest of the approved hero copy. Desktop keeps
  // the two-column layout (text left, phone right). Copy is unchanged; only
  // the order differs on small screens.
  return (
    <section id="hero" aria-labelledby="hero-title" className="overflow-hidden px-4 pb-12 pt-8 sm:px-6 sm:pt-16 lg:pb-20">
      <div className="mx-auto flex max-w-6xl flex-col lg:grid lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-x-10">
        <h1
          id="hero-title"
          className="order-1 font-display text-[2.15rem] lg:order-none font-extrabold leading-[1.04] tracking-[-0.035em] text-ink-900 min-[400px]:text-[2.45rem] sm:text-[3.4rem] lg:col-start-1 lg:text-[3.85rem]"
        >
          You earned the follow. <span className="text-brand-600">You deserve the reach.</span>
        </h1>
        <p data-hero="lead" className="order-4 mt-6 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg lg:order-none lg:col-start-1">
          You worked hard to build your audience. But what good is having thousands of followers if you can't consistently reach them?
        </p>
        <p data-hero="product" className="order-2 mt-4 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg lg:order-none lg:col-start-1">
          <strong className="font-semibold text-ink-900">Meet Crevant.</strong> A creator-first social network where the people who choose to follow
          you can see your content in their Following feed, so you can focus on building connections, earning trust and creating opportunities for
          sustainable income.
        </p>
        <p data-hero="profession" className="order-5 mt-4 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg lg:order-none lg:col-start-1">
          Because content creation should be more than a side hustle. It should have the potential to become a profession.
        </p>
        <div data-hero="actions" className="order-3 mt-6 lg:order-none lg:col-start-1">
          <div className="flex flex-col items-stretch gap-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-start">
            <JoinButton />
            <ExploreButton />
          </div>
          <p className="mt-4 max-w-xl text-sm italic leading-relaxed text-ink-500">An invitation-only platform being built for creators and their supporters.</p>
          <Qualifier testId="hero-note">
            Being built for the pilot. The Following feed shows posts from people you follow, newest first. It isn't a promise that each post reaches
            each follower.
          </Qualifier>
          <p className="mt-3 text-sm text-ink-500">
            Already invited?{' '}
            <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
              Sign in
            </Link>
          </p>
        </div>
        <div data-hero="preview" className="relative order-2 mt-6 lg:order-none lg:col-start-2 lg:row-span-5 lg:row-start-1 lg:mt-0">
          <div aria-hidden="true" className="absolute -inset-4 rounded-[48px] bg-gradient-to-br from-brand-100 via-paper to-spark-100 opacity-50 lg:-inset-6" />
          <TourScreenshot screen="feed" caption="The Following feed, newest first" priority className="relative max-w-[210px] sm:max-w-[240px] lg:max-w-[260px]" />
        </div>
      </div>
    </section>
  )
}

// ---- 2. Founder story -------------------------------------------------------

function Story() {
  return (
    <Section id="story" eyebrow="Why we started Crevant" title="My audience tripled. My income dropped by 60%." className="bg-white">
      <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <div className="flex items-center gap-4">
            <img
              src="/media/landing/founder.jpg"
              alt="Portrait of Crevant's founder"
              width={640}
              height={640}
              loading="lazy"
              decoding="async"
              className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-paper sm:h-24 sm:w-24"
            />
            <p className="text-sm font-semibold text-ink-700">From Crevant's founder</p>
          </div>
          <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-ink-600">
            <p>Two years ago, I made my wife a promise. I told her she'd be able to retire by her 40th birthday.</p>
            <p>There was just one problem. I had no idea how I was going to make that happen.</p>
          </div>
          <details data-testid="full-story" className="group mt-5 rounded-3xl bg-paper ring-1 ring-ink-100 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-ink-900">
              Read the full story
              <span aria-hidden="true" className="text-xl leading-none text-ink-400 transition group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <div className="space-y-4 px-5 pb-5 text-[17px] leading-relaxed text-ink-600">
              <p>So I decided to do something I'd been too afraid to try.</p>
              <p>I'd heard that consistency was the secret to success on YouTube. I made a commitment to post one video every single day for 365 days.</p>
              <p>For five months, almost nothing happened.</p>
              <p>Then suddenly, things changed.</p>
              <p>I reached 12,000 subscribers and finally got monetized. My first earnings were about $500.</p>
              <p>The following month, my subscribers tripled to 36,000.</p>
              <p>But instead of earning more, I earned about $200.</p>
              <p className="font-semibold text-ink-900">My audience had grown by 200%. My income had fallen by 60%.</p>
              <p>And that unpredictability continued.</p>
              <p>That's when I started asking myself a question:</p>
              <p className="font-semibold text-ink-900">What's the point of building an audience if you can't reliably reach the people who chose to follow you?</p>
              <p>I had done what creators are encouraged to do. I'd shown up consistently. I'd created content. I'd grown an audience.</p>
              <p>
                But I was beginning to realize that building an audience and having a reliable connection with that audience were two very different
                things.
              </p>
              <p>And I wasn't the only one experiencing this.</p>
            </div>
          </details>
        </div>
        <EarningsContrast />
      </div>
    </Section>
  )
}

// ---- 3. The problem ---------------------------------------------------------

function Problem() {
  return (
    <Section id="problem" eyebrow="The problem" title="You can have a million followers and still struggle to make a living.">
      <p className="max-w-2xl text-[17px] leading-relaxed text-ink-600">I started paying closer attention to other creators.</p>
      <ul className="mt-6 grid items-start gap-4 md:grid-cols-3">
        <li className={clsx('rounded-3xl bg-card p-6 leading-relaxed text-ink-600', cardShadow)}>
          I saw accounts with hundreds of thousands, even millions, of followers whose latest videos were getting a fraction of that number in views.
        </li>
        <li className={clsx('rounded-3xl bg-card p-6 leading-relaxed text-ink-600', cardShadow)}>
          I came across creators talking about having to return to regular jobs because they couldn't depend on their income from content creation.
        </li>
        <li className={clsx('space-y-3 rounded-3xl bg-card p-6 leading-relaxed text-ink-600', cardShadow)}>
          <p>And I noticed something else.</p>
          <p>Creators who started out sharing what they genuinely cared about were sometimes changing what they created just to stay visible.</p>
          <p className="font-semibold text-ink-800">Following trends. Copying what worked for others. Creating controversy to attract attention.</p>
          <p>Not necessarily because that's what they wanted to create, but because they felt that's what the algorithm would reward.</p>
        </li>
      </ul>
      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p className="font-display text-xl font-bold text-ink-900">Think about that.</p>
          <p>You spend years building an audience. People follow you because they want to hear from you.</p>
          <p>Yet every time you publish something, you're left wondering how many of them will actually see it.</p>
          <div data-testid="problem-questions" className="space-y-3 rounded-3xl border-l-4 border-spark-400 bg-spark-50 px-5 py-4">
            <p className="font-semibold text-ink-900">How do you build trust when you can't consistently connect with your audience?</p>
            <p className="font-semibold text-ink-900">How do you build a sustainable income when you can't predict whether the people who value your work will see it?</p>
            <p>And how can content creation become a respected profession if creators have so little control over how their work reaches their communities?</p>
          </div>
          <p className="font-semibold text-ink-900">We believe creators deserve a better opportunity.</p>
        </div>
        <FeedComparison />
      </div>
    </Section>
  )
}

// ---- 4. Why Crevant exists ---------------------------------------------------

function Why() {
  return (
    <Section id="why" eyebrow="Why Crevant exists" title="What if social media worked for the people creating the value?" className="bg-white">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <ul className="space-y-3">
          {[
            'What if you didn\'t have to constantly fight for the attention of people who already chose to follow you?',
            'What if creating something valuable mattered more than creating something controversial?',
            'What if you could focus on building genuine relationships instead of constantly chasing the next viral video?',
            'And what if those relationships could help you build a more predictable livelihood?',
          ].map((q) => (
            <li key={q} className="rounded-2xl bg-paper px-5 py-4 font-display text-lg font-bold leading-snug text-ink-800 ring-1 ring-ink-100">
              {q}
            </li>
          ))}
        </ul>
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p className="font-semibold text-ink-900">That's the future we're building with Crevant.</p>
          <p>A creator-first social network designed around a simple belief:</p>
          <blockquote className="rounded-3xl bg-brand-700 px-6 py-5 font-display text-xl font-bold leading-snug text-white">
            When someone chooses to follow you, your content should have a reliable place in their feed.
          </blockquote>
          <p>
            We're building Crevant to help creators connect with their audiences, strengthen trust, recognize loyal supporters and develop
            opportunities to earn from the value they create.
          </p>
          <p>Not by promising everyone fame or overnight success.</p>
          <p>But by creating a system where the work you put into building relationships has a better opportunity to compound over time.</p>
        </div>
      </div>
    </Section>
  )
}

// ---- 5. Who it's for ----------------------------------------------------------

const WHO: Array<{ title: string; body: string }> = [
  {
    title: "You've built an audience, but struggle to reach them.",
    body: 'You have people who chose to follow you, yet you never know how many will see your next post.',
  },
  {
    title: "You're creating valuable content, but the income doesn't reflect your effort.",
    body: "You spend hours researching, recording, editing and publishing, but you're still struggling to make content creation financially sustainable.",
  },
  {
    title: "You're tired of creating for the algorithm instead of your audience.",
    body: 'You want the freedom to be yourself, share what you believe in and create content that genuinely matters to the people following you.',
  },
  {
    title: 'You want to turn your side hustle into your profession.',
    body: "Maybe you're already earning something. Maybe you're just starting out. But your goal is to build something that can eventually support you and your family.",
  },
]

function Who() {
  return (
    <Section id="who" eyebrow="Who Crevant is for" title="For creators who want more than views.">
      <ul className="grid gap-4 sm:grid-cols-2">
        {WHO.map((w) => (
          <li key={w.title} className={clsx('rounded-3xl bg-card p-6', cardShadow)}>
            <h3 className="font-display text-lg font-bold leading-snug text-ink-900">{w.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-600">{w.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 font-display text-xl font-bold text-ink-900">If any of these sound familiar, we're building Crevant with people like you in mind.</p>
    </Section>
  )
}

// ---- 6. The Crevant difference -------------------------------------------------

function DifferenceBlock({
  n,
  title,
  status,
  visual,
  children,
}: {
  n: number
  title: string
  status: 'building' | 'planned'
  visual: ReactNode
  children: ReactNode
}) {
  return (
    <li id={`difference-${n}`} data-block={n} className="grid scroll-mt-24 gap-8 rounded-[32px] bg-white p-6 ring-1 ring-ink-100 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <StatusBadge status={status} />
        <h3 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.01em] text-ink-900">
          {n}. {title}
        </h3>
        <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-ink-600">{children}</div>
      </div>
      {visual}
    </li>
  )
}

function Difference() {
  return (
    <Section id="difference" eyebrow="The Crevant difference" title="You don't need a million followers. You need the right 1,000.">
      <Qualifier testId="thousand-note">Every creator's right number is different, and we can't promise what any community will earn.</Qualifier>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3 text-[17px] leading-relaxed text-ink-600">
          <p className="font-display text-xl font-bold text-ink-900">Imagine having 1,000 people who genuinely value what you create.</p>
          <p>People who want to hear from you.</p>
          <p>People who return because your content helps, teaches, entertains or inspires them.</p>
          <p>People who trust you enough to support your work.</p>
        </div>
        <div className="space-y-3 text-[17px] leading-relaxed text-ink-600">
          <p>Now imagine being able to consistently connect with those people without having to compete for their attention every time you publish.</p>
          <p className="font-semibold text-ink-900">That's what we're working toward with Crevant.</p>
          <DifferenceRail />
        </div>
      </div>
      <ol className="mt-10 space-y-6">
        <DifferenceBlock
          n={1}
          title="Reach the people who follow you."
          status="building"
          visual={<TourScreenshot screen="feedPosts" caption="Posts from creators you follow, newest first" className="max-w-[240px]" />}
        >
          <p>When someone follows you on Crevant, your new posts appear in their chronological Following feed.</p>
          <p>No engagement-based ranking deciding whether your content deserves a place there.</p>
          <p>Your followers decide whom they want to follow. We make it easier for them to find what those creators share.</p>
          <Qualifier testId="feed-note">
            Crevant is being designed so posts from people you follow appear newest first, without engagement-based ranking. It isn't a promise that
            each follower will open, view or engage with every post.
          </Qualifier>
        </DifferenceBlock>
        <DifferenceBlock
          n={2}
          title="Give your supporters a reason to keep coming back."
          status="building"
          visual={
            <div className="grid grid-cols-2 gap-3">
              <TourScreenshot screen="creator" caption="Connection Points with one creator" />
              <TourScreenshot screen="rewards" caption="That creator's rewards" />
            </div>
          }
        >
          <p>Building a community isn't just about getting people to follow you. It's about giving them a reason to stay connected.</p>
          <p>Crevant is developing Connection Points, a way to recognize supporters for participating with creators they care about.</p>
          <p>Creators can use these points to offer rewards that encourage meaningful participation and stronger relationships.</p>
          <Qualifier testId="points-note">
            Connection Points are not cash and have no guaranteed monetary value. Rewards depend on what each creator offers.
          </Qualifier>
        </DifferenceBlock>
        <DifferenceBlock n={3} title="Build relationships that can support your livelihood." status="planned" visual={<PlannedPanel />}>
          <p>Imagine having a community that doesn't just consume your content, but values it enough to support what you do.</p>
          <p>Crevant is developing ways for creators to receive support from their communities and explore sustainable earning opportunities.</p>
          <p>Because the goal isn't simply to help you become more popular.</p>
          <p className="font-semibold text-ink-900">It's to help you build something valuable enough to last.</p>
          <Qualifier testId="income-note">Sustainable income is our ambition for creators, not a promise. No payments are enabled during the pilot.</Qualifier>
        </DifferenceBlock>
      </ol>
    </Section>
  )
}

// ---- 7. For the fans ----------------------------------------------------------

function Fans() {
  return (
    <Section id="fans" eyebrow="For the fans" title="You're more than a follower. You're part of their success." className="bg-white">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="space-y-4 text-[17px] leading-relaxed text-ink-600">
          <p>Think about your favorite creator.</p>
          <p>Maybe they've taught you something that changed your life.</p>
          <p>Maybe their videos make you laugh after a difficult day.</p>
          <p>Or maybe they've helped you see possibilities you never considered before.</p>
          <p>You follow them because their content means something to you.</p>
          <p className="font-semibold text-ink-900">But what if your support could mean something more to them, too?</p>
          <div className="rounded-3xl bg-spark-50 p-5 ring-1 ring-spark-200">
            <StatusBadge status="building" />
            <p className="mt-3 font-display text-xl font-bold text-ink-900">On Crevant, your participation matters.</p>
            <p className="mt-2">Follow the creators you care about. Engage with their content. Build your connection with them.</p>
            <p className="mt-2">
              And through Connection Points, you can be recognized for your participation and work toward rewards those creators choose to offer.
            </p>
            <p data-testid="fans-points-note" className="mt-3 text-[14px] italic text-ink-600">
              Connection Points are not cash and have no guaranteed monetary value. Rewards depend on what each creator offers.
            </p>
            <Qualifier testId="fans-status">Shown in the sample tour. Not yet available to real members.</Qualifier>
          </div>
          <p>It's our way of helping creators appreciate the people who make their work possible.</p>
          <p>Because a strong creator community isn't built by creators alone.</p>
          <p className="font-display text-xl font-bold text-ink-900">It's built by the people who believe in them.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TourScreenshot screen="discover" caption="Discover creators to follow" />
          <TourScreenshot screen="myPoints" caption="Your points with each creator" />
        </div>
      </div>
    </Section>
  )
}

// ---- 8. How it works ------------------------------------------------------------

function How() {
  return (
    <Section id="how" eyebrow="How it works" title="Start building something that lasts.">
      <div className="max-w-2xl space-y-3 text-[17px] leading-relaxed text-ink-600">
        <p>You don't have to abandon the audience you've already built.</p>
        <p>Crevant is being designed to help you bring those relationships into a space where you can strengthen them.</p>
      </div>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        <li data-step={1} className={clsx('flex flex-col rounded-3xl bg-card p-6', cardShadow)}>
          <StatusBadge status="building" />
          <h3 className="mt-3 font-display text-lg font-bold text-ink-900">Step 1 — Create your profile.</h3>
          <p className="mt-2 leading-relaxed text-ink-600">Tell people who you are, what you create and why they should connect with you.</p>
          <TourScreenshot screen="profile" caption="A profile in the sample tour" className="mt-5 max-w-[190px]" />
        </li>
        <li data-step={2} className={clsx('flex flex-col rounded-3xl bg-card p-6', cardShadow)}>
          <StatusBadge status="planned" />
          <h3 className="mt-3 font-display text-lg font-bold text-ink-900">Step 2 — Invite your community.</h3>
          <p className="mt-2 leading-relaxed text-ink-600">Bring the people who already enjoy your content.</p>
          <p className="mt-2 leading-relaxed text-ink-600">Give them a reason to join you on Crevant, participate and build a stronger connection.</p>
          <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-ink-200 px-4 py-8 text-center text-[13px] text-ink-500">
            <Send aria-hidden="true" className="h-6 w-6" />
            <p className="mt-2">Creator invite links are planned and not built yet.</p>
          </div>
        </li>
        <li data-step={3} className={clsx('flex flex-col rounded-3xl bg-card p-6', cardShadow)}>
          <StatusBadge status="building" />
          <h3 className="mt-3 font-display text-lg font-bold text-ink-900">Step 3 — Create, connect and grow.</h3>
          <p className="mt-2 leading-relaxed text-ink-600">Publish content, engage with supporters and learn what your community values.</p>
          <p className="mt-2 leading-relaxed text-ink-600">
            As Crevant develops, explore new ways to recognize loyal supporters and build earning opportunities.
          </p>
          <TourScreenshot screen="post" caption="A post and its comments" className="mt-5 max-w-[190px]" />
        </li>
      </ol>
      <div className="mt-10 space-y-1 font-display text-xl font-bold text-ink-900">
        <p>Your content starts the conversation.</p>
        <p className="text-brand-700">Your relationships build the future.</p>
      </div>
      <div className="mt-6">
        <JoinButton />
      </div>
    </Section>
  )
}

// ---- 9. Founding community ---------------------------------------------------------

const PILOT_DETAILS: Array<{ title: string; body: string }> = [
  { title: 'Invitation-only pilot for adults 18 and older.', body: 'Invitations open once our privacy notice is published.' },
  { title: 'An intended 60-day testing period.', body: 'The 60 days begin when invited participants can actually use Crevant, not when this page goes live.' },
  {
    title: 'No real payments yet.',
    body: "No money changes hands on Crevant. Direct support from communities is planned. It isn't available yet. Before anything involving money goes live, participants will hear from us first.",
  },
  {
    title: 'No guaranteed income, views or engagement.',
    body: "The Following feed shows posts from people you follow, newest first. It isn't ranked by likes, comments or any engagement score, and we don't promise any particular reach.",
  },
  {
    title: 'Features are still being developed and tested.',
    body: 'The interactive tour is a demonstration with sample data, not the live product.',
  },
  {
    title: 'Connection Points are not money.',
    body: "They're not money. They can't be bought, sold, cashed out or moved to another creator, and they only work with the creator who gave them.",
  },
]

function Founding() {
  return (
    <section id="founding" aria-labelledby="founding-title" className="scroll-mt-20 px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl rounded-[36px] bg-ink-900 px-5 py-12 sm:px-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-spark-300">The founding community</p>
          <h2 id="founding-title" className="mt-2 font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[2.6rem]">
            The future of content creation should be built by creators.
          </h2>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-300">
            <p>We're not claiming to have figured everything out.</p>
            <p>
              We're building Crevant because we believe the current system leaves too many talented creators struggling to turn their work into a
              sustainable profession.
            </p>
            <p>And we believe there's a better way.</p>
            <p>But we don't want to build that future based only on our assumptions.</p>
            <p className="font-semibold text-white">We want to build it with the people who will actually use it.</p>
            <p>That's why we're starting with a small, invitation-only community of creators and supporters.</p>
            <p>People who are willing to test new ideas, share honest feedback and help shape a platform designed around meaningful connections.</p>
            <p>
              If you've ever felt that the value you create deserves a better opportunity to become something sustainable, we'd love to build this
              with you.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link to="/join/creator" className={clsx(buttonClass('spark', 'lg'), 'h-auto! min-h-12 w-full min-w-0 whitespace-normal! py-3 text-center')}>
              Learn About the Creator Pilot
            </Link>
            <Link to="/join/supporter" className={clsx(buttonClass('ghost', 'lg'), 'h-auto! min-h-12 w-full min-w-0 whitespace-normal! py-3 text-center text-white ring-1 ring-white/30 hover:bg-white/10')}>
              Learn About Joining as a Supporter
            </Link>
          </div>
          <p className="mt-5 text-sm italic leading-relaxed text-ink-400">
            Limited pilot access. We're testing and improving the experience together. Participation does not guarantee earnings or rewards.
          </p>
          <details id="pilot-details" className="group mt-6 rounded-3xl bg-white/[0.06] ring-1 ring-white/10 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-white">
              Pilot details
              <span aria-hidden="true" className="text-xl leading-none text-ink-400 transition group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <ul className="space-y-3 px-5 pb-5 text-[15px] leading-relaxed text-ink-300">
              {PILOT_DETAILS.map((d) => (
                <li key={d.title}>
                  <span className="font-semibold text-white">{d.title}</span> {d.body}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  // Links such as /#founding from other pages: scroll to the section once rendered.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (el) el.scrollIntoView()
  }, [hash])

  return (
    <>
      <Hero />
      <Story />
      <Problem />
      <Why />
      <Who />
      <Difference />
      <Fans />
      <How />
      <Founding />
    </>
  )
}
