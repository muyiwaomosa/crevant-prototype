import clsx from 'clsx'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { RewardKind } from '../../types'
import { useStore } from '../../state/store'
import { KIND_META } from '../../components/RewardCard'
import { Button, CPAmount, Card, DemoTag, Notice } from '../../components/ui'
import { SELF_ID } from '../../data/seed'

const PRESETS = [15, 30, 60, 100, 150]

/** Create and manage the rewards this participant offers. Lives in Profile → Creator tools. */
export function RewardManager() {
  const { rewards, createReward, deleteReward, pushToast } = useStore()
  const mine = rewards.filter((r) => r.creatorId === SELF_ID)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState(30)
  const [kind, setKind] = useState<RewardKind>('digital')
  const [limited, setLimited] = useState(false)
  const [stock, setStock] = useState(10)

  const valid = title.trim().length >= 3 && description.trim().length >= 10 && cost >= 5 && cost <= 1000 && (!limited || stock >= 1)
  const field = 'mt-1 w-full rounded-xl bg-ink-50 px-3 py-2.5 text-[15px] font-normal ring-1 ring-ink-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    createReward({ title, description, cost, kind, stock: limited ? stock : null })
    pushToast({ tone: 'success', title: 'Reward created', body: 'Your followers can now see it on the Rewards page.' })
    setTitle('')
    setDescription('')
    setCost(30)
    setLimited(false)
  }

  return (
    <div>

      <Notice tone="spark" className="mb-5">
        Rewards you create are demonstrations. People redeem them only with CP they earned engaging with you. Nothing is sold, delivered, or paid for.
      </Notice>

      <Card className="mb-6 p-4 sm:p-5">
        <h3 className="mb-4 font-display text-lg font-bold">Create a reward</h3>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="e.g. Signed sketchbook page" className={field} />
          </label>
          <label className="block text-sm font-semibold">
            What people get
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="Describe the reward in a sentence or two."
              className={`${field} resize-none`}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold">Type</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(KIND_META) as RewardKind[]).map((k) => {
                const meta = KIND_META[k]
                return (
                  <label
                    key={k}
                    className={clsx(
                      'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ring-1 transition',
                      kind === k ? 'bg-brand-50 text-brand-800 ring-2 ring-brand-500' : 'bg-white text-ink-700 ring-ink-100 hover:ring-ink-200',
                    )}
                  >
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                    <meta.icon className="h-4 w-4" />
                    {meta.label}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="cost" className="text-sm font-semibold">
              Cost in CP
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCost(p)}
                  aria-pressed={cost === p}
                  className={clsx(
                    'h-9 rounded-full px-3.5 text-sm font-semibold tabular-nums ring-1',
                    cost === p ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-700 ring-ink-100 hover:ring-ink-200',
                  )}
                >
                  {p}
                </button>
              ))}
              <input
                id="cost"
                type="number"
                inputMode="numeric"
                min={5}
                max={1000}
                value={cost}
                onChange={(e) => setCost(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                className="h-9 w-24 rounded-full bg-ink-50 px-3 text-sm font-semibold tabular-nums ring-1 ring-ink-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-describedby="cost-help"
              />
            </div>
            <p id="cost-help" className="mt-1.5 text-[12px] text-ink-500">
              Between 5 and 1,000. People can only spend CP they earned with you. Someone who likes, saves, and comments on a post earns
              about 8 CP, so 15 CP is one or two posts and 100 CP is several weeks of regular engagement.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Limited quantity
            </label>
            {limited && (
              <label className="mt-2 block text-sm text-ink-600">
                How many are available?
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={stock}
                  onChange={(e) => setStock(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
                  className={`${field} w-32`}
                />
              </label>
            )}
          </div>

          <Button type="submit" disabled={!valid} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Create reward
          </Button>
        </form>
      </Card>

      <h3 className="mb-3 font-display text-lg font-bold">Rewards you offer</h3>
      {mine.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-ink-500 ring-1 ring-ink-100">
          No rewards yet. Create one above and it will appear on the Rewards page under your name.
        </p>
      ) : (
        <div className="space-y-3">
          {mine.map((r) => {
            const meta = KIND_META[r.kind]
            return (
              <Card key={r.id} className="flex items-start gap-3 p-4">
                <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', meta.tint)}>
                  <meta.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-sm text-ink-600">{r.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
                    <CPAmount value={r.cost} className="text-ink-800" />
                    <span>· {r.stock === null ? 'Unlimited' : `${r.stock} available`}</span>
                    <DemoTag>Simulated</DemoTag>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    deleteReward(r.id)
                    pushToast({ tone: 'info', title: 'Reward removed' })
                  }}
                  className="-m-1 rounded-full p-2 text-ink-400 hover:bg-[#fdeceb] hover:text-[#b2342a]"
                  aria-label={`Delete ${r.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
