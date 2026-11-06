import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { safeNext } from '../../auth/safeNext'
import { AuthCard, Field, Message, Spinner, Unavailable } from './AuthUi'

/**
 * Email and password sign-in for invited members. There is no sign-up: the
 * pilot is invitation-only and public registration is disabled.
 * Every failed sign-in gets the same message, so the page never reveals
 * whether an email address has an account.
 */
export function SignInPage() {
  const { status, client } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'unavailable' || !client) return <Unavailable />
  if (status === 'signed-in') return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!client || busy) return
    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (!err) {
      navigate(next, { replace: true })
      return
    }
    if (err.status === 429 || err.code === 'over_request_rate_limit') setError('Too many attempts. Please wait a few minutes and try again.')
    else setError("That email and password don't match an account. Check them and try again.")
  }

  return (
    <AuthCard
      title="Sign in"
      intro={<p>For invited participants. Crevant is invitation-only during the pilot, so there's no public sign-up.</p>}
    >
      {status === 'loading' ? (
        <Spinner label="Checking your sign-in…" />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Message tone="error">{error}</Message>}
          <Field id="email" label="Email address" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={busy} className={`${buttonClass('primary', 'lg')} w-full`}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-sm">
            <Link to="/forgot-password" className="font-semibold text-brand-700 underline underline-offset-2">
              Forgot your password?
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  )
}
