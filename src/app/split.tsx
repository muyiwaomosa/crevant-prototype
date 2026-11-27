import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, Lock, Share2 } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { FaceView } from '../components/FaceView'
import { MySplitIcon } from '../components/MySplitIcon'
import { Message } from '../public/auth/AuthUi'
import { AppApiError, messageFor, type EarningsByState, type MyProgress, type MyPoints, type PointsEntry, type ReferralReview, type RewardsOverview } from './api'
import { Link } from 'react-router-dom'
import { useFeedbackAccess } from './feedback'
import { useAppApi, useMyProfile } from './AppApiContext'
import { ContributionInsight } from './insights'
import { MySplitIntro } from './onboarding'
import { EarningsRow, GoalRing, NEXT_ACTION, ProgressCards, creatorJourneyShown, goalText, journeyProgress, useMyProgress } from './progression'

/**
 * My Split (SP-DESIGN-002). IP-1 delivers the destination, its three faces and
 * the member's personal referral link. Connection Points, the simulated fan
 * pool and contribution history arrive with the rewards work package; until
 * then each face says plainly what will appear there and makes no claims.
 */
export function MySplitPage() {
  return (
    <>
      <PageHeader title="My Split" subtitle="What you've built, what's next, and how you got here. Every amount is simulated during the pilot." />
      <FaceView
        label="My Split views"
        faces={[
          { key: 'split', label: 'My Split', content: <SplitFace /> },
          { key: 'goals', label: 'My Goals', content: <GoalsFace /> },
          { key: 'activity', label: 'My Activity', content: <ActivityFace /> },
        ]}
      />
    </>
  )
}

/** Cents as dollars, for simulated values only. */
export function simulatedDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function SimulatedTag() {
  return <span className="ml-1.5 rounded-full bg-[#e7f4f1] px-2 py-0.5 text-[11px] font-bold text-[#1f5e52]">Simulated</span>
}

function useMyPoints() {
  const api = useAppApi()
  const [points, setPoints] = useState<MyPoints | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.myPoints().then(
      (p) => live && setPoints(p),
      () => live && setPoints(null),
    )
    return () => {
      live = false
    }
  }, [api])
  return points
}

function FounderReviewLink() {
  const { founder } = useFeedbackAccess()
  if (!founder) return null
  return (
    <Link to="/app/split/review" className={buttonClass('secondary', 'sm')}>
      Founder: review referrals and rewards
    </Link>
  )
}

function Disclosure() {
  return (
    <p className="rounded-xl bg-[#e7f4f1] px-3 py-2 text-[13px] text-[#1f5e52]" data-testid="split-disclosure">
      During the pilot all rewards and values are simulated. Connection Points have no cash value and nothing is paid out.
    </p>
  )
}

