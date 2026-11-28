import clsx from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, ChevronUp, Compass, PlayCircle } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import type { GoalAudience, Me, MyDetails, MyPoints, MyProgress, ProgressJourney, Topic } from './api'
import { useAppApi, useMyProfile } from './AppApiContext'
import { useLoad } from './components'
import { openSteps, useProgressContext } from './journey'
import { GoalRing, StatusPill, goalText, journeyProgress } from './progression'
import { tourSeen, markTourSeen, useTour } from './tour'

/**
 * Getting started and your goals (unified guidance, Nov 28).
 *
 * One compact component at the top of Home holds both: the getting-started
 * checklist, ticked off only from what the server reports, and a summary of
 * both qualification journeys. The member can minimize it to one line that
 * still shows their goal progress, and expand it again at any time; nothing
 * is hidden for good. Qualification progress never waits for the checklist,
 * and nobody has to publish to pursue the supporter journey: the first post is
 * optional. Once every required step is done, the checklist retires from Home
 * and stays under Profile, Help & getting started. Minimized and tour state are
 * remembered on this device only (approved for the MVP).
 */

export type GuideStep = { key: string; title: string; body: string; to?: string; cta?: string; done: boolean; optional?: boolean }

export function gettingStartedSteps(input: {
  interest: { slug: string; label: string } | null
  followingCount: number
  cliqueCount: number
  postCount: number
  contributed: boolean | null
  profileDone: boolean | null
  cliqueTarget?: number | null
}): GuideStep[] {
  const { interest, followingCount, cliqueCount, postCount, contributed, profileDone, cliqueTarget } = input
  const steps: GuideStep[] = [
    {
      key: 'follow',
      title: 'Follow 3 people you value',
      body: interest
        ? `Start with people who post about ${interest.label}. Their new posts appear on Home, newest first. Nobody is added for you.`
        : 'Their new posts appear on Home, newest first. Nobody is added for you.',
      to: interest ? `/app/discover?face=creators&interest=${encodeURIComponent(interest.slug)}` : '/app/discover?face=creators',
      cta: interest ? `Discover ${interest.label}` : 'Discover people',
      done: followingCount >= 3,
    },
    {
      key: 'clique',
      title: 'Add a creator to your Clique',
      body: `Following someone doesn’t add them to your Clique: you choose who’s closest, and their posts come first.${
        cliqueTarget ? ` Your supporter goal counts ${cliqueTarget} creators in your Clique; this is the first.` : ''
      }`,
      to: '/app/clique',
      cta: 'Your Clique',
      done: cliqueCount > 0,
    },
  ]
  if (contributed !== null)
    steps.push({
      key: 'support',
      title: 'Support a post you value',
      body: 'Leave a thoughtful comment, save it or share it. It helps the creator grow, and it is recognized in My Split.',
      to: '/app/discover',
      cta: 'Find a post',
      done: contributed,
    })
  steps.push({
    key: 'post',
    title: 'Publish your first post',
    body: 'Optional: supporter goals never need a post. Creator goals start here, and your followers can find it on their Home.',
    to: '/app/new',
    cta: 'Create a post',
    done: postCount > 0,
    optional: true,
  })
  if (profileDone !== null)
    steps.push({
      key: 'profile',
      title: 'Complete your profile',
      body: 'Add a short bio or your interests, so people know what you post about and Discover can suggest the right people.',
      to: '/app/profile?edit=1',
      cta: 'Edit profile',
      done: profileDone,
    })
  return steps
}

/** Whether the checklist is finished: every step that isn't optional is done. */
export function checklistComplete(steps: GuideStep[]) {
  return steps.every((s) => s.done || s.optional)
}

/** The checklist as the server sees the member now. Undefined while loading. */
export function useGettingStarted(): GuideStep[] | undefined {
  const api = useAppApi()
  const ctx = useProgressContext()
  const me = useLoad<Me>(() => api.me(), [api])
  const details = useLoad<MyDetails | null>(() => api.myDetails().catch(() => null), [api])
  const points = useLoad<MyPoints | null>(() => api.myPoints().catch(() => null), [api])
  const topics = useLoad<Topic[]>(async () => (await api.topics().catch(() => null)) ?? [], [api])
  if (!me.data || details.data === undefined || points.data === undefined) return undefined
  const slug = details.data?.topics[0]
  const label = slug ? topics.data?.find((t) => t.slug === slug)?.label : undefined
  const p = ctx?.progress
  const cliqueTarget = p && p.enabled ? (p.consumer.steps.find((s) => s.metric === 'clique_creators')?.target ?? null) : null
  return gettingStartedSteps({
    interest: slug && label ? { slug, label } : null,
    followingCount: me.data.followingCount,
    cliqueCount: me.data.cliqueCount,
    postCount: me.data.postCount,
    contributed: points.data ? points.data.recognized + points.data.redeemableApproved + points.data.redeemablePending > 0 : null,
    profileDone: details.data ? Boolean(details.data.bio?.trim()) || details.data.topics.length > 0 : null,
    cliqueTarget,
  })
}

