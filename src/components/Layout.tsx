import clsx from 'clsx'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Compass, Gift, Home, Plus, User } from 'lucide-react'
import { useStore } from '../state/store'
import { Wordmark } from './Wordmark'
import { CreatorAvatar, SparkIcon } from './ui'
import { Toasts } from './Toasts'

// One navigation for everyone. There is no Fan or Creator mode: anyone can
// follow, engage, publish, and offer rewards from the same place.
const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/create', label: 'Create', icon: Plus, primary: true },
  { to: '/rewards', label: 'Rewards', icon: Gift },
  { to: '/profile', label: 'Profile', icon: User },
]

function ScrollToTop() {
  const { pathname } = useLocation()
  // Block body on purpose: newer browsers return a Promise from scrollTo,
  // and React would try to call that as a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function Layout() {
  const { balances, creatorById } = useStore()
  const topBalances = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div className="min-h-dvh md:flex">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>

      {/* Sidebar for tablets and desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col border-r border-ink-100 bg-paper px-3 py-6 md:flex lg:w-64 lg:px-5">
        <Link to="/" className="mb-8 flex justify-center lg:justify-start" aria-label="Crevant home">
          <span className="lg:hidden">
            <Wordmark size="sm" className="[&>span:nth-child(2)]:hidden" />
          </span>
          <span className="hidden lg:inline">
            <Wordmark />
          </span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                clsx(
                  'flex h-12 items-center justify-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition lg:justify-start',
                  item.primary
                    ? isActive
                      ? 'my-1 bg-brand-700 text-white shadow-sm'
                      : 'my-1 bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                    : isActive
                      ? 'bg-white text-ink-900 shadow-sm ring-1 ring-ink-100'
                      : 'text-ink-600 hover:bg-white/70 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={clsx('h-[22px] w-[22px]', isActive && !item.primary && 'text-brand-600')} strokeWidth={isActive || item.primary ? 2.4 : 2} />
                  <span className="hidden lg:inline">{item.primary ? 'Create post' : item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <Link to="/rewards?tab=cp" className="hidden rounded-2xl bg-ink-900 p-4 text-white lg:block">
            <p className="text-xs font-medium text-ink-300">Your CP, by person</p>
            {topBalances.length === 0 ? (
              <p className="mt-1 text-sm text-ink-200">Engage with someone's posts to start earning CP with them.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {topBalances.map(([id, value]) => {
                  const c = creatorById(id)
                  return c ? (
                    <li key={id} className="flex items-center gap-2 text-sm">
                      <CreatorAvatar creator={c} size={20} />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="font-semibold tabular-nums">{value} CP</span>
                    </li>
                  ) : null
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] leading-snug text-ink-300">Each balance only works for that person's rewards. No cash value.</p>
          </Link>
          <p className="hidden text-[11px] leading-snug text-ink-500 lg:block">
            Crevant prototype. All people, posts, points, and rewards are simulated and stay in this browser.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar for phones */}
        <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link to="/" aria-label="Crevant home">
              <Wordmark size="sm" />
            </Link>
            <Link
              to="/rewards?tab=cp"
              className="flex h-8 items-center gap-1 rounded-full bg-white px-2.5 text-[13px] font-semibold text-ink-800 ring-1 ring-ink-100"
              aria-label="Your Connection Points"
            >
              <SparkIcon className="h-4 w-4" />
              My CP
            </Link>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[680px] px-4 pb-28 pt-5 outline-none sm:px-6 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar for phones */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 pb-safe backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-ink-900' : 'text-ink-600')
              }
            >
              {({ isActive }) =>
                item.primary ? (
                  <>
                    <span className={clsx('grid h-9 w-12 place-items-center rounded-2xl text-white shadow-sm transition', isActive ? 'bg-brand-700' : 'bg-brand-600')}>
                      <item.icon className="h-6 w-6" strokeWidth={2.6} />
                    </span>
                    {item.label}
                  </>
                ) : (
                  <>
                    <span className={clsx('grid h-7 w-12 place-items-center rounded-full transition', isActive && 'bg-brand-50')}>
                      <item.icon className={clsx('h-[22px] w-[22px]', isActive && 'text-brand-600')} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {item.label}
                  </>
                )
              }
            </NavLink>
          ))}
        </div>
      </nav>

      <Toasts />
    </div>
  )
}
