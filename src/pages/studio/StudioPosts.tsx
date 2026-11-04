import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Heart, MessageCircle, PenSquare, Trash2 } from 'lucide-react'
import { useNow, useStore } from '../../state/store'
import { PostMedia } from '../../components/PostCard'
import { Button, Card, EmptyState, Modal, PageHeader, buttonClass } from '../../components/ui'
import { formatCompact } from '../../lib/format'
import { fullDateTime, relativeTime } from '../../lib/time'
import { SELF_ID } from '../../data/seed'

export function StudioPosts() {
  const { posts, statsFor, deletePost } = useStore()
  const now = useNow()
  const [toDelete, setToDelete] = useState<string | null>(null)
  const mine = posts.filter((p) => p.creatorId === SELF_ID)

  return (
    <div>
      <PageHeader
        title="Your posts"
        subtitle={`${mine.length} published, newest first`}
        action={
          <Link to="/studio/new" className={buttonClass('primary', 'sm')}>
            <PenSquare className="h-4 w-4" /> New
          </Link>
        }
      />

      {mine.length === 0 ? (
        <EmptyState
          icon={<PenSquare className="h-7 w-7" />}
          title="Nothing published yet"
          body="Your first post will land in your followers' feeds in time order."
          action={
            <Link to="/studio/new" className={buttonClass('primary')}>
              Write a post
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {mine.map((p) => {
            const s = statsFor(p)
            const simulated = p.baseLikes === 0
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
                  {simulated && <span className="ml-auto text-[12px] text-ink-400">Simulated audience, grows over time</span>}
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
