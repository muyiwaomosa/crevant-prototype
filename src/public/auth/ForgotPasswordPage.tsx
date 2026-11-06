import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { AuthCard, Field, Message, Unavailable } from './AuthUi'

export const RESET_SENT_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password. It works once and expires in one hour."

/**
 * Asks Supabase for a reset email. Always shows the same message, whatever
 * happened, so the page never reveals whether an email has an account.
 */
export function ForgotPasswordPage() {
  const { client } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!client) return <Unavailable />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!client || busy) return
    if (!/^[^@\s]+@[^@\s]+$/.test(email.trim())) {
      setError('Enter the email address you use for Crevant.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/confirm` })
    } catch {
      // Same message either way.
    }
    setBusy(false)
    setSent(true)
  }

  return (
    <AuthCard title="Reset your password" intro={<p>Enter the email address you use for Crevant.</p>}>
      {sent ? (
        <div className="space-y-4">
          <Message tone="success">{RESET_SENT_MESSAGE}</Message>
          <Link to="/sign-in" className={buttonClass('secondary')}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Message tone="error">{error}</Message>}
          <Field id="email" label="Email address" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" disabled={busy} className={`${buttonClass('primary', 'lg')} w-full`}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-center text-sm">
            <Link to="/sign-in" className="font-semibold text-brand-700 underline underline-offset-2">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  )
}
