import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Info } from 'lucide-react'
import { BUILD_WAITLIST_ENV, readWaitlistConfig, type WaitlistConfig } from './config'

/**
 * /waitlist/verify#<token> (BL-009): where the waitlist verification email
 * points. The token is after '#', so it never reaches any server log; this
 * page reads it once, removes it from the address bar, and posts it to the
 * join-waitlist function ({"action":"verify_email"}). Nothing else is sent,
 * and the answer is only verified, invalid or expired.
 *
 * Shown only while the waitlist form is on (the same config). Otherwise the
 * page says the waitlist is closed and sends nothing.
 */
type State = 'checking' | 'verified' | 'invalid' | 'expired' | 'error' | 'closed'

const defaultFetch: typeof fetch = (...a) => fetch(...a)
const TOKEN = /^[0-9a-f]{64}$/

export function VerifyEmailPage({
  env = BUILD_WAITLIST_ENV,
  fetchImpl = defaultFetch,
  configOverride,
}: {
  env?: Record<string, unknown>
  fetchImpl?: typeof fetch
  /** Tests only: the config readWaitlistConfig would return. */
  configOverride?: WaitlistConfig | null
}) {
  const [config] = useState(() => (configOverride !== undefined ? configOverride : readWaitlistConfig(env)))
  const [token] = useState(() => (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim().toLowerCase() : ''))
  const [state, setState] = useState<State>(() => (!config ? 'closed' : TOKEN.test(token) ? 'checking' : 'invalid'))

  useEffect(() => {
    // The token leaves the address bar at once (history, screenshots, sharing).
    if (typeof window !== 'undefined' && window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    if (!config || !TOKEN.test(token)) return
    let live = true
    fetchImpl(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify_email', token }) })
      .then(async (r) => {
        const status = r.ok ? ((await r.json()) as { status?: unknown }).status : null
        if (live) setState(status === 'verified' || status === 'invalid' || status === 'expired' ? status : 'error')
      })
      .catch(() => live && setState('error'))
    return () => {
      live = false
    }
  }, [config, token, fetchImpl])

  const copy: Record<State, { title: string; body: string }> = {
    checking: { title: 'Confirming your email', body: 'One moment.' },
    verified: { title: 'Your email is confirmed', body: "Thank you. You're on the Splitpost waitlist with a confirmed address. Invitations to the pilot go out in small groups; joining the waitlist doesn't guarantee a place." },
    invalid: { title: "This link doesn't work", body: 'It may have been used already or replaced by a newer email. If you joined recently, use the link in the latest email we sent.' },
    expired: { title: 'This link has expired', body: 'Verification links last 48 hours. Join the waitlist again with the same address to get a new link.' },
    error: { title: "We couldn't confirm your email right now", body: 'Please try the link again later.' },
    closed: { title: 'The waitlist is closed right now', body: "We can't confirm addresses while the waitlist is closed. Please try your link again later." },
  }
  const c = copy[state]
  return (
    <section className="mx-auto max-w-xl px-4 py-16" data-testid="waitlist-verify" data-state={state}>
      <div className="flex items-start gap-3">
        {state === 'verified' ? <CheckCircle2 aria-hidden className="mt-1 h-6 w-6 shrink-0 text-emerald-600" /> : <Info aria-hidden className="mt-1 h-6 w-6 shrink-0 text-slate-500" />}
        <div>
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          <p className="mt-3 text-slate-700" role={state === 'checking' ? 'status' : undefined}>{c.body}</p>
          <p className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link className="underline" to="/">About Splitpost</Link>
            <Link className="underline" to="/privacy">How we handle your information</Link>
            {state === 'expired' ? <Link className="underline" to="/join">Join the waitlist</Link> : null}
          </p>
        </div>
      </div>
    </section>
  )
}
