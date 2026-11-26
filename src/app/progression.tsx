/**
 * Progression (SP-PRG-001; 20261217000000 and 20261218000000): goals,
 * qualification status and SIMULATED earnings in My Split, and the founder's
 * goals, review, holds, corrections and scorecard in Control Center. Shown to
 * members only while the progression switch is on. Nothing here is paid.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  messageFor,
  type EarningsByState,
  type FounderGoals,
  type GoalAudience,
  type GoalStep,
  type MyProgress,
  type ProgressJourney,
  type ProgressNotice,
  type ProgressionQueue,
  type ProgressionReport,
  type QualificationStatus,
} from './api'
import { useAppApi } from './AppApiContext'

/** What each measure means, in the member's words (SP-PRG-001, CQ and FQ). */
export const GOAL_TEXT: Record<string, { label: string; unit: string }> = {
  original_posts: { label: 'Publish original posts', unit: 'posts' },
  posting_weeks: { label: 'Post in different weeks (last 28 days)', unit: 'weeks' },
  genuine_followers: { label: 'Reach genuine followers', unit: 'followers' },
  clique_connections: { label: 'Be in members’ Cliques', unit: 'members' },
  returning_supporters: { label: 'Have supporters who come back (last 28 days)', unit: 'supporters' },
  clique_creators: { label: 'Keep creators in your Clique', unit: 'creators' },
  meaningful_engagements: { label: 'Comment, save or repost thoughtfully', unit: 'times' },
  engaged_creators: { label: 'Support different creators', unit: 'creators' },
  supporting_weeks: { label: 'Support your Clique in different weeks (last 28 days)', unit: 'weeks' },
  external_shares: { label: 'Share posts outside Splitpost', unit: 'shares' },
  qualified_referrals: { label: 'Bring people who join and follow a creator', unit: 'referrals' },
}
const goalText = (metric: string) => GOAL_TEXT[metric] ?? { label: metric, unit: '' }

const STATUS_TEXT: Record<QualificationStatus, string> = {
  in_progress: 'In progress',
  under_review: 'Under review',
  qualified: 'Qualified',
  eligibility_paused: 'Eligibility paused',
  revoked: 'Qualification revoked',
}

function dollars(cents: number) {
  return `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`
}

/** Loads the member's progress; undefined while loading, null where unavailable. */
export function useMyProgress() {
  const api = useAppApi()
  const [p, setP] = useState<MyProgress | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.myProgress().then(
      (x) => live && setP(x),
      () => live && setP(null),
    )
    return () => {
      live = false
    }
  }, [api])
  return p
}

