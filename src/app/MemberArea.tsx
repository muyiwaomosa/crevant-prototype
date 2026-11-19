import clsx from 'clsx'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, Compass, Home, Plus, User, Users } from 'lucide-react'
import { Wordmark } from '../components/Wordmark'
import { buttonClass } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { AuthCard, Field, Message, Spinner } from '../public/auth/AuthUi'
import { AppApiProvider, ProfileProvider, useAppApi, useProfileGate } from './AppApiContext'
import { ViewTrackerProvider } from './ViewTracker'
import { displayNameProblem, messageFor, usernameProblem, type AppApi } from './api'

/**
 * The members area (/app): invited, signed-in members only (RequireAuth wraps
 * it). Until a member has chosen a username and display name, every page
 * shows the setup step instead. /app/account stays outside this area, so
 * members can always reach sign-out.
 */
export function MemberArea({ api }: { api?: AppApi } = {}) {
  return (
    <AppApiProvider api={api}>
      <Gate />
    </AppApiProvider>
  )
}

function Gate() {
  const { status, reload } = useProfileGate()
  if (status.kind === 'loading') {
    return (
      <Frame>
        <Spinner label="Checking your profile…" />
      </Frame>
    )
  }
  if (status.kind === 'no_access') return <NoPilotAccess status={status.access.status} />
  if (status.kind === 'access_error') {
    return (
      <Frame>
        <Message tone="error">We couldn't verify your access right now. Please try again.</Message>
      </Frame>
    )
  }
  if (status.kind === 'missing') {
    return (
      <Frame>
        <Message tone="info">Your profile isn't ready yet. It's created when your email is confirmed; refresh this page in a moment.</Message>
      </Frame>
    )
  }
  if (status.kind === 'error') {
    return (
      <Frame>
        <Message tone="error">We couldn't check your profile right now. Please refresh to try again.</Message>
      </Frame>
    )
  }
  if (status.kind === 'incomplete') return <SetupProfile onSaved={reload} createdAt={status.profile.createdAt} />
  return (
    <ProfileProvider value={{ profile: status.profile, refresh: reload }}>
      <ViewTrackerProvider userId={status.profile.id}>
        <MemberLayout username={status.profile.username} />
      </ViewTrackerProvider>
    </ProfileProvider>
  )
}

/**
 * Signed in, but not an active pilot member (never granted, revoked or
 * expired). The database refuses every member function for this account, so
 * nothing else is loaded; this only explains it.
 */
export function NoPilotAccess({ status }: { status: 'none' | 'revoked' | 'expired' | 'active' }) {
  const { session, client } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  // Revoked and expired read the same, so the screen never says why access ended.
  const detail = status === 'none' ? "Your account hasn't been approved for the Splitpost pilot yet." : 'Your pilot access has ended.'
  async function signOut() {
    if (!client || signingOut) return
    setSigningOut(true)
    await client.auth.signOut({ scope: 'local' })
    navigate('/sign-in', { replace: true })
  }
  return (
    <main id="main" className="px-4 py-12 sm:py-16">
      <AuthCard
        title="Your pilot access isn't active"
        intro={
          <p>
            Signed in as <strong className="font-semibold text-ink-900">{session?.user.email}</strong>.
          </p>
        }
      >
        <div className="space-y-5" data-testid="no-pilot-access" data-status={status}>
          <Message tone="info">{detail}</Message>
          <button type="button" onClick={signOut} disabled={signingOut} className={`${buttonClass('primary')} w-full`}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </AuthCard>
    </main>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="px-4 py-16">
      <div className="mx-auto max-w-md">{children}</div>
    </main>
  )
}

