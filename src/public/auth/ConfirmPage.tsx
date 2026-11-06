import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { AuthCard, Message, Unavailable } from './AuthUi'

export type EmailLinkType = 'invite' | 'recovery'
export type EmailLink = { tokenHash: string; type: EmailLinkType }

/** Reads the one-time code from an invitation or reset email link. */
export function readEmailLink(search: string): EmailLink | null {
  const params = new URLSearchParams(search)
  const tokenHash = params.get('token_hash') ?? ''
  const type = params.get('type')
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(tokenHash)) return null
  if (type !== 'invite' && type !== 'recovery') return null
  return { tokenHash, type }
}

/**
 * Landing page for invitation and password-reset emails.
 *
 * Protection against email scanners: opening this page does nothing. The
 * one-time code is only sent to Supabase when a person presses Continue.
 * The code is removed from the address bar straight away, so it is not
 * left in browser history.
 */
export function ConfirmPage() {
  const { client, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Read once, before the address bar is cleaned.
  const [link] = useState<EmailLink | null>(() => readEmailLink(location.search))
  const [state, setState] = useState<'ready' | 'verifying' | 'verified' | 'expired' | 'failed'>('ready')

  useEffect(() => {
    if (location.search) navigate('/auth/confirm', { replace: true })
  }, [location.search, navigate])

  // Move on only once the new sign-in is registered, so the password page
  // never sees a signed-out visitor.
  useEffect(() => {
    if (state === 'verified' && status === 'signed-in' && link) {
      navigate('/auth/set-password', { replace: true, state: { reason: link.type } })
    }
  }, [state, status, link, navigate])

  if (!client) return <Unavailable />

  if (!link) {
    return (
      <AuthCard
        title="Open the link from your email"
        intro={<p>This page works with the link in your Crevant invitation or password reset email. If the link has already been used, you can ask for a new one.</p>}
      >
        <div className="flex flex-col gap-3 min-[380px]:flex-row">
          <Link to="/forgot-password" className={buttonClass('primary')}>
            Get a new link
          </Link>
          <Link to="/sign-in" className={buttonClass('secondary')}>
            Sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  const isInvite = link.type === 'invite'

  async function onContinue() {
    if (!client || !link || state === 'verifying' || state === 'verified') return
    setState('verifying')
    const { error } = await client.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
    if (!error) {
      setState('verified')
      return
    }
    setState(error.code === 'otp_expired' || error.status === 403 ? 'expired' : 'failed')
  }

  return (
    <AuthCard
      title={isInvite ? 'Welcome to Crevant' : 'Reset your password'}
      intro={
        <p>
          {isInvite
            ? 'Press Continue to accept your invitation. Next, you will choose a password.'
            : 'Press Continue, then choose a new password.'}
        </p>
      }
    >
      <div className="space-y-4">
        {state === 'expired' && (
          <Message tone="error">
            This link has expired or was already used. Links work once and last one hour.{' '}
            {isInvite ? 'Ask the person who invited you to send a new invitation.' : <Link to="/forgot-password" className="font-semibold underline">Request a new reset link.</Link>}
          </Message>
        )}
        {state === 'failed' && <Message tone="error">Something went wrong. Please try again in a moment.</Message>}
        {state !== 'expired' && (
          <button type="button" onClick={onContinue} disabled={state === 'verifying' || state === 'verified'} className={`${buttonClass('primary', 'lg')} w-full`}>
            {state === 'verifying' || state === 'verified' ? 'Checking your link…' : 'Continue'}
          </button>
        )}
      </div>
    </AuthCard>
  )
}
