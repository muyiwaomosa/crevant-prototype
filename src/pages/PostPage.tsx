import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileX, Send } from 'lucide-react'
import { useNow, useStore } from '../state/store'
import { PostCard } from '../components/PostCard'
import { Avatar, EmptyState, buttonClass } from '../components/ui'
import { fullDateTime, relativeTime } from '../lib/time'
import { EARN_RULES } from '../lib/points'
import { assessComment, COMMENT_ISSUE_TEXT } from '../lib/commentQuality'
import { SELF_ID } from '../data/seed'

export function PostPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { postById, commentsFor, addComment, state, creatorById } = useStore()
  const now = useNow()
  const [text, setText] = useState('')
  const post = postById(id)

  if (!post) {
    return (
      <EmptyState
        icon={<FileX className="h-7 w-7" />}
        title="Post not found"
        body="It may have been deleted."
        action={
          <Link to="/" className={buttonClass('primary')}>
            Back to Home
          </Link>
        }
      />
    )
  }

  const comments = commentsFor(post.id)
  const canEarn = post.creatorId !== SELF_ID && !state.earnedKeys[`comment:${post.id}`]
  const trimmed = text.trim()
  const creatorFirst = creatorById(post.creatorId)?.name.split(' ')[0] ?? 'this creator'
  const issue = trimmed ? assessComment(trimmed, state.myComments.map((c) => c.text)) : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmed) return
    addComment(post.id, trimmed)
    setText('')
  }

  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <PostCard post={post} linkToDetail={false} />
      <p className="mt-2 px-2 text-[13px] text-ink-500">Posted {fullDateTime(post.createdAt)}</p>

      <section aria-labelledby="comments-title" className="mt-6">
        <h2 id="comments-title" className="mb-3 font-display text-lg font-bold">
          Comments <span className="text-ink-400">{comments.length}</span>
        </h2>

        <form onSubmit={submit} className="mb-5 rounded-3xl bg-white p-3 ring-1 ring-ink-100 focus-within:ring-2 focus-within:ring-brand-500">
          <label htmlFor="comment-box" className="sr-only">
            Write a comment
          </label>
          <textarea
            id="comment-box"
            aria-describedby="comment-hint"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 400))}
            rows={2}
            placeholder="Add a thoughtful comment"
            className="block w-full resize-none bg-transparent px-2 py-1 text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            <p id="comment-hint" className="text-[12px] text-ink-600">
              {!canEarn
                ? post.creatorId === SELF_ID
                  ? 'Your own post, so no CP'
                  : 'CP already earned on this post'
                : !trimmed
                  ? `A thoughtful comment earns +${EARN_RULES.comment.points} CP with ${creatorFirst}`
                  : issue
                    ? `No CP yet: ${COMMENT_ISSUE_TEXT[issue]}`
                    : `Earns +${EARN_RULES.comment.points} CP with ${creatorFirst}`}
            </p>
            <button type="submit" disabled={!trimmed} className={buttonClass('primary', 'sm')}>
              <Send className="h-4 w-4" /> Post
            </button>
          </div>
        </form>

        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">No comments yet. Start the conversation.</p>
        ) : (
          <ol className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar name={c.isYou ? state.profile.name : c.authorName} hue={c.authorHue} src={c.isYou ? state.profile.avatar : undefined} size={36} />
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-white px-4 py-2.5 ring-1 ring-ink-100">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold text-ink-900">{c.authorName}</span>
                    {c.isYou && <span className="text-[11px] font-semibold uppercase text-brand-600">You</span>}
                    <time className="text-[12px] text-ink-400" dateTime={new Date(c.createdAt).toISOString()} title={fullDateTime(c.createdAt)}>
                      {relativeTime(c.createdAt, now)}
                    </time>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{c.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
