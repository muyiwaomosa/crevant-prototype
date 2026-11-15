import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { readAcquisition, type WaitlistConfig } from './config'

/**
 * The verified invitation on /join?ref=<code>. Shown only when the waitlist
 * form itself is on (the same config), so it is off by default.
 *
 * It asks the server function about the code (waitlist_api.invite_preview),
 * which answers only whether the link is usable now and, if so, the public
 * name the creator agreed to show. Nothing private about the creator or the
 * waitlist is ever returned. The page then:
 *   valid, with a name    "<Name> invited you to Splitpost."
 *   valid, no name        "A creator in the Splitpost pilot invited you."
 *   unavailable           a short note; joining still works
 *   anything else         nothing (closed, rate limited, offline)
 *
 * Following is NOT offered here: the person has no account yet. They are
 * told that, once invited, they'll be asked themselves (Follow or Not now,
 * ops.record_invite_follow_decision), and that nothing is followed for them.
 */
type Shown = { kind: 'named'; name: string } | { kind: 'nameless' } | { kind: 'unavailable' } | null

export function InviteBanner({
  config,
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
  search = typeof window !== 'undefined' ? window.location.search : '',
}: {
  config: WaitlistConfig
  fetchImpl?: typeof fetch
  search?: string
}) {
  const [shown, setShown] = useState<Shown>(null)
  const raw = new URLSearchParams(search).get('ref')
  const { creatorRef } = readAcquisition(search)

  useEffect(() => {
    if (raw === null) return
    // A malformed code can never be valid: no request at all.
    if (!creatorRef) {
      setShown({ kind: 'unavailable' })
      return
    }
    let live = true
    fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invite_preview', code: creatorRef }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { status?: unknown; invite?: unknown; name?: unknown } | null) => {
        if (!live || !d || d.status !== 'ok') return
        if (d.invite === 'valid') {
          setShown(typeof d.name === 'string' && d.name.trim() && d.name.length <= 40 ? { kind: 'named', name: d.name.trim() } : { kind: 'nameless' })
        } else if (d.invite === 'unavailable') {
          setShown({ kind: 'unavailable' })
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [config.endpoint, creatorRef, fetchImpl, raw])

  if (!shown) return null
  if (shown.kind === 'unavailable') {
    return (
      <p data-testid="invite-unusable" className="mt-8 rounded-3xl bg-ink-50 p-5 leading-relaxed text-ink-700 ring-1 ring-ink-100">
        This invitation link isn't active any more. You can still join the waitlist below.
      </p>
    )
  }
  const who = shown.kind === 'named' ? shown.name : 'the creator who invited you'
  return (
    <div data-testid="invite-banner" className="mt-8 flex gap-3 rounded-3xl bg-white p-5 ring-1 ring-ink-100">
      <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-spark-700" aria-hidden="true" />
      <div className="space-y-1.5 leading-relaxed text-ink-700">
        <p className="font-semibold text-ink-900">
          {shown.kind === 'named' ? `${shown.name} invited you to Splitpost.` : 'A creator in the Splitpost pilot invited you.'}
        </p>
        <p>
          If you're invited to the pilot, we'll ask whether you'd like to follow {who} when you set up your account. You choose Follow or Not
          now. Nobody is followed for you, and an invitation earns nothing for anyone.
        </p>
      </div>
    </div>
  )
}
