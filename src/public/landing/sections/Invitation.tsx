import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'

const copy = HOMEPAGE_COPY.invitation

const focusRing = 'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white'

/**
 * The close: the invitation. One waitlist for creators and fans, with every
 * required pilot disclosure listed beside the call to action and always
 * visible. The band is cut diagonally: the split, one last time.
 */
export function Invitation() {
  return (
    <section
      id="invitation"
      aria-labelledby="invitation-title"
      className="relative isolate scroll-mt-16 overflow-hidden bg-sp-primary text-white"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(118deg,transparent_0_70%,var(--color-sp-secondary)_70%_100%)] opacity-90" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-18 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:py-28">
        <div className="min-w-0">
          <h2
            id="invitation-title"
            className="font-sp-display text-[clamp(2.4rem,8.4vw,5.2rem)] font-black leading-[0.95] tracking-[-0.02em] [font-stretch:110%]"
          >
            {copy.headline}
          </h2>
          <div data-testid="invitation-body" className="mt-6 max-w-xl space-y-1.5 text-[1.12rem] leading-relaxed sm:text-xl">
            {copy.body.map((line, i) => (
              <p key={line} className={i === 0 ? 'font-semibold text-sp-bg' : 'text-sp-muted-on-dark'}>
                {line}
              </p>
            ))}
          </div>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-sp-bg">{copy.shape}</p>
          <p data-testid="invitation-close" className="mt-2 font-sp-display text-xl font-extrabold text-sp-accent">
            {copy.close}
          </p>
          <Link
            to="/join"
            className={`mt-8 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-sp-secondary px-8 text-base font-bold text-sp-ink transition-[background-color,transform] hover:bg-[#bde3db] active:scale-[0.98] motion-reduce:transition-none min-[420px]:w-auto ${focusRing}`}
          >
            {copy.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div data-testid="founder-signoff" className="mt-8 flex items-center gap-3">
            <img src="/media/landing/founder.jpg" alt="" width={640} height={640} loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover ring-2 ring-white/25" />
            <p className="text-sm font-semibold text-white">{copy.signOff}</p>
          </div>
        </div>

        <div data-testid="pilot-details" className="rounded-[28px] bg-sp-primary p-6 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)] ring-1 ring-white/15 sm:p-8">
          <h3 className="font-sp-display text-sm font-extrabold uppercase tracking-[0.16em] text-sp-secondary-on-dark">{copy.pilotDetailsTitle}</h3>
          <ul className="mt-4 space-y-3">
            {copy.pilotDetails.map((d) => (
              <li key={d} className="flex gap-3 text-[0.97rem] leading-relaxed text-white/90">
                <Check className="mt-1 h-4 w-4 shrink-0 text-sp-secondary" aria-hidden="true" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative bg-sp-primary">
        <p data-testid="people-note" className="mx-auto max-w-6xl px-4 py-6 text-[13px] leading-relaxed text-sp-muted-on-dark sm:px-6">
          {HOMEPAGE_COPY.peopleNote}
        </p>
      </div>
    </section>
  )
}