/** First visit: the profile exists (created on confirmation); the member chooses how they appear. */
export function SetupProfile({ onSaved, createdAt }: { onSaved: () => Promise<void>; createdAt: string }) {
  const { session } = useAuth()
  const passwordSet = (useLocation().state as { passwordSet?: boolean } | null)?.passwordSet
  return (
    <main id="main" className="px-4 py-12 sm:py-16">
      <AuthCard
        title="Welcome to Splitpost"
        intro={
          <p>
            Signed in as <strong className="font-semibold text-ink-900">{session?.user.email}</strong>.
          </p>
        }
      >
        <div className="space-y-5">
          {passwordSet && <Message tone="success">Your password is saved.</Message>}
          <div role="status" className="flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-brand-800 ring-1 ring-brand-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Your profile is ready</p>
              <p className="text-sm">Created {new Date(createdAt).toLocaleString()}. Choose how people will see you to start posting and following.</p>
            </div>
          </div>
          <ProfileForm onSaved={onSaved} submitLabel="Continue" />
          <p className="text-sm">
            <Link to="/app/account" className="font-semibold text-brand-700 underline underline-offset-2">
              Your account
            </Link>
          </p>
        </div>
      </AuthCard>
    </main>
  )
}

/** Username and display name. Used for setup and for editing later. */
export function ProfileForm({
  onSaved,
  submitLabel,
  initial,
}: {
  onSaved: () => void | Promise<void>
  submitLabel: string
  initial?: { username: string; displayName: string }
}) {
  const api = useAppApi()
  const [username, setUsername] = useState(initial?.username ?? '')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    const p = usernameProblem(u) ?? displayNameProblem(displayName)
    setSaved(false)
    if (p) {
      setProblem(p)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await api.saveProfile({ username: u, displayName })
      setSaved(true)
      await onSaved()
    } catch (err) {
      setProblem(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Username"
        id="username"
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={30}
        hint="3 to 30 lowercase letters, numbers or underscores. Shown as @username."
      />
      <Field
        label="Display name"
        id="display-name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        autoComplete="name"
        maxLength={50}
        hint="The name people see on your posts. You can change both later."
      />
      {problem && <Message tone="error">{problem}</Message>}
      {saved && !problem && initial && <Message tone="success">Saved.</Message>}
      <button type="submit" disabled={busy} className={`${buttonClass('primary')} w-full`}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

const NAV = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/discover', label: 'Discover', icon: Compass },
  { to: '/app/new', label: 'Create', icon: Plus, primary: true },
  { to: '/app/clique', label: 'Clique', icon: Users },
  { to: '/app/profile', label: 'Profile', icon: User },
]

/** The tour's layout, for real members: sidebar on larger screens, tab bar on phones. */
function MemberLayout({ username }: { username: string }) {
  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col border-r border-ink-100 bg-paper px-3 py-6 md:flex lg:w-64 lg:px-5">
        <Link to="/app" className="mb-8 flex justify-center lg:justify-start" aria-label="Splitpost home">
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
        <div className="mt-auto space-y-2">
          <p className="hidden text-[13px] font-semibold text-ink-700 lg:block">@{username}</p>
          <Link to="/app/account" className="hidden text-[13px] font-semibold text-brand-700 underline underline-offset-2 lg:inline">
            Your account
          </Link>
          <p className="hidden text-[11px] leading-snug text-ink-500 lg:block">Splitpost pilot. Invitation-only, for adults 18 and older.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link to="/app" aria-label="Splitpost home">
              <Wordmark size="sm" />
            </Link>
            <Link to="/app/account" className="text-[13px] font-semibold text-brand-700">
              Your account
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[680px] px-4 pb-28 pt-5 outline-none sm:px-6 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 pb-safe backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                clsx('flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-ink-900' : 'text-ink-500')
              }
            >
              {({ isActive }) =>
                item.primary ? (
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm">
                    <item.icon className="h-6 w-6" strokeWidth={2.6} />
                  </span>
                ) : (
                  <>
                    <item.icon className={clsx('h-[22px] w-[22px]', isActive && 'text-brand-600')} strokeWidth={isActive ? 2.4 : 2} />
                    {item.label}
                  </>
                )
              }
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
