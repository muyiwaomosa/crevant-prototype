import { Link } from 'react-router-dom'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { JOIN_PATH, waitlistCta } from './waitlist/status'
import { MEMBER_SIGN_IN_URL } from './member-sign-in'

/**
 * /pilot-access: for visitors who arrive with an older link to the public
 * website's "Sign In". Members are sent on to the member app's sign-in page
 * (app.splitpost.ca, a plain link); newcomers to the waitlist. There is
 * deliberately no form, no auth code and no Supabase client here: the public
 * site build stays free of member functionality (scripts/check-site-bundle.mjs).
 * Never indexed.
 */
export function PilotAccessPage() {
  return (
    <section aria-labelledby="pilot-access-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Splitpost
        </Link>
        <h1 id="pilot-access-title" className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          Already part of Splitpost?
        </h1>
        <div data-testid="pilot-access" className="mt-8 flex gap-3 rounded-3xl bg-white p-5 text-ink-700 ring-1 ring-ink-100 sm:p-6">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="space-y-2 leading-relaxed">
            <p className="font-semibold text-ink-900">Splitpost is currently open to invited members only.</p>
            <p>If you've received access, sign in to your account. If you're new here, join the waitlist to be considered for the pilot.</p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
          <a href={MEMBER_SIGN_IN_URL} className={`${buttonClass('primary', 'lg')} w-full min-[420px]:w-auto`}>
            Sign In
          </a>
          <Link to={JOIN_PATH} className={`${buttonClass('secondary', 'lg')} w-full min-[420px]:w-auto`}>
            {waitlistCta()}
          </Link>
        </div>
      </div>
    </section>
  )
}
