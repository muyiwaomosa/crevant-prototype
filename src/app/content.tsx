import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Bookmark, Check, Pencil, Repeat2, Share2 } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { AppApiError, LIMITS, type Post, type PostMeta, type Topic } from './api'
import { useAppApi } from './AppApiContext'
import { useFeatures } from './onboarding'
import { ErrorNote } from './components'
import { useRecognize } from './recognition'

/**
 * Content (IP-4a, 20261202000000): post topics, saves, reposts and editing.
 * Card details are fetched in batches for every post on screen, like profile
 * pictures, so the post lists themselves don't change.
 */

type MetaStore = {
  get(id: string): PostMeta | undefined
  request(id: string): void
  set(id: string, change: Partial<PostMeta>): void
  /** False on a database without content (the buttons are hidden). */
  available: boolean
  version: number
}
const MetaContext = createContext<MetaStore | null>(null)

export function PostMetaProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const cache = useRef(new Map<string, PostMeta>())
  const queue = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [available, setAvailable] = useState(true)
  const [version, setVersion] = useState(0)
  const flush = useCallback(async () => {
    timer.current = null
    const ids = [...queue.current]
    queue.current.clear()
    try {
      const meta = await api.postMeta(ids)
      if (meta === null) {
        setAvailable(false)
        return
      }
      for (const id of ids) if (meta[id]) cache.current.set(id, meta[id])
    } catch {
      // Card details are extras: the post itself still shows.
    }
    setVersion((v) => v + 1)
  }, [api])
  const request = useCallback(
    (id: string) => {
      if (cache.current.has(id) || queue.current.has(id)) return
      queue.current.add(id)
      if (!timer.current) timer.current = setTimeout(() => void flush(), 25)
    },
    [flush],
  )
  const set = useCallback((id: string, change: Partial<PostMeta>) => {
    const prev = cache.current.get(id)
    if (prev) cache.current.set(id, { ...prev, ...change })
    setVersion((v) => v + 1)
  }, [])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const store: MetaStore = { get: (id) => cache.current.get(id), request, set, available, version }
  return <MetaContext.Provider value={store}>{children}</MetaContext.Provider>
}

export function usePostMeta(id: string): { meta: PostMeta | undefined; available: boolean; set: (change: Partial<PostMeta>) => void } {
  const store = useContext(MetaContext)
  useEffect(() => {
    store?.request(id)
  }, [store, id])
  return { meta: store?.get(id), available: store?.available ?? false, set: (change) => store?.set(id, change) }
}

/** Topic and "Edited" beside the time. */
export function PostMetaLine({ postId }: { postId: string }) {
  const { meta } = usePostMeta(postId)
  if (!meta || (!meta.topicLabel && !meta.editedAt)) return null
  return (
    <>
      {meta.topicLabel && <> · <span data-testid="post-topic">{meta.topicLabel}</span></>}
      {meta.editedAt && <> · <span data-testid="post-edited">Edited</span></>}
    </>
  )
}

