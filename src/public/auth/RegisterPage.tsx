import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { CAPTCHA_NEEDED, CaptchaBox, useCaptcha } from '../../auth/captcha'
import { AuthCard, Field, Message, Unavailable } from './AuthUi'
import { passwordProblem } from './SetPasswordPage'
import { REGISTRATION_CODE, rememberRegistrationCode, storedRegistrationCode } from '../../app/registration'
import { MEMBER_APP_HOSTS } from '../../entry'

/**
 * Controlled registration through an invitation or referral link
 * (foundation v2, 20261130000000; founder decision D2): /register/<code>.
 *
 * Only people with a valid link can create an account. The code and the 18+
 * confirmation travel with the sign-up, and Supabase Auth's account creation
 * hook (public.hook_before_user_created) refuses the account unless the link
 * is valid, registration is not paused or full, and external access is open.
 * After the email is confirmed, the members area claims membership through
 * the same link (public.app_claim_access), which checks everything again.
 *
 * Attribution is first touch: the first link this browser opened is kept for
 * seven days and used even if another link is opened later.
 *
 * On the production member app address the page stays closed until the
 * reviewed pilot terms and privacy notice are published (POLICIES_PUBLISHED,
 * changed only in a reviewed pull request). Previews and local builds show the
 * form for testing; the database still decides who may register.
 */
export const POLICIES_PUBLISHED = false

export const REGISTER_SENT_MESSAGE =
  "Check your email. If this address can be used for Splitpost, we've sent a link to confirm it. The link works once and expires in one hour."

/** Plain messages for the account creation hook's refusals (matched on the hook's wording). */
export function registrationProblem(message: string | undefined): string | null {
  const m = (message ?? '').toLowerCase()
  if (m.includes('paused')) return 'Registration is paused right now. Please try again later, or join the waitlist.'
  if (m.includes('not open to new members')) return "The Splitpost pilot isn't open to new members yet. Please check back soon."
  if (m.includes('is full')) return 'The pilot is full for now. Please try again later, or join the waitlist.'
  if (m.includes('used a lot today')) return 'This link has been used a lot today. Please try again tomorrow.'
  if (m.includes('not valid')) return "This invitation or referral link isn't valid. Ask the person who shared it for a new one."
  if (m.includes('permanent email')) return 'Please use a permanent email address.'
  if (m.includes('18 or older')) return 'The Splitpost pilot is for people aged 18 or older.'
  return null
}

export function confirmRedirect(): string {
  return `${window.location.origin}/auth/confirm`
}

function onProductionHost(): boolean {
  try {
    return MEMBER_APP_HOSTS.includes(window.location.hostname)
  } catch {
    return false
  }
}

export function RegisterPage({ open = POLICIES_PUBLISHED || !onProductionHost() }: { open?: boolean } = {}) {
  const { status, client } = useAuth()
  const { code: fromLink } = useParams()
  const captcha = useCaptcha()
  const [code, setCode] = useState<string | null>(() => storedRegistrationCode())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [adult, setAdult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (fromLink) setCode(rememberRegistrationCode(fromLink) ?? (REGISTRATION_CODE.test(fromLink.toLowerCase()) ? fromLink.toLowerCase() : null))
  }, [fromLink])

  if (status === 'unavailable' || !client) return <Unavailable />
  if (status === 'signed-in') return <Navigate to="/app" replace />
  if (!open) {
    return (
      <AuthCard title="Registration opens soon" intro={<p>Joining Splitpost through invitation and referral links opens soon. Please check back, or join the waitlist.</p>}>
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </AuthCard>
    )
  }
  if (!code) {
    return (
      <AuthCard title="You need an invitation link" intro={<p>Splitpost is a controlled pilot for adults. You can join through an invitation or a member's referral link.</p>}>
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
    if (!client || busy || !code) return
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter your email address.')
    const problem = passwordProblem(password, confirm)
    if (problem) return setError(problem)
    if (!adult) return setError('The Splitpost pilot is for people aged 18 or older.')
    if (captcha.enabled && !captcha.token) return setError(CAPTCHA_NEEDED)
    setBusy(true)
    setError(null)
    const { error: err } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: confirmRedirect(),
        data: { registration_code: code, adult_attested: true },
        ...(captcha.token ? { captchaToken: captcha.token } : {}),
      },
    })
    setBusy(false)
    captcha.reset()
    if (!err) return setSent(true)
    const errCode = (err as { code?: string }).code
    const refusal = registrationProblem(err.message)
    if (refusal) setError(refusal)
    else if (err.status === 429 || errCode === 'over_request_rate_limit' || errCode === 'over_email_send_rate_limit') setError('Too many attempts. Please wait a few minutes and try again.')
    else if (errCode === 'signup_disabled') setError("Registration isn't open yet. Please check back soon.")
    else if (errCode === 'weak_password') setError('Choose a stronger password: longer, and not one that has appeared in a data breach.')
    else if (errCode === 'captcha_failed') setError("The security check didn't pass. Please try again.")
    else if (errCode === 'email_address_invalid') setError('Enter a valid email address.')
    // Anything else (including an address that already has an account) gets
    // the same reply as a success, so the page reveals nothing.
    else setSent(true)
  }

  if (sent) {
    return (
      <AuthCard title="Confirm your email" intro={<p>One more step.</p>}>
        <div className="space-y-4" data-testid="register-sent">
          <Message tone="success">{REGISTER_SENT_MESSAGE}</Message>
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
    <AuthCard
      title="Join Splitpost"
      intro={<p>You've been invited to a controlled pilot for adults. Create your account with your email address and a password.</p>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="register-form">
        {error && <Message tone="error">{error}</Message>}
        <Field id="email" label="Email address" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field id="password" label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <label className="flex items-start gap-3 text-sm text-ink-800">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>I confirm that I am 18 or older.</span>
        </label>
        {!POLICIES_PUBLISHED && (
          <p className="rounded-xl bg-paper px-3 py-2 text-[12.5px] text-ink-700" data-testid="policies-pending">
            Preview: the pilot terms and member privacy notice are being reviewed and will be shown here before registration opens.
          </p>
        )}
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
