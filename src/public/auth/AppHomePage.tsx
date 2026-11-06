import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { AuthCard, Message, Spinner } from './AuthUi'

type ProfileState = { kind: 'loading' } | { kind: 'ready'; createdAt: string } | { kind: 'missing' } | { kind: 'error' }

/**
 * Signed-in home. Reads only the member's own profile (row level security
 * allows nothing else) to confirm it was created automatically.
 */
export function AppHomePage() {
  const { client, session } = useAuth()
  const passwordSet = (useLocation().state as { passwordSet?: boolean } | null)?.passwordSet
  const [profile, setProfile] = useState<ProfileState>({ kind: 'loading' })
  const userId = session?.user.id

  useEffect(() => {
    if (!client || !userId) return
    let active = true
    client
      .from('profiles')
      .select('id, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setProfile({ kind: 'error' })
        else if (!data) setProfile({ kind: 'missing' })
        else setProfile({ kind: 'ready', createdAt: data.created_at as string })
      })
    return () => {
      active = false
    }
  }, [client, userId])

  return (
    <AuthCard title="You're signed in" intro={<p>Signed in as <strong className="font-semibold text-ink-900">{session?.user.email}</strong>.</p>}>
      <div className="space-y-4">
        {passwordSet && <Message tone="success">Your password is saved.</Message>}
        {profile.kind === 'loading' && <Spinner label="Checking your profile…" />}
        {profile.kind === 'ready' && (
          <div role="status" className="flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-brand-800 ring-1 ring-brand-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Your profile is ready</p>
              <p className="text-sm">Created {new Date(profile.createdAt).toLocaleString()}. Choosing your username and display name is coming next.</p>
            </div>
          </div>
        )}
        {profile.kind === 'missing' && (
          <Message tone="info">Your profile isn't ready yet. It's created when your email is confirmed; refresh this page in a moment.</Message>
        )}
        {profile.kind === 'error' && <Message tone="error">We couldn't check your profile right now. Please refresh to try again.</Message>}
        <Link to="/app/account" className={buttonClass('secondary')}>
          Your account
        </Link>
      </div>
    </AuthCard>
  )
}
