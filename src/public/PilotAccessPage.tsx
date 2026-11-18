import { Link } from 'react-router-dom'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { waitlistCta } from './waitlist/status'

/**
 * /pilot-access: where the public website's "Sign In" leads while member
 * sign-in isn't open on the public site. It explains, plainly, that sign-in
 * is coming and is invitation only. There is deliberately no form, no auth
 * code and no Supabase client here: the public site build stays free of
 * member functionality (scripts/check-site-bundle.mjs). Never indexed.
 */
export function PilotAccessPage() {
  return (
    <section aria-labelledby="pilot-access-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Splitpost
        </Link>
        <h1 id="pilot-access-title" className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          Member Sign In
        </h1>
        <div data-testid="pilot-access" className="mt-8 flex gap-3 rounded-3xl bg-white p-5 text-ink-700 ring-1 ring-ink-100 sm:p-6">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="space-y-2 leading-relaxed">
            <p className="font-semibold text-ink-900">Member sign-in is coming soon.</p>
            <p>Access to the Splitpost pilot is by invitation only. If you're invited, we'll email you when your account is ready.</p>
            <p>There's nothing to sign in to here yet, and this page doesn't collect anything.</p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
          <Link to="/join" className={`${buttonClass('primary', 'lg')} w-full min-[420px]:w-auto`}>
            {waitlistCta()}
          </Link>
          <Link to="/" className={`${buttonClass('secondary', 'lg')} w-full min-[420px]:w-auto`}>
            Back to Splitpost
          </Link>
        </div>
      </div>
    </section>
  )
}
