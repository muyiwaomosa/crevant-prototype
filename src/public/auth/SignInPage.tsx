import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { safeNext } from '../../auth/safeNext'
import { CAPTCHA_NEEDED, CaptchaBox, useCaptcha } from '../../auth/captcha'
import { AuthCard, Field, Message, Spinner, Unavailable } from './AuthUi'
import { confirmRedirect } from './SignUpPage'

/**
 * Email and password sign-in. New members register on /sign-up (open beta).
 * Every failed sign-in gets the same message, so the page never reveals
 * whether an email address has an account. The one exception is an account
 * whose email isn't confirmed yet: Supabase says so only after the password
 * matched, so it reveals nothing to someone without the password, and the
 * page offers to send the confirmation link again.
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
  const [unconfirmed, setUnconfirmed] = useState<'no' | 'yes' | 'sending' | 'sent'>('no')
  const captcha = useCaptcha()

  if (status === 'unavailable' || !client) return <Unavailable />
  if (status === 'signed-in') return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!client || busy) return
    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }
    if (captcha.enabled && !captcha.token) {
      setError(CAPTCHA_NEEDED)
      return
    }
    setBusy(true)
    setError(null)
    setUnconfirmed('no')
    const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password, ...(captcha.token ? { options: { captchaToken: captcha.token } } : {}) })
    setBusy(false)
    captcha.reset()
    if (!err) {
      navigate(next, { replace: true })
      return
    }
    if (err.status === 429 || err.code === 'over_request_rate_limit') setError('Too many attempts. Please wait a few minutes and try again.')
    else if (err.code === 'email_not_confirmed') {
      setUnconfirmed('yes')
      setError('Confirm your email address first, using the link we sent you.')
    } else if (err.code === 'captcha_failed') setError("The security check didn't pass. Please try again.")
    else setError("That email and password don't match an account. Check them and try again.")
  }

  async function resendConfirmation() {
    if (!client || unconfirmed === 'sending') return
    if (captcha.enabled && !captcha.token) {
      setError(CAPTCHA_NEEDED)
      return
    }
    setUnconfirmed('sending')
    try {
      await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: confirmRedirect(), ...(captcha.token ? { captchaToken: captcha.token } : {}) } })
    } catch {
      // Same reply either way.
    }
    captcha.reset()
    setError(null)
    setUnconfirmed('sent')
  }

  return (
    <AuthCard
      title="Sign in"
      intro={
        <p>
          New to Splitpost?{' '}
          <Link to="/sign-up" className="font-semibold text-brand-700 underline underline-offset-2">
            Create an account
          </Link>
          .
        </p>
      }
    >
      {status === 'loading' ? (
        <Spinner label="Checking your sign-in…" />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Message tone="error">{error}</Message>}
          {unconfirmed === 'sent' && <Message tone="success">If the address can be used, a new confirmation link is on its way.</Message>}
          <Field id="email" label="Email address" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <CaptchaBox captcha={captcha} />
          <button type="submit" disabled={busy} className={`${buttonClass('primary', 'lg')} w-full`}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {(unconfirmed === 'yes' || unconfirmed === 'sending') && (
            <button type="button" onClick={resendConfirmation} disabled={unconfirmed === 'sending'} className={`${buttonClass('secondary')} w-full`}>
              {unconfirmed === 'sending' ? 'Sending…' : 'Send the confirmation link again'}
            </button>
          )}
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
