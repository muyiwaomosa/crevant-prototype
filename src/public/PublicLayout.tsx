import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { DISCOVER_PATH } from '../entry'
import { useMemberLinks } from './member-links'
import { useRobotsMeta } from './robots'
import { BRAND_LINE, PILOT_DISCLOSURES, PRODUCT_IMAGES_DISCLOSURE, SITE_NAV } from './landing/copy'
import { WAITLIST_CLOSED_COPY, WAITLIST_OPEN, waitlistCta } from './waitlist/status'
import { SplitpostWordmark } from './landing/ui/SplitpostWordmark'

const HEADER_LINK =
  'inline-flex h-9 items-center rounded-full text-sm font-semibold text-white transition-[background-color,color,box-shadow,transform] hover:bg-white/10 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none'

/**
 * What the layout lets the page it shows change (React Router outlet context).
 * /join hides the header's waitlist button while its success screen is shown,
 * since the visitor has just joined. Pages outside this layout get none.
 */
export type PublicLayoutContext = { setHeaderCtaHidden: (hidden: boolean) => void }

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

/**
 * The header's Sign In link when the build has no member pages (the public
 * site): it goes to /pilot-access, which explains that member sign-in is
 * coming and is invitation only. Text from 420px, an icon below (same name).
 */
function PilotAccessLink() {
  return (
    <Link to="/pilot-access" aria-label="Sign In" data-testid="header-sign-in" className={`${HEADER_LINK} h-11 w-11 justify-center min-[420px]:h-9 min-[420px]:w-auto min-[420px]:px-3.5 whitespace-nowrap`}>
      <LogIn className="h-5 w-5 min-[420px]:hidden" aria-hidden="true" />
      <span className="hidden min-[420px]:inline" aria-hidden="true">
        Sign In
      </span>
    </Link>
  )
}

/**
 * The public site's header and footer. `account` is the header's account link
 * (Sign In or Your account, to the real sign-in page); the public site build
 * passes none, because it has no member pages, so the header's Sign In goes to
 * /pilot-access instead. Kept free of auth code so the site build doesn't
 * include it.
 */
export function PublicLayout({ account }: { account?: ReactNode }) {
  const memberLinks = useMemberLinks()
  // noindex everywhere, except the approved pages once indexing is approved.
  useRobotsMeta()
  const [headerCtaHidden, setHeaderCtaHidden] = useState(false)
  // Any navigation brings the button back, whatever the page did.
  const { pathname } = useLocation()
  useEffect(() => setHeaderCtaHidden(false), [pathname])
  const outletContext: PublicLayoutContext = { setHeaderCtaHidden }
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>

      {/* Splitpost header (PR 2). The footer below changes in PR 5. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-sp-primary/95 pt-[env(safe-area-inset-top)] text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="Splitpost home"
            className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <SplitpostWordmark compactBelow360 />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            {/* Phones: logo, Sign in and Join the Waitlist; How It Works stays in the footer. */}
            <span className="hidden sm:contents">
              <Link to={DISCOVER_PATH} className={`${HEADER_LINK} px-3.5`}>
                {SITE_NAV.discover}
              </Link>
            </span>
            {/* Sign In at every width: the full app's account link, or /pilot-access on the public site. */}
            {/* The account link is shared with the account pages, so it's restyled here rather than changed. */}
            {account ? <span className="contents [&_a]:text-white [&_a:hover]:bg-white/10">{account}</span> : <PilotAccessLink />}
            {!headerCtaHidden && (
              <Link
                to="/join"
                data-testid="header-waitlist-cta"
                aria-label={waitlistCta()}
                className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-sp-secondary px-3 text-[13px] font-bold min-[390px]:px-4 min-[390px]:text-sm text-sp-ink transition-[background-color,color,box-shadow,transform] hover:bg-[#bde3db] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
              >
                {WAITLIST_OPEN ? (
                  waitlistCta()
                ) : (
                  <>
                    {/* Under 390px the full closed label doesn't fit beside the logo. */}
                    <span aria-hidden="true" className="min-[440px]:hidden">{WAITLIST_CLOSED_COPY.ctaShort}</span>
                    <span aria-hidden="true" className="hidden min-[440px]:inline">{WAITLIST_CLOSED_COPY.cta}</span>
                  </>
                )}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet context={outletContext} />
      </main>

      <footer className="bg-sp-primary text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="max-w-md">
            <SplitpostWordmark />
            <p data-testid="footer-tagline" className="mt-4 font-sp-display text-xl font-extrabold text-sp-secondary">{BRAND_LINE}</p>
            <p data-testid="footer-disclosure" className="mt-2 text-sm leading-relaxed text-sp-muted-on-dark">{PILOT_DISCLOSURES.footer}</p>
            <p data-testid="product-images-note" className="mt-1 text-sm leading-relaxed text-sp-muted-on-dark">{PRODUCT_IMAGES_DISCLOSURE}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/85">
            <Link to="/#problem" className="hover:text-sp-secondary-on-dark">
              {SITE_NAV.why}
            </Link>
            <Link to={DISCOVER_PATH} className="hover:text-sp-secondary-on-dark">
              {SITE_NAV.how}
            </Link>
            <Link to="/join" className="hover:text-sp-secondary-on-dark">
              {waitlistCta()}
            </Link>
            {import.meta.env.MODE !== 'site' && memberLinks && (
              <Link to="/sign-in" className="hover:text-sp-secondary-on-dark">
                Sign In
              </Link>
            )}
            {!memberLinks && (
              <Link to="/pilot-access" className="hover:text-sp-secondary-on-dark">
                Sign In
              </Link>
            )}
          </nav>
        </div>
        <p className="mx-auto max-w-6xl border-t border-white/10 px-4 py-6 text-[13px] text-sp-muted-on-dark sm:px-6">© 2026 Splitpost. All rights reserved.</p>
      </footer>
    </div>
  )
}
