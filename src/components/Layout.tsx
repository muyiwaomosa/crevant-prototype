import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Compass, Gift, Home, LayoutDashboard, ListOrdered, PenSquare, Sparkles, Ticket, User } from 'lucide-react'
import { useStore } from '../state/store'
import { Wordmark } from './Wordmark'
import { CreatorAvatar, SparkIcon } from './ui'
import { Toasts } from './Toasts'

const FAN_NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/points', label: 'Points', icon: Sparkles },
  { to: '/rewards', label: 'Rewards', icon: Gift },
  { to: '/profile', label: 'Profile', icon: User },
]

const CREATOR_NAV = [
  { to: '/studio', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/studio/new', label: 'Create', icon: PenSquare },
  { to: '/studio/posts', label: 'Posts', icon: ListOrdered },
  { to: '/studio/rewards', label: 'Rewards', icon: Ticket },
  { to: '/profile', label: 'Profile', icon: User },
]

function ModeSwitch({ className }: { className?: string }) {
  const { state, setMode } = useStore()
  const navigate = useNavigate()
  const choose = (mode: 'fan' | 'creator') => {
    if (mode === state.mode) return
    setMode(mode)
    navigate(mode === 'creator' ? '/studio' : '/')
  }
  return (
    <div role="radiogroup" aria-label="Experience" className={clsx('flex rounded-full bg-ink-100 p-0.5 text-[13px] font-semibold', className)}>
      {(['fan', 'creator'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={state.mode === m}
          onClick={() => choose(m)}
          className={clsx(
            'h-8 flex-1 rounded-full px-3 transition',
            state.mode === m ? (m === 'creator' ? 'bg-ink-900 text-white shadow' : 'bg-white text-ink-900 shadow') : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {m === 'fan' ? 'Fan' : 'Creator'}
        </button>
      ))}
    </div>
  )
}

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
  const { state, balances, creatorById } = useStore()
  const topBalances = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  const nav = state.mode === 'creator' ? CREATOR_NAV : FAN_NAV
  const location = useLocation()

  // If someone lands on a studio deep link while in fan mode, switch to creator mode.
  // This only reacts to URL changes. Reacting to mode changes too would undo a
  // deliberate switch to fan mode during the render before navigation lands.
  const { setMode } = useStore()
  const modeRef = useRef(state.mode)
  modeRef.current = state.mode
  useEffect(() => {
    if (location.pathname.startsWith('/studio') && modeRef.current !== 'creator') setMode('creator')
  }, [location.pathname, setMode])

  return (
    <div className="min-h-dvh md:flex">
      <ScrollToTop />

      {/* Sidebar for tablets and desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col border-r border-ink-100 bg-paper px-3 py-6 md:flex lg:w-64 lg:px-5">
        <Link to={state.mode === 'creator' ? '/studio' : '/'} className="mb-8 flex justify-center lg:justify-start" aria-label="Crevant home">
          <span className="lg:hidden">
            <Wordmark size="sm" className="[&>span:nth-child(2)]:hidden" />
          </span>
          <span className="hidden lg:inline">
            <Wordmark />
          </span>
        </Link>
        <ModeSwitch className="mb-6 hidden lg:flex" />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex h-12 items-center justify-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition lg:justify-start',
                  isActive ? 'bg-white text-ink-900 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:bg-white/70 hover:text-ink-800',
                )
              }
              title={item.label}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={clsx('h-[22px] w-[22px]', isActive && 'text-brand-600')} strokeWidth={isActive ? 2.4 : 2} />
                  <span className="hidden lg:inline">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <ModeSwitch className="flex flex-col gap-0.5 lg:hidden [&>button]:px-0 [&>button]:text-[11px]" />
          {state.mode === 'fan' && (
            <Link to="/points" className="hidden rounded-2xl bg-ink-900 p-4 text-white lg:block">
              <p className="text-xs font-medium text-ink-300">Connection Points by creator</p>
              {topBalances.length === 0 ? (
                <p className="mt-1 text-sm text-ink-200">Engage with a creator to start earning CP with them.</p>
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
              <p className="mt-2 text-[11px] leading-snug text-ink-300">Each balance is only for that creator's rewards. No cash value.</p>
            </Link>
          )}
          <p className="hidden text-[11px] leading-snug text-ink-400 lg:block">
            Crevant prototype. All people, posts, points, and rewards are simulated.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar for phones */}
        <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link to={state.mode === 'creator' ? '/studio' : '/'} aria-label="Crevant home">
              <Wordmark size="sm" className="max-[359px]:[&>span:nth-child(2)]:hidden" />
            </Link>
            <div className="flex items-center gap-2">
              {state.mode === 'fan' && (
                <Link
                  to="/points"
                  className="flex h-8 items-center gap-1 rounded-full bg-white px-2.5 text-[13px] font-semibold text-ink-800 ring-1 ring-ink-100"
                  aria-label="Connection Points by creator"
                >
                  <SparkIcon className="h-4 w-4" />
                  CP
                </Link>
              )}
              <ModeSwitch className="w-[132px]" />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[680px] px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar for phones */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 pb-safe backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-ink-900' : 'text-ink-400')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('grid h-7 w-12 place-items-center rounded-full transition', isActive && 'bg-brand-50')}>
                    <item.icon className={clsx('h-[22px] w-[22px]', isActive && 'text-brand-600')} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Toasts />
    </div>
  )
}
