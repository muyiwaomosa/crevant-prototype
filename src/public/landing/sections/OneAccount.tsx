import { HandHeart, PenLine, Users } from 'lucide-react'
import { MySplitIcon } from '../../../components/MySplitIcon'
import { HOMEPAGE_COPY } from '../copy'

const copy = HOMEPAGE_COPY.account
// One icon per line: share, support, connect, recognized (the official Splitpost symbol).
const ICONS = [PenLine, HandHeart, Users, MySplitIcon]

/**
 * Section 6, ONE ACCOUNT (SP-BRAND-002, as amended): one account for
 * creating and supporting. No separate sign up, account type or business
 * proposition; every call to action goes to the one waitlist.
 */
export function OneAccount() {
  return (
    <section id="account" aria-labelledby="account-title" className="scroll-mt-16 bg-white text-sp-ink">
      <div className="mx-auto max-w-4xl px-4 pb-18 pt-20 text-center sm:px-6 sm:pb-24 sm:pt-24">
        <h2 id="account-title" className="text-balance font-sp-display text-[clamp(2.2rem,7vw,3.6rem)] font-black leading-[0.98] tracking-[-0.02em] [font-stretch:108%]">
          {copy.headline}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[1.12rem] leading-relaxed sm:text-xl">{copy.body}</p>
        <ul data-testid="account-lines" className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 text-left min-[480px]:grid-cols-2">
          {copy.lines.map((line, i) => {
            const Icon = ICONS[i]
            return (
              <li key={line} className="flex items-center gap-3 rounded-2xl bg-sp-bg px-4 py-3.5 text-[1.02rem] font-semibold">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sp-link ring-1 ring-sp-ink/8">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {line}
              </li>
            )
          })}
        </ul>
        <p data-testid="account-closing" className="mt-10 font-sp-display text-[clamp(1.6rem,5vw,2.2rem)] font-black text-sp-link">
          {copy.closing}
        </p>
      </div>
    </section>
  )
}