/** Save and Repost, in the card's action row. */
export function SaveRepostButtons({ post }: { post: Post }) {
  const api = useAppApi()
  const recognize = useRecognize()
  const { meta, available, set } = usePostMeta(post.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!available || !meta) return null
  async function run(action: () => Promise<void>, optimistic: Partial<PostMeta>, undo: Partial<PostMeta>, contributed = false) {
    if (busy) return
    setBusy(true)
    setError(null)
    set(optimistic)
    try {
      await action()
      if (contributed) recognize()
    } catch (e) {
      set(undo)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const saved = meta.savedByMe
  const reposted = meta.repostedByMe
  return (
    <>
      {!post.isMine && (
        <button
          type="button"
          disabled={busy}
          aria-pressed={reposted}
          onClick={() =>
            run(
              () => (reposted ? api.unrepost(post.id) : api.repost(post.id)),
              { repostedByMe: !reposted, repostCount: meta.repostCount + (reposted ? -1 : 1) },
              { repostedByMe: reposted, repostCount: meta.repostCount },
              !reposted,
            )
          }
          className={clsx(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition',
            reposted ? 'bg-[#e7f4f1] text-[#1f5e52]' : 'text-ink-600 hover:bg-ink-100',
          )}
        >
          <Repeat2 className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">{reposted ? 'Undo repost, ' : 'Repost, '}</span>
          <span className="tabular-nums">{meta.repostCount}</span>
          <span className="sr-only">{meta.repostCount === 1 ? ' repost' : ' reposts'}</span>
        </button>
      )}
      {post.isMine && meta.repostCount > 0 && (
        <span className="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold text-ink-600">
          <Repeat2 className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="tabular-nums">{meta.repostCount}</span>
          <span className="sr-only">{meta.repostCount === 1 ? ' repost' : ' reposts'}</span>
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? 'Saved (tap to remove)' : 'Save'}
        onClick={() => run(() => (saved ? api.unsave(post.id) : api.save(post.id)), { savedByMe: !saved }, { savedByMe: saved }, !saved)}
        className={clsx('inline-flex h-9 w-9 items-center justify-center rounded-full transition', saved ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-100')}
      >
        <Bookmark className={clsx('h-[18px] w-[18px]', saved && 'fill-current')} aria-hidden="true" />
      </button>
      {error !== null && (
        <span className="sr-only" role="alert">
          {error instanceof AppApiError ? error.code : 'error'}
        </span>
      )}
    </>
  )
}

/** The active topics, for the composer and the editor (null on a database without them). */
export function useTopicList(): Topic[] | null {
  const api = useAppApi()
  const [topics, setTopics] = useState<Topic[] | null>(null)
  useEffect(() => {
    let live = true
    api.topics().then(
      (t) => live && setTopics(t),
      () => live && setTopics(null),
    )
    return () => {
      live = false
    }
  }, [api])
  return topics
}

export function TopicSelect({ value, onChange, topics, label = 'Topic (optional)' }: { value: string; onChange: (v: string) => void; topics: Topic[]; label?: string }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-full border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <option value="">No topic</option>
        {topics.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Gives a just-published post its topic. A retry of the same post is fine. */
export async function categorize(api: ReturnType<typeof useAppApi>, postId: string, topic: string | undefined) {
  if (!topic) return
  try {
    await api.setPostTopic(postId, topic)
  } catch (e) {
    // Already categorized (a retried publish): nothing to do.
    if (!(e instanceof AppApiError && e.code === 'not_found')) throw e
  }
}

/** Edit button and inline editor for the author's own post. */
export function EditPost({ post, onEdited }: { post: Post; onEdited: (body: string) => void }) {
  const api = useAppApi()
  const { meta, available, set } = usePostMeta(post.id)
  const topics = useTopicList()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState(post.body)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const textId = useId()
  if (!available || !meta || !post.isMine) return null
  const length = [...body.trim()].length
  const over = length > LIMITS.post
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setBody(post.body)
          setTopic(meta.topic ?? '')
          setError(null)
          setOpen(true)
        }}
        aria-label="Edit post"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      >
        <Pencil className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    )
  async function save() {
    setBusy(true)
    setError(null)
    try {
      const nextTopic = topic || null
      await api.editPost(post.id, body, nextTopic)
      const label = topics?.find((t) => t.slug === nextTopic)?.label ?? null
      const changed = body.trim() !== post.body || nextTopic !== meta?.topic
      set({ topic: nextTopic, topicLabel: label, ...(changed ? { editedAt: new Date().toISOString() } : {}) })
      onEdited(body.trim())
      setOpen(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="post-editor mt-3 w-full space-y-2" data-testid="post-editor">
      <label htmlFor={textId} className="sr-only">
        Edit your post
      </label>
      <textarea
        id={textId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="block w-full resize-y rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {topics && <TopicSelect value={topic} onChange={setTopic} topics={topics} label="Topic" />}
        <span className={clsx('text-[13px] tabular-nums', over ? 'font-semibold text-[#b4233a]' : 'text-ink-500')}>
          {length}/{LIMITS.post}
        </span>
      </div>
      <p className="text-[12.5px] text-ink-600">People will see that this post was edited. Photos can't be changed.</p>
      {error !== null && <ErrorNote error={error} />}
      <div className="flex gap-2">
        <button type="button" disabled={busy || over} onClick={save} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonClass('secondary', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Share (20261203000000): the device share sheet where there is one, else
 * copy the link. The link is the public preview (/p/<id>, 20261204000000)
 * with the sharer's referral link; visitors see it only while previews are
 * on, members are taken to the post. The share is
 * recorded once per post and channel an hour; sharing works even if
 * recording fails.
 */
export function ShareButton({ post }: { post: Post }) {
  const features = useFeatures()
  const api = useAppApi()
  const recognize = useRecognize()
  const { available } = usePostMeta(post.id)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  if (!available) return null
  async function share() {
    setNotice(null)
    if (post.isMine) {
      try {
        if ((await api.publicPreviewsAllowed()) === false)
          setNotice("You switched public previews off, so only members can open this link. You can switch them back on in")
      } catch {
        // The share still works.
      }
    }
    // The public preview address (20261204000000), carrying the sharer's
    // referral link so a visitor who joins is attributed to them.
    let code: string | null = null
    try {
      code = await api.myReferralCode()
    } catch {
      code = null
    }
    const url = `${window.location.origin}/p/${post.id}${code ? `?r=${code}` : ''}`
    let channel: 'copy_link' | 'share_sheet' | null = null
    const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: `A post by ${post.author.displayName} on Splitpost`, url })
        channel = 'share_sheet'
      } catch {
        return // cancelled
      }
    } else {
      try {
        await nav?.clipboard.writeText(url)
        channel = 'copy_link'
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2500)
      } catch {
        return
      }
    }
    void api.recordShare(post.id, channel).then(recognize, () => undefined)
  }
  if (!features.sharing) return null
  return (
    <>
    <button
      type="button"
      onClick={() => void share()}
      aria-label={copied ? 'Link copied' : 'Share'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition hover:bg-ink-100"
    >
      {copied ? <Check className="h-[18px] w-[18px] text-brand-700" aria-hidden="true" /> : <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>
    {notice && (
      <p role="status" className="basis-full rounded-2xl bg-ink-100/70 px-3 py-2 text-[13px] text-ink-700" data-testid="share-notice">
        {notice}{' '}
        <Link to="/app/settings/privacy" className="font-semibold text-brand-700 underline">
          Privacy, sharing and ads
        </Link>
        .
      </p>
    )}
    </>
  )
}

/**
 * Settings: public previews of my posts (20261204000000), on by default since
 * BL-006 (20261222000000). Switching off takes effect at once. Hidden before
 * the migration. Previews also need Splitpost to open them project-wide.
 */
export function PublicPreviewsSetting() {
  const api = useAppApi()
  const [allowed, setAllowed] = useState<boolean | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const id = useId()
  useEffect(() => {
    let live = true
    api.publicPreviewsAllowed().then(
      (a) => live && setAllowed(a),
      () => live && setAllowed(null),
    )
    return () => {
      live = false
    }
  }, [api])
  if (allowed === undefined || allowed === null) return null
  async function change(next: boolean) {
    // Shown at once; put back if saving fails.
    const before = allowed
    setAllowed(next)
    setBusy(true)
    setError(null)
    try {
      await api.setPublicPreviews(next)
    } catch (e) {
      setAllowed(before)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section data-testid="public-previews-setting">
    <Card className="mt-4 p-5">
      <h2 className="font-display text-lg font-bold text-ink-900">Sharing outside Splitpost</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
        Public previews are on unless you switch them off. When you or someone else shares one of your posts outside Splitpost, people who aren't members can open
        the link and see a public preview: the post's text, when it was posted, its topic and your name and username. They never see photos or videos, comments,
        likes or anything about other members, and posts that are deleted, hidden by moderation or under review are never shown. Switch previews off at any time
        and they stop straight away. Splitpost turns previews on for visitors only when the pilot opens to the public.
      </p>
      <label htmlFor={id} className="mt-3 flex items-start gap-3 text-[15px] font-semibold text-ink-900">
        <input id={id} type="checkbox" checked={allowed} disabled={busy} onChange={(e) => void change(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-600" />
        <span>Allow public previews of my posts</span>
      </label>
      <p className="mt-1 pl-7 text-[13px] text-ink-600">{allowed ? 'On: shared links to your posts show a public preview.' : 'Off: only members can open links to your posts.'}</p>
      {error !== null && <ErrorNote error={error} />}
    </Card>
    </section>
  )
}

/** After joining from a preview, offer to follow the creator the member came for (never automatic). */
export function JoinedForPrompt() {
  const [who, setWho] = useState<{ username: string; displayName: string } | null>(null)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('splitpost.join_for')
      const v = raw ? (JSON.parse(raw) as { username?: unknown; displayName?: unknown; at?: unknown }) : null
      if (v && typeof v.username === 'string' && typeof v.displayName === 'string' && typeof v.at === 'number' && Date.now() - v.at < 7 * 86400000) {
        setWho({ username: v.username, displayName: v.displayName })
      }
    } catch {
      setWho(null)
    }
  }, [])
  if (!who) return null
  const dismiss = () => {
    try {
      window.localStorage.removeItem('splitpost.join_for')
    } catch {
      // ignore
    }
    setWho(null)
  }
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100" data-testid="joined-for">
      <p className="text-[14px] text-brand-900">
        You came to Splitpost for <strong>{who.displayName}</strong>. Follow them to see their posts on Home.
      </p>
      <div className="flex gap-2">
        <Link to={`/app/u/${who.username}`} onClick={dismiss} className={buttonClass('primary', 'sm')}>
          See {who.displayName}
        </Link>
        <button type="button" onClick={dismiss} className={buttonClass('ghost', 'sm')}>
          Not now
        </button>
      </div>
    </div>
  )
}
