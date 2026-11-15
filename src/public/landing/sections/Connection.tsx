import { Info } from 'lucide-react'
import { HOMEPAGE_COPY } from '../copy'
import { RecognitionScreen, SupportScreen } from '../ui/PhoneScreens'

const copy = HOMEPAGE_COPY.connection

/**
 * Section 4, the fan connection: recognition for eligible fans who help a
 * creator grow, as a way to strengthen the relationship. Connection Points
 * are not money, and the line saying so sits right beside the claim.
 */
export function Connection() {
  return (
    <section id="connection" aria-labelledby="connection-title" className="scroll-mt-16 bg-sp-cream text-sp-ink">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-18 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16 lg:py-28">
        <div className="min-w-0">
          <p className="font-sp-display text-[13px] font-extrabold uppercase tracking-[0.18em] text-sp-gold-text">{copy.eyebrow}</p>
          <h2
            id="connection-title"
            className="mt-4 text-balance font-sp-display text-[clamp(2.2rem,7vw,3.8rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]"
          >
            {copy.headline}
          </h2>
          <p data-testid="connection-body" className="mt-6 max-w-xl text-[1.08rem] leading-relaxed text-sp-muted sm:text-lg">
            {copy.body}
          </p>
          <ol data-testid="connection-steps" className="mt-8 space-y-4">
            {copy.steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sp-teal font-sp-display text-sm font-black text-sp-gold">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="font-sp-display text-lg font-extrabold leading-tight">{s.title}</h3>
                  <p className="mt-0.5 text-[15px] leading-snug text-sp-muted">{s.line}</p>
                </div>
              </li>
            ))}
          </ol>
          <p data-testid="connection-disclosure" className="mt-8 flex gap-2.5 rounded-2xl bg-white p-4 text-[15px] font-semibold leading-snug ring-1 ring-sp-ink/8">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sp-gold-text" />
            {copy.disclosure}
          </p>
        </div>
        {/* Phones show the recognition screen alone; from 640px both screens sit side by side. */}
        <div aria-hidden="true" className="grid gap-6 sm:grid-cols-2">
          <div className="hidden pt-10 sm:block">
            <SupportScreen />
          </div>
          <div className="mx-auto w-full max-w-[260px]">
            <RecognitionScreen />
          </div>
        </div>
      </div>
    </section>
  )
}
