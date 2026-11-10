import { Link } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { TOUR_BASE } from '../entry'

/**
 * /join: the one Crevant waitlist. Everyone can create, discover, follow,
 * engage and support, so nobody picks a side when they join.
 *
 * Informational only until the privacy notice is published: deliberately no
 * form and no personal data yet. The form arrives in a separate change with
 * its own privacy and security review. Joining the waitlist never secures a
 * place in the pilot; invitations go out in small groups.
 */
export function JoinPage() {
  return (
    <section aria-labelledby="join-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to="/#founding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Crevant
        </Link>
        <h1 id="join-title" className="mt-6 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          Join the Waitlist
        </h1>
        {/* Founder-approved introduction. */}
        <div data-testid="join-intro" className="mt-4 space-y-4 text-lg leading-relaxed text-ink-600">
          <p>Be among the first to experience a social network designed to help creators build meaningful relationships with their communities.</p>
          <p>Whether you create content or support the people who do, there's a place for you on Crevant.</p>
          <p>We're inviting people in small groups as we build and test the platform. Joining the waitlist doesn't guarantee an invitation to the pilot.</p>
        </div>

        <div data-testid="not-open" className="mt-8 flex gap-3 rounded-3xl bg-spark-50 p-5 text-ink-700 ring-1 ring-spark-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-spark-700" aria-hidden="true" />
          <div className="space-y-1.5 leading-relaxed">
            <p className="font-semibold text-ink-900">The waitlist opens once our privacy notice is published.</p>
            <p>This page collects nothing.</p>
          </div>
        </div>

        <h2 className="mt-10 font-display text-xl font-bold text-ink-900">The pilot</h2>
        <ul className="mt-3 space-y-1.5 leading-relaxed text-ink-600">
          <li>Invitation-only, for adults 18 and older.</li>
          <li>Features are still being developed and tested. No money changes hands on Crevant.</li>
          <li>Participation does not guarantee earnings or rewards.</li>
        </ul>

        <div className="mt-10 rounded-3xl bg-white p-6 ring-1 ring-ink-100">
          <h2 className="font-display text-xl font-bold text-ink-900">Explore the interactive tour</h2>
          <p className="mt-2 leading-relaxed text-ink-600">Try the product concept now, in a demonstration with sample data. Everything you do there stays in your own browser.</p>
          <div className="mt-5 flex flex-col gap-3 min-[420px]:flex-row">
            <a href={TOUR_BASE} className={buttonClass('primary')}>
              Explore Crevant
            </a>
            <Link to="/#founding" className={buttonClass('secondary')}>
              Back to Crevant
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
