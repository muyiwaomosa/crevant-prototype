import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Heart, MessageCircle, PenSquare, Trash2 } from 'lucide-react'
import { useNow, useStore } from '../../state/store'
import { PostMedia } from '../../components/PostCard'
import { Button, Card, EmptyState, Modal, buttonClass } from '../../components/ui'
import { formatCompact } from '../../lib/format'
import { fullDateTime, relativeTime } from '../../lib/time'
import { SELF_ID } from '../../data/seed'

/** The participant's own published posts, newest first, with stats and delete. Shown on Profile. */
export function MyPosts() {
  const { posts, statsFor, deletePost } = useStore()
  const now = useNow()
  const [toDelete, setToDelete] = useState<string | null>(null)
  const mine = posts.filter((p) => p.creatorId === SELF_ID)

  return (
    <div>
      {mine.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-600">{mine.length} published, newest first</p>
          <Link to="/create" className={buttonClass('primary', 'sm')}>
            <PenSquare className="h-4 w-4" /> New post
          </Link>
        </div>
      )}

      {mine.length === 0 ? (
        <EmptyState
          icon={<PenSquare className="h-7 w-7" />}
          title="Nothing published yet"
          body="Anyone can post on Crevant. Your first post goes to the people who follow you, in time order."
          action={
            <Link to="/create" className={buttonClass('primary')}>
              Write a post
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {mine.map((p) => {
            const s = statsFor(p)
            return (
              <Card key={p.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <time className="text-[13px] font-medium text-ink-500" title={fullDateTime(p.createdAt)} dateTime={new Date(p.createdAt).toISOString()}>
                    {relativeTime(p.createdAt, now)} · {fullDateTime(p.createdAt)}
                  </time>
                  <button
                    type="button"
                    onClick={() => setToDelete(p.id)}
                    className="-m-2 rounded-full p-2 text-ink-400 hover:bg-[#fdeceb] hover:text-[#b2342a]"
                    aria-label="Delete post"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {p.text && <p className="mb-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-800">{p.text}</p>}
                {p.media && <PostMedia media={p.media} postId={p.id} />}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-ink-100 pt-3 text-sm tabular-nums text-ink-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="h-4 w-4" /> {formatCompact(s.likes)}
                  </span>
                  <Link to={`/post/${p.id}`} className="inline-flex items-center gap-1.5 hover:text-ink-900">
                    <MessageCircle className="h-4 w-4" /> {s.comments}
                  </Link>
                  <span className="inline-flex items-center gap-1.5">
                    <Bookmark className="h-4 w-4" /> {s.saves}
                  </span>
                  <span className="ml-auto text-[12px] text-ink-600">Likes and saves are simulated</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title="Delete this post?">
        <p className="text-sm text-ink-600">It will be removed from your page and from followers' feeds.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (toDelete) deletePost(toDelete)
              setToDelete(null)
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