/** One dismissible first-use tip (UX-05). "Got it" hides it on this device. */
export function FirstUseTip({ id, children }: { id: string; children: React.ReactNode }) {
  const key = `splitpost.tip.${id}`
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(key) !== 'seen'
    } catch {
      return true
    }
  })
  if (!open) return null
  return (
    <div className="rounded-2xl border-2 border-brand-100 bg-white p-4" data-testid={`tip-${id}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">New here</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-800">{children}</p>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(key, 'seen')
            } catch {
              // A tip that comes back next time is fine.
            }
            setOpen(false)
          }}
          className={buttonClass('secondary', 'sm')}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Face 1: My Split, what I have (UX-04).

function SplitFace() {
  const points = useMyPoints()
  const progress = useMyProgress()
  if (progress === undefined) return <p className="text-sm text-ink-600">Loading your split…</p>
  if (!progress?.enabled) return <PointsOverview points={points} />
  const e = progress.earnings
  return (
    <div className="space-y-4" data-testid="split-progression">
      <FirstUseTip id="split">
        This is your split: what you've accumulated so far, simulated during the pilot. Locked amounts unlock when you reach your goals under My Goals.
      </FirstUseTip>
      <SplitHero creator={e.creator} supporter={e.consumer} />
      <details className="group rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]" data-testid="split-explain">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-bold text-brand-700">
          What do these mean? <ChevronDown className="h-4 w-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <dl className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-ink-700">
          <div>
            <dt className="inline font-semibold text-ink-900">Your split </dt>
            <dd className="inline">
              is everything you've accumulated on Splitpost: as a creator, from ads shown with your posts, and as a supporter, for helping creators grow.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-ink-900">Locked </dt>
            <dd className="inline">is accumulated but held until you reach your goals for that journey.</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-ink-900">Unlocked </dt>
            <dd className="inline">is available to you once your goals are met and checked.</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-ink-900">Settled </dt>
            <dd className="inline">is what a monthly statement has closed.</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-ink-900">Simulated </dt>
            <dd className="inline">means these are practice amounts for the pilot. Points are not money and nothing is paid.</dd>
          </div>
        </dl>
        <h3 className="mt-4 text-[13px] font-bold text-ink-900">The breakdown</h3>
        {creatorJourneyShown(progress) && (
          <div>
            <p className="mt-2 text-[12.5px] font-semibold text-ink-700">As a creator</p>
            <EarningsRow e={e.creator} testId="earnings-creator" />
          </div>
        )}
        <div>
          <p className="mt-2 text-[12.5px] font-semibold text-ink-700">As a supporter</p>
          <EarningsRow e={e.consumer} testId="earnings-consumer" estimatedCents={points?.simulatedValueCents} />
        </div>
        {(e.creator.lockedCents > 0 || e.consumer.lockedCents > 0) && (
          <p className="mt-2 text-[12px] text-ink-600">
            Your legitimate allocated rewards remain attributed to you until you qualify, subject to applicable integrity and adjustment rules. All pilot
            amounts are simulated.
          </p>
        )}
      </details>
      <NextForYou progress={progress} />
      <Disclosure />
      <FounderReviewLink />
    </div>
  )
}

function SplitHero({ creator, supporter }: { creator: EarningsByState; supporter: EarningsByState }) {
  const total = creator.accumulatedCents + supporter.accumulatedCents
  const unlocked = creator.eligibleCents + creator.settledCents + supporter.eligibleCents + supporter.settledCents
  const locked = Math.max(0, total - unlocked)
  const share = total > 0 ? Math.round((unlocked / total) * 100) : 0
  return (
    <section className="rounded-[26px] bg-brand-600 p-5 text-white shadow-[0_18px_30px_-20px_rgba(23,47,112,0.8)]" aria-labelledby="split-total-label" data-testid="split-hero">
      <div className="flex items-center justify-between gap-3">
        <span id="split-total-label" className="flex items-center gap-2 text-[13px] font-semibold text-[#d3def3]">
          <MySplitIcon className="h-5 w-5" strokeWidth={2.2} /> Your split so far
        </span>
        <span className="rounded-full bg-[#e7f4f1] px-2.5 py-0.5 text-[11px] font-bold text-[#1f5e52]">Simulated</span>
      </div>
      <p className="mt-1 font-display text-[44px] font-extrabold leading-none tracking-tight tabular-nums" data-testid="split-total">
        {simulatedDollars(total)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/10 px-3 py-2.5">
          <dt className="text-[12px] text-[#d3def3]">As a creator</dt>
          <dd className="font-display text-[21px] font-extrabold tabular-nums">{simulatedDollars(creator.accumulatedCents)}</dd>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2.5">
          <dt className="text-[12px] text-[#d3def3]">As a supporter</dt>
          <dd className="font-display text-[21px] font-extrabold tabular-nums">{simulatedDollars(supporter.accumulatedCents)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
        <div className="bg-[#a8d9cf]" style={{ width: `${share}%` }} />
        <div className="bg-[#f6b888]" style={{ width: `${total > 0 ? 100 - share : 0}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between text-[12px] font-semibold">
        <span>Unlocked {simulatedDollars(unlocked)}</span>
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden="true" /> Locked {simulatedDollars(locked)}
        </span>
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#e7edf9]">
        {total === 0
          ? 'Nothing yet. Your split grows as you post and as you support the creators you value. Start with the next step below.'
          : 'Locked amounts are held until you reach your goals. Reach them and they unlock. During the pilot every amount is simulated and nothing is paid.'}
      </p>
    </section>
  )
}

