import { useEffect, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { TOUR_BASE } from '../entry'
import { useMemberLinks } from './member-links'
import { useRobotsMeta } from './robots'
import { PRODUCT_IMAGES_DISCLOSURE } from './landing/shared'
import { HOMEPAGE_COPY } from './landing/copy'
import { SplitpostWordmark } from './landing/ui/SplitpostWordmark'

const HEADER_LINK =
  'inline-flex h-9 items-center rounded-full text-sm font-semibold text-white transition-[background-color,color,box-shadow,transform] hover:bg-white/10 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

/**
 * The public site's header and footer. `account` is the header's account link
 * (Sign in or Your account); the public site build passes none, because it has
 * no member pages. Kept free of auth code so the site build doesn't include it.
 */
export function PublicLayout({ account }: { account?: ReactNode }) {
  const memberLinks = useMemberLinks()
  // noindex everywhere, except the approved pages once indexing is approved.
  useRobotsMeta()
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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-sp-midnight/95 pt-[env(safe-area-inset-top)] text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="Splitpost home"
            className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <SplitpostWordmark />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            {/* The tour is a separate app, so it needs a full page load. */}
            {/* Phones: logo, Sign in and Join the Waitlist; Discover Splitpost stays in the hero. */}
            <span className="hidden sm:contents">
              <a href={TOUR_BASE} className={`${HEADER_LINK} px-3.5`}>
                {HOMEPAGE_COPY.hero.secondaryCta}
              </a>
            </span>
            {/* Below 420px only the logo and Join the Waitlist fit; Sign in stays in the hero and footer. */}
            {/* The account link is shared with the account pages, so it's restyled here rather than changed. */}
            {account && <span className="hidden min-[420px]:contents [&_a]:text-white [&_a:hover]:bg-white/10">{account}</span>}
            <Link
              to="/join"
              className="inline-flex h-9 items-center rounded-full bg-sp-orange px-4 text-sm font-bold text-sp-midnight transition-[background-color,color,box-shadow,transform] hover:bg-[#ff7e45] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
            >
              {HOMEPAGE_COPY.hero.primaryCta}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-sp-midnight text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="max-w-md">
            <SplitpostWordmark />
            <p className="mt-4 font-sp-display text-lg font-extrabold text-sp-orange">{HOMEPAGE_COPY.hero.tagline}</p>
            <p className="mt-2 text-sm leading-relaxed text-sp-muted-on-dark">An invitation-only pilot for adults 18 and older.</p>
            <p data-testid="product-images-note" className="mt-1 text-sm leading-relaxed text-sp-muted-on-dark">{PRODUCT_IMAGES_DISCLOSURE}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/85">
            <Link to="/#why" className="hover:text-sp-orange">
              Why Splitpost
            </Link>
            <Link to="/#how" className="hover:text-sp-orange">
              How It Works
            </Link>
            <Link to="/join" className="hover:text-sp-orange">
              {HOMEPAGE_COPY.hero.primaryCta}
            </Link>
            <a href={TOUR_BASE} className="hover:text-sp-orange">
              {HOMEPAGE_COPY.hero.secondaryCta}
            </a>
            {import.meta.env.MODE !== 'site' && memberLinks && (
              <Link to="/sign-in" className="hover:text-sp-orange">
                Sign in
              </Link>
            )}
          </nav>
        </div>
        <p className="mx-auto max-w-6xl border-t border-white/10 px-4 py-6 text-[13px] text-sp-muted-on-dark sm:px-6">© 2026 Splitpost. All rights reserved.</p>
      </footer>
    </div>
  )
}
