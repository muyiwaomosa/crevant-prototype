import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { AuthCard, Message } from './AuthUi'

/** Account details and sign-out. Signed-in members only. */
export function AccountPage() {
  const { client, session } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'local' | 'global' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function signOut(scope: 'local' | 'global') {
    if (!client || busy) return
    setBusy(scope)
    setError(null)
    const { error: err } = await client.auth.signOut({ scope })
    setBusy(null)
    if (err && scope === 'global') {
      setError("We couldn't sign you out of your other devices. Please try again.")
      return
    }
    navigate('/sign-in', { replace: true })
  }

  return (
    <AuthCard title="Your account" intro={<p>Email address: <strong className="font-semibold text-ink-900">{session?.user.email}</strong></p>}>
      <div className="space-y-4">
        {error && <Message tone="error">{error}</Message>}
        <button type="button" onClick={() => signOut('local')} disabled={busy !== null} className={`${buttonClass('primary')} w-full`}>
          {busy === 'local' ? 'Signing out…' : 'Sign out'}
        </button>
        <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink-100">
          <p className="text-sm leading-relaxed text-ink-600">
            Signed in somewhere you don't recognise, or on a shared computer? This signs you out everywhere, including here.
          </p>
          <button type="button" onClick={() => signOut('global')} disabled={busy !== null} className={`${buttonClass('secondary')} mt-3 w-full`}>
            {busy === 'global' ? 'Signing out everywhere…' : 'Sign out of all devices'}
          </button>
        </div>
        <p className="text-sm">
          <Link to="/app" className="font-semibold text-brand-700 underline underline-offset-2">
            Back to your home
          </Link>
          {' · '}
          <Link to="/forgot-password" className="font-semibold text-brand-700 underline underline-offset-2">
            Change password
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
