/**
 * Progression (20261217000000, SP-REFINE-002): goals and SIMULATED locked
 * earnings in My Split (G2, G4, G5), and the founder's goal values in
 * Control Center (G1). Shown only while the progression switch is on. Goal
 * values come only from the founder; with none set, a goal shows progress
 * and unlocks nothing. Nothing here is paid.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { messageFor, type EarningsByState, type FounderGoals, type GoalAudience, type GoalStep, type MyProgress } from './api'
import { useAppApi } from './AppApiContext'

/** What each measure means, in the member's words. */
export const GOAL_TEXT: Record<string, { label: string; unit: string }> = {
  original_posts: { label: 'Publish original posts', unit: 'posts' },
  posting_weeks: {
    label: 'Post in different weeks (last 6 weeks)',
    unit: 'weeks',
  },
  genuine_followers: { label: 'Reach genuine followers', unit: 'followers' },
  active_supporters: {
    label: 'Have active supporters (last 28 days)',
    unit: 'supporters',
  },
  clique_connections: { label: 'Be in members’ Cliques', unit: 'members' },
  clique_engagement_weeks: {
    label: 'Support people in your Clique (last 4 weeks)',
    unit: 'weeks',
  },
  support_weeks: {
    label: 'Support creators you value (last 6 weeks)',
    unit: 'weeks',
  },
  shares: { label: 'Share posts by others (last 28 days)', unit: 'shares' },
  verified_contributions: {
    label: 'Make a verified contribution, such as a qualified referral',
    unit: 'contributions',
  },
}
const goalText = (metric: string) => GOAL_TEXT[metric] ?? { label: metric, unit: '' }

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
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

