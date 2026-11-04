import clsx from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, CheckCircle2, Download, KeyRound, Lock, PartyPopper, Ticket } from 'lucide-react'
import type { Redemption, Reward, RewardKind } from '../types'
import { useStore } from '../state/store'
import { FollowButton } from './CreatorCard'
import { Button, CPAmount, CreatorAvatar, DemoTag, Modal, buttonClass } from './ui'

export const KIND_META: Record<RewardKind, { label: string; icon: typeof Award; tint: string }> = {
  digital: { label: 'Digital download', icon: Download, tint: 'bg-brand-50 text-brand-700' },
  access: { label: 'Exclusive access', icon: KeyRound, tint: 'bg-[#efeafd] text-[#5b3fb0]' },
  recognition: { label: 'Recognition', icon: Award, tint: 'bg-spark-50 text-spark-700' },
  experience: { label: 'Experience', icon: Ticket, tint: 'bg-[#fdeceb] text-[#a8352b]' },
}

export function RewardCard({ reward }: { reward: Reward }) {
  const { creatorById, rewardStatus, remainingStock, redeem, balance, state } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<Redemption | null>(null)
  const creator = creatorById(reward.creatorId)
  if (!creator) return null

  const status = rewardStatus(reward)
  const left = remainingStock(reward)
  const meta = KIND_META[reward.kind]
  const progress = Math.min(1, balance / reward.cost)
  const redeemed = state.redemptions.find((r) => r.rewardId === reward.id)

  let cta: React.ReactNode
  if (status.canRedeem) {
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
    cta = <span className="text-sm font-semibold text-ink-400">All claimed</span>
  } else if (status.reason === 'own') {
    cta = <span className="text-sm font-semibold text-ink-400">Your reward</span>
  } else {
    cta = (
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500">
        <Lock className="h-3.5 w-3.5" /> {status.needed?.toLocaleString()} CP to go
      </span>
    )
  }

  return (
    <article className="rounded-3xl bg-card p-4 shadow-[0_1px_2px_rgb(19_25_27/0.06),0_0_0_1px_rgb(19_25_27/0.05)]">
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', meta.tint)}>
          <meta.icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold leading-snug text-ink-900">{reward.title}</h3>
          </div>
          <Link to={`/creator/${creator.id}`} className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-800">
            <CreatorAvatar creator={creator} size={18} />
            {creator.name}
          </Link>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">{reward.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
            <span>{meta.label}</span>
            <span aria-hidden="true">·</span>
            <span>{left === null ? 'Unlimited' : left === 0 ? 'None left' : `${left} of ${reward.stock} left`}</span>
            <DemoTag>Simulated</DemoTag>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <div className="min-w-0 flex-1">
          <CPAmount value={reward.cost} className="text-ink-900" />
          {!status.canRedeem && status.reason === 'points' && (
            <div className="mt-1.5 h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
              <div className="h-full rounded-full bg-spark-400" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
        {cta}
      </div>

      <Modal
        open={confirming}
        onClose={() => {
          setConfirming(false)
          setDone(null)
        }}
        title={done ? 'Reward redeemed' : 'Redeem this reward?'}
      >
        {done ? (
          <div className="text-center">
            <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-spark-50 text-spark-600">
              <PartyPopper className="h-8 w-8" />
            </span>
            <p className="font-semibold text-ink-900">{reward.title}</p>
            <p className="text-sm text-ink-500">from {creator.name}</p>
            <div className="my-5 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-500">Demo confirmation code</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-ink-900">{done.code}</p>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-500">
              This is a simulated redemption. Nothing will be delivered and the code cannot be used anywhere. In a real version,{' '}
              {creator.name.split(' ')[0]} would be notified and fulfil it.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link to="/profile?tab=redemptions" className={buttonClass('secondary')}>
                View history
              </Link>
              <Button
                onClick={() => {
                  setConfirming(false)
                  setDone(null)
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="rounded-2xl bg-ink-50 p-4">
              <p className="font-semibold">{reward.title}</p>
              <p className="text-sm text-ink-500">from {creator.name}</p>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Current balance</dt>
                  <dd className="font-semibold tabular-nums">{balance.toLocaleString()} CP</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Reward cost</dt>
                  <dd className="font-semibold tabular-nums text-[#b2342a]">−{reward.cost.toLocaleString()} CP</dd>
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-1.5">
                  <dt className="font-semibold">Balance after</dt>
                  <dd className="font-bold tabular-nums">{(balance - reward.cost).toLocaleString()} CP</dd>
                </div>
              </dl>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              Connection Points and rewards in this prototype are for demonstration only. They have no monetary value and nothing real is
              exchanged.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="spark"
                onClick={() => {
                  const r = redeem(reward.id)
                  if (r) setDone(r)
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {redeemed && !confirming && (
        <p className="mt-2 text-[12px] text-ink-500">
          Demo code <span className="font-mono font-semibold text-ink-700">{redeemed.code}</span>
        </p>
      )}
    </article>
  )
}
