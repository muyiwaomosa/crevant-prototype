import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Heart, MessageCircle, MoreHorizontal, Repeat2, Sparkles, Trash2, Users } from 'lucide-react'
import { Card, buttonClass } from '../components/ui'
import { Message } from '../public/auth/AuthUi'
import { relativeTime } from '../lib/time'
import { LIMITS, messageFor, newRequestId, type FollowSource, type MemberSummary, type Post } from './api'
import { useAppApi } from './AppApiContext'
import { useTrackView } from './ViewTracker'
import { ReportButton } from './moderation'
import { PictureAvatar } from './avatars'
import { PostPhoto } from './media'
import { PostVideo } from './video'
import { EditPost, PostMetaLine, SaveRepostButtons, ShareButton } from './content'

export function MemberAvatar({ member, size = 40 }: { member: MemberSummary; size?: number }) {
  return <PictureAvatar id={member.id} name={member.displayName} size={size} />
}

export function MemberLink({ member, className }: { member: MemberSummary; className?: string }) {
  return (
    <Link to={`/app/u/${member.username}`} className={clsx('font-semibold text-ink-900 hover:underline', className)}>
      {member.displayName}
    </Link>
  )
}

/** Shows a time like "3h ago", with the full date on hover. */
export function When({ iso }: { iso: string }) {
  const ts = Date.parse(iso)
  return (
    <time dateTime={iso} title={new Date(ts).toLocaleString()}>
      {relativeTime(ts, Date.now())}
    </time>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  return <Message tone="error">{messageFor(error)}</Message>
}

/** One post, with like, comment and (for your own posts) delete. Likes update straight away and roll back on failure. */
export function PostItem({ post, onDeleted, linkToPost = true }: { post: Post; onDeleted?: (id: string) => void; linkToPost?: boolean }) {
  const api = useAppApi()
  // Counts as viewed once at least half of it has been on screen for 2 seconds (views.ts).
  const trackView = useTrackView(post.id, !post.isMine)
  const [liked, setLiked] = useState(post.likedByMe)
  const [likes, setLikes] = useState(post.likeCount)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [body, setBody] = useState(post.body)
  useEffect(() => setBody(post.body), [post.body])
  // Follow the server's values when they change (a refreshed feed), but never
  // on mount: the first state already holds them, and a like tapped before the
  // card's effects have run must not be undone by them.
  const synced = useRef({ liked: post.likedByMe, likes: post.likeCount })
  useEffect(() => {
    if (synced.current.liked === post.likedByMe && synced.current.likes === post.likeCount) return
    synced.current = { liked: post.likedByMe, likes: post.likeCount }
    setLiked(post.likedByMe)
    setLikes(post.likeCount)
  }, [post.likedByMe, post.likeCount])

  async function toggleLike() {
    if (busy) return
    const next = !liked
    setBusy(true)
    setError(null)
    setLiked(next)
    setLikes((n) => n + (next ? 1 : -1))
    try {
      await (next ? api.like(post.id) : api.unlike(post.id))
    } catch (e) {
      setLiked(!next)
      setLikes((n) => n + (next ? -1 : 1))
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await api.deletePost(post.id)
      // The database has queued the photo's files; this only asks the server to delete them now.
      if (post.media) void api.requestPhotoCleanup().catch(() => undefined)
      onDeleted?.(post.id)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  // Approved design (SP-DESIGN-002, V1): photos and videos run edge to edge
  // at the top of the card with the creator over the image; short text posts
  // use the display face.
  const media = post.media?.kind === 'photo' || post.media?.kind === 'video'
  const display = !media && body.length > 0 && body.length <= 160 && !body.includes('\n')
  const header = (overlay: boolean) => (
    <header
      className={clsx(
        'flex items-center gap-3',
        overlay &&
          'pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-black/55 to-transparent px-4 pb-8 pt-4 text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)] [&_a]:pointer-events-auto [&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center [&_a]:text-white [&_p]:text-white/90',
      )}
    >
      <span className={clsx(overlay && 'pointer-events-auto rounded-full ring-2 ring-white')}>
        <MemberAvatar member={post.author} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <MemberLink member={post.author} />
        <p className="truncate text-[13px] text-ink-500">
          @{post.author.username} · <When iso={post.createdAt} />
          <PostMetaLine postId={post.id} />
        </p>
      </div>
      {post.authorInMyClique && (
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold',
            overlay ? 'bg-sp-accent text-ink-900 [text-shadow:none]' : 'bg-brand-50 text-brand-700',
          )}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" /> Clique
        </span>
      )}
    </header>
  )

  return (
    <Card className={clsx('overflow-hidden rounded-[26px]', media ? 'p-0' : 'p-4 sm:p-5')}>
      <article ref={trackView} aria-label={`Post by ${post.author.displayName}`} data-testid="post">
        {post.repostedBy && (
          <p className={clsx('mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-600', media && 'px-4 pt-3 sm:px-5')} data-testid="reposted-by">
            <Repeat2 className="h-4 w-4" aria-hidden="true" /> Reposted by <MemberLink member={post.repostedBy} className="text-[13px]" />
          </p>
        )}
        {media ? (
          <div className="relative">
            {header(true)}
            {post.media?.kind === 'photo' && <PostPhoto post={post} bleed />}
            {post.media?.kind === 'video' && <PostVideo post={post} bleed />}
          </div>
        ) : (
          header(false)
        )}
        <div className={clsx(media && 'px-4 pb-4 sm:px-5')}>
        {body !== '' && (
          <p
            className={clsx(
              'mt-3 whitespace-pre-wrap break-words',
              display ? 'font-display text-[20px] font-extrabold leading-snug text-ink-900' : 'text-[15px] leading-relaxed text-ink-800',
            )}
            data-display={display ? 'true' : undefined}
          >
            {body}
          </p>
        )}
        <footer className="mt-3 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={toggleLike}
            disabled={busy}
            aria-pressed={liked}
            className={clsx(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition',
              liked ? 'bg-[#fde8ea] text-[#b4233a]' : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            <Heart className={clsx('h-[18px] w-[18px]', liked && 'fill-current')} aria-hidden="true" />
            {/* Named "Like, 3 likes" from the visible count plus screen-reader text,
                so speech and sight match (WCAG 2.5.3). Words, not brackets, so every
                browser joins the parts the same way. */}
            <span className="sr-only">{liked ? 'Unlike, ' : 'Like, '}</span>
            <span className="tabular-nums">{likes}</span>
            <span className="sr-only">{likes === 1 ? ' like' : ' likes'}</span>
          </button>
          {linkToPost ? (
            <Link
              to={`/app/post/${post.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-600 hover:bg-ink-100"
            >
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              {/* Named "2 comments" from its visible count (WCAG 2.5.3). */}
              <span className="tabular-nums">{post.commentCount}</span>
              <span className="sr-only">{post.commentCount === 1 ? ' comment' : ' comments'}</span>
            </Link>
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold text-ink-600">
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="tabular-nums">{post.commentCount}</span>
              <span className="sr-only">{post.commentCount === 1 ? ' comment' : ' comments'}</span>
            </span>
          )}
          <SaveRepostButtons post={post} />
          <ShareButton post={post} />
          {!post.isMine && (
            <OverflowMenu label={`More options for this post by ${post.author.displayName}`} className="ml-auto">
              <ReportButton target="post" targetId={post.id} name={post.author.displayName} />
            </OverflowMenu>
          )}
          {post.isMine && onDeleted && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 has-[.post-editor]:w-full">
              {!confirming && <EditPost post={{ ...post, body }} onEdited={setBody} />}
              {confirming ? (
                <>
                  <span className="text-sm text-ink-600">Delete this post?</span>
                  <button type="button" onClick={remove} disabled={busy} className={buttonClass('danger', 'sm')}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonClass('secondary', 'sm')}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label="Delete post"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                >
                  <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </footer>
        {error !== null && (
          <div className="mt-3">
            <ErrorNote error={error} />
          </div>
        )}
        </div>
      </article>
    </Card>
  )
}

/** "···": less frequent actions (report, block), out of the way until needed. */
export function OverflowMenu({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-1 flex min-w-44 flex-col items-stretch gap-1 rounded-2xl bg-white p-2 text-left shadow-lg ring-1 ring-ink-100">
          {children}
        </div>
      )}
    </div>
  )
}

/** A text box with a character count, for posts and comments. */
export function TextComposer({
  label,
  placeholder,
  max,
  submitLabel,
  onSubmit,
  rows = 3,
}: {
  label: string
  placeholder: string
  max: number
  submitLabel: string
  /** requestId stays the same for the same text until it succeeds, so a retry is stored once. */
  onSubmit: (text: string, requestId: string) => Promise<void>
  rows?: number
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // `busy` only changes on the next render, so two submits in the same tick
  // (a double click, Enter plus click) would both see false. The ref doesn't wait.
  const sending = useRef(false)
  // One request id per text: reused if the person retries the same text after
  // an error (the first attempt may have been stored), new once the text
  // changes or the send succeeds.
  const request = useRef<{ text: string; id: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const length = [...text.trim()].length
  const over = length > max

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || length === 0 || over) return
    sending.current = true
    setBusy(true)
    setError(null)
    if (!request.current || request.current.text !== text) request.current = { text, id: newRequestId() }
    try {
      await onSubmit(text, request.current.id)
      request.current = null
      setText('')
    } catch (err) {
      setError(err)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="block w-full resize-y rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={clsx('text-[13px] tabular-nums', over ? 'font-semibold text-[#b4233a]' : 'text-ink-500')} aria-live="polite">
          {length}/{max}
        </span>
        <button type="submit" disabled={busy || length === 0 || over} className={buttonClass('primary', 'sm')}>
          {busy ? 'Sending…' : submitLabel}
        </button>
      </div>
      {error !== null && <ErrorNote error={error} />}
    </form>
  )
}

/**
 * Follow and Clique buttons for one creator. Following never adds someone to
 * the Clique: that's a separate, deliberate choice, and only for people you
 * follow. Removing from the Clique never unfollows. When the Clique is full,
 * it links to the Clique page to choose who to replace.
 *
 * Right after a follow, a short confirmation offers the next steps: add them to
 * your Clique, or see their posts (postsHref). While it shows, its "Add to
 * Clique" replaces the one in the button row, so there is only ever one.
 */
export function RelationshipButtons({
  member,
  onChange,
  size = 'sm',
  postsHref,
  source = 'other',
}: {
  member: { id: string; displayName: string; followedByMe: boolean; inMyClique: boolean }
  /** Called after a change succeeds, with the new state (lists may refresh, or keep it locally). */
  onChange: (next: { followedByMe: boolean; inMyClique: boolean }) => void | Promise<void>
  size?: 'sm' | 'md'
  /** Where "See their posts" goes: a route (`/app/u/name#posts`) or an in-page anchor (`#posts`). Omit to hide it. */
  postsHref?: string
  /** Where a follow from here starts (recorded with the follow; never a stage). */
  source?: FollowSource
}) {
  const api = useAppApi()
  // The state this control shows. It follows the member it is given, but a
  // successful change updates it at once, so a list that refreshes (or drops
  // the person, as suggestions do once you follow them) can't make it stale.
  const [state, setState] = useState({ followedByMe: member.followedByMe, inMyClique: member.inMyClique })
  useEffect(() => {
    setState({ followedByMe: member.followedByMe, inMyClique: member.inMyClique })
  }, [member.id, member.followedByMe, member.inMyClique])
  const [busy, setBusy] = useState(false)
  // A second tap while a request is still running is ignored, even in the same instant.
  const inFlight = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const [justFollowed, setJustFollowed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const name = member.displayName

  async function run(action: () => Promise<void>, next: { followedByMe: boolean; inMyClique: boolean }, message: string | null, followed = false) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setState(next)
      setJustFollowed(followed)
      setNotice(message)
      try {
        await onChange(next)
      } catch {
        // The change itself succeeded; a failed refresh shouldn't undo what is shown.
      }
    } catch (e) {
      setError(e)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const addToClique = (className: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(() => api.cliqueAdd(member.id), { followedByMe: true, inMyClique: true }, 'Added to your Clique!')}
      className={className}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" /> Join Clique<span className="sr-only">{` (${name})`}</span>
    </button>
  )
  const prompt = justFollowed && state.followedByMe && !state.inMyClique

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state.followedByMe ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => api.unfollow(member.id), { followedByMe: false, inMyClique: false }, `You unfollowed ${name}.`)}
            className={buttonClass('secondary', size)}
          >
            <Check className="h-4 w-4" aria-hidden="true" /> Following<span className="sr-only">{` (${name}, tap to unfollow)`}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => api.follow(member.id, source), { followedByMe: true, inMyClique: false }, null, true)}
            className={buttonClass('primary', size)}
          >
            Follow<span className="sr-only">{` ${name}`}</span>
          </button>
        )}
        {state.followedByMe &&
          (state.inMyClique ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => api.cliqueRemove(member.id), { followedByMe: true, inMyClique: false }, `Removed from your Clique. You still follow ${name}.`)
              }
              className={buttonClass('secondary', size)}
            >
              <Check className="h-4 w-4" aria-hidden="true" /> In your Clique<span className="sr-only">{` (${name}, tap to remove)`}</span>
            </button>
          ) : (
            !prompt && addToClique(buttonClass('secondary', size))
          ))}
        {busy && (
          <span className="text-sm text-ink-500" aria-hidden="true">
            Saving…
          </span>
        )}
      </div>
      {/* Success and error messages are announced to screen readers. */}
      <div aria-live="polite">
        {notice && (
          <p data-testid="relationship-notice" className="flex items-start gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-900 ring-1 ring-brand-100">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </p>
        )}
        {prompt && (
          <div data-testid="follow-confirmation" className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-100">
            <p className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                You're following <strong>{name}</strong>. Their new posts will appear on Home, newest first. Join their Clique to keep them close.
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {addToClique(buttonClass('primary', 'sm'))}
              {postsHref &&
                (postsHref.startsWith('#') ? (
                  <a href={postsHref} className={buttonClass('secondary', 'sm')}>
                    See their posts
                  </a>
                ) : (
                  <Link to={postsHref} className={buttonClass('secondary', 'sm')}>
                    See their posts
                  </Link>
                ))}
              <button type="button" onClick={() => setJustFollowed(false)} className={buttonClass('ghost', 'sm')}>
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
      {error !== null && <ErrorNote error={error} />}
    </div>
  )
}

export { LIMITS }