function EarningsRow({ e, testId }: { e: EarningsByState; testId: string }) {
  const unlocked = e.eligibleCents + e.settledCents
  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-[#a8d9cf] p-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-ink-900">Earnings</span>
        <span className="rounded-full bg-[#e7f4f1] px-2 py-0.5 text-[11px] font-bold text-[#1f5e52]">Simulated</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {[
          ['Accumulated', e.accumulatedCents],
          ['Locked', e.lockedCents],
          ['Unlocked', unlocked],
        ].map(([label, cents]) => (
          <div key={label as string}>
            <dt className="text-[12px] text-ink-600">{label}</dt>
            <dd className="font-display text-[18px] font-extrabold tabular-nums text-ink-900">{dollars(cents as number)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function GoalCard({
  title,
  journey,
  earnings,
  audience,
  goodStanding,
}: {
  title: string
  journey: { qualifiedAt: string | null; steps: GoalStep[] }
  earnings: EarningsByState
  audience: GoalAudience
  goodStanding: boolean
}) {
  const set = journey.steps.length > 0 && journey.steps.every((s) => s.target !== null)
  const done = journey.steps.filter((s) => s.target !== null && s.value >= s.target).length
  const next = journey.steps.find((s) => s.target !== null && s.value < s.target)
  return (
    <div data-testid={`goals-${audience}`}>
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold text-ink-900">{title}</h2>
          {journey.qualifiedAt ? (
            <span className="text-[13px] font-semibold text-[#0f7a64]">Goals met</span>
          ) : (
            set && (
              <span className="text-[13px] tabular-nums text-ink-600">
                {done} of {journey.steps.length}
              </span>
            )
          )}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-600" data-testid={`goals-${audience}-status`}>
          {journey.qualifiedAt
            ? 'Your earnings are unlocked. Nothing is paid during the pilot.'
            : !set
              ? 'Your progress so far. The goals that unlock earnings have not been set yet, so nothing unlocks for now.'
              : !goodStanding
                ? 'While an account restriction is in force, nothing unlocks. It continues once it ends.'
                : next
                  ? `Next: ${goalText(next.metric).label.toLowerCase()}.`
                  : 'You have met every goal. Your earnings unlock the next time you open My Split.'}
        </p>
        <ul className="mt-3 space-y-2.5">
          {journey.steps.map((s) => (
            <StepRow key={s.metric} step={s} />
          ))}
        </ul>
        <EarningsRow e={earnings} testId={`earnings-${audience}`} />
        {!journey.qualifiedAt && earnings.lockedCents > 0 && (
          <p className="mt-2 text-[12px] text-ink-600">Locked amounts stay yours until you meet the goals. Splitpost never takes them.</p>
        )}
      </Card>
    </div>
  )
}

/** The goal cards of My Split (shown only while progression is on). */
export function ProgressCards({ progress }: { progress: Extract<MyProgress, { enabled: true }> }) {
  const creatorShown =
    progress.creator.qualifiedAt !== null ||
    progress.earnings.creator.accumulatedCents > 0 ||
    progress.creator.steps.some((s) => s.metric === 'original_posts' && s.value > 0)
  return (
    <>
      {creatorShown && (
        <GoalCard
          title="Creator goals"
          audience="creator"
          journey={progress.creator}
          earnings={progress.earnings.creator}
          goodStanding={progress.goodStanding}
        />
      )}
      <GoalCard
        title="Supporter goals"
        audience="consumer"
        journey={progress.consumer}
        earnings={progress.earnings.consumer}
        goodStanding={progress.goodStanding}
      />
    </>
  )
}

const control = 'mt-1 block min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-base text-ink-900'

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
          ? `In force since ${new Date(current.setAt).toLocaleDateString('en-US')}: ${current.reason}. ${goals.qualified[audience]} qualified.`
          : 'Not set. Until every value is set, nobody on this journey qualifies.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map((m) => (
          <label key={m} className="block text-sm font-semibold text-ink-800">
            {goalText(m).label}
            <input
              type="number"
              inputMode="numeric"
              value={values[m] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              className={control}
            />
          </label>
        ))}
      </div>
      <label className="block text-sm font-semibold text-ink-800">
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={control} />
      </label>
      {error !== null && <Message tone="error">{messageFor(error)}</Message>}
      <button type="submit" className={buttonClass('primary', 'sm')}>
        Save {audience === 'creator' ? 'creator' : 'supporter'} goals
      </button>
    </form>
  )
}

/** Control Center: the founder sets goal values (versioned, with a reason) and runs a simulated settlement. */
export function GoalsPanel() {
  const api = useAppApi()
  const [goals, setGoals] = useState<FounderGoals | null | undefined>(undefined)
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
    return () => {
      live = false
    }
  }, [api, version])
  if (goals === undefined) return <Spinner label="Loading goals…" />
  if (goals === null) return null
  async function settle() {
    setError(null)
    setSettled(null)
    try {
      const r = await api.founderSettleEligible(reason)
      setReason('')
      setSettled(`Settled (simulated): ${r.creatorEntries} creator share(s) and ${r.consumerAllocations} supporter allocation(s). Nothing is paid.`)
    } catch (err) {
      setError(err)
    }
  }
  return (
    <div data-testid="goals-panel">
      <Card className="p-5">
        <h2 className="font-display text-lg font-extrabold text-ink-900">Progression goals</h2>
        <div className="mt-3 space-y-3">
          <p className="text-[14px] text-ink-700">
            The values members must reach to unlock simulated earnings. Every change is a new version with its reason; members already qualified stay qualified.
            Members see goals only while the progression switch is on.
          </p>
          {notice && <Message tone="success">{notice}</Message>}
          {(['creator', 'consumer'] as const).map((a) => (
            <GoalsForm
              key={`${a}-${goals.versions.length}`}
              audience={a}
              goals={goals}
              onSaved={() => (setVersion((v) => v + 1), setNotice('Saved as a new version. Members already qualified stay qualified.'))}
            />
          ))}
          <div className="space-y-2 rounded-2xl bg-paper p-4">
            <h3 className="font-bold text-ink-900">Simulated settlement</h3>
            <p className="text-[13px] text-ink-600">Marks every unlocked amount of members in good standing as settled. A statement only: nothing is paid.</p>
            <label className="block text-sm font-semibold text-ink-800">
              Reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={control} />
            </label>
            {error !== null && <Message tone="error">{messageFor(error)}</Message>}
            {settled && <Message tone="success">{settled}</Message>}
            <button type="button" onClick={() => void settle()} className={buttonClass('secondary', 'sm')}>
              Settle (simulated)
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
