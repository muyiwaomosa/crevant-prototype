import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Wordmark } from '../components/Wordmark'
import { buttonClass } from '../components/ui'
import { TOUR_BASE } from '../entry'
import { useAuth } from '../auth/AuthProvider'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export function PublicLayout() {
  const signedIn = useAuth().status === 'signed-in'
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Crevant home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            {/* The tour is a separate app, so it needs a full page load. */}
            {/* Wrappers control visibility: the button classes set their own display. */}
            {/* Phones: logo, Sign in and Join the Waitlist; Explore Crevant stays in the hero and footer. */}
            <span className="hidden sm:contents">
              <a href={TOUR_BASE} className={buttonClass('ghost', 'sm')}>
                Explore Crevant
              </a>
            </span>
            {/* Below 420px only the logo and Join the Waitlist fit; Sign in stays in the hero and footer. */}
            <span className="hidden min-[420px]:contents">
              {signedIn ? (
                <Link to="/app" className={buttonClass('ghost', 'sm')}>
                  Your account
                </Link>
              ) : (
                <Link to="/sign-in" className={buttonClass('ghost', 'sm')}>
                  Sign in
                </Link>
              )}
            </span>
            <Link to="/#founding" className={buttonClass('primary', 'sm')}>
              Join the Waitlist
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink-100 bg-paper">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="max-w-md">
            <Wordmark size="sm" />
            <p className="mt-3 font-display text-base font-bold text-ink-800">Create value. Build connections. Grow together.</p>
            <p className="mt-1 text-sm text-ink-500">A creator-first social network.</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">An invitation-only pilot for adults 18 and older.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-600">
            <Link to="/#story" className="hover:text-ink-900">
              Our Story
            </Link>
            <Link to="/#how" className="hover:text-ink-900">
              How It Works
            </Link>
            <Link to="/#founding" className="hover:text-ink-900">
              Join the Waitlist
            </Link>
            <a href={TOUR_BASE} className="hover:text-ink-900">
              Explore Crevant
            </a>
            <Link to="/sign-in" className="hover:text-ink-900">
              Sign in
            </Link>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-[13px] text-ink-400 sm:px-6">© 2026 Crevant. All rights reserved.</p>
      </footer>
    </div>
  )
}