/** The nearest open goal and one action (UX-03): the journey closest to done first. */
function NextForYou({ progress }: { progress: Extract<MyProgress, { enabled: true }> }) {
  const journeys = ([
    ['creator', 'Creator goals', progress.creator, progress.earnings.creator],
    ['consumer', 'Supporter goals', progress.consumer, progress.earnings.consumer],
  ] as const)
    .filter(([a]) => a === 'consumer' || creatorJourneyShown(progress))
    .map(([audience, title, j, e]) => ({ audience, title, j, e, ...journeyProgress(j) }))
  const open = journeys
    .filter((x) => x.j.status === 'in_progress' && x.set && x.next)
    .sort((a, b) => b.done / b.total - a.done / a.total)[0]
  const review = journeys.find((x) => x.j.status === 'under_review')
  return (
    <section aria-labelledby="next-for-you" data-testid="next-for-you">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="next-for-you" className="font-display text-[17px] font-extrabold text-ink-900">
          Next for you
        </h2>
        <Link to="/app/split?face=goals" className="text-[13px] font-semibold text-brand-700">
          All goals
        </Link>
      </div>
      <Card className="p-4">
        {open && open.next ? (
          <>
            <div className="flex items-center gap-3">
              <GoalRing done={open.done} total={open.total} tone={open.audience === 'creator' ? 'brand' : 'green'} />
              <div className="min-w-0">
                <p className="font-bold text-ink-900">{open.title}</p>
                <p className="text-[12.5px] text-ink-600">
                  {open.done} of {open.total} done.
                  {open.e.lockedCents + open.e.pausedCents > 0 ? ` Unlocks ${simulatedDollars(open.e.lockedCents + open.e.pausedCents)} (simulated).` : ''}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#fef4ec] px-3 py-2.5">
              <span className="text-[13.5px] font-semibold text-[#5a2a0b]">
                {goalText(open.next.metric).label}: {Math.min(open.next.value, open.next.target ?? 0)} of {open.next.target}
              </span>
              {NEXT_ACTION[open.next.metric] && (
                <Link to={NEXT_ACTION[open.next.metric].to} className={buttonClass('primary', 'sm')}>
                  {NEXT_ACTION[open.next.metric].label}
                </Link>
              )}
            </div>
          </>
        ) : review ? (
          <p className="text-[14px] text-ink-800">You've met every {review.audience === 'creator' ? 'creator' : 'supporter'} goal. We're checking it, then it unlocks.</p>
        ) : (
          <p className="text-[14px] text-ink-800">You're up to date. Keep supporting the creators you value; My Goals shows where you stand.</p>
        )}
      </Card>
    </section>
  )
}

