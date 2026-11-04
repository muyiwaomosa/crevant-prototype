import clsx from 'clsx'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, CheckCircle2, Download, KeyRound, Lock, PartyPopper, Sparkles, Ticket } from 'lucide-react'
import type { Redemption, Reward, RewardKind } from '../types'
import { useStore } from '../state/store'
import { rewardProgress } from '../lib/points'
import { FollowButton } from './CreatorCard'
import { Button, CPAmount, CreatorAvatar, DemoTag, Modal, buttonClass } from './ui'

export const KIND_META: Record<RewardKind, { label: string; icon: typeof Award; tint: string }> = {
  digital: { label: 'Digital download', icon: Download, tint: 'bg-brand-50 text-brand-700' },
  access: { label: 'Exclusive access', icon: KeyRound, tint: 'bg-[#efeafd] text-[#5b3fb0]' },
  recognition: { label: 'Recognition', icon: Award, tint: 'bg-spark-50 text-spark-700' },
  experience: { label: 'Experience', icon: Ticket, tint: 'bg-[#fdeceb] text-[#a8352b]' },
}

export function RewardCard({ reward, showCreator = true }: { reward: Reward; showCreator?: boolean }) {
  const { creatorById, eligibility, remainingStock, redeem, state, pushToast } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<Redemption | null>(null)
  const [busy, setBusy] = useState(false)
  // A ref, not state: it blocks a second click in the same tick, before React re-renders.
  const inFlight = useRef(false)
  const creator = creatorById(reward.creatorId)
  if (!creator) return null

  const first = creator.name.split(' ')[0]
  const status = eligibility(reward)
  const balance = status.balance
  const left = remainingStock(reward)
  const meta = KIND_META[reward.kind]
  const progress = rewardProgress(balance, reward.cost)
  const needed = Math.max(0, reward.cost - balance)
  const redeemed = state.redemptions.find((r) => r.rewardId === reward.id)
  const showProgress = !creator.isSelf && !redeemed && (status.ok || status.reason === 'points' || status.reason === 'follow')

  const close = () => {
    setConfirming(false)
    setDone(null)
    inFlight.current = false
  }

  const confirm = () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const result = redeem(reward.id)
    setBusy(false)
    if (result.ok) {
      // Stay locked until the dialog closes, so extra clicks are ignored.
      setDone(result.redemption)
      return
    }
    inFlight.current = false
    setConfirming(false)
    pushToast({ tone: 'warn', title: 'Not redeemed', body: 'This reward is no longer available to you. Nothing was deducted.' })
  }

  let cta: React.ReactNode
  if (status.ok) {
    cta = (
      <Button variant="spark" size="sm" onClick={() => setConfirming(true)}>
        Redeem
      </Button>
    )
  } else if (status.reason === 'follow') {
    cta = <FollowButton creator={creator} size="sm" />
  } else if (status.reason === 'redeemed') {
    cta = (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
        <CheckCircle2 className="h-4 w-4" /> Redeemed
      </span>
    )
  } else if (status.reason === 'soldOut') {
    cta = <span className="text-sm font-semibold text-ink-500">All claimed</span>
  } else if (status.reason === 'own') {
    cta = <span className="text-sm font-semibold text-ink-500">Your reward</span>
  } else {
    cta = (
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-600">
        <Lock className="h-3.5 w-3.5" /> {needed.toLocaleString()} CP to go
      </span>
    )
  }

  return (
    <article className="rounded-3xl bg-card p-4 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]" aria-label={`${reward.title}, ${reward.cost} CP with ${creator.name}`}>
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', meta.tint)}>
          <meta.icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-ink-900">{reward.title}</h3>
          {showCreator && (
            <Link to={`/creator/${creator.id}`} className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-ink-600 hover:text-ink-900">
              <CreatorAvatar creator={creator} size={18} />
              {creator.name}
            </Link>
          )}
          <p className="mt-2 text-sm leading-relaxed text-ink-600">{reward.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-600">
            <span>{meta.label}</span>
            <span aria-hidden="true">·</span>
            <span>{left === null ? 'Unlimited' : left === 0 ? 'None left' : `${left} of ${reward.stock} left`}</span>
            <DemoTag>Simulated reward</DemoTag>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-ink-100 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CPAmount value={reward.cost} className="text-ink-900" />
            <span className="ml-1 text-[12px] text-ink-600">with {first}</span>
          </div>
          {cta}
        </div>

        {showProgress && (
          <div className="mt-3">
            <div className="flex justify-between text-[12px] text-ink-600">
              <span>
                Your {first} balance: <strong className="font-semibold tabular-nums text-ink-900">{balance} CP</strong>
              </span>
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"
              role="progressbar"
              aria-label={`Progress toward ${reward.title}`}
              aria-valuemin={0}
              aria-valuemax={reward.cost}
              aria-valuenow={Math.min(balance, reward.cost)}
              aria-valuetext={`${Math.min(balance, reward.cost)} of ${reward.cost} CP with ${creator.name}`}
            >
              <div className="h-full rounded-full bg-spark-400 transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            {!status.ok && (
              <p className="mt-2 text-[12px] leading-snug text-ink-600">
                {status.reason === 'follow'
                  ? `Follow ${first} to start earning CP for this reward.`
                  : `Only CP earned with ${first} counts here. Points from other creators cannot be used.`}{' '}
                <Link to={`/creator/${creator.id}`} className="inline-flex items-center gap-0.5 font-semibold text-brand-700 hover:underline">
                  <Sparkles className="h-3 w-3" /> Earn more with {first}
                </Link>
              </p>
            )}
          </div>
        )}
        {redeemed && (
          <p className="mt-2 text-[12px] text-ink-600">
            Demo code <span className="font-mono font-semibold text-ink-800">{redeemed.code}</span>
            {redeemed.legacy && ' · redeemed with the old universal balance'}
          </p>
        )}
      </div>

      <Modal open={confirming} onClose={close} title={done ? 'Simulated reward redeemed' : 'Redeem this reward?'}>
        {done ? (
          <div className="text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-spark-50 text-spark-600">
              <PartyPopper className="h-8 w-8" />
            </span>
            <p className="font-semibold text-ink-900">{reward.title}</p>
            <p className="text-sm text-ink-600">from {creator.name}</p>
            <div className="my-5 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-600">Demo confirmation code</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-ink-900">{done.code}</p>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-600">
              This is a simulation. Nothing will be delivered, {first} is not contacted, and the code cannot be used anywhere. Your {first} balance is
              now {status.balance} CP.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link to="/rewards?tab=history" className={buttonClass('secondary')} onClick={close}>
                View history
              </Link>
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="rounded-2xl bg-ink-50 p-4">
              <p className="font-semibold">{reward.title}</p>
              <p className="text-sm text-ink-600">from {creator.name}</p>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">Your balance with {first}</dt>
                  <dd className="font-semibold tabular-nums">{balance} CP</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-600">Reward cost</dt>
                  <dd className="font-semibold tabular-nums text-[#b2342a]">−{reward.cost} CP</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-ink-200 pt-1.5">
                  <dt className="font-semibold">{first} balance after</dt>
                  <dd className="font-bold tabular-nums">{Math.max(0, balance - reward.cost)} CP</dd>
                </div>
              </dl>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-600">
              Only your CP with {first} is used. Your balances with other creators stay the same. This is a simulated reward: no money changes hands
              and nothing is delivered.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="spark" onClick={confirm} disabled={busy} aria-busy={busy}>
                {busy ? 'Redeeming…' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </article>
  )
}
