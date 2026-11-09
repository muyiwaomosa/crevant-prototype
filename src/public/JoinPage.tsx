import { Link } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { buttonClass } from '../components/ui'
import { TOUR_BASE } from '../entry'

/**
 * /join/creator and /join/supporter. Informational only: applications and
 * invitations are not open yet. Deliberately no form and no personal data,
 * like the request page, until the privacy notice and security controls exist.
 */
type Audience = 'creator' | 'supporter'

const CONTENT: Record<Audience, { eyebrow: string; title: string; whoTitle: string; who: string[]; what: string[]; notOpen: string }> = {
  creator: {
    eyebrow: 'The creator pilot',
    title: 'Learn about the creator pilot',
    whoTitle: 'Who it is for',
    // Approved Section 5 copy.
    who: [
      "You've built an audience, but struggle to reach them.",
      "You're creating valuable content, but the income doesn't reflect your effort.",
      "You're tired of creating for the algorithm instead of your audience.",
      'You want to turn your side hustle into your profession.',
    ],
    // Approved Sections 8 and 9 copy.
    what: [
      'Create your profile. Tell people who you are, what you create and why they should connect with you.',
      'Invite your community. Bring the people who already enjoy your content. (Creator invite links are planned and not built yet.)',
      'Create, connect and grow. Publish content, engage with supporters and learn what your community values.',
      'Test new ideas, share honest feedback and help shape a platform designed around meaningful connections.',
    ],
    notOpen: 'Creator applications are not open yet. They open once our privacy notice is published and the security controls are ready.',
  },
  supporter: {
    eyebrow: 'Joining as a supporter',
    title: 'Learn about joining as a supporter',
    whoTitle: 'Who it is for',
    // Approved Section 7 copy.
    who: [
      'You follow creators because their content means something to you.',
      'You want your support to mean something more to them, too.',
    ],
    what: [
      'Follow the creators you care about. Engage with their content. Build your connection with them.',
      'Through Connection Points, you can be recognized for your participation and work toward rewards those creators choose to offer.',
      'Test new ideas, share honest feedback and help shape a platform designed around meaningful connections.',
    ],
    notOpen: 'Joining as a supporter is not open yet. Invitations open once our privacy notice is published and the security controls are ready.',
  },
}

export function JoinPage({ audience }: { audience: Audience }) {
  const c = CONTENT[audience]
  return (
    <section aria-labelledby="join-title" className="px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Link to="/#founding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Crevant
        </Link>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-600">{c.eyebrow}</p>
        <h1 id="join-title" className="mt-2 font-display text-[2rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[2.5rem]">
          {c.title}
        </h1>

        <div data-testid="not-open" className="mt-6 flex gap-3 rounded-3xl bg-spark-50 p-5 text-ink-700 ring-1 ring-spark-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-spark-700" aria-hidden="true" />
          <div className="space-y-1.5 leading-relaxed">
            <p className="font-semibold text-ink-900">{c.notOpen}</p>
            <p>This page collects nothing.</p>
          </div>
        </div>

        <h2 className="mt-10 font-display text-xl font-bold text-ink-900">{c.whoTitle}</h2>
        <ul className="mt-3 space-y-2 leading-relaxed text-ink-600">
          {c.who.map((w) => (
            <li key={w} className="flex gap-3">
              <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              {w}
            </li>
          ))}
        </ul>

        <h2 className="mt-10 font-display text-xl font-bold text-ink-900">What participation will involve</h2>
        <ul className="mt-3 space-y-2 leading-relaxed text-ink-600">
          {c.what.map((w) => (
            <li key={w} className="flex gap-3">
              <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              {w}
            </li>
          ))}
        </ul>
        {audience === 'supporter' && (
          <p data-testid="points-note" className="mt-3 text-sm italic text-ink-500">
            Connection Points are not cash and have no guaranteed monetary value. Rewards depend on what each creator offers.
          </p>
        )}

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
