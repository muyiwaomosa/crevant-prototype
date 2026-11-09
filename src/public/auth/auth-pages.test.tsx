// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthProvider } from '../../auth/AuthProvider'
import { PublicRoutes } from '../PublicApp'
import { RESET_SENT_MESSAGE } from './ForgotPasswordPage'
import { readEmailLink } from './ConfirmPage'
import { passwordProblem } from './SetPasswordPage'

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c'
const SESSION = { access_token: 't', refresh_token: 'r', user: { id: 'user-1', email: 'me@example.test' } }

type Fake = ReturnType<typeof makeClient>
function makeClient({ session = null as unknown, profile = { id: 'user-1', created_at: '2026-11-06T12:00:00Z' } as unknown } = {}) {
  let listener: ((event: string, s: unknown) => void) | null = null
  const maybeSingle = vi.fn(async () => ({ data: profile, error: null }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn((cb: (event: string, s: unknown) => void) => {
        listener = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      verifyOtp: vi.fn(async () => ({ data: { session: SESSION }, error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: SESSION }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(),
      signInWithOtp: vi.fn(),
    },
    from: vi.fn(() => ({ select })),
    emit: (event: string, s: unknown) => listener?.(event, s),
    calls: { select, eq, maybeSingle },
  }
  return client
}

let where = ''
function splitPath(path: string) {
  const [beforeHash, hash = ''] = path.split('#')
  const [pathname, search = ''] = beforeHash.split('?')
  return { pathname, search: search ? `?${search}` : '', hash: hash ? `#${hash}` : '' }
}
function WhereAmI() {
  const l = useLocation()
  where = l.pathname + l.search + l.hash
  return null
}

function renderAt(path: string, client: Fake | null, state?: unknown) {
  return render(
    <AuthProvider client={client as unknown as SupabaseClient | null}>
      <MemoryRouter initialEntries={[{ ...splitPath(path), state }]}>
        <PublicRoutes />
        <WhereAmI />
      </MemoryRouter>
    </AuthProvider>,
  )
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  where = ''
})
afterEach(() => cleanup())

describe('email links (/auth/confirm)', () => {
  it('reads only invite and recovery links with a plausible code', () => {
    expect(readEmailLink(`#token_hash=${TOKEN}&type=invite`)).toEqual({ tokenHash: TOKEN, type: 'invite' })
    expect(readEmailLink(`#token_hash=${TOKEN}&type=recovery`)?.type).toBe('recovery')
    expect(readEmailLink(`#token_hash=${TOKEN}&type=signup`)).toBeNull()
    expect(readEmailLink(`#token_hash=${TOKEN}&type=magiclink`)).toBeNull()
    expect(readEmailLink('#token_hash=short&type=invite')).toBeNull()
    expect(readEmailLink(`#token_hash=${TOKEN}<script>&type=invite`)).toBeNull()
    expect(readEmailLink('')).toBeNull()
  })

  it('ignores a code sent in the query string (it would reach the server) and removes it from the address', async () => {
    const client = makeClient()
    renderAt(`/auth/confirm?token_hash=${TOKEN}&type=invite`, client)
    expect(await screen.findByText('Open the link from your email')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    await waitFor(() => expect(where).toBe('/auth/confirm'))
    expect(client.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('does nothing until Continue is pressed (protects against email scanners), and removes the code from the address', async () => {
    const client = makeClient()
    renderAt(`/auth/confirm#token_hash=${TOKEN}&type=invite`, client)
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByText('Welcome to Crevant')).toBeTruthy()
    await waitFor(() => expect(where).toBe('/auth/confirm'))
    await new Promise((r) => setTimeout(r, 50))
    expect(client.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('verifies the code on Continue and moves on to choosing a password', async () => {
    const client = makeClient()
    renderAt(`/auth/confirm#token_hash=${TOKEN}&type=invite`, client)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(client.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'invite' }))
    act(() => client.emit('SIGNED_IN', SESSION))
    await waitFor(() => expect(where).toBe('/auth/set-password'))
  })

  it('explains an expired or used link without retrying', async () => {
    const client = makeClient()
    client.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { code: 'otp_expired', status: 403 } } as never)
    renderAt(`/auth/confirm#token_hash=${TOKEN}&type=recovery`, client)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/This link has expired or was already used/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('without a link, offers to get a new one and calls nothing', async () => {
    const client = makeClient()
    renderAt('/auth/confirm', client)
    expect(await screen.findByText('Open the link from your email')).toBeTruthy()
    expect(client.auth.verifyOtp).not.toHaveBeenCalled()
  })
})

describe('choosing a password', () => {
  it('requires at least 10 characters, a matching confirmation, and at most 72 bytes', () => {
    expect(passwordProblem('short', 'short')).toMatch(/at least 10/)
    expect(passwordProblem('ninechars', 'ninechars')).toMatch(/at least 10/)
    expect(passwordProblem('tencharsok', 'tencharsoK')).toMatch(/don't match/)
    expect(passwordProblem('tencharsok', 'tencharsok')).toBeNull()
    expect(passwordProblem('é'.repeat(37), 'é'.repeat(37))).toMatch(/too long/)
  })

  it('is for signed-in members only', async () => {
    renderAt('/auth/set-password', makeClient())
    await waitFor(() => expect(where).toBe('/sign-in?next=%2Fauth%2Fset-password'))
  })

  it('saves the password and goes to the signed-in home', async () => {
    const client = makeClient({ session: SESSION })
    renderAt('/auth/set-password', client, { reason: 'invite' })
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'correct horse 42' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'correct horse 42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'correct horse 42' }))
    await waitFor(() => expect(where).toBe('/app'))
  })

  it('blocks a short password before contacting Supabase', async () => {
    const client = makeClient({ session: SESSION })
    renderAt('/auth/set-password', client)
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('sign in', () => {
  it('has email and password fields and no sign-up option', async () => {
    renderAt('/sign-in', makeClient())
    expect(await screen.findByLabelText('Email address')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/sign up|create (an )?account|register/i)
    expect(document.body.textContent).toContain("there's no public sign-up")
  })

  it('shows the same message for a wrong password and an unknown email', async () => {
    const client = makeClient()
    const messages: string[] = []
    for (const code of ['invalid_credentials', 'email_not_confirmed']) {
      client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code, status: 400 } } as never)
      renderAt('/sign-in', client)
      fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'x@example.test' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'whatever-123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      messages.push((await screen.findByRole('alert')).textContent || '')
      cleanup()
    }
    expect(messages[0]).toBe(messages[1])
  })

  it('returns only to pages on this site after signing in', async () => {
    for (const [next, expected] of [
      ['%2Fapp%2Faccount', '/app/account'],
      ['https%3A%2F%2Fevil.example', '/app'],
      ['%2F%2Fevil.example', '/app'],
      ['%2Fauth%2Fconfirm', '/app'],
    ] as const) {
      const client = makeClient()
      renderAt(`/sign-in?next=${next}`, client)
      fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'me@example.test' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse 42' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      act(() => client.emit('SIGNED_IN', SESSION))
      await waitFor(() => expect(where.split('?')[0]).toBe(expected))
      cleanup()
    }
  })

  it('never calls sign-up or one-time-code sign-in', async () => {
    const client = makeClient()
    renderAt('/sign-in', client)
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'me@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse 42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(client.auth.signInWithPassword).toHaveBeenCalled())
    expect(client.auth.signUp).not.toHaveBeenCalled()
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled()
  })
})

describe('password reset', () => {
  it('shows the same message whatever happens, and links back to /auth/confirm', async () => {
    for (const outcome of [{ data: {}, error: null }, { data: {}, error: { code: 'over_email_send_rate_limit', status: 429 } }]) {
      const client = makeClient()
      client.auth.resetPasswordForEmail.mockResolvedValueOnce(outcome as never)
      renderAt('/forgot-password', client)
      fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'someone@example.test' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
      expect((await screen.findByRole('status')).textContent).toBe(RESET_SENT_MESSAGE)
      expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('someone@example.test', { redirectTo: `${window.location.origin}/auth/confirm` })
      cleanup()
    }
  })
})

describe('signed-in pages', () => {
  it('send visitors who are not signed in to sign in, and back afterwards', async () => {
    for (const path of ['/app', '/app/account']) {
      renderAt(path, makeClient())
      await waitFor(() => expect(where).toBe(`/sign-in?next=${encodeURIComponent(path)}`))
      cleanup()
    }
  })

  it('home reads only the member\'s own profile and says it is ready', async () => {
    const client = makeClient({ session: SESSION })
    renderAt('/app', client)
    expect(await screen.findByText('Your profile is ready')).toBeTruthy()
    expect(client.from).toHaveBeenCalledWith('profiles')
    expect(client.calls.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(document.body.textContent).toContain('me@example.test')
  })

  it('home explains when the profile is not there yet', async () => {
    renderAt('/app', makeClient({ session: SESSION, profile: null }))
    expect(await screen.findByText(/Your profile isn't ready yet/)).toBeTruthy()
  })

  it('account page signs out on this device, or everywhere', async () => {
    for (const [button, scope] of [['Sign out', 'local'], ['Sign out of all devices', 'global']] as const) {
      const client = makeClient({ session: SESSION })
      renderAt('/app/account', client)
      fireEvent.click(await screen.findByRole('button', { name: button }))
      await waitFor(() => expect(client.auth.signOut).toHaveBeenCalledWith({ scope }))
      cleanup()
    }
  })

  it('header offers "Your account" when signed in and "Sign in" otherwise', async () => {
    renderAt('/', makeClient({ session: SESSION }))
    expect(await screen.findByRole('link', { name: 'Your account' })).toBeTruthy()
    cleanup()
    renderAt('/', makeClient())
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0))
  })
})

describe('there is no way to register', () => {
  it('has no sign-up route', async () => {
    for (const path of ['/sign-up', '/signup', '/register']) {
      renderAt(path, makeClient())
      expect(await screen.findByText('Page not found')).toBeTruthy()
      cleanup()
    }
  })
  it('/join is the waitlist information page: no form, no password, no account creation', async () => {
    const client = makeClient()
    const { container } = renderAt('/join', client)
    expect(await screen.findByRole('heading', { level: 1, name: 'Join the Waitlist' })).toBeTruthy()
    expect(container.querySelector('form, input, textarea, select, [type="password"]')).toBeNull()
    expect(client.auth.signUp).not.toHaveBeenCalled()
    cleanup()
  })
})
