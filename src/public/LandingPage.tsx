import clsx from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Info } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { cardShadow, Section, StatusBadge, TourScreenshot } from './landing/shared'
import { Hero } from './landing/sections/Hero'
import { Problem } from './landing/sections/Problem'
import { Solution } from './landing/sections/Solution'
import { DifferenceRail } from './landing/visuals'
import { BringYourAudience, EarlyDoor, FanJourney, PlannedPanel, RightThousand, ShapeSketch } from './landing/illustrations'

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
//  * No forms and no personal data yet: the waitlist pages only inform until
//    the privacy notice is published. Joining the waitlist never secures a
//    place in the pilot; invitations go out in small groups.

function Qualifier({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p data-testid={testId} className="mt-3 flex gap-2 text-[13px] leading-relaxed text-ink-500">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export const WAITLIST_LABEL = 'Join the Waitlist'

function JoinButton() {
  return (
    <a href="#founding" className={buttonClass('primary', 'lg')}>
      {WAITLIST_LABEL} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  )
}

/** A Join the Waitlist link placed where interest peaks. */
function WaitlistLink() {
  return (
    <div data-cta="waitlist" className="mt-10 flex flex-col items-start gap-2">
      <Link to="/join" className={clsx(buttonClass('primary', 'lg'), 'h-auto! min-h-12 max-w-full whitespace-normal! py-3 text-center')}>
        {WAITLIST_LABEL} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <p className="text-[13px] text-ink-500">Joining the waitlist doesn't secure a place in the pilot. We invite people in small groups.</p>
    </div>
  )
}

/**
 * Phones only: a slim Join the Waitlist bar once the hero has scrolled away,
 * hidden again as soon as the founding section comes into view.
 */
function MobileWaitlistBar() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const hero = document.getElementById('hero')
      const founding = document.getElementById('founding')
      if (!hero || !founding) return
      const pastHero = hero.getBoundingClientRect().bottom < 0
      const beforeFounding = founding.getBoundingClientRect().top > window.innerHeight
      setShow(pastHero && beforeFounding)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div
      data-testid="mobile-waitlist-bar"
      aria-hidden={!show}
      className={clsx(
        'fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-paper/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md transition-transform motion-reduce:transition-none md:hidden',
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <a href="#founding" tabIndex={show ? 0 : -1} className={clsx(buttonClass('primary', 'md'), 'w-full')}>
        {WAITLIST_LABEL} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  )
}

// ---- 1. Hero: src/public/landing/sections/Hero.tsx (Splitpost, PR 2) ----------

// ---- 2 and 3. The problem, and POST. SUPPORT. SPLIT. (Splitpost, PR 3): ----
// src/public/landing/sections/Problem.tsx and Solution.tsx

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
    // Phones show the visual first; desktop alternates sides (even blocks put the visual on the left).
    <li
      id={`difference-${n}`}
      data-block={n}
      className={clsx(
        'grid scroll-mt-24 gap-8 rounded-[32px] bg-white p-6 ring-1 ring-ink-100 sm:p-8 lg:items-center',
        n % 2 === 0 ? 'lg:grid-cols-[0.9fr_1.1fr]' : 'lg:grid-cols-[1.1fr_0.9fr]',
      )}
    >
      <div className={clsx('min-w-0', n % 2 === 0 && 'lg:order-last')}>
        <StatusBadge status={status} />
        <h3 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-[-0.01em] text-ink-900">
          {n}. {title}
        </h3>
        <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-ink-600">{children}</div>
      </div>
      <div className="order-first min-w-0 lg:order-none">{visual}</div>
    </li>
  )
}

function Difference() {
  return (
    <Section id="difference" eyebrow="The Crevant difference" title="You don't need a million followers. You need the right 1,000.">
      <Qualifier testId="thousand-note">Every creator's right number is different, and we can't promise what any community will earn.</Qualifier>
      <div className="mt-8">
        <RightThousand />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
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
              <TourScreenshot screen="creator" caption="Connection Points with one creator" callout={{ text: '10 CP with Amara', top: '12%' }} />
              <TourScreenshot screen="rewards" caption="That creator's rewards" callout={{ text: 'Only CP earned with Amara counts here.', top: '40%' }} />
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
      <WaitlistLink />
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
        <TourScreenshot screen="discover" caption="Discover creators to follow" className="max-w-[260px] lg:mt-6" />
      </div>
      <div className="mt-10">
        <FanJourney />
      </div>
      <WaitlistLink />
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
          <BringYourAudience />
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
  {
    title: 'Invitation-only pilot for adults 18 and older.',
    body: "The waitlist opens once our privacy notice is published. Joining it doesn't secure a place: we invite people in small groups.",
  },
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
          <div data-testid="founder-signoff" className="mt-6 flex items-center gap-3">
            <img src="/media/landing/founder.jpg" alt="" width={640} height={640} loading="lazy" decoding="async" className="h-12 w-12 rounded-full object-cover ring-2 ring-white/20" />
            <p className="font-display text-base font-bold text-white">Muyiwa Omosa, Founder of Crevant.</p>
          </div>
          <ul data-testid="founding-opportunities" className="mt-8 grid gap-3 sm:grid-cols-2">
            <li className="flex flex-col gap-3 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10">
              <EarlyDoor />
              <div>
                <p className="font-display text-lg font-bold text-white">Experience Crevant early.</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-300">
                  Be among the first to use Crevant while it's being built, and see what a creator-first social network feels like.
                </p>
              </div>
            </li>
            <li className="flex flex-col gap-3 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10">
              <ShapeSketch />
              <div>
                <p className="font-display text-lg font-bold text-white">Help shape its future.</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-300">
                  Test new ideas, tell us what works and what doesn't, and help decide what Crevant becomes.
                </p>
              </div>
            </li>
          </ul>
          <div className="mt-8">
            <Link to="/join" className={clsx(buttonClass('spark', 'lg'), 'h-auto! min-h-12 w-full min-w-0 whitespace-normal! py-3 text-center sm:w-auto')}>
              {WAITLIST_LABEL} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-5 text-sm italic leading-relaxed text-ink-400">
            Joining the waitlist doesn't secure a place in the pilot. We invite people in small groups and improve the experience together.
            Participation does not guarantee earnings or rewards.
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
      <Problem />
      <Solution />
      <Difference />
      <Fans />
      <How />
      <Founding />
      <MobileWaitlistBar />
    </>
  )
}
