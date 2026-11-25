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
 *   * CreatorSetupCard: posting topics (up to 3), a first post, your own
 *     invitation link, and where your insights are. Shown on your own Profile.
 *   * FirstPostGuide: a short guide on Create before the first post.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, PenLine, Sparkles, UserPlus } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { MySplitIcon } from '../components/MySplitIcon'
import { Message, Spinner } from '../public/auth/AuthUi'
import { messageFor, type AppApi, type CreatorSetup, type Features, type Inviter } from './api'
import { useAppApi } from './AppApiContext'
import { TopicPicker, TopicTags, useTopics } from './profileDetails'

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

function useReferralLink() {
  const api = useAppApi()
  const [code, setCode] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.myReferralCode().then(
      (c) => live && setCode(c),
      () => live && setCode(null),
    )
    return () => {
      live = false
    }
  }, [api])
  return code ? `${window.location.origin}/register/${code}` : code === undefined ? undefined : null
}

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={
          done
            ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-white'
            : 'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink-200 bg-white'
        }
        aria-hidden="true"
      >
        {done && <Check className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-900">
          {title}
          <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
        </p>
        {children}
      </div>
    </li>
  )
}

/** Creator setup on the member's own Profile: optional, and gone once complete unless reopened. */
export function CreatorSetupCard() {
  const api = useAppApi()
  const { topics } = useTopics()
  const link = useReferralLink()
  const [setup, setSetup] = useState<CreatorSetup | null | undefined>(undefined)
  const [draft, setDraft] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let live = true
    api.myCreatorSetup().then(
      (s) => live && (setSetup(s), setDraft(s?.postingTopics ?? [])),
      () => live && setSetup(null),
    )
    return () => {
      live = false
    }
  }, [api])
  if (setup === undefined) return <Spinner label="Loading creator setup…" />
  if (setup === null) return null
  const topicsDone = setup.postingTopics.length > 0
  const postDone = setup.posts > 0
  const inviteDone = setup.joinedThroughMyLink > 0 || setup.followers > 0
  const complete = topicsDone && postDone && inviteDone
  async function saveTopics() {
    setBusy(true)
    setError(null)
    try {
      const t = await api.setCreatorTopics(draft)
      setSetup((s) => (s ? { ...s, postingTopics: t } : s))
      setSaved(true)
      setEditing(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
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
  return (
    <div data-testid="creator-setup">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink-900">
          <Sparkles className="h-5 w-5 text-brand-700" aria-hidden="true" /> {complete ? 'Your creator tools' : 'Share your own work'}
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-600">
          {complete
            ? 'Everything is set up. Your insights are on the Attention, Retention and Money faces of your Profile.'
            : 'Optional. Every Splitpost account can post. These steps help the right people find you.'}
        </p>
        <ol className="mt-4 space-y-4">
          <Step done={topicsDone} title="Choose what you post about">
            {topicsDone && !editing ? (
              <div className="mt-1.5 space-y-2">
                <TopicTags slugs={setup.postingTopics} topics={topics} />
                <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-brand-700 underline underline-offset-2">
                  Change topics
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                {topics ? (
                  <TopicPicker
                    topics={topics}
                    value={draft}
                    onChange={setDraft}
                    max={POSTING_TOPICS_MAX}
                    legend="Topics you post about"
                    hint="Up to 3. People interested in these topics will see you in their suggestions."
                    hideLegend
                  />
                ) : (
                  <Spinner label="Loading topics…" />
                )}
                <button type="button" onClick={() => void saveTopics()} disabled={busy || draft.length === 0} className={buttonClass('primary', 'sm')}>
                  {busy ? 'Saving…' : 'Save topics'}
                </button>
              </div>
            )}
            {saved && (
              <p className="mt-1 text-sm font-semibold text-brand-800" role="status">
                Saved. You'll appear in suggestions for these topics.
              </p>
            )}
          </Step>
          <Step done={postDone} title="Publish your first post">
            {!postDone && (
              <Link to="/app/new" className={`${buttonClass('secondary', 'sm')} mt-2`}>
                <PenLine className="h-4 w-4" aria-hidden="true" /> Write a post
              </Link>
            )}
          </Step>
          <Step done={inviteDone} title="Invite the people who already follow you elsewhere">
            <p className="mt-1 text-[14px] text-ink-600">
              Your personal link brings them straight to you. They choose whether to follow.
              {setup.joinedThroughMyLink > 0 &&
                ` ${setup.joinedThroughMyLink} ${setup.joinedThroughMyLink === 1 ? 'person has' : 'people have'} joined through it.`}
            </p>
            {link && (
              <button type="button" onClick={() => void copy()} className={`${buttonClass('secondary', 'sm')} mt-2`}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{' '}
                {copied ? 'Link copied' : 'Copy my invitation link'}
              </button>
            )}
          </Step>
        </ol>
        {error !== null && (
          <div className="mt-3">
            <Message tone="error">{messageFor(error)}</Message>
          </div>
        )}
      </Card>
    </div>
  )
}

/** A short guide on Create, before the member's first post. */
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
          <li>Your followers see it in their Following feed. Nothing is ranked or hidden.</li>
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
