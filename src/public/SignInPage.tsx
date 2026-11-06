import { PlaceholderPage } from './RequestInvitePage'

/** Placeholder until sign in is built (Phase 1A, PR 3). Collects nothing. */
export function SignInPage() {
  return (
    <PlaceholderPage
      title="Sign in opens soon for invited participants."
      body={<p>If you've been invited, we'll email you when it's ready.</p>}
    />
  )
}