function guideKey(id: string) {
  return `splitpost.guide.${id}`
}

function readMinimized(id: string) {
  try {
    const v = window.localStorage.getItem(guideKey(id))
    if (v) return v === 'min'
    // Members who hid the old first steps or goal strip start minimized, never hidden.
    return window.localStorage.getItem(`splitpost.first-steps.${id}`) === 'hidden' || window.localStorage.getItem(`splitpost.goalstrip.${id}`) !== null
  } catch {
    return false
  }
}

const TITLE: Record<GoalAudience, string> = { consumer: 'Supporter goals', creator: 'Creator goals' }
const SHORT: Record<GoalAudience, string> = { consumer: 'Supporter', creator: 'Creator' }

function journeyLine(j: ProgressJourney): string {
  const { set, next } = journeyProgress(j)
  if (j.status === 'under_review') return 'All 5 met. Eligibility review in progress; nothing unlocks until it’s approved.'
  if (j.status === 'qualified') return 'Qualified after review.'
  if (j.status === 'eligibility_paused') return 'Qualified. Release is paused while a review is in place.'
  if (j.status === 'revoked') return 'Qualification revoked. See My Split.'
  if (!set) return 'Goals are not set yet.'
  const open = openSteps(j)[0]
  const step = next && next.target !== null ? next : open
  return step && step.target !== null ? `Next: ${goalText(step.metric).label.replace(/ \(last 28 days\)/, '').toLowerCase()} · ${Math.min(step.value, step.target)} of ${step.target}` : 'Every goal met. A review starts next.'
}

function JourneyRow({ audience, journey }: { audience: GoalAudience; journey: ProgressJourney }) {
  const { set, done, total } = journeyProgress(journey)
  return (
    <li>
      <Link to="/app/split#goals" className="flex items-center gap-3 rounded-2xl px-1 py-1.5 hover:bg-ink-50" data-testid={`guide-journey-${audience}`}>
        <GoalRing done={set ? done : 0} total={total || 5} size={40} tone={audience === 'creator' ? 'brand' : 'green'} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[14px] font-bold text-ink-900">{TITLE[audience]}</span>
            <StatusPill status={journey.status} />
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-600">{journeyLine(journey)}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
      </Link>
    </li>
  )
}

