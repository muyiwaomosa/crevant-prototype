import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSupabase } from '../auth/client'
import { relativeTime } from '../lib/time'

/**
 * Public preview of one shared post (20261204000000), the only thing a
 * visitor can read. Shows the creator's name, the text, time and topic, and a
 * way to join (through the sharer's referral link, kept for attribution) or
 * sign in and follow. Never the photo, counts, comments or other members.
 */

type Preview = {
  id: string
  body: string
  createdAt: string
  edited: boolean
  hasPhoto: boolean
  topicLabel: string | null
  username: string
  displayName: string
}

/** Where a new member is offered to follow the creator they came for. */
export const JOIN_FOR_KEY = 'splitpost.join_for'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const REF = /^[0-9a-f]{16}$/

export function PublicPostPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const ref = REF.test(params.get('r') ?? '') ? (params.get('r') as string) : null
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ok'; post: Preview } | { kind: 'gone' } | { kind: 'busy' }>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    const client = getSupabase()
    if (!client || !UUID.test(id)) {
      setState({ kind: 'gone' })
      return
    }
    client.rpc('app_public_post', { p_post: id, p_ref: ref }).then(({ data, error }) => {
      if (!live) return
      if (error) {
        setState(/rate_limited/.test(error.message ?? '') ? { kind: 'busy' } : { kind: 'gone' })
        return
      }
      const r = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null
      if (!r) return setState({ kind: 'gone' })
      const post: Preview = {
        id: String(r.id),
        body: String(r.body),
        createdAt: String(r.created_at),
        edited: Boolean(r.edited),
        hasPhoto: Boolean(r.has_photo),
        topicLabel: (r.topic_label as string | null) ?? null,
        username: String(r.author_username),
        displayName: String(r.author_display_name),
      }
      try {
        window.localStorage.setItem(JOIN_FOR_KEY, JSON.stringify({ username: post.username, displayName: post.displayName, at: Date.now() }))
      } catch {
        // Storage may be unavailable: the follow prompt after joining is a nicety.
      }
      setState({ kind: 'ok', post })
    })
    return () => {
      live = false
    }
  }, [id, ref])

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-xl">
        <p className="mb-6 font-display text-xl font-extrabold text-brand-700">Splitpost</p>
        {state.kind === 'loading' && <p className="text-ink-600">Loading the post…</p>}
        {state.kind === 'busy' && <p className="text-ink-700">Lots of people are looking right now. Please try again in a minute.</p>}
        {state.kind === 'gone' && (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="font-display text-xl font-extrabold text-ink-900">This post isn't available</h1>
            <p className="mt-2 text-ink-700">It may have been removed, or its creator keeps their posts for members only.</p>
            <JoinActions ref_={ref} />
          </div>
        )}
        {state.kind === 'ok' && (
          <article className="rounded-3xl bg-white p-6 shadow-sm" data-testid="public-post">
            <header>
              <p className="font-display text-lg font-extrabold text-ink-900">{state.post.displayName}</p>
              <p className="text-[14px] text-ink-600">
                @{state.post.username} · <time dateTime={state.post.createdAt}>{relativeTime(Date.parse(state.post.createdAt), Date.now())}</time>
                {state.post.topicLabel && <> · {state.post.topicLabel}</>}
                {state.post.edited && <> · Edited</>}
              </p>
            </header>
            <p className="mt-4 whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink-900">{state.post.body}</p>
            {state.post.hasPhoto && <p className="mt-3 rounded-2xl bg-ink-100/70 px-4 py-3 text-[14px] text-ink-700">This post includes a photo. Members can see it on Splitpost.</p>}
            <div className="mt-6 border-t border-ink-100 pt-5">
              <h2 className="font-display text-[17px] font-bold text-ink-900">Follow {state.post.displayName} on Splitpost</h2>
              <p className="mt-1 text-[14px] text-ink-700">Splitpost is a creator-first community, in a closed pilot for adults.</p>
              <JoinActions ref_={ref} username={state.post.username} />
            </div>
          </article>
        )}
      </div>
    </main>
  )
}

function JoinActions({ ref_, username }: { ref_: string | null; username?: string }) {
  const next = username ? `/app/u/${username}` : '/app'
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {ref_ ? (
        <Link to={`/register/${ref_}`} className="inline-flex h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
          Join with this invitation
        </Link>
      ) : (
        <a href="https://www.splitpost.ca/join" className="inline-flex h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
          Join the waitlist
        </a>
      )}
      <Link
        to={`/sign-in?next=${encodeURIComponent(next)}`}
        className="inline-flex h-11 items-center rounded-full border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
      >
        I'm a member: sign in{username ? ' and follow' : ''}
      </Link>
    </div>
  )
}
