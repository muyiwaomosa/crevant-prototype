import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bookmark, Camera, ChevronRight, Info, Pencil, RotateCcw, Users, Wrench } from 'lucide-react'
import { MyPosts } from './tools/MyPosts'
import { formatCompact } from '../lib/format'
import { AvatarEditor } from '../components/AvatarEditor'
import { useStore } from '../state/store'
import { PostCard } from '../components/PostCard'
import { FollowButton } from '../components/CreatorCard'
import { Avatar, Button, Card, CreatorAvatar, CreatorName, EmptyState, Modal, Tabs, buttonClass } from '../components/ui'
import { SELF_ID } from '../data/seed'
import type { Category } from '../types'

type Tab = 'posts' | 'saved' | 'following'
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
          Category
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
  const { state, lifetime, postById, posts, creatorById, followerCount, resetDemo } = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && ['posts', 'saved', 'following'].includes(tabParam) ? tabParam : 'posts'
  const [editing, setEditing] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const myPostCount = posts.filter((p) => p.creatorId === SELF_ID).length
  const savedPosts = Object.entries(state.saved)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => postById(id))
    .filter((p) => p !== undefined)

  return (
    <div>
      <Card className="mb-5 p-5">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setEditingPhoto(true)}
            className="group relative shrink-0 rounded-full"
            aria-label={state.profile.avatar ? 'Change profile picture' : 'Add profile picture'}
          >
            <Avatar name={state.profile.name} hue={168} src={state.profile.avatar} size={72} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-ink-900 text-white ring-2 ring-white group-hover:bg-brand-700">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{state.profile.name}</h1>
            <p className="text-sm text-ink-600">
              @{state.profile.handle} · {state.profile.category}
            </p>
            {state.profile.bio && <p className="mt-2 text-sm leading-relaxed text-ink-700">{state.profile.bio}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit profile
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditingPhoto(true)}>
            <Camera className="h-4 w-4" /> {state.profile.avatar ? 'Change photo' : 'Add photo'}
          </Button>
        </div>
        <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
          {[
            ['Posts', String(myPostCount), null],
            ['Followers', formatCompact(followerCount(SELF_ID)), 'demo'],
            ['Following', String(state.following.length), null],
            ['CP earned', lifetime.toLocaleString(), null],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-2xl bg-ink-50 px-1 py-2.5">
              <dt className="text-[12px] text-ink-600">{label}</dt>
              <dd className="font-display text-lg font-bold tabular-nums">{value}</dd>
              {note && <dd className="text-[10px] font-semibold uppercase tracking-wide text-ink-600">{note}</dd>}
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] leading-snug text-ink-600">
          Your follower count is simulated. In this prototype nobody else can see your profile, because it lives only in this browser.
        </p>
      </Card>

      <Link
        to="/profile/tools"
        className="mb-6 flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-ink-100 transition hover:ring-ink-200"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <Wrench className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink-900">Creator tools</span>
          <span className="block text-[13px] leading-snug text-ink-600">Offer rewards to people who engage with you, and see your audience.</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-500" />
      </Link>

      <Tabs
        label="Profile sections"
        value={tab}
        onChange={(t) => setParams(t === 'posts' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: 'posts', label: 'Posts', count: myPostCount },
          { id: 'saved', label: 'Saved', count: savedPosts.length },
          { id: 'following', label: 'Following', count: state.following.length },
        ]}
      />

      <div className="mb-8">
        {tab === 'posts' && <MyPosts />}

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
              body="Find people whose posts you want to see on Discover."
              action={
                <Link to="/discover" className={buttonClass('primary')}>
                  Discover people
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
                      <p className="truncate text-[13px] text-ink-600">{c.category}</p>
                    </div>
                    <FollowButton creator={c} size="sm" />
                  </div>
                )
              })}
            </Card>
          ))}
      </div>

      <section aria-labelledby="about-title" className="space-y-3">
        <h2 id="about-title" className="font-display text-lg font-bold">
          About this demo
        </h2>
        <Card className="p-4 text-sm leading-relaxed text-ink-600">
          <p className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
            <span>
              This is an early Crevant prototype. There are no accounts and no server: every person, post, comment, point, and reward is sample
              data stored only in this browser. Connection Points have no monetary value.
            </span>
          </p>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Welcome tour</p>
            <p className="text-[13px] text-ink-600">See the short introduction again. Your data stays as it is.</p>
          </div>
          <Link to="/welcome?replay=1" className={buttonClass('secondary', 'sm')}>
            Replay
          </Link>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Reset demo</p>
            <p className="text-[13px] text-ink-600">Clear your follows, points, posts, rewards, and picture, and start fresh.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </Card>
      </section>

      {editing && <EditProfile open={editing} onClose={() => setEditing(false)} />}
      <AvatarEditor open={editingPhoto} onClose={() => setEditingPhoto(false)} />

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset the demo?">
        <p className="text-sm leading-relaxed text-ink-600">
          This restores the original sample data. Your follows, likes, comments, saved posts, points, redemptions, profile picture, and anything you
          published or offered will be removed from this browser. You'll see the welcome again.
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
              navigate('/welcome')
            }}
          >
            Reset demo
          </Button>
        </div>
      </Modal>
    </div>
  )
}
