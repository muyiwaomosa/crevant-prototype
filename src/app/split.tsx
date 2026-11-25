import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { FaceView } from '../components/FaceView'
import { MySplitIcon } from '../components/MySplitIcon'
import { Message } from '../public/auth/AuthUi'
import { AppApiError, messageFor, type MyPoints, type PointsEntry, type ReferralReview, type RewardsOverview } from './api'
import { Link } from 'react-router-dom'
import { useFeedbackAccess } from './feedback'
import { useAppApi } from './AppApiContext'

/**
 * My Split (SP-DESIGN-002). IP-1 delivers the destination, its three faces and
 * the member's personal referral link. Connection Points, the simulated fan
 * pool and contribution history arrive with the rewards work package; until
 * then each face says plainly what will appear there and makes no claims.
 */
export function MySplitPage() {
  return (
    <>
      <PageHeader title="My Split" subtitle="How you help the creators you value grow. Rewards are simulated during the pilot." />
      <FaceView
        label="My Split views"
        faces={[
          { key: 'overview', label: 'Overview', content: <Overview /> },
          { key: 'history', label: 'History', content: <History /> },
          { key: 'opportunities', label: 'Opportunities', content: <Opportunities /> },
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

function Overview() {
  const api = useAppApi()
  const [points, setPoints] = useState<MyPoints | null | undefined>(undefined)
  const { founder } = useFeedbackAccess()
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
  return (
    <div className="space-y-4">
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
          <p className="rounded-xl bg-[#e7f4f1] px-3 py-2 text-[13px] text-[#1f5e52]" data-testid="split-disclosure">
            During the pilot all rewards and values are simulated. Connection Points have no cash value and nothing is paid out.
          </p>
          {founder && (
            <Link to="/app/split/review" className={buttonClass('secondary', 'sm')}>
              Founder: review referrals and rewards
            </Link>
          )}
        </div>
      </Card>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  meaningful_comment: 'Thoughtful comment',
  save: 'Saved a post',
  repost: 'Reposted',
  external_share: 'Shared outside Splitpost',
  qualified_referral: 'Qualified referral',
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
          <select value={kind} onChange={(e) => setKind(e.target.value as 'content_ad' | 'feed_ad')} className={field}>
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
