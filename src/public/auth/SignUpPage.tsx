import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { CAPTCHA_NEEDED, CaptchaBox, useCaptcha } from '../../auth/captcha'
import { AuthCard, Field, Message, Unavailable } from './AuthUi'
import { passwordProblem } from './SetPasswordPage'
import { BETA_DOCUMENTS_PUBLISHED } from '../beta/documents'

/** Shown after every sign-up, whatever happened, so the page never reveals whether an email has an account. */
export const SIGN_UP_SENT_MESSAGE =
  "Check your email. If this address can be used for Splitpost, we've sent a link to confirm it. The link works once and expires in one hour."

/** Where the confirmation link lands: the scanner-safe confirm page on this site. */
export function confirmRedirect(): string {
  return `${window.location.origin}/auth/confirm`
}

/**
 * Open beta: register with an email address and a password. The account can
 * use Splitpost once its email is confirmed: the confirm page signs it in and
 * the members area claims membership (public.app_claim_access), which the
 * database gives only while registration is open.
 *
 * Adults only (18 or older) for the beta, and the member agrees to the
 * community rules and has seen the beta privacy notice. Until both documents
 * are approved (src/public/beta/documents.ts) the page stays closed. Both are checked before
 * anything is sent. The security check (Cloudflare Turnstile) is verified by
 * Supabase itself.
 */
export function SignUpPage({ open = BETA_DOCUMENTS_PUBLISHED }: { open?: boolean } = {}) {
  const { status, client } = useAuth()
  const captcha = useCaptcha()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [adult, setAdult] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [resent, setResent] = useState<'idle' | 'sending' | 'done'>('idle')

  if (status === 'unavailable' || !client) return <Unavailable />
  if (status === 'signed-in') return <Navigate to="/app" replace />
  if (!open) {
    return (
      <AuthCard title="Sign-up opens soon" intro={<p>Registration for the Splitpost beta isn't open yet. Please check back soon.</p>}>
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </AuthCard>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!client || busy) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter your email address.')
    const problem = passwordProblem(password, confirm)
    if (problem) return setError(problem)
    if (!adult) return setError('The Splitpost beta is for people aged 18 or older.')
    if (!agreed) return setError('Please agree to the community rules to continue.')
    if (captcha.enabled && !captcha.token) return setError(CAPTCHA_NEEDED)
    setBusy(true)
    setError(null)
    const { error: err } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: confirmRedirect(), ...(captcha.token ? { captchaToken: captcha.token } : {}) },
    })
    setBusy(false)
    captcha.reset()
    if (!err) return setSent(true)
    const code = (err as { code?: string }).code
    if (err.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') setError('Too many attempts. Please wait a few minutes and try again.')
    else if (code === 'signup_disabled') setError("Sign-up isn't open yet. Please check back soon.")
    else if (code === 'weak_password') setError('Choose a stronger password: longer, and not one that has appeared in a data breach.')
    else if (code === 'captcha_failed') setError("The security check didn't pass. Please try again.")
    else if (code === 'email_address_invalid') setError('Enter a valid email address.')
    // Anything else (including an address that already has an account) gets
    // the same reply as a success, so the page reveals nothing.
    else setSent(true)
  }

  async function resend() {
    if (!client || resent === 'sending') return
    if (captcha.enabled && !captcha.token) return setError(CAPTCHA_NEEDED)
    setResent('sending')
    try {
      await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: confirmRedirect(), ...(captcha.token ? { captchaToken: captcha.token } : {}) } })
    } catch {
      // Same reply either way.
    }
    captcha.reset()
    setError(null)
    setResent('done')
  }

  if (sent) {
    return (
      <AuthCard title="Confirm your email" intro={<p>One more step.</p>}>
        <div className="space-y-4">
          <Message tone="success">{SIGN_UP_SENT_MESSAGE}</Message>
          {error && <Message tone="error">{error}</Message>}
          {resent === 'done' ? (
            <p className="text-sm text-ink-700">If the address can be used, a new link is on its way.</p>
          ) : (
            <>
              <CaptchaBox captcha={captcha} />
              <button type="button" onClick={resend} disabled={resent === 'sending'} className={`${buttonClass('secondary')} w-full`}>
                {resent === 'sending' ? 'Sending…' : 'Send the link again'}
              </button>
            </>
          )}
          <p className="text-center text-sm">
            <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2">
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Create your account" intro={<p>Join the Splitpost beta with your email address and a password.</p>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Message tone="error">{error}</Message>}
        <Field id="email" label="Email address" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field id="password" label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <label className="flex items-start gap-3 text-sm text-ink-800">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>I am 18 or older.</span>
        </label>
        <label className="flex items-start gap-3 text-sm text-ink-800">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            I agree to the{' '}
            <Link to="/community-rules" className="font-semibold text-brand-700 underline underline-offset-2">
              community rules
            </Link>{' '}
            and have read the{' '}
            <Link to="/beta-privacy" className="font-semibold text-brand-700 underline underline-offset-2">
              privacy notice
            </Link>
            .
          </span>
        </label>
        <CaptchaBox captcha={captcha} />
        <button type="submit" disabled={busy} className={`${buttonClass('primary', 'lg')} w-full`}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