/** While progression is off: Connection Points and the simulated estimate, as before. */
function PointsOverview({ points }: { points: MyPoints | null | undefined }) {
  return (
    <div className="space-y-4">
      <ContributionInsight />
      <Card className="overflow-hidden p-0">
        <div className="bg-brand-600 p-5 text-white">
          <div className="flex items-center gap-3">
            <MySplitIcon className="h-8 w-8" strokeWidth={2} />
            <h2 className="font-display text-[22px] font-extrabold">Your contribution, made visible</h2>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-[#d3def3]">
            Connection Points recognize how you help creators grow: thoughtful comments, saves, reposts, shares, and inviting people who go on to follow a creator.
          </p>
        </div>
        <div className="space-y-3 p-5 text-[14px] leading-relaxed text-ink-700">
          {points === undefined && <p>Loading your points…</p>}
          {points === null && (
            <p>
              <strong className="text-ink-900">Coming in the pilot:</strong> your points, which ones are redemption eligible, and an estimate of what eligible points would be worth from the simulated fan pool.
            </p>
          )}
          {points && (
            <dl className="grid grid-cols-2 gap-3" data-testid="split-points">
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-[13px] text-ink-600">Recognized</dt>
                <dd className="font-display text-2xl font-extrabold tabular-nums text-ink-900">{points.recognized}</dd>
                <dd className="text-[12px] text-ink-600">Counts your contribution. Not redeemable.</dd>
              </div>
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-[13px] text-ink-600">Redeemable</dt>
                <dd className="font-display text-2xl font-extrabold tabular-nums text-ink-900">{points.redeemableApproved}</dd>
                <dd className="text-[12px] text-ink-600">
                  From qualified referrals.{points.redeemablePending > 0 ? ` ${points.redeemablePending} waiting for review.` : ''}
                </dd>
              </div>
              <div className="col-span-2 rounded-2xl border border-dashed border-[#a8d9cf] p-3">
                <dt className="text-[13px] text-ink-600">
                  Estimated value of your redeemable points <SimulatedTag />
                </dt>
                <dd className="font-display text-2xl font-extrabold tabular-nums text-ink-900">{simulatedDollars(points.simulatedValueCents)}</dd>
                <dd className="text-[12px] text-ink-600">
                  From the simulated fan rewards pool, shared across all approved redeemable points.
                  {points.settled > 0 ? ` ${points.settled} points already allocated in simulated month closes.` : ''}
                </dd>
              </div>
            </dl>
          )}
          <Disclosure />
          <FounderReviewLink />
        </div>
      </Card>
      {/* The setup's last step, always here to come back to: how points are recognized, reviewed and simulated. */}
      <Card className="p-5">
        <MySplitIntro />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Face 2: My Goals, what to do (UX-03, UX-04).

function GoalsFace() {
  const progress = useMyProgress()
  if (progress === undefined) return <p className="text-sm text-ink-600">Loading your goals…</p>
  if (!progress?.enabled)
    return (
      <Card className="p-6 text-center">
        <h2 className="font-display text-lg font-extrabold">Goals are coming</h2>
        <p className="mt-2 text-[14px] text-ink-700">
          Goals will show what to do next, and how close you are, once they open in the pilot. Until then, your contributions are still recognized under My Activity.
        </p>
      </Card>
    )
  return (
    <div className="space-y-4">
      <GoalCompleted progress={progress} />
      <ProgressCards progress={progress} />
      <MySplitIntroCard />
    </div>
  )
}

function MySplitIntroCard() {
  return (
    <Card className="p-5">
      <MySplitIntro />
    </Card>
  )
}

/**
 * Milestone feedback (UX-03): a goal met since the member last looked is
 * acknowledged once, then remembered on this device. Only goals the server
 * reports as met; nothing is predicted.
 */
function GoalCompleted({ progress }: { progress: Extract<MyProgress, { enabled: true }> }) {
  const { profile } = useMyProfile()
  const key = `splitpost.goals-met.${profile.id}`
  const met = (
    [
      ['creator', progress.creator],
      ['consumer', progress.consumer],
    ] as const
  ).flatMap(([a, j]) => (j.status === 'in_progress' || j.status === 'under_review' ? j.steps.filter((s) => s.target !== null && s.value >= s.target).map((s) => ({ a, s, j })) : []))
  const [fresh] = useState(() => {
    let seen: string[] = []
    try {
      seen = JSON.parse(window.localStorage.getItem(key) ?? '[]') as string[]
    } catch {
      seen = []
    }
    const ids = met.map((m) => `${m.a}:${m.s.metric}:${m.j.goalsSince ?? ''}`)
    try {
      window.localStorage.setItem(key, JSON.stringify(ids))
    } catch {
      // Shown again next time at worst.
    }
    // The first visit records what is already met without celebrating it all at once.
    if (window.localStorage.getItem(key + '.started') === null) {
      try {
        window.localStorage.setItem(key + '.started', '1')
      } catch {
        // ignore
      }
      return []
    }
    return met.filter((_m, i) => !seen.includes(ids[i]))
  })
  if (fresh.length === 0) return null
  const first = fresh[0]
  const { done, total } = journeyProgress(first.j)
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-[#e7f4f1] p-4" data-testid="goal-completed" role="status">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0f7a64] text-white shadow-[0_0_0_5px_#cdebe4]" aria-hidden="true">
        <Check className="h-5 w-5" strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-extrabold text-[#173f37]">Goal complete: {goalText(first.s.metric).label}</p>
        <p className="text-[13px] text-[#1f5e52]">
          {done === total
            ? "That's every goal. We'll check it, then it unlocks."
            : `That's ${done} of your ${total} ${first.a === 'creator' ? 'creator' : 'supporter'} goals done.`}
          {fresh.length > 1 ? ` And ${fresh.length - 1} more since you last looked.` : ''}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Face 3: My Activity, what I did (UX-04).

function ActivityFace() {
  const points = useMyPoints()
  return (
    <div className="space-y-4">
      {points && (
        <div data-testid="activity-points">
        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-ink-900">Connection Points</h2>
            <span className="font-display text-[26px] font-extrabold tabular-nums text-ink-900">
              {(points.recognized + points.redeemableApproved).toLocaleString('en-US')}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
            Recognition for how you help creators grow. {points.recognized.toLocaleString('en-US')} count your contribution and have no value.
            {points.redeemableApproved > 0
              ? ` ${points.redeemableApproved.toLocaleString('en-US')} came from qualified referrals and share in the simulated rewards pool.`
              : ' Only points from qualified referrals share in the simulated rewards pool.'}
          </p>
        </Card>
        </div>
      )}
      <section aria-labelledby="activity-history">
        <h2 id="activity-history" className="mb-2 font-display text-[17px] font-extrabold text-ink-900">
          Your contributions
        </h2>
        <History />
      </section>
      <Opportunities />
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  meaningful_comment: 'Thoughtful comment',
  save: 'Saved a post',
  repost: 'Reposted',
  external_share: 'Shared outside Splitpost',
  qualified_referral: 'Qualified referral',
  own_audience_referral: 'Brought someone to your profile',
}
const STATUS_LABEL: Record<string, string> = {
  recognized: 'Recognized',
  pending_review: 'Waiting for review',
  approved: 'Redeemable',
  rejected: 'Not approved',
  reversal: 'Reversed',
  settled: 'Allocated (simulated)',
}

function History() {
  const api = useAppApi()
  const [rows, setRows] = useState<PointsEntry[] | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    api.myPointsHistory().then(
      (r) => live && setRows(r),
      (e) => live && (setError(e), setRows([])),
    )
    return () => {
      live = false
    }
  }, [api])
  if (rows === undefined) return <p className="text-sm text-ink-600">Loading your history…</p>
  if (error !== null || rows.length === 0)
    return (
      <Card className="p-6 text-center">
        <h2 className="font-display text-lg font-extrabold">Nothing here yet</h2>
        <p className="mt-2 text-[14px] text-ink-700">Your contributions will be listed here, newest first: thoughtful comments, saves, reposts, shares and qualified referrals.</p>
      </Card>
    )
  return (
    <Card className="p-0">
      <ul className="divide-y divide-ink-100" data-testid="points-history">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">{ACTION_LABEL[r.action] ?? r.action}</p>
              <p className="truncate text-[13px] text-ink-600">
                {STATUS_LABEL[r.status] ?? r.status}
                {r.creator ? ` · ${r.creator.displayName}` : ''}
              </p>
            </div>
            <span className={`shrink-0 font-display font-extrabold tabular-nums ${r.points < 0 ? 'text-[#b4233a]' : 'text-ink-900'}`}>
              {r.points > 0 ? `+${r.points}` : r.points}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Founder: the qualified referral review queue and the simulated reconciliation. */
export function RewardsReviewPage() {
  const api = useAppApi()
  const [queue, setQueue] = useState<ReferralReview[] | undefined>(undefined)
  const [overview, setOverview] = useState<RewardsOverview | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const load = useCallback(async () => {
    try {
      const [q, o] = await Promise.all([api.founderReferralQueue(), api.founderRewardsOverview()])
      setQueue(q)
      setOverview(o)
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  async function review(id: number, approve: boolean) {
    try {
      await api.founderReviewReferral(id, approve)
      await load()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <>
      <PageHeader title="Referrals and rewards" subtitle="Founder only. Everything here is simulated: nothing is paid." />
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {overview && (
        <Card className="mb-4 p-5" >
          <h2 className="font-display text-lg font-bold text-ink-900">
            Reconciliation <SimulatedTag />
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4" data-testid="rewards-overview">
            {[
              ['Revenue (net)', simulatedDollars(overview.revenueCents)],
              ['Creators (content ads)', simulatedDollars(overview.creatorCents)],
              ['Fan rewards pool', simulatedDollars(overview.poolCents)],
              ['Splitpost (incl. feed ads)', simulatedDollars(overview.splitpostCents)],
              ['Open pool', simulatedDollars(overview.openPoolCents)],
              ['Redeemable, approved', overview.redeemableApproved],
              ['Waiting for review', overview.redeemablePending],
              ['Recognized', overview.recognized],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-[12px] text-ink-600">{k}</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12.5px] text-ink-600">
            Rules {overview.ruleVersion}. Awards {overview.paused ? 'paused' : 'on'}. Creators plus pool plus Splitpost always equal revenue.
          </p>
        </Card>
      )}
      <SimulatedMonthTools onChange={load} />
      <Card className="p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">Qualified referrals waiting for review</h2>
        {queue === undefined && <p className="mt-2 text-sm text-ink-600">Loading…</p>}
        {queue && queue.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing waiting.</p>}
        {queue && queue.length > 0 && (
          <ul className="mt-3 space-y-2" data-testid="referral-queue">
            {queue.map((q) => (
              <li key={q.awardId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper px-4 py-3 text-[14px]">
                <span>
                  <strong>@{q.referrer ?? 'deleted'}</strong> referred <strong>@{q.referred ?? 'deleted'}</strong>, whose first follow was @{q.firstFollow ?? 'deleted'}
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => void review(q.awardId, true)} className={buttonClass('primary', 'sm')}>
                    Approve<span className="sr-only">{` referral by ${q.referrer}`}</span>
                  </button>
                  <button type="button" onClick={() => void review(q.awardId, false)} className={buttonClass('secondary', 'sm')}>
                    Reject<span className="sr-only">{` referral by ${q.referrer}`}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

/** The first day of last month, as YYYY-MM (the month most often recorded and closed). */
function lastMonth() {
  const d = new Date()
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return m.toISOString().slice(0, 7)
}

/** Founder: record simulated revenue and close a finished month. Simulated only: nothing is collected or paid. */
function SimulatedMonthTools({ onChange }: { onChange: () => Promise<void> }) {
  const api = useAppApi()
  const [month, setMonth] = useState(lastMonth())
  const [kind, setKind] = useState<'content_ad' | 'feed_ad'>('content_ad')
  const [creator, setCreator] = useState('')
  const [dollars, setDollars] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  async function record() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const cents = Math.round(Number(dollars) * 100)
      if (!Number.isFinite(cents) || cents <= 0 || !note.trim()) throw new AppApiError('invalid_request')
      let creatorId: string | null = null
      if (kind === 'content_ad') {
        const m = await api.member(creator.replace(/^@/, '').trim())
        if (!m) throw new AppApiError('not_found')
        creatorId = m.id
      }
      await api.founderRecordSimRevenue(`${month}-01`, kind, creatorId, cents, note)
      setDone(`Recorded ${simulatedDollars(cents)} of simulated ${kind === 'content_ad' ? 'content' : 'feed'} advertising for ${month}.`)
      setDollars('')
      setNote('')
      await onChange()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  async function close() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const r = await api.founderCloseMonth(`${month}-01`)
      setDone(`Closed ${month}: ${simulatedDollars(r.allocatedCents)} of a ${simulatedDollars(r.poolCents)} pool to ${r.members} members (${r.points} points). It reconciles to the cent.`)
      await onChange()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const field = 'mt-1 block h-11 w-full rounded-2xl border border-ink-200 bg-white px-3 text-base text-ink-900'
  return (
    <Card className="mb-4 space-y-3 p-5">
      <h2 className="font-display text-lg font-bold text-ink-900">
        Simulated revenue and month close <SimulatedTag />
      </h2>
      <p className="text-[13px] text-ink-600">For the pilot model only, until advertising records revenue from campaigns. Nothing is collected or paid.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink-800">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={field} />
        </label>
        <label className="block text-sm font-semibold text-ink-800">
          Kind
          <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as 'content_ad' | 'feed_ad')} className={field}>
            <option value="content_ad">Content advertising (shared)</option>
            <option value="feed_ad">Feed advertising (Splitpost)</option>
          </select>
        </label>
        {kind === 'content_ad' && (
          <label className="block text-sm font-semibold text-ink-800">
            Creator username
            <input value={creator} onChange={(e) => setCreator(e.target.value)} className={field} />
          </label>
        )}
        <label className="block text-sm font-semibold text-ink-800">
          Net amount ($)
          <input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value.replace(/[^0-9.]/g, ''))} className={field} />
        </label>
        <label className="block text-sm font-semibold text-ink-800 sm:col-span-2">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
      </div>
      {done && <Message tone="success">{done}</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={record} className={buttonClass('primary', 'sm')}>
          Record simulated revenue
        </button>
        <button type="button" disabled={busy} onClick={close} className={buttonClass('secondary', 'sm')}>
          Close the month (simulated)
        </button>
      </div>
    </Card>
  )
}

function Opportunities() {
  const api = useAppApi()
  const [code, setCode] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let live = true
    api.myReferralCode().then(
      (c) => live && setCode(c),
      (e) => live && (setError(e), setCode(null)),
    )
    return () => {
      live = false
    }
  }, [api])
  const link = code ? `${window.location.origin}/register/${code}` : null
  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  async function share() {
    if (!link) return
    try {
      await navigator.share({ title: 'Join me on Splitpost', url: link })
    } catch {
      // Cancelled or unavailable: the copy button still works.
    }
  }
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-display text-lg font-extrabold">Invite someone who'd value it</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
          Share your personal link with an adult who would enjoy the creators you follow. When they join through it and follow a creator, that's a direct contribution to that creator's growth.
        </p>
        {error !== null && <div className="mt-3"><Message tone="error">{messageFor(error)}</Message></div>}
        {code === undefined && <p className="mt-3 text-sm text-ink-600">Getting your link…</p>}
        {code === null && error === null && <p className="mt-3 text-sm text-ink-600">Personal links aren't available yet.</p>}
        {link && (
          <div className="mt-4 space-y-3">
            <div className="break-all rounded-xl bg-paper px-3 py-2 font-mono text-[13px] text-ink-900" data-testid="referral-link">
              {link}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={buttonClass('primary')}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" onClick={share} className={buttonClass('secondary')}>
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
            </div>
          </div>
        )}
        <p className="mt-4 text-[12.5px] text-ink-600">
          Places in the pilot are limited and registration can be paused. People can only join through a valid link. Rewards for referrals are simulated and not yet switched on.
        </p>
      </Card>
    </div>
  )
}