/** The checklist itself, shared by Home and Help & getting started. */
export function Checklist({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="space-y-3" data-testid="getting-started-steps">
      {steps.map((step, i) => (
        <li key={step.key} className="flex gap-3" data-done={step.done ? 'true' : 'false'} data-testid={`guide-step-${step.key}`}>
          <span
            className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', step.done ? 'bg-[#0f7a64] text-white' : 'bg-brand-50 text-brand-700')}
            aria-hidden="true"
          >
            {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
          </span>
          <div className="min-w-0">
            <p className={clsx('font-semibold', step.done ? 'text-ink-500 line-through' : 'text-ink-900')}>
              {step.title}
              {step.optional && !step.done && <span className="ml-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-700 no-underline">Optional</span>}
              {step.done && <span className="sr-only"> (done)</span>}
            </p>
            {!step.done && <p className="text-sm text-ink-600">{step.body}</p>}
            {!step.done && step.to && step.cta && (
              <Link to={step.to} className="mt-1 inline-block text-sm font-semibold text-brand-700 underline">
                {step.cta}
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-[#efe9de]" aria-hidden="true">
      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${total > 0 ? Math.round((100 * done) / total) : 0}%` }} />
    </span>
  )
}

/** Offered once, inside the guide (never a card of its own): the optional tour of the five destinations. */
function TourOffer() {
  const { profile } = useMyProfile()
  const tour = useTour()
  const [seen, setSeen] = useState(() => tourSeen(profile.id))
  if (seen || !tour) return null
  return (
    <div className="mt-4 rounded-2xl bg-brand-50 px-3 py-2.5 text-[13.5px] text-brand-900" data-testid="tour-offer">
      <p>New here? A 30-second tour of the five places in the app.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          markTourSeen(profile.id)
          setSeen(true)
          tour.start()
        }}
        className={buttonClass('primary', 'sm')}
      >
        Take the tour
      </button>
      <button
        type="button"
        onClick={() => {
          markTourSeen(profile.id)
          setSeen(true)
        }}
        className={buttonClass('ghost', 'sm')}
      >
        Not now
      </button>
      </div>
    </div>
  )
}

/** Home: getting started and both journeys, in one compact component that minimizes to one line. */
export function HomeGuide() {
  const { profile } = useMyProfile()
  const steps = useGettingStarted()
  const progress = useProgressContext()?.progress
  const [minimized, setMinimized] = useState(() => readMinimized(profile.id))
  if (!steps) return null
  const enabled: Extract<MyProgress, { enabled: true }> | null = progress && progress.enabled ? progress : null
  const complete = checklistComplete(steps)
  const doneCount = steps.filter((s) => s.done).length
  if (complete && !enabled) return null
  function set(min: boolean) {
    try {
      window.localStorage.setItem(guideKey(profile.id), min ? 'min' : 'open')
    } catch {
      // Remembered for this visit only.
    }
    setMinimized(min)
  }
  const journeys: Array<[GoalAudience, ProgressJourney]> = enabled
    ? [
        ['consumer', enabled.consumer],
        ['creator', enabled.creator],
      ]
    : []
  if (minimized)
    return (
      <section className="mb-4" aria-label={complete ? 'Your goals' : 'Getting started and your goals'} data-testid="home-guide" data-state="minimized">
        <button
          type="button"
          onClick={() => set(false)}
          aria-expanded={false}
          className="flex w-full items-center gap-3 rounded-full bg-white px-4 py-2.5 text-left shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]"
        >
          <span className="line-clamp-2 min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-ink-900">
            {!complete && `Getting started ${doneCount} of ${steps.length}`}
            {!complete && journeys.length > 0 && ' · '}
            {journeys
              .map(([a, j]) => {
                const { done, total } = journeyProgress(j)
                return j.status === 'in_progress' ? `${SHORT[a]} ${done}/${total}` : `${SHORT[a]}: ${j.status === 'under_review' ? 'under review' : j.status === 'qualified' ? 'qualified' : 'see My Split'}`
              })
              .join(' · ')}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-700">
            Show <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
      </section>
    )
  return (
    <section className="mb-4" aria-labelledby="home-guide-title" data-testid="home-guide" data-state="open">
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="home-guide-title" className="font-display text-lg font-bold text-ink-900">
              {complete ? 'Your goals' : 'Getting started'}
            </h2>
            {!complete && (
              <>
                <p className="mt-0.5 text-[13px] text-ink-600">
                  {doneCount} of {steps.length} done. Ticked off from what you actually do.
                </p>
                <div className="mt-2">
                  <Bar done={doneCount} total={steps.length} />
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={() => set(true)} aria-expanded={true} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-ink-600 hover:text-ink-900">
            Minimize <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {!complete && (
          <div className="mt-4">
            <Checklist steps={steps} />
          </div>
        )}
        {journeys.length > 0 && (
          <div className={complete ? 'mt-2' : 'mt-4 border-t border-ink-100 pt-3'}>
            {!complete && <h3 className="mb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-600">Your goals</h3>}
            <ul className="space-y-1">
              {journeys.map(([a, j]) => (
                <JourneyRow key={a} audience={a} journey={j} />
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-ink-600">Pursue either or both. Supporter goals never need a post.</p>
          </div>
        )}
        {!complete && <TourOffer />}
      </Card>
    </section>
  )
}

/** Profile, Help & getting started: the checklist (kept after it leaves Home), the tour and the five welcome screens. */
export function HelpPage() {
  const steps = useGettingStarted()
  const tour = useTour()
  const done = steps ? steps.filter((s) => s.done).length : 0
  return (
    <>
      <Link to="/app/profile" className="mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-brand-700">
        <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" /> Your profile
      </Link>
      <PageHeader title="Help & getting started" subtitle="Your first steps, a quick tour of the app, and how Splitpost works." />
      <section aria-labelledby="help-steps" data-testid="help-getting-started">
        <Card className="p-5">
          <h2 id="help-steps" className="font-display text-lg font-bold text-ink-900">
            Getting started
          </h2>
          {!steps ? (
            <p className="mt-2 text-sm text-ink-600">Loading your first steps…</p>
          ) : (
            <>
              <p className="mt-0.5 text-[13px] text-ink-600">
                {checklistComplete(steps) ? 'All done. Well done.' : `${done} of ${steps.length} done.`}
              </p>
              <div className="mt-2">
                <Bar done={done} total={steps.length} />
              </div>
              <div className="mt-4">
                <Checklist steps={steps} />
              </div>
            </>
          )}
        </Card>
      </section>
      <Card className="mt-4 divide-y divide-ink-100 p-0">
        {tour && (
          <button type="button" onClick={() => tour.start()} className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50" data-testid="help-tour">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink-900">Take the app tour</span>
              <span className="block text-[13px] text-ink-600">Five stops, about 30 seconds.</span>
            </span>
            <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
          </button>
        )}
        <Link to="/app/welcome" className="flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-ink-50" data-testid="help-welcome">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <PlayCircle className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink-900">How Splitpost works</span>
            <span className="block text-[13px] text-ink-600">The five welcome screens.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
        </Link>
      </Card>
    </>
  )
}
