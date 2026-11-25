import { useLayoutEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import type { PublicLayoutContext } from './PublicLayout'
import { ArrowLeft, Info } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { DISCOVER_PATH } from '../entry'
import { BUILD_WAITLIST_ENV, readWaitlistConfig } from './waitlist/config'
import { WAITLIST_CLOSED_COPY, waitlistCta } from './waitlist/status'
import { WaitlistForm } from './waitlist/WaitlistForm'
import { JoinSuccess } from './waitlist/JoinSuccess'
import type { MountTurnstile } from './waitlist/turnstile'
import { InviteBanner } from './waitlist/InviteBanner'
import { HOMEPAGE_COPY } from './landing/copy'

/**
 * /join: the one Splitpost sign up (JOIN_PATH), where every call to action
 * on the site goes. Everyone can create, discover, follow, engage, support
 * and, once approved, advertise, so nobody picks a side when they join.
 *
 * The form appears only when readWaitlistConfig() finds every required
 * setting, including the approved privacy notice (docs/WAITLIST.md). Until
 * then the page is informational only and collects nothing. Joining the
 * waitlist never secures a place in the pilot; invitations go out in small
 * groups.
 */
export function JoinPage({
  env = BUILD_WAITLIST_ENV,
  mount,
  fetchImpl,
}: {
  env?: Record<string, unknown>
  /** Test only: stand-ins for Turnstile and the network, passed to the form. */
  mount?: MountTurnstile
  fetchImpl?: typeof fetch
}) {
  const waitlist = readWaitlistConfig(env)
  const [joined, setJoined] = useState(false)
  // While the success screen is shown, the shared header hides its waitlist
  // button: the visitor has just joined. Restored when leaving the page. A
  // layout effect, so the header changes before the browser paints the screen.
  const layout = useOutletContext<PublicLayoutContext | undefined>()
  const setHeaderCtaHidden = layout?.setHeaderCtaHidden
  useLayoutEffect(() => {
    if (!joined || !setHeaderCtaHidden) return
    setHeaderCtaHidden(true)
    return () => setHeaderCtaHidden(false)
  }, [joined, setHeaderCtaHidden])
  // After a confirmed signup the success screen replaces the whole page, so its
  // one action is the only one here.
  if (joined) {
    return (
      <section aria-labelledby="join-success-title" className="px-4 py-12 sm:px-6 sm:py-20">
        <JoinSuccess />
      </section>
    )
  }
  return (
    <section aria-labelledby="join-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to="/#invitation" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Splitpost
        </Link>
        <h1 id="join-title" className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          {waitlist ? waitlistCta(true) : WAITLIST_CLOSED_COPY.joinTitle}
        </h1>
        {/* The founder-approved introduction, with its first line updated to the Splitpost message. */}
        <div data-testid="join-intro" className="mt-4 space-y-4 text-lg leading-relaxed text-ink-600">
          <p>Be among the first to try Splitpost, where creators make the content, fans help it grow, and both deserve to benefit from its success.</p>
          <p>Whether you create content or support the people who do, there's a place for you on Splitpost.</p>
          <p>We're inviting people in small groups as we build and test the platform. Joining the waitlist doesn't guarantee an invitation to the pilot.</p>
        </div>

        {waitlist ? (
          <>
            <InviteBanner config={waitlist} />
            <WaitlistForm config={waitlist} mount={mount} fetchImpl={fetchImpl} onSuccess={() => setJoined(true)} />
          </>
        ) : (
          <div data-testid="not-open" className="mt-8 flex gap-3 rounded-3xl bg-spark-50 p-5 text-ink-700 ring-1 ring-spark-200">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-spark-700" aria-hidden="true" />
            <div className="space-y-1.5 leading-relaxed">
              <p className="font-semibold text-ink-900">{WAITLIST_CLOSED_COPY.notOpenTitle}</p>
              <p>{WAITLIST_CLOSED_COPY.notOpenBody}</p>
              <p>{WAITLIST_CLOSED_COPY.collectsNothing}</p>
            </div>
          </div>
        )}

        {/* The same pilot disclosures as the homepage's pilot details band, word for word. */}
        <h2 className="mt-10 font-display text-xl font-bold text-ink-900">{HOMEPAGE_COPY.pilot.eyebrow}</h2>
        <ul data-testid="join-pilot-details" className="mt-3 space-y-1.5 leading-relaxed text-ink-600">
          {HOMEPAGE_COPY.pilot.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>

        <div className="mt-10 rounded-3xl bg-white p-6 ring-1 ring-ink-100">
          {/* Draft copy, pending founder approval. */}
          <h2 className="font-display text-xl font-bold text-ink-900">See how Splitpost works</h2>
          <p className="mt-2 leading-relaxed text-ink-600">
            How your followers find your posts, how you understand the community you're building, and how your supporters can help you grow.
          </p>
          <div className="mt-5 flex flex-col gap-3 min-[420px]:flex-row">
            <Link to={DISCOVER_PATH} className={buttonClass('primary')}>
              Discover Splitpost
            </Link>
            <Link to="/#invitation" className={buttonClass('secondary')}>
              Back to Splitpost
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
