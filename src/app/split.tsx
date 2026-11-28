import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, Lock, Share2, Unlock } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { MySplitIcon } from '../components/MySplitIcon'
import { Message } from '../public/auth/AuthUi'
import { AppApiError, messageFor, type EarningsByState, type MyProgress, type MyPoints, type PointsEntry, type ReferralReview, type RewardsOverview } from './api'
import { Link, useLocation } from 'react-router-dom'
import { useFeedbackAccess } from './feedback'
import { useAppApi } from './AppApiContext'
import { MySplitIntro } from './onboarding'
import { EarningsRow, ProgressCards, creatorJourneyShown } from './progression'
import { suggestNext, useSharedProgress } from './journey'

/**
 * My Split (SP-DESIGN-002; unified, Nov 28): one scrolling page about rewards
 * and progression. In order: the simulated split (unlocked and locked), the
 * Connection Points, both qualification journeys with their milestones and
 * status, then recent activity with the full history, and the personal
 * invitation link. Performance analytics live in Your Insights, not here.
 * Every value is the server's; the economic and eligibility rules are
 * unchanged: meeting all five goals starts an eligibility review, and nothing
 * unlocks automatically.
 */
export function MySplitPage() {
  const points = useMyPoints()
  const progress = useSharedProgress()
  const { hash, search } = useLocation()
  // Old links to the former faces (?face=goals, ?face=activity) land on the matching section.
  const legacy = new URLSearchParams(search).get('face')
  const target = hash.replace('#', '') || (legacy === 'goals' ? 'goals' : legacy === 'activity' ? 'activity' : '')
  const ready = progress !== undefined
  useEffect(() => {
    if (ready && target) document.getElementById(target)?.scrollIntoView?.({ block: 'start' })
  }, [ready, target])
  const enabled = progress?.enabled ? progress : null
  const suggestion = enabled ? suggestNext(enabled) : null
  return (
    <>
      <PageHeader title="My Split" subtitle="Your rewards and progress. Every amount is simulated during the pilot." />
      {!ready ? (
        <p className="text-sm text-ink-600">Loading your split…</p>
      ) : (
        <div className="space-y-4" data-testid={enabled ? 'split-progression' : 'split-basic'}>
          {enabled && <SplitHero creator={enabled.earnings.creator} supporter={enabled.earnings.consumer} />}
          <SplitExplained progress={enabled} points={points} />
          <PointsSummary points={points} />
          <CreatorShare />
          {enabled ? (
            <section id="goals" aria-labelledby="goals-title" className="scroll-mt-20 space-y-3">
              <h2 id="goals-title" className="mt-2 font-display text-lg font-bold text-ink-900">
                Your goals
              </h2>
              <ProgressCards progress={enabled} open={suggestion?.audience ?? 'consumer'} />
            </section>
          ) : (
            <Card className="p-5">
              <MySplitIntro />
              <p className="mt-3 text-[13px] text-ink-600">Goals will show here once they open in the pilot. Your contributions are already recognized below.</p>
            </Card>
          )}
          <section id="activity" aria-labelledby="activity-history" className="scroll-mt-20">
            <h2 id="activity-history" className="mb-2 mt-2 font-display text-lg font-bold text-ink-900">
              Recent activity
            </h2>
            <History />
          </section>
          <section id="invite" className="scroll-mt-20">
            <Opportunities />
          </section>
          <Disclosure />
          <FounderReviewLink />
        </div>
      )}
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

function SplitHero({ creator, supporter }: { creator: EarningsByState; supporter: EarningsByState }) {
  const total = creator.accumulatedCents + supporter.accumulatedCents
  const unlocked = creator.eligibleCents + creator.settledCents + supporter.eligibleCents + supporter.settledCents
  const locked = Math.max(0, total - unlocked)
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
          <dt className="flex items-center gap-1 text-[12px] text-[#d3def3]">
            <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> Unlocked
          </dt>
          <dd className="font-display text-[21px] font-extrabold tabular-nums" data-testid="split-unlocked">
            {simulatedDollars(unlocked)}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[12px] text-[#d3def3]">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Locked
          </dt>
          <dd className="font-display text-[21px] font-extrabold tabular-nums" data-testid="split-locked">
            {simulatedDollars(locked)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[12.5px] text-[#d3def3]">
        As a supporter {simulatedDollars(supporter.accumulatedCents)} · As a creator {simulatedDollars(creator.accumulatedCents)}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#e7edf9]">
        {total === 0
          ? 'Nothing yet. Your split grows as you post and as you support the creators you value. Your goals below show where to start.'
          : 'Locked amounts are held until a journey’s 5 goals are met and its eligibility review is approved. Nothing unlocks automatically, and nothing is paid during the pilot.'}
      </p>
    </section>
  )
}

/** The plain meaning of each amount, and the breakdown per journey, one tap away. */
function SplitExplained({ progress, points }: { progress: Extract<MyProgress, { enabled: true }> | null; points: MyPoints | null | undefined }) {
  return (
    <details className="group rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]" data-testid="split-explain">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-bold text-brand-700">
        How My Split works <ChevronDown className="h-4 w-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      {/* Without the goals, the same explanation is already on the page in its own card. */}
      {progress && (
        <div className="mt-3">
          <MySplitIntro heading={null} />
        </div>
      )}
      {progress && (
        <>
          <dl className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed text-ink-700">
            <div>
              <dt className="inline font-semibold text-ink-900">Your split </dt>
              <dd className="inline">
                is everything you've accumulated on Splitpost: as a creator, from ads shown with your posts, and as a supporter, for helping creators grow.
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-ink-900">Locked </dt>
              <dd className="inline">is accumulated but held until that journey's goals are met and its eligibility review is approved.</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-ink-900">Unlocked </dt>
              <dd className="inline">is available to you once the eligibility review is approved.</dd>
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
          <div>
            <p className="mt-2 text-[12.5px] font-semibold text-ink-700">As a supporter</p>
            <EarningsRow e={progress.earnings.consumer} testId="earnings-consumer" estimatedCents={points?.simulatedValueCents} />
          </div>
          {creatorJourneyShown(progress) && (
            <div>
              <p className="mt-2 text-[12.5px] font-semibold text-ink-700">As a creator</p>
              <EarningsRow e={progress.earnings.creator} testId="earnings-creator" />
            </div>
          )}
          {(progress.earnings.creator.lockedCents > 0 || progress.earnings.consumer.lockedCents > 0) && (
            <p className="mt-2 text-[12px] text-ink-600">
              Your legitimate allocated rewards remain attributed to you until you qualify, subject to applicable integrity and adjustment rules. All pilot
              amounts are simulated.
            </p>
          )}
        </>
      )}
    </details>
  )
}

/**
 * A creator's simulated share of the ads placed with their posts, by month
 * (moved here from Insights: rewards live in My Split). Shown only once there
 * is a share to show. Equal segments on purpose: the shares themselves aren't
 * shown until the Rewards Rules are legally reviewed.
 */
function CreatorShare() {
  const api = useAppApi()
  const [months, setMonths] = useState<Array<{ month: string; creatorCents: number }> | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.mySimulatedEarnings().then(
      (m) => live && setMonths(m),
      () => live && setMonths(null),
    )
    return () => {
      live = false
    }
  }, [api])
  if (!months || months.length === 0) return null
  return (
    <div data-testid="simulated-earnings">
      <Card className="p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">
          Your simulated creator share <SimulatedTag />
        </h2>
        <div className="mt-2 grid h-9 grid-cols-3 overflow-hidden rounded-xl text-[13px] font-semibold" aria-label="Shared between you, the fan rewards pool and Splitpost">
          <span className="grid place-items-center bg-brand-700 text-white">You</span>
          <span className="grid place-items-center bg-[#a8d9cf] text-ink-900">Fans</span>
          <span className="grid place-items-center bg-ink-100 text-ink-800">Splitpost</span>
        </div>
        <p className="mt-2 text-[13px] text-ink-600">
          Ads placed with your posts are shared between you, the fan rewards pool and Splitpost. Ads elsewhere in the app aren't part of creator shares.
        </p>
        <ul className="mt-3 space-y-1 text-[14px]">
          {months.map((e) => (
            <li key={e.month} className="flex justify-between">
              <span>{new Date(e.month.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
              <span className="font-semibold tabular-nums">{simulatedDollars(e.creatorCents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-ink-700">Nothing is paid during the pilot.</p>
      </Card>
    </div>
  )
}

/** Connection Points: recognition (never redeemable) kept apart from redeemable points and their simulated estimate. */
function PointsSummary({ points }: { points: MyPoints | null | undefined }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink-900">Connection Points</h2>
        <span className="text-[12px] text-ink-500">No cash value</span>
      </div>
      <p className="mt-1 text-[13.5px] text-ink-600">
        Recognition for how you help creators grow: thoughtful comments, saves, reposts, shares, and inviting people who go on to follow a creator.
      </p>
      {points === undefined && <p className="mt-3 text-sm text-ink-600">Loading your points…</p>}
      {points === null && (
        <p className="mt-3 text-[14px] text-ink-700">
          <strong className="text-ink-900">Coming in the pilot:</strong> your points, which ones are redemption eligible, and an estimate of what eligible points would be worth from the simulated fan pool.
        </p>
      )}
      {points && (
        <dl className="mt-3 grid grid-cols-2 gap-3" data-testid="split-points">
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
    </Card>
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

/** Recent activity: the latest few entries, and the full history (paged, 30 at a time) on request. */
function History() {
  const api = useAppApi()
  const [rows, setRows] = useState<PointsEntry[] | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [full, setFull] = useState(false)
  const [more, setMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  useEffect(() => {
    let live = true
    api.myPointsHistory().then(
      (r) => live && (setRows(r), setMore(r.length >= 30)),
      (e) => live && (setError(e), setRows([])),
    )
    return () => {
      live = false
    }
  }, [api])
  async function older() {
    if (!rows || rows.length === 0) return
    setLoadingOlder(true)
    try {
      const next = await api.myPointsHistory(rows[rows.length - 1].id)
      setRows([...rows, ...next])
      setMore(next.length >= 30)
    } catch (e) {
      setError(e)
    } finally {
      setLoadingOlder(false)
    }
  }
  if (rows === undefined) return <p className="text-sm text-ink-600">Loading your history…</p>
  if (rows.length === 0)
    return (
      <Card className="p-6 text-center">
        <h3 className="font-display text-lg font-extrabold">Nothing here yet</h3>
        <p className="mt-2 text-[14px] text-ink-700">Your contributions will be listed here, newest first: thoughtful comments, saves, reposts, shares and qualified referrals.</p>
        {error !== null && <p className="mt-2 text-[13px] text-ink-600">{messageFor(error)}</p>}
      </Card>
    )
  const shown = full ? rows : rows.slice(0, 5)
  return (
    <>
      <Card className="p-0">
        <ul className="divide-y divide-ink-100" data-testid="points-history">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{ACTION_LABEL[r.action] ?? r.action}</p>
                <p className="truncate text-[13px] text-ink-600">
                  {STATUS_LABEL[r.status] ?? r.status}
                  {r.creator ? ` · ${r.creator.displayName}` : ''}
                  {` · ${new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </p>
              </div>
              <span className={`shrink-0 font-display font-extrabold tabular-nums ${r.points < 0 ? 'text-[#b4233a]' : 'text-ink-900'}`}>
                {r.points > 0 ? `+${r.points}` : r.points}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {!full && rows.length > 5 && (
        <button type="button" onClick={() => setFull(true)} className={`${buttonClass('secondary', 'sm')} mt-3`}>
          Show full history
        </button>
      )}
      {full && more && (
        <button type="button" disabled={loadingOlder} onClick={() => void older()} className={`${buttonClass('secondary', 'sm')} mt-3`}>
          {loadingOlder ? 'Loading…' : 'Show older'}
        </button>
      )}
    </>
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
