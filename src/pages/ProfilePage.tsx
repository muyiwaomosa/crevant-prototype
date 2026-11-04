import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bookmark, Gift, Info, Pencil, RotateCcw, Users } from 'lucide-react'
import { useNow, useStore } from '../state/store'
import { PostCard } from '../components/PostCard'
import { FollowButton } from '../components/CreatorCard'
import { Avatar, Button, Card, CreatorAvatar, CreatorName, EmptyState, Modal, Tabs, buttonClass } from '../components/ui'
import { relativeTime } from '../lib/time'
import { SELF_ID } from '../data/seed'
import type { Category } from '../types'

type Tab = 'saved' | 'following' | 'redemptions'
const CATEGORIES: Category[] = ['Art', 'Books', 'Fitness', 'Food', 'Music', 'Tech', 'Travel', 'Wellness']

function EditProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, updateProfile, pushToast } = useStore()
  const [name, setName] = useState(state.profile.name)
  const [handle, setHandle] = useState(state.profile.handle)
  const [bio, setBio] = useState(state.profile.bio)
  const [category, setCategory] = useState<Category>(state.profile.category)
  const valid = name.trim().length >= 2 && /^[a-z0-9_]{3,20}$/.test(handle)
  const field = 'mt-1 w-full rounded-xl bg-ink-50 px-3 py-2.5 text-[15px] ring-1 ring-ink-100 focus:outline-none focus:ring-2 focus:ring-brand-500'
  return (
    <Modal open={open} onClose={onClose} title="Edit profile">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          updateProfile({ name: name.trim(), handle, bio: bio.trim(), category })
          pushToast({ tone: 'success', title: 'Profile updated' })
          onClose()
        }}
        className="space-y-4"
      >
        <label className="block text-sm font-semibold">
          Display name
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} className={field} />
        </label>
        <label className="block text-sm font-semibold">
          Handle
          <div className="relative">
            <span className="absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-ink-400">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
              className={`${field} pl-7`}
              aria-describedby="handle-help"
            />
          </div>
          <span id="handle-help" className="mt-1 block text-[12px] font-normal text-ink-500">
            3 to 20 characters: letters, numbers, underscores.
          </span>
        </label>
        <label className="block text-sm font-semibold">
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={3} className={`${field} resize-none`} />
        </label>
        <label className="block text-sm font-semibold">
          Creator category
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={field}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <button type="submit" disabled={!valid} className={buttonClass('primary')}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ProfilePage() {
  const { state, balance, postById, creatorById, resetDemo } = useStore()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && ['saved', 'following', 'redemptions'].includes(tabParam) ? tabParam : 'saved'
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const savedPosts = Object.entries(state.saved)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => postById(id))
    .filter((p) => p !== undefined)

  return (
    <div>
      <Card className="mb-5 p-5">
        <div className="flex items-start gap-4">
          <Avatar name={state.profile.name} hue={168} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{state.profile.name}</h1>
            <p className="text-sm text-ink-500">@{state.profile.handle}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">{state.profile.bio}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit profile
          </Button>
          <Link to={`/creator/${SELF_ID}`} className={buttonClass('secondary', 'sm')}>
            View creator page
          </Link>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ['Following', state.following.length],
            ['Saved', savedPosts.length],
            ['CP', balance.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-ink-50 py-2.5">
              <dt className="text-[12px] text-ink-500">{label}</dt>
              <dd className="font-display text-lg font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Tabs
        label="Profile sections"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'saved', label: 'Saved', count: savedPosts.length },
          { id: 'following', label: 'Following', count: state.following.length },
          { id: 'redemptions', label: 'Redeemed', count: state.redemptions.length },
        ]}
      />

      <div className="mb-8">
        {tab === 'saved' &&
          (savedPosts.length === 0 ? (
            <EmptyState icon={<Bookmark className="h-7 w-7" />} title="Nothing saved yet" body="Tap the bookmark on any post to keep it here." />
          ) : (
            <div className="space-y-4">
              {savedPosts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ))}

        {tab === 'following' &&
          (state.following.length === 0 ? (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="Not following anyone"
              body="Find creators you love on Discover."
              action={
                <Link to="/discover" className={buttonClass('primary')}>
                  Discover creators
                </Link>
              }
            />
          ) : (
            <Card className="divide-y divide-ink-100">
              {state.following.map((id) => {
                const c = creatorById(id)
                if (!c) return null
                return (
                  <div key={id} className="flex items-center gap-3 px-4 py-3">
                    <CreatorAvatar creator={c} size={42} />
                    <div className="min-w-0 flex-1">
                      <CreatorName creator={c} className="max-w-full text-sm" />
                      <p className="truncate text-[13px] text-ink-500">{c.category}</p>
                    </div>
                    <FollowButton creator={c} size="sm" />
                  </div>
                )
              })}
            </Card>
          ))}

        {tab === 'redemptions' &&
          (state.redemptions.length === 0 ? (
            <EmptyState
              icon={<Gift className="h-7 w-7" />}
              title="No rewards redeemed yet"
              body="Redeemed demo rewards and their confirmation codes appear here."
              action={
                <Link to="/rewards" className={buttonClass('primary')}>
                  Browse rewards
                </Link>
              }
            />
          ) : (
            <Card className="divide-y divide-ink-100">
              {state.redemptions.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-spark-50 text-spark-600">
                    <Gift className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.rewardTitle}</p>
                    <p className="text-[12px] text-ink-500">
                      {creatorById(r.creatorId)?.name} · {relativeTime(r.at, now)} · <span className="font-mono">{r.code}</span>
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[#b2342a]">−{r.cost}</span>
                </div>
              ))}
            </Card>
          ))}
      </div>

      <section aria-labelledby="about-title" className="space-y-3">
        <h2 id="about-title" className="font-display text-lg font-bold">
          About this demo
        </h2>
        <Card className="p-4 text-sm leading-relaxed text-ink-600">
          <p className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <span>
              This is an early Crevant prototype. There are no accounts and no server: every creator, post, comment, point, and reward is
              sample data stored only in this browser. Connection Points have no monetary value.
            </span>
          </p>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Reset demo</p>
            <p className="text-[13px] text-ink-500">Clear your follows, points, posts, and rewards and start fresh.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </Card>
      </section>

      {editing && <EditProfile open={editing} onClose={() => setEditing(false)} />}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset the demo?">
        <p className="text-sm leading-relaxed text-ink-600">
          This restores the original sample data. Your follows, likes, comments, saved posts, points, redemptions, and anything you created in
          the creator studio will be removed from this browser.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              resetDemo()
              setConfirmReset(false)
              setParams({}, { replace: true })
            }}
          >
            Reset demo
          </Button>
        </div>
      </Modal>
    </div>
  )
}
