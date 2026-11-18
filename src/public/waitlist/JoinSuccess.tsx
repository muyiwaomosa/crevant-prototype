import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { buttonClass } from '../../components/ui'
import { PRIVACY_CONTACT } from '../privacy/contact'

/**
 * The screen shown once the server has confirmed a signup ('ok', which is
 * also the answer to a repeat signup, so nobody can tell who has joined).
 * It replaces the whole /join page content, so its single action is the
 * only one on the page.
 *
 * Accessibility: the screen replaces the form, and with it the form's
 * aria-live region, so nothing announces the change by itself. Focus moves to
 * the heading instead (tabIndex -1, so it isn't a tab stop), which screen
 * readers read out, and keyboard users continue from here rather than from
 * a removed button. The page scrolls to the top for the same reason.
 */
export function JoinSuccess() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0)
    heading.current?.focus()
  }, [])

  return (
    <div data-testid="waitlist-success" className="mx-auto max-w-lg text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 ring-8 ring-brand-50/60">
        <CheckCircle2 className="h-11 w-11 text-brand-600" aria-hidden="true" />
      </div>
      <h1
        ref={heading}
        tabIndex={-1}
        id="join-success-title"
        className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 outline-none sm:text-[2.5rem]"
      >
        You're on the list!
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-600">
        Thanks for joining Splitpost! We're inviting people to try the platform in small groups. If you're selected for the pilot, we'll send you
        an invitation by email.
      </p>
      <p data-testid="waitlist-success-disclosure" className="mt-3 text-sm text-ink-500">
        Joining the waitlist doesn't guarantee an invitation.
      </p>

      <div className="mt-8">
        <Link to="/" className={`${buttonClass('primary', 'lg')} w-full sm:w-auto`}>
          Explore Splitpost
        </Link>
      </div>

      <div className="mt-10 rounded-3xl bg-white p-5 text-left text-sm leading-relaxed text-ink-600 ring-1 ring-ink-100">
        <p data-testid="waitlist-leave">
          Changed your mind? Email{' '}
          <a href={`mailto:${PRIVACY_CONTACT}`} className="font-semibold text-brand-700 underline underline-offset-2">
            {PRIVACY_CONTACT}
          </a>{' '}
          from the address you signed up with to request deletion of your details.
        </p>
        <p className="mt-2">
          <Link to="/privacy" className="font-semibold text-brand-700 underline underline-offset-2">
            Read our privacy notice
          </Link>
        </p>
      </div>
    </div>
  )
}
