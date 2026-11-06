import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { buttonClass } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { AuthCard, Field, Message } from './AuthUi'

export const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_BYTES = 72 // the password hashing limit

/** Returns a message when the password is not acceptable, otherwise null. */
export function passwordProblem(password: string, confirm: string): string | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'That password is too long. Use a shorter one.'
  if (password !== confirm) return "The two passwords don't match."
  return null
}

/** Choose a password after accepting an invitation or resetting it. Signed-in members only. */
export function SetPasswordPage() {
  const { client } = useAuth()
  const navigate = useNavigate()
  const reason = (useLocation().state as { reason?: string } | null)?.reason
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!client || saving) return
    const problem = passwordProblem(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await client.auth.updateUser({ password })
    setSaving(false)
    if (!err) {
      navigate('/app', { replace: true, state: { passwordSet: true } })
      return
    }
    if (err.code === 'weak_password') setError(`Choose a stronger password with at least ${MIN_PASSWORD_LENGTH} characters.`)
    else if (err.code === 'same_password') setError('Choose a password different from your current one.')
    else setError('We could not save your password. Please try again.')
  }

  return (
    <AuthCard
      title={reason === 'recovery' ? 'Choose a new password' : 'Choose your password'}
      intro={<p>You will use it with your email address to sign in to Crevant.</p>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Message tone="error">{error}</Message>}
        <Field
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          required
        />
        <Field
          id="confirm-password"
          label="Type it again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <button type="submit" disabled={saving} className={`${buttonClass('primary', 'lg')} w-full`}>
          {saving ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthCard>
  )
}