/** Connection Points as one bar: recognition and reward eligible. */
export function PointsBar({ recognized, redeemable }: { recognized: number; redeemable: number }) {
  const total = recognized + redeemable
  const share = total > 0 ? Math.round((recognized / total) * 100) : 0
  return (
    <div data-testid="points-bar">
      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-ink-900">Connection Points</h2>
          <span className="font-display text-[22px] font-extrabold tabular-nums text-ink-900">{total.toLocaleString('en-US')}</span>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
          <div className="bg-sp-secondary" style={{ width: `${share}%` }} />
          <div className="bg-sp-accent" style={{ width: `${total > 0 ? 100 - share : 0}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] text-ink-600">
          <span>Recognition {recognized.toLocaleString('en-US')}</span>
          <span>Reward eligible {redeemable.toLocaleString('en-US')}</span>
        </div>
      </Card>
    </div>
  )
}

function StepRow({ step }: { step: GoalStep }) {
  const t = goalText(step.metric)
  const met = step.target !== null && step.value >= step.target
  return (
    <li className="flex items-center gap-2.5 text-[14px]" data-testid="goal-step" data-met={met ? 'true' : 'false'}>
      <span
        className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${met ? 'bg-[#0f7a64] text-white' : 'bg-ink-200'}`}
        aria-hidden="true"
      >
        {met && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="flex-1 text-ink-800">
        {t.label}
        {met && <span className="sr-only"> (done)</span>}
      </span>
      <span className="text-[12px] tabular-nums text-ink-600">
        {step.target === null ? `${step.value} ${t.unit}` : `${Math.min(step.value, step.target)} / ${step.target}`}
      </span>
    </li>
  )
}

function EarningsRow({ e, testId, estimatedCents }: { e: EarningsByState; testId: string; estimatedCents?: number }) {
  const cells: Array<[string, number]> = [
    ['Accumulated', e.accumulatedCents],
    ['Locked', e.lockedCents],
    ['Unlocked', e.eligibleCents],
    ['Settled', e.settledCents],
  ]
  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-[#a8d9cf] p-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-ink-900">Earnings</span>
        <span className="rounded-full bg-[#e7f4f1] px-2 py-0.5 text-[11px] font-bold text-[#1f5e52]">Simulated</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
        {cells.map(([label, cents]) => (
          <div key={label}>
            <dt className="text-[12px] text-ink-600">{label}</dt>
            <dd className="font-display text-[17px] font-extrabold tabular-nums text-ink-900">{dollars(cents)}</dd>
          </div>
        ))}
      </dl>
      {e.pausedCents !== 0 && <p className="mt-2 text-[12px] text-ink-700">Paused while under review: {dollars(e.pausedCents)} (part of Accumulated).</p>}
      {estimatedCents !== undefined && estimatedCents > 0 && (
        <p className="mt-2 text-[12px] text-ink-700">
          Estimated for your reward-eligible points this month: {dollars(estimatedCents)}. It is fixed when the month closes.
        </p>
      )}
    </div>
  )
}

/** One plain sentence for where the member stands, and what happens next. */
function statusLine(j: ProgressJourney, goalsSet: boolean, next: GoalStep | undefined): string {
  switch (j.status) {
    case 'under_review':
      return 'You have met every goal. We are checking it, and then your earnings unlock.'
    case 'qualified':
      return 'Qualified. Your earnings are unlocked. Nothing is paid during the pilot.'
    case 'eligibility_paused':
      return 'Qualified, but release is paused while a review or restriction is in place. Your qualification is kept.'
    case 'revoked':
      return 'Your qualification was revoked after a review. See the message below about appealing.'
    default:
      if (!goalsSet) return 'Your progress so far. The goals have not been set yet, so nothing unlocks for now.'
      return next ? `Next: ${goalText(next.metric).label.toLowerCase()}.` : 'You have met every goal. Open My Split again soon to see it checked.'
  }
}

const GROWTH: Record<GoalAudience, string[]> = {
  creator: [
    'Reply to the comments of people who come back.',
    'Post in the weeks your supporters are most active.',
    'Look at Reach and Connection in Your insights to see what brings people back.',
  ],
  consumer: ['Keep supporting the creators in your Clique.', 'Discover a new creator in Discover.', 'Tell a creator what their post meant to you.'],
}

function GoalCard({
  title,
  journey,
  earnings,
  audience,
  notices,
  estimatedCents,
}: {
  title: string
  journey: ProgressJourney
  earnings: EarningsByState
  audience: GoalAudience
  notices: ProgressNotice[]
  estimatedCents?: number
}) {
  const set = journey.steps.length > 0 && journey.steps.every((s) => s.target !== null)
  const done = journey.steps.filter((s) => s.target !== null && s.value >= s.target).length
  const next = journey.steps.find((s) => s.target !== null && s.value < s.target)
  const showSteps = journey.status === 'in_progress'
  return (
    <div data-testid={`goals-${audience}`}>
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold text-ink-900">{title}</h2>
          <span className="text-[13px] font-semibold text-ink-700" data-testid={`goals-${audience}-badge`}>
            {journey.status === 'in_progress' && set ? `${done} of ${journey.steps.length}` : STATUS_TEXT[journey.status]}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-600" data-testid={`goals-${audience}-status`}>
          {statusLine(journey, set, next)}
        </p>
        {notices.map((n) => (
          <p key={`${n.kind}-${n.since}`} className="mt-2 rounded-xl bg-paper px-3 py-2 text-[13px] text-ink-800" data-testid="progress-notice">
            {n.message}{' '}
            <span className="text-ink-600">
              {n.kind === 'hold' ? 'Nothing is taken: it is paused while we review it.' : 'To appeal, send us a message through Feedback.'}
            </span>
          </p>
        ))}
        {showSteps && (
          <ul className="mt-3 space-y-2.5">
            {journey.steps.map((s) => (
              <StepRow key={s.metric} step={s} />
            ))}
          </ul>
        )}
        {journey.status === 'in_progress' && journey.goalsSince && set && (
          <p className="mt-2 text-[12px] text-ink-600">
            Goals in force since {new Date(journey.goalsSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        )}
        <EarningsRow e={earnings} testId={`earnings-${audience}`} estimatedCents={estimatedCents} />
        {journey.status !== 'qualified' && earnings.lockedCents > 0 && (
          <p className="mt-2 text-[12px] text-ink-600">
            Your legitimate allocated rewards remain attributed to you until you qualify, subject to applicable integrity and adjustment rules. All pilot
            amounts are simulated.
          </p>
        )}
        {(journey.status === 'qualified' || journey.status === 'eligibility_paused') && (
          <div className="mt-3" data-testid={`growth-${audience}`}>
            <h3 className="text-[13px] font-bold text-ink-900">Keep growing (optional)</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-700">
              {GROWTH[audience].map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-ink-600">Optional. Your qualification never depends on them.</p>
          </div>
        )}
      </Card>
    </div>
  )
}

/** The goal cards of My Split (shown only while progression is on). */
export function ProgressCards({ progress, estimatedCents }: { progress: Extract<MyProgress, { enabled: true }>; estimatedCents?: number }) {
  const creatorShown =
    progress.creator.status !== 'in_progress' ||
    progress.earnings.creator.accumulatedCents !== 0 ||
    progress.creator.steps.some((s) => s.metric === 'original_posts' && s.value > 0)
  const notices = (a: GoalAudience) =>
    progress.notices.filter((n) =>
      n.kind === 'revoked' ? n.audience === a : a === 'creator' ? n.scope !== 'consumer_allocation' : n.scope !== 'creator_entry',
    )
  return (
    <>
      {creatorShown && (
        <GoalCard title="Creator goals" audience="creator" journey={progress.creator} earnings={progress.earnings.creator} notices={notices('creator')} />
      )}
      <GoalCard
        title="Supporter goals"
        audience="consumer"
        journey={progress.consumer}
        earnings={progress.earnings.consumer}
        notices={notices('consumer')}
        estimatedCents={estimatedCents}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Control Center

const control = 'mt-1 block min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-base text-ink-900'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-ink-800">
      {label}
      {children}
    </label>
  )
}

function GoalsForm({ audience, goals, onSaved }: { audience: GoalAudience; goals: FounderGoals; onSaved: () => void }) {
  const api = useAppApi()
  const current = goals.versions.find((v) => v.audience === audience)
  const metrics = goals.catalogue[audience]
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(metrics.map((m) => [m, current?.targets[m] !== undefined ? String(current.targets[m]) : ''])),
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const targets = Object.fromEntries(metrics.map((m) => [m, Number(values[m])]))
      await api.founderSetGoals(audience, targets, reason)
      setReason('')
      onSaved()
    } catch (err) {
      setError(err)
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl bg-paper p-4" data-testid={`goal-form-${audience}`}>
      <h3 className="font-bold text-ink-900">{audience === 'creator' ? 'Creator goals' : 'Supporter goals'}</h3>
      <p className="text-[13px] text-ink-600">
        {current
          ? `In force since ${new Date(current.setAt).toLocaleDateString('en-US')}: ${current.reason}. ${goals.qualified[audience]} met.`
          : 'Not set. Until every value is set, nobody on this journey qualifies.'}
      </p>
      <p className="text-[12px] text-ink-600">
        Changing approved benchmarks needs your separate authorization (SP-PRG-001). Members who already met the goals keep their place.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map((m) => (
          <Field key={m} label={goalText(m).label}>
            <input
              type="number"
              inputMode="numeric"
              value={values[m] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              className={control}
            />
          </Field>
        ))}
      </div>
      <Field label="Reason">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={control} />
      </Field>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <button type="submit" className={buttonClass('primary', 'sm')}>
        Save {audience === 'creator' ? 'creator' : 'supporter'} goals
      </button>
    </form>
  )
}

/** Review queue: approve after the integrity review, revoke with evidence, restore after an appeal; holds. */
function ReviewSection({ queue, onChanged }: { queue: ProgressionQueue; onChanged: (note: string) => void }) {
  const api = useAppApi()
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<unknown>(null)
  async function run(f: () => Promise<unknown>, note: string) {
    setError(null)
    try {
      await f()
      setReason('')
      setEvidence('')
      setMessage('')
      onChanged(note)
    } catch (err) {
      setError(err)
    }
  }
  const open = queue.members.filter((m) => m.status !== 'in_progress')
  return (
    <div className="space-y-3 rounded-2xl bg-paper p-4" data-testid="progression-review">
      <h3 className="font-bold text-ink-900">Qualification review</h3>
      <p className="text-[13px] text-ink-600">
        Every decision needs a reason and is recorded. A revocation also needs an evidence reference and a message the member will see.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Decision reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={control} />
        </Field>
        <Field label="Evidence reference">
          <input value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={200} className={control} />
        </Field>
        <Field label="Message to the member">
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} className={control} />
        </Field>
      </div>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {open.length === 0 ? (
        <p className="text-[13px] text-ink-600">Nobody has met their goals yet.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((m) => (
            <li
              key={`${m.memberId}-${m.audience}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2"
              data-testid="review-row"
            >
              <span className="text-[14px] text-ink-800">
                @{m.username ?? 'member'} · {m.audience === 'creator' ? 'creator' : 'supporter'} · {STATUS_TEXT[m.status]}
              </span>
              <span className="flex flex-wrap gap-2">
                {m.status === 'under_review' && (
                  <button
                    type="button"
                    className={buttonClass('primary', 'sm')}
                    onClick={() =>
                      void run(
                        () =>
                          api.founderDecideQualification({
                            memberId: m.memberId,
                            audience: m.audience,
                            decision: 'approved',
                            reason,
                            evidenceRef: evidence || undefined,
                          }),
                        `Approved @${m.username}.`,
                      )
                    }
                  >
                    Approve
                  </button>
                )}
                {(m.status === 'qualified' || m.status === 'eligibility_paused') && (
                  <button
                    type="button"
                    className={buttonClass('danger', 'sm')}
                    onClick={() =>
                      void run(
                        () =>
                          api.founderDecideQualification({
                            memberId: m.memberId,
                            audience: m.audience,
                            decision: 'revoked',
                            reason,
                            evidenceRef: evidence,
                            memberMessage: message,
                          }),
                        `Revoked @${m.username}.`,
                      )
                    }
                  >
                    Revoke
                  </button>
                )}
                {m.status === 'revoked' && (
                  <button
                    type="button"
                    className={buttonClass('secondary', 'sm')}
                    onClick={() =>
                      void run(
                        () =>
                          api.founderDecideQualification({
                            memberId: m.memberId,
                            audience: m.audience,
                            decision: 'restored',
                            reason,
                            evidenceRef: evidence || undefined,
                          }),
                        `Restored @${m.username}.`,
                      )
                    }
                  >
                    Restore
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="pt-2 font-bold text-ink-900">Open holds</h3>
      {queue.holds.length === 0 ? (
        <p className="text-[13px] text-ink-600">No open holds.</p>
      ) : (
        <ul className="space-y-2">
          {queue.holds.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2" data-testid="hold-row">
              <span className="text-[14px] text-ink-800">
                @{h.username ?? 'member'} ·{' '}
                {h.scope === 'account' ? 'whole account' : h.scope === 'creator_entry' ? `entry ${h.revenueEntryId}` : `allocation ${h.settlementId}`} ·{' '}
                {h.reason}
              </span>
              <button
                type="button"
                className={buttonClass('secondary', 'sm')}
                onClick={() => void run(() => api.founderReleaseHold(h.id, reason), 'Hold released.')}
              >
                Release
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type GovAction = 'hold_entry' | 'hold_allocation' | 'hold_account' | 'correct_entry' | 'correct_allocation'
const GOV_LABEL: Record<GovAction, string> = {
  hold_entry: 'Hold one revenue entry',
  hold_allocation: 'Hold one month’s allocation',
  hold_account: 'Hold the whole account',
  correct_entry: 'Correct a revenue entry',
  correct_allocation: 'Correct a month’s allocation',
}
type CorrectionKind = 'refund' | 'invalid_activity' | 'correction' | 'restoration'
const KIND_LABEL: Record<CorrectionKind, string> = {
  refund: 'Advertiser refund (reduces)',
  invalid_activity: 'Invalid activity (reduces)',
  correction: 'Correction',
  restoration: 'Restoration after an appeal (adds)',
}

/**
 * Holds and corrections (SP-PRG-001 PRG-06): one form, a review step that
 * says exactly what will be recorded, then a confirmation. Every action
 * needs a reason; holds need a message the member will see; an account-wide
 * hold needs a justification. Uses only the founder functions; no balance
 * can be edited directly.
 */
function GovernanceForm({ onChanged }: { onChanged: (note: string) => void }) {
  const api = useAppApi()
  const [action, setAction] = useState<GovAction>('hold_entry')
  const [username, setUsername] = useState('')
  const [target, setTarget] = useState('')
  const [kind, setKind] = useState<CorrectionKind>('refund')
  const [direction, setDirection] = useState<'decrease' | 'increase'>('decrease')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [justification, setJustification] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<{ summary: string; memberId: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const isHold = action.startsWith('hold')
  const needsTarget = action !== 'hold_account'
  const targetLabel = action === 'hold_entry' || action === 'correct_entry' ? 'Revenue entry number' : 'Month close (settlement) number'
  const kinds: CorrectionKind[] =
    action === 'correct_allocation' ? ['invalid_activity', 'correction', 'restoration'] : ['refund', 'invalid_activity', 'correction', 'restoration']
  const cents = Math.round(Number(amount) * 100)
  const signed = kind === 'refund' || kind === 'invalid_activity' ? -cents : kind === 'restoration' ? cents : direction === 'decrease' ? -cents : cents

  async function review(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setProblem(null)
    if (reason.trim().length < 3) return setProblem('Write the reason (3 characters or more).')
    if (needsTarget && !/^\d+$/.test(target.trim())) return setProblem(`Enter the ${targetLabel.toLowerCase()}.`)
    if (isHold && message.trim().length < 3) return setProblem('Write the message the member will see.')
    if (action === 'hold_account' && justification.trim().length < 10)
      return setProblem('An account-wide hold needs a documented justification (10 characters or more).')
    if (!isHold && !(cents > 0)) return setProblem('Enter an amount in dollars, more than zero.')
    let member
    try {
      member = await api.member(username.trim().replace(/^@/, ''))
    } catch (err) {
      return setError(err)
    }
    if (!member) return setProblem('No member has that username.')
    const what = isHold
      ? `${GOV_LABEL[action]}${needsTarget ? ` ${target.trim()}` : ''} for @${member.username}. The member will see: “${message.trim()}” Nothing is taken; release pauses until you release the hold.`
      : `${GOV_LABEL[action]} ${target.trim()} for @${member.username}: ${KIND_LABEL[kind]}, ${signed < 0 ? '−' : '+'}$${(cents / 100).toFixed(2)} (simulated). A new compensating record; the original is not changed.`
    setPending({ summary: what, memberId: member.id })
  }

  async function confirm() {
    if (!pending) return
    setError(null)
    try {
      const evidenceRef = evidence.trim() || undefined
      if (action === 'hold_entry' || action === 'hold_allocation' || action === 'hold_account') {
        await api.founderPlaceHold({
          memberId: pending.memberId,
          scope: action === 'hold_entry' ? 'creator_entry' : action === 'hold_allocation' ? 'consumer_allocation' : 'account',
          revenueEntryId: action === 'hold_entry' ? Number(target) : undefined,
          settlementId: action === 'hold_allocation' ? Number(target) : undefined,
          reason: reason.trim(),
          evidenceRef,
          justification: action === 'hold_account' ? justification.trim() : undefined,
          memberMessage: message.trim(),
        })
      } else if (action === 'correct_entry') {
        await api.founderCorrectRevenue({ entryId: Number(target), deltaCents: signed, kind, reason: reason.trim(), evidenceRef })
      } else {
        await api.founderCorrectAllocation({
          settlementId: Number(target),
          memberId: pending.memberId,
          deltaCents: signed,
          kind: kind as 'invalid_activity' | 'correction' | 'restoration',
          reason: reason.trim(),
          evidenceRef,
        })
      }
      setPending(null)
      setReason('')
      setEvidence('')
      setJustification('')
      setMessage('')
      setAmount('')
      onChanged(isHold ? 'Hold recorded.' : 'Correction recorded.')
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form onSubmit={review} className="space-y-3 rounded-2xl bg-paper p-4" data-testid="governance-form">
      <h3 className="font-bold text-ink-900">Holds and corrections</h3>
      <p className="text-[13px] text-ink-600">Simulated amounts only. Every action is recorded with its reason and cannot be edited afterwards.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Action">
          <select
            value={action}
            onChange={(e) => (
              setAction(e.target.value as GovAction),
              setPending(null),
              setKind(e.target.value === 'correct_allocation' ? 'invalid_activity' : 'refund')
            )}
            className={control}
          >
            {(Object.keys(GOV_LABEL) as GovAction[]).map((a) => (
              <option key={a} value={a}>
                {GOV_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Member username">
          <input value={username} onChange={(e) => (setUsername(e.target.value), setPending(null))} className={control} autoCapitalize="none" />
        </Field>
        {needsTarget && (
          <Field label={targetLabel}>
            <input value={target} onChange={(e) => (setTarget(e.target.value), setPending(null))} inputMode="numeric" className={control} />
          </Field>
        )}
        {!isHold && (
          <>
            <Field label="Kind">
              <select value={kind} onChange={(e) => (setKind(e.target.value as CorrectionKind), setPending(null))} className={control}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            {kind === 'correction' && (
              <Field label="Direction">
                <select value={direction} onChange={(e) => (setDirection(e.target.value as 'decrease' | 'increase'), setPending(null))} className={control}>
                  <option value="decrease">Decrease</option>
                  <option value="increase">Increase</option>
                </select>
              </Field>
            )}
            <Field label="Amount in dollars (simulated)">
              <input value={amount} onChange={(e) => (setAmount(e.target.value), setPending(null))} inputMode="decimal" className={control} />
            </Field>
          </>
        )}
        <Field label="Reason (internal)">
          <input value={reason} onChange={(e) => (setReason(e.target.value), setPending(null))} maxLength={500} className={control} />
        </Field>
        <Field label="Evidence reference">
          <input value={evidence} onChange={(e) => (setEvidence(e.target.value), setPending(null))} maxLength={200} className={control} />
        </Field>
        {action === 'hold_account' && (
          <Field label="Why the risk cannot be isolated (justification)">
            <input value={justification} onChange={(e) => (setJustification(e.target.value), setPending(null))} maxLength={500} className={control} />
          </Field>
        )}
        {isHold && (
          <Field label="Message the member will see">
            <input value={message} onChange={(e) => (setMessage(e.target.value), setPending(null))} maxLength={500} className={control} />
          </Field>
        )}
      </div>
      {problem && <Message tone="error">{problem}</Message>}
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      {pending ? (
        <div className="space-y-2 rounded-xl border border-ink-200 bg-white p-3" data-testid="governance-confirm">
          <p className="text-[14px] text-ink-800">{pending.summary}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void confirm()} className={buttonClass('danger', 'sm')}>
              Confirm and record
            </button>
            <button type="button" onClick={() => setPending(null)} className={buttonClass('secondary', 'sm')}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" className={buttonClass('primary', 'sm')}>
          Review
        </button>
      )}
    </form>
  )
}

function AuditList({ queue }: { queue: ProgressionQueue }) {
  if (queue.decisions.length === 0) return null
  return (
    <div className="space-y-2 rounded-2xl bg-paper p-4" data-testid="progression-audit">
      <h3 className="font-bold text-ink-900">Recent decisions</h3>
      <ul className="space-y-1 text-[13px] text-ink-800">
        {queue.decisions.slice(0, 20).map((d, i) => (
          <li key={`${d.decidedAt}-${i}`}>
            {new Date(d.decidedAt).toLocaleString('en-US')}: {d.decision} @{d.username ?? 'member'} ({d.audience === 'creator' ? 'creator' : 'supporter'}).{' '}
            {d.reason}
            {d.evidenceRef ? ` Evidence: ${d.evidenceRef}.` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Scorecard({ report }: { report: ProgressionReport }) {
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : 'not yet measured')
  const block = (title: string, part: ProgressionReport['creator'], def: string) => (
    <div>
      <h4 className="text-[13px] font-bold text-ink-900">
        {title} ({part.denominator})
      </h4>
      <p className="text-[12px] text-ink-600">{def}</p>
      <ul className="mt-1 space-y-0.5 text-[13px] text-ink-800">
        {Object.entries(part.milestones).map(([m, n]) => (
          <li key={m}>
            {goalText(m).label}: {n} ({pct(n, part.denominator)})
          </li>
        ))}
      </ul>
    </div>
  )
  const statuses = (a: GoalAudience) =>
    Object.entries(report.statuses[a])
      .map(([k, v]) => `${STATUS_TEXT[k as QualificationStatus] ?? k} ${v}`)
      .join(', ') || 'none yet'
  return (
    <div className="space-y-3 rounded-2xl bg-paper p-4" data-testid="progression-scorecard">
      <h3 className="font-bold text-ink-900">Progression scorecard</h3>
      <p className="text-[12px] text-ink-600">Actual counts measured now, testers excluded. Money is simulated.</p>
      {block('Creators', report.creator, report.definitions.creator_denominator ?? '')}
      {block('Supporters', report.consumer, report.definitions.consumer_denominator ?? '')}
      <p className="text-[13px] text-ink-800">
        Creator statuses: {statuses('creator')}. Supporter statuses: {statuses('consumer')}.
      </p>
      <p className="text-[13px] text-ink-800">
        Qualified referrals: {report.referrals.qualifiedReferrals}; at most {report.referrals.theoreticalMaxQualifyingConsumers} supporters can reach the
        referral goal. {report.referrals.note}
      </p>
      <p className="text-[13px] text-ink-800">
        Integrity: {report.integrity.open_holds ?? 0} open hold(s) ({report.integrity.account_holds ?? 0} account-wide), {report.integrity.revocations ?? 0}{' '}
        revocation(s), {report.integrity.restorations ?? 0} restoration(s), {report.integrity.revenue_corrections ?? 0} revenue and{' '}
        {report.integrity.allocation_corrections ?? 0} allocation correction(s). Held creator amounts (simulated): {dollars(report.money.heldCreatorCents)}.
      </p>
    </div>
  )
}

/** Control Center: goals, review, holds, a simulated settlement and the scorecard. */
export function GoalsPanel() {
  const api = useAppApi()
  const [goals, setGoals] = useState<FounderGoals | null | undefined>(undefined)
  const [queue, setQueue] = useState<ProgressionQueue | null>(null)
  const [report, setReport] = useState<ProgressionReport | null>(null)
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [settled, setSettled] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    api.founderGoals().then(
      (g) => live && setGoals(g),
      () => live && setGoals(null),
    )
    api.founderProgressionQueue().then(
      (q) => live && setQueue(q),
      () => live && setQueue(null),
    )
    api.founderProgressionReport().then(
      (r) => live && setReport(r),
      () => live && setReport(null),
    )
    return () => {
      live = false
    }
  }, [api, version])
  if (goals === undefined) return <Spinner label="Loading goals…" />
  if (goals === null) return null
  const changed = (note: string) => (setVersion((v) => v + 1), setNotice(note))
  async function settle() {
    setError(null)
    setSettled(null)
    try {
      const r = await api.founderSettleEligible(reason)
      setReason('')
      setSettled(`Settled (simulated): ${r.creatorEntries} creator share(s) and ${r.consumerAllocations} supporter allocation(s). Nothing is paid.`)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(err)
    }
  }
  return (
    <div data-testid="goals-panel">
      <Card className="p-5">
        <h2 className="font-display text-lg font-extrabold text-ink-900">Progression</h2>
        <div className="mt-3 space-y-3">
          <p className="text-[14px] text-ink-700">
            Goals, review and simulated earnings (SP-PRG-001). Members see them only while the progression switch is on. Every change is recorded with its
            reason.
          </p>
          {notice && <Message tone="success">{notice}</Message>}
          {(['creator', 'consumer'] as const).map((a) => (
            <GoalsForm
              key={`${a}-${goals.versions.length}`}
              audience={a}
              goals={goals}
              onSaved={() => changed('Saved as a new version. Members already qualified stay qualified.')}
            />
          ))}
          {queue && <ReviewSection queue={queue} onChanged={changed} />}
          <GovernanceForm onChanged={changed} />
          {queue && <AuditList queue={queue} />}
          <div className="space-y-2 rounded-2xl bg-paper p-4">
            <h3 className="font-bold text-ink-900">Simulated settlement</h3>
            <p className="text-[13px] text-ink-600">
              Marks every unlocked amount of members in good standing, with no hold, as settled. A statement only: nothing is paid.
            </p>
            <Field label="Reason">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={control} />
            </Field>
            {error !== null && <Message tone="error">{messageFor(error)}</Message>}
            {settled && <Message tone="success">{settled}</Message>}
            <button type="button" onClick={() => void settle()} className={buttonClass('secondary', 'sm')}>
              Settle (simulated)
            </button>
          </div>
          {report && <Scorecard report={report} />}
        </div>
      </Card>
    </div>
  )
}
