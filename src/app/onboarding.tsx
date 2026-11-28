/**
 * Progressive onboarding for one unified account (20261211000000).
 *
 * Every member can read, post and (once approved) advertise. Nothing here is a
 * separate account type and nothing is required: each piece appears when it
 * becomes relevant and can be skipped.
 *
 *   * InviterCard: who invited you, with Follow and Not now. Never automatic.
 *   * MySplitIntro: what Connection Points are, in plain words, with the
 *     Splitpost symbol. Simulated during the pilot, never money.
 *   * FirstPostGuide: a short guide on Create before the first post.
 */
import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { MySplitIcon } from '../components/MySplitIcon'
import { Message } from '../public/auth/AuthUi'
import { messageFor, type AppApi, type Features, type Inviter } from './api'
import { useAppApi } from './AppApiContext'
import { TopicTags, useTopics } from './profileDetails'

export const POSTING_TOPICS_MAX = 3

/** Who invited the new member, shown once in setup. Following is their choice. */
export function InviterCard() {
  const api = useAppApi()
  const { topics } = useTopics()
  const [inviter, setInviter] = useState<Inviter | null | undefined>(undefined)
  const [state, setState] = useState<'ask' | 'following' | 'later'>('ask')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    api.myInviter().then(
      (i) => live && (setInviter(i), i?.following && setState('following')),
      () => live && setInviter(null),
    )
    return () => {
      live = false
    }
  }, [api])
  if (!inviter) return null
  async function follow() {
    if (!inviter) return
    setBusy(true)
    setError(null)
    try {
      await api.follow(inviter.id, 'other')
      setState('following')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-testid="inviter-card">
      <Card className="p-4">
        <p className="text-[13px] font-semibold text-brand-800">You're here because of</p>
        <p className="mt-1 font-display text-lg font-extrabold text-ink-900">
          {inviter.displayName} <span className="text-[14px] font-semibold text-ink-500">@{inviter.username}</span>
        </p>
        {inviter.postingTopics.length > 0 && (
          <div className="mt-2">
            <TopicTags slugs={inviter.postingTopics} topics={topics} />
          </div>
        )}
        {state === 'ask' && (
          <>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
              They invited you to Splitpost. Follow them if you'd like their posts in your Following feed.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void follow()} disabled={busy} className={buttonClass('primary')}>
                <UserPlus className="h-4 w-4" aria-hidden="true" /> Follow {inviter.displayName}
              </button>
              <button type="button" onClick={() => setState('later')} className={buttonClass('secondary')}>
                Not now
              </button>
            </div>
          </>
        )}
        {state === 'following' && <p className="mt-2 text-[14px] font-semibold text-brand-800">You're following {inviter.displayName}.</p>}
        {state === 'later' && <p className="mt-2 text-[14px] text-ink-600">No problem. You can follow them from their profile any time.</p>}
        {error !== null && (
          <div className="mt-3">
            <Message tone="error">{messageFor(error)}</Message>
          </div>
        )}
      </Card>
    </div>
  )
}

/** How My Split works, in three short points. */
export function MySplitIntro({ heading = 'How My Split works' }: { heading?: string | null }) {
  return (
    <div className="space-y-3" data-testid="my-split-intro">
      {heading && (
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink-900">
          <MySplitIcon className="h-6 w-6 text-brand-700" /> {heading}
        </h2>
      )}
      <ol className="space-y-3 text-[15px] leading-relaxed text-ink-800">
        <li className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-800">1</span>
          <span>
            <strong>You add value.</strong> A thoughtful comment, a save, a share, or bringing a friend who follows a creator all count.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-800">2</span>
          <span>
            <strong>Splitpost recognizes it with Connection Points.</strong> Points are recognized first. Some, like a referral, become redeemable after a quick
            review.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-800">3</span>
          <span>
            <strong>My Split shows your share.</strong> During the pilot every value is simulated. Points are not money and nothing is paid.
          </span>
        </li>
      </ol>
    </div>
  )
}

export function FirstPostGuide() {
  const api = useAppApi()
  const [posts, setPosts] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    api.myCreatorSetup().then(
      (s) => live && setPosts(s ? s.posts : null),
      () => live && setPosts(null),
    )
    return () => {
      live = false
    }
  }, [api])
  if (posts === null || posts > 0) return null
  return (
    <div data-testid="first-post-guide">
      <Card className="p-4">
        <h2 className="font-display text-base font-extrabold text-ink-900">Your first post</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-ink-700">
          <li>Say hello and what people can expect from you.</li>
          <li>Pick a topic so people who care about it can find it.</li>
          <li>It goes into your followers’ Home feeds, newest first. Nothing is ranked or hidden, though who opens it is up to them.</li>
        </ul>
      </Card>
    </div>
  )
}

// One request per page load: the switches the screens depend on (20261212000000).
const featureCache = new WeakMap<AppApi, Promise<Features | null>>()
/** Which features are on; everything is assumed on while loading or before the migration. The server enforces each switch itself. */
export function useFeatures(): Features {
  const api = useAppApi()
  const [f, setF] = useState<Features | null>(null)
  useEffect(() => {
    let live = true
    let p = featureCache.get(api)
    if (!p) {
      p = api.features().catch(() => null)
      featureCache.set(api, p)
    }
    p.then((x) => live && setF(x))
    return () => {
      live = false
    }
  }, [api])
  return f ?? { ads: true, sharing: true, videoPosts: false, videoPlayback: true, photos: false, rewards: true }
}
